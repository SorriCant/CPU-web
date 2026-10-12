// 药大人大战僵尸的画面。药材、僵尸和草地各是一张图（src/assets/zombie-defense），换形象只需要替换图片文件；
// 子弹、特效和药圃的边框是画出来的。只按引擎状态作画，不改状态。
import lawnArt from "@/assets/zombie-defense/lawn.webp";
import ampouleArt from "@/assets/zombie-defense/unit-ampoule.webp";
import burnerArt from "@/assets/zombie-defense/unit-burner.webp";
import cabinetArt from "@/assets/zombie-defense/unit-cabinet.webp";
import capsuleArt from "@/assets/zombie-defense/unit-capsule.webp";
import dripArt from "@/assets/zombie-defense/unit-drip.webp";
import fizzArt from "@/assets/zombie-defense/unit-fizz.webp";
import mintArt from "@/assets/zombie-defense/unit-mint.webp";
import mortarArt from "@/assets/zombie-defense/unit-mortar.webp";
import beakerArt from "@/assets/zombie-defense/zombie-beaker.webp";
import giantArt from "@/assets/zombie-defense/zombie-giant.webp";
import mentorArt from "@/assets/zombie-defense/zombie-mentor.webp";
import runnerArt from "@/assets/zombie-defense/zombie-runner.webp";
import thesisArt from "@/assets/zombie-defense/zombie-thesis.webp";
import walkerArt from "@/assets/zombie-defense/zombie-walker.webp";
import { darken, ellipsePath, groundShadow, lighten, paint, roundedPath, vertical, type Context } from "./gameArt";
import {
  ZD_RULES,
  ZD_UNITS,
  type ZdEffect,
  type ZdShot,
  type ZdState,
  type ZdUnit,
  type ZdUnitKind,
  type ZdZombie,
  type ZdZombieKind,
} from "./zombieDefenseEngine";

export interface ZdLayout {
  left: number;
  top: number;
  cellWidth: number;
  cellHeight: number;
}

export interface ZdSceneState {
  /** 逻辑宽高：宽固定 420，高随屏幕比例变化。 */
  width: number;
  height: number;
  game: ZdState;
  /** 当前选中的药材或铲子，用来提示哪些格子可以操作。 */
  selected: ZdUnitKind | "shovel" | null;
  /** 点中准备升级的那一格。 */
  focus?: { lane: number; row: number } | null;
}

const TOP_RESERVE = 100;
const BOTTOM_RESERVE = 226;
const CREAM = "#fff3df";
const RED = "#ef5a44";
const MINT = "#63d9bb";
const GOLD = "#ffd166";
const BRICK = "#b98a66";
const TAU = Math.PI * 2;

const ART: Record<string, string> = {
  lawn: lawnArt,
  "u:mortar": mortarArt,
  "u:capsule": capsuleArt,
  "u:mint": mintArt,
  "u:cabinet": cabinetArt,
  "u:fizz": fizzArt,
  "u:ampoule": ampouleArt,
  "u:burner": burnerArt,
  "u:drip": dripArt,
  "z:walker": walkerArt,
  "z:runner": runnerArt,
  "z:beaker": beakerArt,
  "z:giant": giantArt,
  "z:thesis": thesisArt,
  "z:mentor": mentorArt,
};

const images = new Map<string, HTMLImageElement>();
/** 每加载好一张图加一，存好的小图跟着作废重做。 */
let artVersion = 0;

function loadArt() {
  if (typeof Image === "undefined") return Promise.resolve();
  return Promise.all(Object.entries(ART).map(([key, source]) => new Promise<void>((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      images.set(key, image);
      artVersion += 1;
      resolve();
    };
    // 图没加载出来就用一团浅色顶着，不影响玩。
    image.onerror = () => resolve();
    image.src = source;
  }))).then(() => undefined);
}

/** 图都加载完（或失败）以后完成，页面据此重画已经画出去的图标和招牌图。 */
export const zdArtReady = loadArt();

// 画面里的东西大多是重复的：棋盘、同一种药材、同一种僵尸。先按屏幕上的大小缩好存起来，
// 对局里只贴图；后期场上几百只僵尸，每帧也只是几百次贴图。
const sprites = new Map<string, HTMLCanvasElement>();
const fits = new Map<string, Fitted>();
let spriteSignature = "";
let pixel = 1;

/** 画布缩放、格子大小变了，或者又有图加载好了，存的小图就都作废。 */
function useSprites(context: Context, scene: ZdSceneState, layout: ZdLayout) {
  const scale = typeof context.getTransform === "function" ? context.getTransform().a : 2;
  pixel = Math.min(4, Math.max(0.5, scale || 1));
  const signature = `${pixel.toFixed(3)}:${scene.width}:${scene.height.toFixed(1)}:${layout.cellHeight.toFixed(2)}:${artVersion}`;
  if (signature !== spriteSignature) {
    sprites.clear();
    fits.clear();
    labels.clear();
    spriteSignature = signature;
  }
}

/** 取一张宽高为 width × height（画布坐标）的小图，没有就用 draw 画一张；draw 里原点在小图正中。 */
function sprite(key: string, width: number, height: number, draw: (context: Context) => void) {
  let canvas = sprites.get(key);
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(width * pixel));
    canvas.height = Math.max(1, Math.ceil(height * pixel));
    const context = canvas.getContext("2d");
    if (context) {
      context.scale(pixel, pixel);
      context.translate(width / 2, height / 2);
      draw(context);
    }
    sprites.set(key, canvas);
  }
  return canvas;
}

function stamp(context: Context, canvas: HTMLCanvasElement, x: number, y: number, width: number, height: number) {
  context.drawImage(canvas, x - width / 2, y - height / 2, width, height);
}

type ArtVariant = "" | "slow" | "flash" | "crack1" | "crack2";

/** 缩好的一张图：小图本身、它在画布坐标里的宽高，以及脚底（贴地的那条线）离小图上沿多远。 */
interface Fitted {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  feet: number;
}

