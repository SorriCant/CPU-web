// 贪吃奶龙的画面。奶龙的头、身子和吃的各是一张图（src/assets/greedy-nailong），换形象只需要替换图片文件；
// 场地是画出来的。只按引擎状态作画，不改状态。
import bodyArt from "@/assets/greedy-nailong/body.webp";
import feastArt from "@/assets/greedy-nailong/feast.webp";
import headDeadArt from "@/assets/greedy-nailong/head-dead.webp";
import headEatArt from "@/assets/greedy-nailong/head-eat.webp";
import headArt from "@/assets/greedy-nailong/head.webp";
import menuArt from "@/assets/greedy-nailong/menu.webp";
import pillArt from "@/assets/greedy-nailong/pill.webp";
import snack1 from "@/assets/greedy-nailong/snack-1.webp";
import snack2 from "@/assets/greedy-nailong/snack-2.webp";
import snack3 from "@/assets/greedy-nailong/snack-3.webp";
import snack4 from "@/assets/greedy-nailong/snack-4.webp";
import snack5 from "@/assets/greedy-nailong/snack-5.webp";
import snack6 from "@/assets/greedy-nailong/snack-6.webp";
import snack7 from "@/assets/greedy-nailong/snack-7.webp";
import snack8 from "@/assets/greedy-nailong/snack-8.webp";
import { groundShadow, roundedPath, vertical, type Context } from "./gameArt";
import { NL_RULES, nlStepSeconds, nlVector, type NlCell, type NlItem, type NlState } from "./greedyNailongEngine";

export interface NlLayout {
  left: number;
  top: number;
  cell: number;
}

/** 飘起来的“+10”。页面在吃到东西时加一条，过一会儿自己去掉。 */
export interface NlFloater {
  text: string;
  x: number;
  y: number;
  /** 出现时的对局时间（秒）。 */
  born: number;
}

export interface NlSceneState {
  /** 逻辑宽高：宽固定 420，高随屏幕比例变化。 */
  width: number;
  height: number;
  game: NlState;
  floaters: NlFloater[];
}

export const NL_FLOATER_SECONDS = 0.8;
const TOP_RESERVE = 88;
const BOTTOM_RESERVE = 46;
const SNACKS = [snack1, snack2, snack3, snack4, snack5, snack6, snack7, snack8];

const ART: Record<string, string> = {
  head: headArt,
  "head-eat": headEatArt,
  "head-dead": headDeadArt,
  body: bodyArt,
  menu: menuArt,
  feast: feastArt,
  pill: pillArt,
};
SNACKS.forEach((source, index) => {
  ART[`snack-${index}`] = source;
});

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
    // 图没加载出来就用一个纯色的圆顶着，不影响玩。
    image.onerror = () => resolve();
    image.src = source;
  }))).then(() => undefined);
}

/** 图都加载完（或失败）以后完成，页面据此重画已经画出去的图标和招牌图。 */
export const nlArtReady = loadArt();

// 每种图按屏幕上的大小缩好存起来，对局里只做不缩放的原样贴图。
const sprites = new Map<string, HTMLCanvasElement>();
let spriteSignature = "";
let pixel = 1;