/**
 * 把一张图等比缩进 maxWidth × maxHeight 的框里存起来。variant 是在图上再加工一层：减速时染成冷蓝色、
 * 受击时整个变白、药柜被啃出裂纹；shadow 为真时把脚下的影子也画进去，对局里一只僵尸只贴一次图。
 * tilt、scaleX、scaleY 是姿势：以脚底为轴歪一点、压扁或拉长一点。姿势也是事先画好存起来的，
 * 对局里只做不缩放、不旋转的原样贴图——这是画布最快的一条路，没有显卡加速的设备上差别尤其大。
 */
function artSprite(name: string, maxWidth: number, maxHeight: number, variant: ArtVariant = "", shadow = false, tilt = 0, scaleX = 1, scaleY = 1): Fitted {
  const key = `a:${name}:${variant}:${shadow ? 1 : 0}:${maxWidth.toFixed(1)}:${maxHeight.toFixed(1)}:${tilt.toFixed(2)}:${scaleX.toFixed(3)}:${scaleY.toFixed(3)}`;
  const cached = fits.get(key);
  if (cached) return cached;
  const image = images.get(name);
  const naturalWidth = image?.naturalWidth || 1;
  const naturalHeight = image?.naturalHeight || 1;
  const scale = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight);
  const artWidth = naturalWidth * scale;
  const artHeight = naturalHeight * scale;
  // 脚底那条线在图里的位置：带影子的往上收一点，让鞋底压在影子上。
  const sole = artHeight * (shadow ? 0.972 : 1);
  const shadowRadius = artHeight * 0.055;
  const lean = Math.abs(Math.sin(tilt)) * artHeight;
  const width = Math.max(artWidth, shadow ? artHeight * 0.66 : 0) * Math.max(1, scaleX) + lean * 2 + 2;
  const feet = sole * Math.max(1, scaleY) + 1;
  const height = feet + Math.max((artHeight - sole) * scaleY, shadow ? shadowRadius : 0) + 1;
  const canvas = sprite(key, width, height, (target) => {
    const top = -height / 2;
    // 以脚底为原点摆好姿势，下面在图自己的坐标里画。
    target.save();
    target.translate(0, top + feet);
    target.rotate(tilt);
    target.scale(scaleX, scaleY);
    const left = -artWidth / 2;
    if (image) {
      target.imageSmoothingQuality = "high";
      target.drawImage(image, left, -sole, artWidth, artHeight);
    } else {
      ellipsePath(target, 0, artHeight / 2 - sole, artWidth * 0.36, artHeight * 0.36);
      target.fillStyle = "rgba(255, 255, 255, .3)";
      target.fill();
    }
    if (variant === "crack1" || variant === "crack2") {
      // 裂纹只画在已经有东西的地方。
      target.globalCompositeOperation = "source-atop";
      const crack = (points: Array<[number, number]>) => {
        target.beginPath();
        points.forEach(([x, y], index) => {
          if (index) target.lineTo(left + x * artWidth, y * artHeight - sole);
          else target.moveTo(left + x * artWidth, y * artHeight - sole);
        });
        target.lineJoin = "round";
        target.lineCap = "round";
        target.lineWidth = Math.max(1.6, artWidth * 0.028);
        target.strokeStyle = "rgba(38, 20, 10, .85)";
        target.stroke();
      };
      crack([[0.2, 0.02], [0.32, 0.2], [0.24, 0.36], [0.36, 0.5]]);
      crack([[0.32, 0.2], [0.44, 0.24]]);
      if (variant === "crack2") {
        crack([[0.86, 0.98], [0.72, 0.76], [0.8, 0.6], [0.66, 0.44]]);
        crack([[0.72, 0.76], [0.58, 0.8]]);
        crack([[0.62, 0.02], [0.56, 0.16], [0.64, 0.26]]);
      }
    }
    if (variant === "slow" && image) {
      // 减速：整只染成冷蓝色。用正片叠底，暗处和轮廓都还在，不会发白；再按原图把染到外面的部分裁掉。
      target.globalCompositeOperation = "multiply";
      target.fillStyle = "#86bcff";
      target.fillRect(left - 2, -sole - 2, artWidth + 4, artHeight + 4);
      target.globalCompositeOperation = "destination-in";
      target.drawImage(image, left, -sole, artWidth, artHeight);
    }
    target.restore();
    // 只给已经画上去的地方加工。
    target.globalCompositeOperation = "source-atop";
    if (variant === "slow") {
      target.fillStyle = "rgba(170, 220, 255, .14)";
      target.fillRect(-width / 2, top, width, height);
    } else if (variant === "flash") {
      target.fillStyle = "#ffffff";
      target.fillRect(-width / 2, top, width, height);
    }
    if (shadow) {
      target.globalCompositeOperation = "destination-over";
      groundShadow(target, 0, top + feet, Math.min(width / 2, artWidth * 0.42), shadowRadius, 0.55);
    }
    target.globalCompositeOperation = "source-over";
  });
  const fitted = { canvas, width, height, feet };
  fits.set(key, fitted);
  return fitted;
}

/**
 * 把缩好的图原样贴到画布上：centerX 是左右的正中，footY 是脚底。位置对齐到屏幕像素、大小和小图的像素一一对应，
 * 浏览器就不用重新采样。
 */
function blit(context: Context, art: Fitted, centerX: number, footY: number) {
  context.drawImage(
    art.canvas,
    Math.round((centerX - art.width / 2) * pixel) / pixel,
    Math.round((footY - art.feet) * pixel) / pixel,
    art.canvas.width / pixel,
    art.canvas.height / pixel,
  );
}

/** 药圃在画布里的位置：顶部让出计分牌，底部让出药材栏。 */
export function zdLayout(width: number, height: number): ZdLayout {
  const cellWidth = (width - 20) / ZD_RULES.lanes;
  const room = height - TOP_RESERVE - BOTTOM_RESERVE;
  const cellHeight = Math.min(84, Math.max(52, room / ZD_RULES.rows));
  return {
    left: 10,
    top: TOP_RESERVE + Math.max(0, (room - cellHeight * ZD_RULES.rows) / 2),
    cellWidth,
    cellHeight,
  };
}

/** 画布坐标对应的格子；落在药圃外返回 null。 */
export function zdCellAt(layout: ZdLayout, x: number, y: number) {
  const lane = Math.floor((x - layout.left) / layout.cellWidth);
  const row = Math.floor((y - layout.top) / layout.cellHeight);
  if (lane < 0 || lane >= ZD_RULES.lanes || row < 0 || row >= ZD_RULES.rows) return null;
  return { lane, row };
}

function drawBoard(context: Context, scene: ZdSceneState, layout: ZdLayout) {
  const { width, height } = scene;
  const boardWidth = layout.cellWidth * ZD_RULES.lanes;
  const boardHeight = layout.cellHeight * ZD_RULES.rows;
  const bottom = layout.top + boardHeight;
  // 黄昏的天色一直压到药圃上沿，僵尸从雾里走出来。
  context.fillStyle = vertical(context, 0, layout.top + 20, "#1b1f3d", "#27484a");
  context.fillRect(0, 0, width, layout.top + 20);
  context.fillStyle = vertical(context, bottom, height, "#1d3a33", "#132427");
  context.fillRect(0, bottom, width, height - bottom);
  context.fillStyle = "#1d3a33";
  context.fillRect(0, layout.top, width, boardHeight);

  context.save();
  roundedPath(context, layout.left, layout.top, boardWidth, boardHeight, 14);
  context.clip();
  const lawn = images.get("lawn");
  if (lawn) {
    // 草地图裁成药圃的长宽比铺满。
    const aspect = boardWidth / boardHeight;
    let sourceWidth = lawn.naturalWidth;
    let sourceHeight = lawn.naturalHeight;
    if (sourceWidth / sourceHeight > aspect) sourceWidth = sourceHeight * aspect;
    else sourceHeight = sourceWidth / aspect;
    context.imageSmoothingQuality = "high";
    context.drawImage(lawn, (lawn.naturalWidth - sourceWidth) / 2, (lawn.naturalHeight - sourceHeight) / 2, sourceWidth, sourceHeight, layout.left, layout.top, boardWidth, boardHeight);
  } else {
    context.fillStyle = "#35806a";
    context.fillRect(layout.left, layout.top, boardWidth, boardHeight);
  }
  // 格子：一深一浅地压在草地上，像修剪出来的纹路。
  for (let lane = 0; lane < ZD_RULES.lanes; lane += 1) {
    for (let row = 0; row < ZD_RULES.rows; row += 1) {
      context.fillStyle = (lane + row) % 2 === 0 ? "rgba(255, 255, 220, .07)" : "rgba(6, 34, 30, .2)";
      context.fillRect(layout.left + lane * layout.cellWidth, layout.top + row * layout.cellHeight, layout.cellWidth, layout.cellHeight);
    }
  }
  // 越靠近僵尸进场的一侧越暗，四周也收一点。
  context.fillStyle = vertical(context, layout.top, layout.top + boardHeight * 0.5, "rgba(20, 22, 50, .55)", "rgba(20, 22, 50, 0)");
  context.fillRect(layout.left, layout.top, boardWidth, boardHeight * 0.5);
  context.lineWidth = 10;
  context.strokeStyle = "rgba(8, 26, 26, .28)";
  roundedPath(context, layout.left, layout.top, boardWidth, boardHeight, 14);
  context.stroke();
  context.restore();
  roundedPath(context, layout.left, layout.top, boardWidth, boardHeight, 14);
  context.lineWidth = 2;
  context.strokeStyle = "rgba(170, 235, 195, .26)";
  context.stroke();

  // 防线：药圃下沿一道矮砖墙，僵尸越过这里就结束。
  const wallTop = bottom + 4;
  const course = 7.5;
  context.fillStyle = "rgba(0, 0, 0, .32)";
  roundedPath(context, layout.left + 1, wallTop + 3, boardWidth - 2, course * 2 + 1, 4);
  context.fill();
  context.save();
  roundedPath(context, layout.left + 1, wallTop, boardWidth - 2, course * 2, 4);
  context.fillStyle = darken(BRICK, 0.55);
  context.fill();
  context.clip();
  for (let row = 0; row < 2; row += 1) {
    let index = row * 5;
    for (let x = layout.left + 1 - (row ? 15 : 0); x < layout.left + boardWidth; x += 30) {
      index += 1;
      const tone = ((index * 37) % 5) / 5;
      const brick = tone < 0.4 ? lighten(BRICK, 0.1 + tone * 0.3) : darken(BRICK, (tone - 0.4) * 0.3);
      roundedPath(context, x + 0.7, wallTop + row * course + 0.7, 28.6, course - 1.4, 1.6);
      context.fillStyle = vertical(context, wallTop + row * course, wallTop + (row + 1) * course, lighten(BRICK, 0.28), brick);
      context.fill();
    }
  }
  context.restore();
}

function drawSelection(context: Context, scene: ZdSceneState, layout: ZdLayout) {
  if (!scene.selected) return;
  const occupied = new Map(scene.game.units.map((unit) => [unit.lane * 100 + unit.row, unit]));
  const shovel = scene.selected === "shovel";
  for (let lane = 0; lane < ZD_RULES.lanes; lane += 1) {
    for (let row = 0; row < ZD_RULES.rows; row += 1) {
      const unit = occupied.get(lane * 100 + row);
      // 选了药材时，还没有这种药材的那些格子也能点：种上去就是杂交。
      const graft = !shovel && unit && unit.kind !== "fizz" && unit.kind !== scene.selected && !unit.grafts.includes(scene.selected as ZdUnitKind);
      if (shovel ? !unit : Boolean(unit) && !graft) continue;
      const x = layout.left + lane * layout.cellWidth;
      const y = layout.top + row * layout.cellHeight;
      roundedPath(context, x + 4, y + 4, layout.cellWidth - 8, layout.cellHeight - 8, 10);
      context.fillStyle = shovel ? "rgba(239, 90, 68, .24)" : graft ? "rgba(255, 209, 102, .16)" : "rgba(255, 255, 255, .1)";
      context.fill();
      context.lineWidth = 1.5;
      context.strokeStyle = shovel ? "rgba(255, 160, 140, .95)" : graft ? "rgba(255, 215, 120, .95)" : "rgba(255, 255, 255, .5)";
      context.stroke();
    }
  }
}