function useSprites(context: Context, scene: NlSceneState, layout: NlLayout) {
  const scale = typeof context.getTransform === "function" ? context.getTransform().a : 2;
  pixel = Math.min(4, Math.max(0.5, scale || 1));
  const signature = `${pixel.toFixed(3)}:${scene.width}:${scene.height.toFixed(1)}:${layout.cell.toFixed(2)}:${artVersion}`;
  if (signature !== spriteSignature) {
    sprites.clear();
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

/** 把小图原样贴到画布上，正中在 (x, y)；位置对齐到屏幕像素。 */
function blit(context: Context, canvas: HTMLCanvasElement, x: number, y: number) {
  const width = canvas.width / pixel;
  const height = canvas.height / pixel;
  context.drawImage(canvas, Math.round((x - width / 2) * pixel) / pixel, Math.round((y - height / 2) * pixel) / pixel, width, height);
}

/** 一张图缩进边长 box 的方框里，可以歪一点（tilt）；fallback 是图没加载出来时顶替的颜色。 */
function artSprite(name: string, box: number, tilt = 0, fallback = "#ffd95e") {
  const side = box * (1 + Math.abs(Math.sin(tilt)) * 0.5);
  return sprite(`a:${name}:${box.toFixed(1)}:${tilt.toFixed(2)}`, side, side, (target) => {
    const image = images.get(name);
    target.rotate(tilt);
    if (!image) {
      target.beginPath();
      target.arc(0, 0, box * 0.42, 0, Math.PI * 2);
      target.fillStyle = fallback;
      target.fill();
      return;
    }
    const scale = Math.min(box / image.naturalWidth, box / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    target.imageSmoothingQuality = "high";
    target.drawImage(image, -width / 2, -height / 2, width, height);
  });
}

/** 场地在画布里的位置：顶部让出计分牌，底部让出一行提示；格子大小随屏幕高度收放，二十行总能全看到。 */
export function nlLayout(width: number, height: number): NlLayout {
  const room = height - TOP_RESERVE - BOTTOM_RESERVE;
  const cell = Math.max(12, Math.min((width - 24) / NL_RULES.columns, room / NL_RULES.rows));
  return {
    cell,
    left: (width - cell * NL_RULES.columns) / 2,
    top: TOP_RESERVE + Math.max(0, (room - cell * NL_RULES.rows) * 0.5),
  };
}

function drawBoard(context: Context, scene: NlSceneState, layout: NlLayout) {
  const { width, height } = scene;
  const boardWidth = layout.cell * NL_RULES.columns;
  const boardHeight = layout.cell * NL_RULES.rows;
  context.fillStyle = vertical(context, 0, height, "#fff3c4", "#ffe2a0");
  context.fillRect(0, 0, width, height);
  // 托盘：一圈厚边，里面是深浅相间的草绿格子。
  const rim = 7;
  context.fillStyle = "rgba(120, 78, 20, .18)";
  roundedPath(context, layout.left - rim, layout.top - rim + 5, boardWidth + rim * 2, boardHeight + rim * 2, 20);
  context.fill();
  roundedPath(context, layout.left - rim, layout.top - rim, boardWidth + rim * 2, boardHeight + rim * 2, 20);
  context.fillStyle = vertical(context, layout.top - rim, layout.top + boardHeight + rim, "#7fbf5a", "#5fa046");
  context.fill();
  context.save();
  roundedPath(context, layout.left, layout.top, boardWidth, boardHeight, 13);
  context.clip();
  for (let y = 0; y < NL_RULES.rows; y += 1) {
    for (let x = 0; x < NL_RULES.columns; x += 1) {
      context.fillStyle = (x + y) % 2 === 0 ? "#b9e28c" : "#aedb80";
      context.fillRect(layout.left + x * layout.cell, layout.top + y * layout.cell, layout.cell + 0.5, layout.cell + 0.5);
    }
  }
  // 贴着边的一圈暗一点，提醒这里是墙。
  context.lineWidth = 6;
  context.strokeStyle = "rgba(60, 110, 40, .2)";
  roundedPath(context, layout.left, layout.top, boardWidth, boardHeight, 13);
  context.stroke();
  context.restore();
}

function cellCenter(layout: NlLayout, x: number, y: number) {
  return { x: layout.left + (x + 0.5) * layout.cell, y: layout.top + (y + 0.5) * layout.cell };
}

function shadowSprite(radius: number) {
  return sprite(`shadow:${radius.toFixed(1)}`, radius * 2.2, radius, (target) => groundShadow(target, 0, 0, radius, radius * 0.4, 0.3));
}

function drawItem(context: Context, item: NlItem, layout: NlLayout, time: number) {
  const center = cellCenter(layout, item.x, item.y);
  // 吃的画得比格子大一圈，小屏幕上也认得出是什么。
  const box = layout.cell * (item.kind === "feast" ? 1.95 : item.kind === "pill" ? 1.4 : 1.5);
  const bob = Math.sin(time * 3.2 + item.x * 1.3 + item.y * 0.7) * layout.cell * 0.05;
  const name = item.kind === "snack" ? `snack-${item.look}` : item.kind;
  blit(context, shadowSprite(box * 0.34), center.x, center.y + box * 0.36);
  if (item.kind !== "snack") {
    // 限时的东西外面一圈倒计时；快没了的时候一闪一闪。
    const total = item.kind === "feast" ? NL_RULES.feastSeconds : NL_RULES.pillSeconds;
    const share = Math.max(0, Math.min(1, item.left / total));
    if (item.left < 2 && Math.floor(time * 6) % 2 === 0) context.globalAlpha = 0.45;
    const radius = box * (item.kind === "feast" ? 0.5 : 0.56);
    context.lineWidth = 3.5;
    context.lineCap = "round";
    context.strokeStyle = "rgba(255, 255, 255, .55)";
    context.beginPath();
    context.arc(center.x, center.y, radius, 0, Math.PI * 2);
    context.stroke();
    context.strokeStyle = item.kind === "feast" ? "#ff6a3d" : "#38a169";
    context.beginPath();
    context.arc(center.x, center.y, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * share);
    context.stroke();
  }
  blit(context, artSprite(name, box, 0, item.kind === "pill" ? "#ffffff" : "#ff9a5c"), center.x, center.y + bob - layout.cell * 0.04);
  context.globalAlpha = 1;
}

/** 一节身子在两格之间的位置：progress 为 0 时还在上一格，为 1 时到了这一格。 */
function between(layout: NlLayout, from: NlCell, to: NlCell, progress: number) {
  const a = cellCenter(layout, from.x, from.y);
  const b = cellCenter(layout, to.x, to.y);
  return { x: a.x + (b.x - a.x) * progress, y: a.y + (b.y - a.y) * progress };
}

function drawSnake(context: Context, scene: NlSceneState, layout: NlLayout) {
  const game = scene.game;
  const snake = game.snake;
  const progress = Math.max(0, Math.min(1, game.stepTimer / nlStepSeconds(game.foods)));
  const count = snake.length;
  // 从尾巴往头画，前面的压住后面的。最后三节一节比一节小。
  for (let index = count - 1; index >= 1; index -= 1) {
    const from = index + 1 < count ? snake[index + 1] : game.tailGhost ?? snake[index];
    const point = between(layout, from, snake[index], progress);
    const fromTail = count - 1 - index;
    // 一节比格子大，前后压在一起，连成一条圆滚滚的身子。
    const size = layout.cell * (fromTail === 0 ? 0.86 : fromTail === 1 ? 1.02 : fromTail === 2 ? 1.14 : 1.24);
    blit(context, shadowSprite(size * 0.42), point.x, point.y + size * 0.36);
    blit(context, artSprite("body", size), point.x, point.y);
  }
  const head = between(layout, snake[1] ?? snake[0], snake[0], progress);
  const vector = nlVector(game.direction);
  // 前面两格以内有吃的就张大嘴；刚吃完嚼两下；撞了是晕的。
  let look = "head";
  if (game.over && game.cause !== "full") look = "head-dead";
  else if (game.chewing > 0.16) look = "head-eat";
  else {
    for (let step = 1; step <= 2 && look === "head"; step += 1) {
      const x = snake[0].x + vector.x * step;
      const y = snake[0].y + vector.y * step;
      if (game.items.some((item) => item.x === x && item.y === y)) look = "head-eat";
    }
  }
  const size = layout.cell * 1.9;
  const x = head.x;
  let y = head.y - layout.cell * 0.1;
  // 嚼的时候头一点一点。
  if (look !== "head-dead" && game.chewing > 0) y += Math.sin(game.chewing * 40) * layout.cell * 0.04;
  blit(context, shadowSprite(size * 0.4), head.x, head.y + size * 0.36);
  blit(context, artSprite(look, size, vector.x * 0.14), x, y);
}

// “+10” 这样的字，每种写一次存起来。
function labelSprite(text: string) {
  const width = text.length * 10 + 12;
  return sprite(`label:${text}`, width, 24, (target) => {
    target.font = "900 16px ui-rounded, \"SF Pro Rounded\", system-ui, sans-serif";
    target.textAlign = "center";
    target.textBaseline = "middle";
    target.lineJoin = "round";
    target.lineWidth = 4;
    target.strokeStyle = "rgba(255, 255, 255, .95)";
    target.strokeText(text, 0, 0.5);
    target.fillStyle = "#e8590c";
    target.fillText(text, 0, 0.5);
  });
}

export function drawNlScene(context: Context, scene: NlSceneState) {
  const layout = nlLayout(scene.width, scene.height);
  const game = scene.game;
  useSprites(context, scene, layout);
  const board = sprite("board", scene.width, scene.height, (target) => {
    target.translate(-scene.width / 2, -scene.height / 2);
    drawBoard(target, scene, layout);
  });
  context.drawImage(board, 0, 0, scene.width, scene.height);
  for (const item of game.items) drawItem(context, item, layout, game.time);
  drawSnake(context, scene, layout);
  for (const floater of scene.floaters) {
    const age = (game.time - floater.born) / NL_FLOATER_SECONDS;
    if (age < 0 || age >= 1) continue;
    const center = cellCenter(layout, floater.x, floater.y);
    context.globalAlpha = 1 - age * age;
    blit(context, labelSprite(floater.text), center.x, center.y - layout.cell * (0.7 + age * 0.9));
  }
  context.globalAlpha = 1;
}

/** 把一张图缩进方形画布正中：主菜单的招牌图和设置里的图标用。 */
function drawFitted(context: Context, name: string, size: number, share: number) {
  context.clearRect(0, 0, size, size);
  const image = images.get(name);
  if (!image) return;
  const scale = Math.min((size * share) / image.naturalWidth, (size * share) / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
}

/** 主菜单的招牌图：系着围兜、举着刀叉的奶龙。 */
export function drawNlMenuArt(context: Context, size: number) {
  drawFitted(context, "menu", size, 0.92);
}

/** 设置页里的小图标：第几种零食（0 起）、火锅或消食片。 */
export function drawNlIcon(context: Context, name: number | "feast" | "pill" | "head", size: number) {
  drawFitted(context, typeof name === "number" ? `snack-${name}` : name, size, 0.94);
}