function drawFocus(context: Context, scene: ZdSceneState, layout: ZdLayout) {
  if (!scene.focus) return;
  roundedPath(context, layout.left + scene.focus.lane * layout.cellWidth + 3, layout.top + scene.focus.row * layout.cellHeight + 3, layout.cellWidth - 6, layout.cellHeight - 6, 12);
  context.fillStyle = "rgba(255, 209, 102, .2)";
  context.fill();
  context.lineWidth = 2.5;
  context.strokeStyle = GOLD;
  context.stroke();
}

/** 药材栏、图鉴里的图标：一张图缩进方框正中。 */
export function drawZdUnitIcon(context: Context, kind: ZdUnitKind, size: number) {
  context.clearRect(0, 0, size, size);
  const image = images.get(`u:${kind}`);
  if (!image) return;
  const scale = Math.min((size * 0.94) / image.naturalWidth, (size * 0.94) / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
}

function healthBar(context: Context, x: number, y: number, width: number, ratio: number, color: string) {
  if (ratio >= 0.999) return;
  // 血条每帧要画很多条，用最省事的矩形。
  context.fillStyle = "rgba(8, 12, 18, .7)";
  context.fillRect(x - width / 2 - 1, y - 1, width + 2, 6);
  context.fillStyle = color;
  context.fillRect(x - width / 2, y, Math.max(2, width * Math.max(0, ratio)), 4);
}

/** 一株药材在格子里占多大。 */
function unitSize(layout: ZdLayout) {
  return Math.min(layout.cellWidth, layout.cellHeight) * 0.92;
}

const BADGE_WIDTH = 27;
const BADGE_HEIGHT = 14;

/** 杂交徽标的直径：格子矮就小一点，种数多也小一点。 */
function chipSize(layout: ZdLayout, count: number) {
  return Math.min(20, Math.max(14, layout.cellHeight * 0.25)) * (count > 3 ? 0.88 : 1);
}

/** 格子下沿那一排牌子有多高：等级牌和杂交徽标；什么都没有是 0。 */
function tagRow(unit: ZdUnit, layout: ZdLayout) {
  if (unit.grafts.length) return chipSize(layout, unit.grafts.length) + 3;
  return unit.level >= 2 ? BADGE_HEIGHT + 2 : 0;
}

/** 药材脚底贴地的那条线。脚下有牌子的往上让一点。 */
function unitBase(unit: ZdUnit, layout: ZdLayout) {
  const y = layout.top + (unit.row + 0.5) * layout.cellHeight;
  return y + unitSize(layout) * 0.45 - tagRow(unit, layout) * 0.45;
}

/** 杂交进来的药材：深色小圆牌上一个头像，金边。 */
function chipSprite(kind: ZdUnitKind, diameter: number) {
  const box = diameter + 3;
  return sprite(`chip:${kind}:${diameter.toFixed(1)}`, box, box, (target) => {
    ellipsePath(target, 0, 0, diameter / 2, diameter / 2);
    paint(target, vertical(target, -diameter / 2, diameter / 2, "#35505a", "#16242b"), "rgba(255, 214, 120, .95)", 1.3);
    const image = images.get(`u:${kind}`);
    if (!image) return;
    const scale = Math.min((diameter * 0.8) / image.naturalWidth, (diameter * 0.8) / image.naturalHeight);
    target.imageSmoothingQuality = "high";
    target.drawImage(image, (-image.naturalWidth * scale) / 2, (-image.naturalHeight * scale) / 2, image.naturalWidth * scale, image.naturalHeight * scale);
  });
}

/** 一株药材的本体：图（连影子）和受击的白光。牌子和血条在最后统一画，不会被挡住。 */
function drawUnitBody(context: Context, unit: ZdUnit, layout: ZdLayout, time: number) {
  const x = layout.left + (unit.lane + 0.5) * layout.cellWidth;
  const size = unitSize(layout);
  const base = unitBase(unit, layout);
  const box = size * (tagRow(unit, layout) ? 1.02 : 1.1);
  const ratio = unit.hp / unit.maxHp;
  const variant: ArtVariant = unit.kind === "cabinet" ? (ratio < 0.33 ? "crack2" : ratio < 0.66 ? "crack1" : "") : "";
  const name = `u:${unit.kind}`;
  if (unit.kind === "fizz") {
    // 泡腾片越鼓越大，还在发抖：场上最多一两颗，现缩现贴。
    const charge = 1 - Math.min(1, unit.timer / ZD_UNITS.fizz.interval);
    const swell = 1 + charge * 0.22 + Math.sin(time * 30) * 0.03;
    const art = artSprite(name, box, box, "", true);
    const glow = size * (0.5 + charge * 0.25) * 2;
    stamp(context, glowSprite("fizzglow", "rgba(255, 255, 255, .7)", "rgba(255, 255, 255, .3)", "rgba(255, 255, 255, 0)"), x, base - art.feet / 2, glow, glow);
    context.drawImage(art.canvas, x - (art.width * swell) / 2, base - art.feet * swell, art.width * swell, art.height * swell);
    return;
  }
  // 姿势只有几种，各存一张：平时一起一伏（三档），开火、出药力的一瞬间往下一缩。
  // 烧着的酒精灯 pulse 一直不为零，不算开火。
  const firing = unit.pulse > (unit.kind === "burner" || unit.grafts.includes("burner") ? 0.155 : 0.05);
  const beat = firing ? 0 : Math.round(Math.sin(time * 2.6 + unit.lane * 1.7 + unit.row * 0.9));
  const art = artSprite(name, box, box, variant, true, 0, firing ? 1.07 : 1 - beat * 0.012, firing ? 0.9 : 1 + beat * 0.016);
  blit(context, art, x, base);
  // 挨啃是连续的，白光一闪一闪，不然整株一直发白。
  if (unit.hurt > 0 && (time * 5) % 1 < 0.3) {
    context.globalAlpha = 0.4;
    blit(context, artSprite(name, box, box, "flash"), x, base);
    context.globalAlpha = 1;
  }
  if (unit.kind === "mortar" && unit.pulse > 0) {
    // 研钵出药力：钵口冒几颗金星。
    context.globalAlpha = Math.min(1, unit.pulse * 2);
    stamp(context, sprite("sparks", 44, 24, drawSparks), x, base - art.feet * 0.86 - (0.5 - unit.pulse) * size * 0.2, 44, 24);
    context.globalAlpha = 1;
  }
}

/** 三颗金色的星点：研钵出药力、药材升级时用。 */
function drawSparks(target: Context) {
  for (const [dx, dy, radius] of [[-16, 4, 2.6], [0, -6, 3.2], [15, 2, 2.4]]) {
    ellipsePath(target, dx, dy, radius, radius);
    target.fillStyle = "rgba(255, 232, 150, .95)";
    target.fill();
  }
}

function levelBadge(level: number) {
  return sprite(`lv:${level}`, BADGE_WIDTH + 2, BADGE_HEIGHT + 2, (target) => {
    roundedPath(target, -BADGE_WIDTH / 2, -BADGE_HEIGHT / 2, BADGE_WIDTH, BADGE_HEIGHT, BADGE_HEIGHT / 2);
    paint(target, vertical(target, -BADGE_HEIGHT / 2, BADGE_HEIGHT / 2, lighten(GOLD, 0.3), darken(GOLD, 0.16)), "rgba(60, 40, 8, .85)", 1);
    target.font = `800 ${level >= 100 ? 7.5 : 9}px ui-rounded, "SF Pro Rounded", system-ui, sans-serif`;
    target.textAlign = "center";
    target.textBaseline = "middle";
    target.fillStyle = "#3a2a05";
    target.fillText(`Lv${level}`, 0, 0.5);
  });
}

/** 药材脚下的一排牌子（等级、杂交进来的几种）和血条。 */
function drawUnitTags(context: Context, unit: ZdUnit, layout: ZdLayout) {
  const x = layout.left + (unit.lane + 0.5) * layout.cellWidth;
  const bottom = layout.top + (unit.row + 1) * layout.cellHeight;
  const count = unit.grafts.length;
  const row = tagRow(unit, layout);
  if (row) {
    const diameter = count ? chipSize(layout, count) : 0;
    const badge = unit.level >= 2 ? BADGE_WIDTH + 2 : 0;
    // 放不下就让圆牌叠着排。
    const room = layout.cellWidth - 6 - badge;
    const step = count > 1 ? Math.min(diameter + 1.5, (room - diameter) / (count - 1)) : 0;
    const chips = count ? diameter + step * (count - 1) : 0;
    let cursor = x - (badge + chips) / 2;
    const centerY = bottom - row / 2 - 1.5;
    if (badge) {
      stamp(context, levelBadge(unit.level), cursor + BADGE_WIDTH / 2, centerY, BADGE_WIDTH + 2, BADGE_HEIGHT + 2);
      cursor += badge;
    }
    for (let index = 0; index < count; index += 1) {
      stamp(context, chipSprite(unit.grafts[index], diameter), cursor + diameter / 2 + index * step, centerY, diameter + 3, diameter + 3);
    }
  }
  if (unit.kind !== "fizz") healthBar(context, x, bottom - row - 8, layout.cellWidth * 0.5, unit.hp / unit.maxHp, "#7fe08a");
}

function isBurning(unit: ZdUnit) {
  return unit.pulse > 0 && (unit.kind === "burner" || unit.grafts.includes("burner"));
}

/** 正在烧的格子：每盏烧着的酒精灯前方两格、左右三路。几盏灯烧到同一格只算一次。 */
function burningCells(units: ZdUnit[]) {
  const cells = new Set<number>();
  for (const unit of units) {
    if (!isBurning(unit)) continue;
    for (let lane = Math.max(0, unit.lane - 1); lane <= Math.min(ZD_RULES.lanes - 1, unit.lane + 1); lane += 1) {
      for (let row = unit.row - 1; row >= Math.max(0, Math.ceil(unit.row - ZD_RULES.burnReach)); row -= 1) cells.add(lane * 100 + row);
    }
  }
  // 种着药材的格子不画火：僵尸走不到那里，火苗盖在药材身上只会显得乱。
  if (cells.size) for (const unit of units) cells.delete(unit.lane * 100 + unit.row);
  return cells;
}

/** 烧着的格子地上一片暖光。 */
function drawBurnGlow(context: Context, cells: Set<number>, layout: ZdLayout) {
  const width = layout.cellWidth * 1.3;
  const height = layout.cellHeight * 1.3;
  const glow = sprite("burnglow", width, height, (target) => {
    target.scale(1, height / width);
    const fill = target.createRadialGradient(0, 0, 0, 0, 0, width / 2);
    fill.addColorStop(0, "rgba(255, 150, 50, .42)");
    fill.addColorStop(0.6, "rgba(255, 110, 36, .2)");
    fill.addColorStop(1, "rgba(255, 96, 32, 0)");
    target.fillStyle = fill;
    target.fillRect(-width / 2, -width / 2, width, width);
  });
  for (const cell of cells) {
    stamp(context, glow, layout.left + (Math.floor(cell / 100) + 0.5) * layout.cellWidth, layout.top + ((cell % 100) + 0.5) * layout.cellHeight, width, height);
  }
}

/** 烧着的格子里蹿动的火苗，画在僵尸身上。 */
function drawBurnFlames(context: Context, cells: Set<number>, layout: ZdLayout, time: number) {
  const flameHeight = Math.min(layout.cellWidth, layout.cellHeight) * 0.4;
  const flameWidth = flameHeight * 0.62;
  const flame = sprite(`flame:${flameHeight.toFixed(1)}`, flameWidth, flameHeight, (target) => {
    const tongue = (halfWidth: number, tip: number, from: string, to: string) => {
      target.beginPath();
      target.moveTo(0, tip);
      target.bezierCurveTo(halfWidth * 1.5, tip + (flameHeight / 2 - tip) * 0.5, halfWidth, flameHeight / 2, 0, flameHeight / 2);
      target.bezierCurveTo(-halfWidth, flameHeight / 2, -halfWidth * 1.5, tip + (flameHeight / 2 - tip) * 0.5, 0, tip);
      target.closePath();
      target.fillStyle = vertical(target, tip, flameHeight / 2, from, to);
      target.fill();
    };
    tongue(flameWidth * 0.36, -flameHeight / 2, "rgba(255, 190, 64, .92)", "rgba(236, 72, 28, .85)");
    tongue(flameWidth * 0.2, -flameHeight * 0.12, "rgba(255, 250, 210, .96)", "rgba(255, 186, 66, .92)");
  });
  for (const cell of cells) {
    const lane = Math.floor(cell / 100);
    const row = cell % 100;
    // 每格两簇，位置由格子编号定死，大小各自忽闪。
    for (let index = 0; index < 2; index += 1) {
      const seed = lane * 17 + row * 29 + index * 7;
      const flicker = (0.6 + (0.5 * ((seed * 13) % 5)) / 5) * (0.78 + 0.3 * Math.abs(Math.sin(time * 9 + seed * 1.9)));
      const x = layout.left + (lane + 0.28 + index * 0.44 + Math.sin(seed * 3.3) * 0.08) * layout.cellWidth;
      const foot = layout.top + (row + 0.42 + ((seed * 7) % 10) / 20) * layout.cellHeight;
      const width = flameWidth * (0.8 + flicker * 0.25);
      const height = flameHeight * flicker;
      context.drawImage(flame, x - width / 2, foot - height, width, height);
    }
  }
}

const ZOMBIE_LOOK: Record<ZdZombieKind, { scale: number; pace: number }> = {
  walker: { scale: 1, pace: 6 },
  runner: { scale: 0.98, pace: 13 },
  beaker: { scale: 1.04, pace: 6 },
  giant: { scale: 1.34, pace: 4 },
  thesis: { scale: 1.42, pace: 4.4 },
  mentor: { scale: 1.6, pace: 3.2 },
};

/** 一只普通僵尸有多高。 */
function zombieHeight(layout: ZdLayout) {
  return Math.min(layout.cellWidth, layout.cellHeight) * 1.16;
}

/** 僵尸脚底贴地的那条线。 */
function zombieFeet(zombie: ZdZombie, layout: ZdLayout) {
  return layout.top + zombie.y * layout.cellHeight + Math.min(layout.cellWidth, layout.cellHeight) * 0.42;
}

/** 场上的僵尸超过这么多只算“扎堆”：叠在一起的不再一只只画。 */
const CROWD = 140;
const SLOTS = 64;
const crowdSlots = new Uint8Array(ZD_RULES.lanes * SLOTS);

/**
 * 扎堆时挑出要画的僵尸：同一路里前后不到三分之一格的算叠在一起，大个子和小个子各留最靠前的一只。
 * 被挡在后面的本来也看不见；这样后期几百只僵尸，实际贴的图只有一两百张。zombies 要按从远到近排好。
 */
function thinCrowd(zombies: ZdZombie[]) {
  crowdSlots.fill(0);
  const shown: ZdZombie[] = [];
  for (let index = zombies.length - 1; index >= 0; index -= 1) {
    const zombie = zombies[index];
    const slot = zombie.lane * SLOTS + Math.min(SLOTS - 1, Math.max(0, Math.floor((zombie.y + 2) * 3)));
    const size = ZOMBIE_LOOK[zombie.kind].scale > 1.2 ? 2 : 1;
    if (crowdSlots[slot] & size) continue;
    crowdSlots[slot] |= size;
    shown.push(zombie);
  }
  return shown.reverse();
}

/**
 * 画一只僵尸：走路时左、正、右三种歪法轮着来，一步一颠；啃咬时往前一下一下地扑。
 * 三种歪法各是一张存好的图，对局里只是原样贴图。
 */
function drawZombieBody(context: Context, zombie: ZdZombie, layout: ZdLayout, time: number) {
  const look = ZOMBIE_LOOK[zombie.kind];
  const tall = zombieHeight(layout) * look.scale;
  const x = layout.left + (zombie.lane + 0.5) * layout.cellWidth;
  let y = zombieFeet(zombie, layout);
  const name = `z:${zombie.kind}`;
  const swing = Math.sin((zombie.biting ? time * 15 : time * look.pace) + zombie.id * 1.7);
  let tilt = 0;
  if (zombie.biting) y += Math.max(0, swing) * tall * 0.05;
  else {
    tilt = Math.round(swing) * 0.07;
    y -= Math.abs(swing) * tall * 0.03;
  }
  const alpha = Math.min(1, Math.max(0, (zombie.y - ZD_RULES.spawnY) / 0.45));
  if (alpha < 1) context.globalAlpha = alpha;
  blit(context, artSprite(name, tall, tall, zombie.slow > 0 ? "slow" : "", true, tilt), x, y);
  // 只在刚挨打的一瞬间闪一下白；后期僵尸一直在挨打，一直罩着白就看不清了。
  if (zombie.hurt > 0.07) {
    context.globalAlpha = alpha * 0.45;
    blit(context, artSprite(name, tall, tall, "flash", false, tilt), x, y);
  }
  context.globalAlpha = 1;
}

function drawShot(context: Context, shot: ZdShot, layout: ZdLayout) {
  const x = layout.left + (shot.lane + 0.5) * layout.cellWidth;
  const y = layout.top + shot.y * layout.cellHeight;
  // 子弹连拖尾一共 36 高，小图的正中在弹头下方 8 处。
  stamp(context, sprite(`s:${shot.kind}:${shot.tint}`, 28, 52, (target) => {
    if (shot.tint) {
      // 点燃的带一团火光，带寒气的带一团冷光。
      const glow = target.createRadialGradient(0, -8, 2, 0, -8, 14);
      glow.addColorStop(0, shot.tint === "fire" ? "rgba(255, 170, 60, .8)" : "rgba(160, 230, 255, .8)");
      glow.addColorStop(1, shot.tint === "fire" ? "rgba(255, 120, 30, 0)" : "rgba(140, 215, 255, 0)");
      target.fillStyle = glow;
      target.fillRect(-14, -24, 28, 34);
    }
    paintShot(target, shot.kind, 0, -8);
    if (shot.tint) {
      target.globalCompositeOperation = "source-atop";
      target.fillStyle = shot.tint === "fire" ? "rgba(255, 130, 30, .3)" : "rgba(170, 230, 255, .35)";
      target.fillRect(-14, -26, 28, 52);
      target.globalCompositeOperation = "source-over";
    }
  }), x, y + 8, 28, 52);
}

function paintShot(context: Context, kind: ZdShot["kind"], x: number, y: number) {
  const mint = kind === "mint";
  const color = mint ? MINT : RED;
  // 拖尾
  context.fillStyle = vertical(context, y, y + 28, mint ? "rgba(140, 240, 215, .6)" : "rgba(255, 170, 140, .6)", "rgba(255, 255, 255, 0)");
  context.beginPath();
  context.moveTo(x - 4.5, y);
  context.lineTo(x + 4.5, y);
  context.lineTo(x, y + 28);
  context.closePath();
  context.fill();
  if (mint) {
    context.beginPath();
    context.moveTo(x, y - 10);
    context.bezierCurveTo(x + 9, y - 1, x + 7, y + 8, x, y + 8);
    context.bezierCurveTo(x - 7, y + 8, x - 9, y - 1, x, y - 10);
    paint(context, vertical(context, y - 10, y + 8, "#e9fff8", color), darken(color, 0.5), 1.2);
    ellipsePath(context, x - 2, y - 1, 1.6, 3, 0.3);
    context.fillStyle = "rgba(255, 255, 255, .8)";
    context.fill();
    return;
  }
  roundedPath(context, x - 5.5, y - 11, 11, 21, 5.5);
  paint(context, CREAM, null);
  context.save();
  context.beginPath();
  context.rect(x - 6.5, y - 12, 13, 11.5);
  context.clip();
  roundedPath(context, x - 5.5, y - 11, 11, 21, 5.5);
  paint(context, color, null);
  context.restore();
  roundedPath(context, x - 5.5, y - 11, 11, 21, 5.5);
  context.lineWidth = 1.2;
  context.strokeStyle = "rgba(96, 40, 24, .75)";
  context.stroke();
  ellipsePath(context, x - 2.2, y - 5, 1.4, 4, 0);
  context.fillStyle = "rgba(255, 255, 255, .6)";
  context.fill();
}

/** 一团从中心往外淡出的光。 */
function glowSprite(key: string, inner: string, middle: string, outer: string) {
  return sprite(key, 64, 64, (target) => {
    const fill = target.createRadialGradient(0, 0, 0, 0, 0, 32);
    fill.addColorStop(0, inner);
    fill.addColorStop(0.5, middle);
    fill.addColorStop(1, outer);
    target.fillStyle = fill;
    target.fillRect(-32, -32, 64, 64);
  });
}

/** 一个圆环，贴的时候再拉成需要的大小。 */
function ringSprite(key: string, color: string) {
  return sprite(key, 64, 64, (target) => {
    ellipsePath(target, 0, 0, 29, 29);
    target.lineWidth = 3;
    target.strokeStyle = color;
    target.stroke();
  });
}

// “+25” 这样的字，每种写一次存起来。数值种类多，存得太多就整批丢掉重来。
const labels = new Map<string, HTMLCanvasElement>();

function labelSprite(text: string) {
  let canvas = labels.get(text);
  if (!canvas) {
    if (labels.size > 240) labels.clear();
    const width = text.length * 9 + 10;
    canvas = document.createElement("canvas");
    canvas.width = Math.ceil(width * pixel);
    canvas.height = Math.ceil(20 * pixel);
    const target = canvas.getContext("2d");
    if (target) {
      target.scale(pixel, pixel);
      target.font = "800 14px ui-rounded, \"SF Pro Rounded\", system-ui, sans-serif";
      target.textAlign = "center";
      target.textBaseline = "middle";
      target.lineJoin = "round";
      target.lineWidth = 3;
      target.strokeStyle = "rgba(40, 28, 8, .8)";
      target.strokeText(text, width / 2, 10.5);
      target.fillStyle = GOLD;
      target.fillText(text, width / 2, 10.5);
    }
    labels.set(text, canvas);
  }
  return canvas;
}

// 每种特效同时最多画这么多个（取最新的）。后期一秒几十次击退，全画出来既看不清，也是拖慢画面的大头。
const EFFECT_LIMIT: Record<ZdEffect["kind"], number> = { boom: 10, energy: 24, puff: 40, level: 12, beam: 20 };
const effectBudget: Record<ZdEffect["kind"], number> = { boom: 0, energy: 0, puff: 0, level: 0, beam: 0 };

/** 画特效。全部是贴存好的小图，只改大小和透明度，不在对局里现画路径和文字。 */
function drawEffects(context: Context, effects: ZdEffect[], layout: ZdLayout) {
  effectBudget.boom = EFFECT_LIMIT.boom;
  effectBudget.energy = EFFECT_LIMIT.energy;
  effectBudget.puff = EFFECT_LIMIT.puff;
  effectBudget.level = EFFECT_LIMIT.level;
  effectBudget.beam = EFFECT_LIMIT.beam;
  for (let index = effects.length - 1; index >= 0; index -= 1) {
    const effect = effects[index];
    if (effectBudget[effect.kind] <= 0) continue;
    effectBudget[effect.kind] -= 1;
    const x = layout.left + (effect.lane + 0.5) * layout.cellWidth;
    const y = layout.top + effect.y * layout.cellHeight;
    const progress = Math.min(1, effect.age / effect.life);
    const fade = 1 - progress;
    if (effect.kind === "boom") {
      // 泡腾片炸开：一团白光、一圈冲击波和四散的泡泡。
      const reach = 0.5 + progress * 1.1;
      const width = reach * layout.cellWidth * 2.3;
      const height = reach * layout.cellHeight * 2.4;
      context.globalAlpha = fade;
      stamp(context, glowSprite("burst", "rgba(255, 255, 255, .95)", "rgba(226, 246, 255, .6)", "rgba(200, 235, 255, 0)"), x, y, width * 1.05, height * 1.05);
      stamp(context, ringSprite("ring:white", "rgba(255, 255, 255, .95)"), x, y, width, height);
      stamp(context, sprite("bubbles", 64, 64, (target) => {
        for (let bubble = 0; bubble < 12; bubble += 1) {
          const angle = (bubble / 12) * TAU + bubble;
          const distance = 15 + (bubble % 3) * 5;
          ellipsePath(target, Math.cos(angle) * distance, Math.sin(angle) * distance, 2.6, 2.6);
          paint(target, "rgba(255, 255, 255, .5)", "rgba(255, 255, 255, .95)", 0.8);
        }
      }), x, y, width, height);
    } else if (effect.kind === "energy") {
      const label = labelSprite(`+${effect.amount ?? ZD_RULES.passiveEnergy}`);
      const width = label.width / pixel;
      context.globalAlpha = 1 - progress * progress;
      context.drawImage(label, x - width / 2, y - 18 - progress * 24, width, 20);
    } else if (effect.kind === "beam") {
      // 安瓿炮的一发：一道中间亮、两边虚的光柱从炮口打到药圃顶上，炮口闪一下。
      const tint = effect.tint || "plain";
      const color = tint === "fire" ? "255, 140, 50" : tint === "frost" ? "140, 215, 255" : "255, 206, 96";
      const strip = sprite(`beam:${tint}`, 32, 4, (target) => {
        const fill = target.createLinearGradient(-16, 0, 16, 0);
        fill.addColorStop(0, `rgba(${color}, 0)`);
        fill.addColorStop(0.3, `rgba(${color}, .75)`);
        fill.addColorStop(0.5, "rgba(255, 255, 255, 1)");
        fill.addColorStop(0.7, `rgba(${color}, .75)`);
        fill.addColorStop(1, `rgba(${color}, 0)`);
        target.fillStyle = fill;
        target.fillRect(-16, -2, 32, 4);
      });
      const width = 10 + 22 * fade;
      context.globalAlpha = Math.min(1, fade * 1.4);
      context.drawImage(strip, x - width / 2, layout.top, width, Math.max(0, y - layout.top));
      stamp(context, glowSprite(`beamflash:${tint}`, "rgba(255, 255, 255, 1)", `rgba(${color}, .5)`, `rgba(${color}, 0)`), x, y, 30 + 34 * fade, 30 + 34 * fade);
    } else if (effect.kind === "level") {
      // 升级、杂交：一圈金光往外扩，几颗星点往上飘。
      const size = 0.5 + progress * 0.7;
      context.globalAlpha = fade;
      stamp(context, ringSprite("ring:gold", "rgba(255, 214, 110, .95)"), x, y, layout.cellWidth * size, layout.cellHeight * size);
      stamp(context, sprite("sparks", 44, 24, drawSparks), x, y - progress * 36, 44, 24);
    } else {
      // 僵尸倒下：一小团散开的灰烟。
      const size = 1 + progress * 0.6;
      context.globalAlpha = fade * 0.9;
      stamp(context, sprite("puff", 56, 48, (target) => {
        for (const [dx, dy, radius] of [[-10, 2, 12], [8, -3, 14], [0, 9, 10]]) {
          const fill = target.createRadialGradient(dx, dy, 0, dx, dy, radius);
          fill.addColorStop(0, "rgba(232, 238, 232, .55)");
          fill.addColorStop(1, "rgba(232, 238, 232, 0)");
          target.fillStyle = fill;
          target.fillRect(dx - radius, dy - radius, radius * 2, radius * 2);
        }
      }), x, y - progress * 8, 56 * size, 48 * size);
    }
  }
  context.globalAlpha = 1;
}

export function drawZdScene(context: Context, scene: ZdSceneState) {
  const layout = zdLayout(scene.width, scene.height);
  const game = scene.game;
  useSprites(context, scene, layout);
  // 天色、草地和路牙不会变，整张存起来。
  const board = sprite("board", scene.width, scene.height, (target) => {
    target.translate(-scene.width / 2, -scene.height / 2);
    drawBoard(target, scene, layout);
  });
  context.drawImage(board, 0, 0, scene.width, scene.height);
  drawSelection(context, scene, layout);
  drawFocus(context, scene, layout);

  const units = [...game.units].sort((left, right) => left.row - right.row);
  const sorted = [...game.zombies].sort((left, right) => left.y - right.y);
  const zombies = sorted.length > CROWD ? thinCrowd(sorted) : sorted;
  const burning = burningCells(units);
  if (burning.size) drawBurnGlow(context, burning, layout);
  // 药材和僵尸按脚底的位置从远到近画，近的压住远的。
  let next = 0;
  for (const unit of units) {
    const depth = unitBase(unit, layout);
    while (next < zombies.length && zombieFeet(zombies[next], layout) <= depth) {
      drawZombieBody(context, zombies[next], layout, game.time);
      next += 1;
    }
    drawUnitBody(context, unit, layout, game.time);
  }
  for (; next < zombies.length; next += 1) drawZombieBody(context, zombies[next], layout, game.time);

  if (burning.size) drawBurnFlames(context, burning, layout, game.time);
  for (const shot of game.shots) drawShot(context, shot, layout);
  for (const unit of units) drawUnitTags(context, unit, layout);
  for (const zombie of zombies) {
    if (zombie.y - ZD_RULES.spawnY < 0.45) continue;
    const tall = zombieHeight(layout) * ZOMBIE_LOOK[zombie.kind].scale;
    healthBar(context, layout.left + (zombie.lane + 0.5) * layout.cellWidth, zombieFeet(zombie, layout) - tall - 7, tall * 0.42, zombie.hp / zombie.maxHp, "#ff7a66");
  }
  drawEffects(context, game.effects, layout);
}

/** 主菜单的招牌图：一名胶囊射手对着一只僵尸。 */
export function drawZdMenuArt(context: Context, size: number) {
  context.clearRect(0, 0, size, size);
  const place = (name: string, centerX: number, bottom: number, box: number) => {
    const image = images.get(name);
    if (!image) return;
    const scale = Math.min(box / image.naturalWidth, box / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    groundShadow(context, centerX, bottom - height * 0.02, width * 0.4, height * 0.06, 0.4);
    context.imageSmoothingQuality = "high";
    context.drawImage(image, centerX - width / 2, bottom - height, width, height);
  };
  place("z:walker", size * 0.66, size * 0.9, size * 0.74);
  place("u:capsule", size * 0.3, size * 0.92, size * 0.48);
}
