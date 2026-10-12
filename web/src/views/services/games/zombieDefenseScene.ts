// 药大人大战僵尸的画面：黄昏里的药圃、药材、僵尸和特效。只按引擎状态作画，不改状态。
import {
  darken,
  ellipsePath,
  gloss,
  groundShadow,
  horizontal,
  lighten,
  paint,
  roundedPath,
  vertical,
  volume,
  type Context,
} from "./gameArt";
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
const WOOD = "#b98556";
const DARK = "#2b2330";
const TAU = Math.PI * 2;

// 画面里的东西大多是重复的：棋盘、同一种药材、同一种僵尸的同一帧。先画到小画布上存起来，
// 对局里只贴图；后期场上几百只僵尸，每帧也只是几百次贴图，不用再一笔一笔画。
const sprites = new Map<string, HTMLCanvasElement>();
let spriteSignature = "";
let pixel = 1;

/** 画布缩放或格子大小变了，存的小图就都作废。 */
function useSprites(context: Context, scene: ZdSceneState, layout: ZdLayout) {
  const scale = typeof context.getTransform === "function" ? context.getTransform().a : 2;
  pixel = Math.min(4, Math.max(0.5, scale || 1));
  const signature = `${pixel.toFixed(3)}:${scene.width}:${scene.height.toFixed(1)}:${layout.cellHeight.toFixed(2)}`;
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

function stamp(context: Context, canvas: HTMLCanvasElement, x: number, y: number, width: number, height: number) {
  context.drawImage(canvas, x - width / 2, y - height / 2, width, height);
}

function stampShadow(context: Context, x: number, y: number, rx: number, ry: number) {
  const width = rx * 2.1;
  const height = ry * 2.1;
  stamp(context, sprite(`shadow:${rx.toFixed(1)}:${ry.toFixed(1)}`, width, height, (target) => groundShadow(target, 0, 0, rx, ry, 0.45)), x, y, width, height);
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
  context.fillStyle = vertical(context, 0, layout.top + 20, "#232544", "#2f5a55");
  context.fillRect(0, 0, width, layout.top + 20);
  context.fillStyle = vertical(context, bottom, height, "#24463c", "#182e2a");
  context.fillRect(0, bottom, width, height - bottom);
  context.fillStyle = "#24463c";
  context.fillRect(0, layout.top, width, boardHeight);

  context.save();
  roundedPath(context, layout.left, layout.top, boardWidth, boardHeight, 14);
  context.clip();
  for (let lane = 0; lane < ZD_RULES.lanes; lane += 1) {
    for (let row = 0; row < ZD_RULES.rows; row += 1) {
      const x = layout.left + lane * layout.cellWidth;
      const y = layout.top + row * layout.cellHeight;
      context.fillStyle = (lane + row) % 2 === 0 ? "#37806a" : "#327661";
      context.fillRect(x, y, layout.cellWidth, layout.cellHeight);
      // 每格几簇草，位置由格子编号定死，不会闪动。
      context.strokeStyle = "rgba(124, 205, 160, .34)";
      context.lineWidth = 1.6;
      context.lineCap = "round";
      for (let tuft = 0; tuft < 3; tuft += 1) {
        const seed = lane * 31 + row * 17 + tuft * 53;
        const tx = x + 10 + ((seed * 37) % Math.max(1, Math.floor(layout.cellWidth - 20)));
        const ty = y + 12 + ((seed * 59) % Math.max(1, Math.floor(layout.cellHeight - 20)));
        context.beginPath();
        context.moveTo(tx - 3, ty);
        context.lineTo(tx - 4.5, ty - 6);
        context.moveTo(tx, ty);
        context.lineTo(tx, ty - 8);
        context.moveTo(tx + 3, ty);
        context.lineTo(tx + 4.5, ty - 6);
        context.stroke();
      }
    }
  }
  // 越靠近僵尸进场的一侧越暗。
  context.fillStyle = vertical(context, layout.top, layout.top + boardHeight * 0.45, "rgba(24, 26, 52, .42)", "rgba(24, 26, 52, 0)");
  context.fillRect(layout.left, layout.top, boardWidth, boardHeight * 0.45);
  context.restore();
  roundedPath(context, layout.left, layout.top, boardWidth, boardHeight, 14);
  context.lineWidth = 2;
  context.strokeStyle = "rgba(160, 230, 190, .22)";
  context.stroke();

  // 防线：药圃下沿的一排木栅栏，僵尸越过这里就结束。
  const picket = 14;
  for (let x = layout.left + 3; x < layout.left + boardWidth - 6; x += picket) {
    roundedPath(context, x, bottom + 4, picket - 4, 16, 3.5);
    paint(context, vertical(context, bottom + 4, bottom + 20, lighten(WOOD, 0.22), darken(WOOD, 0.12)), darken(WOOD, 0.4), 1);
  }
  context.fillStyle = "rgba(0, 0, 0, .22)";
  context.fillRect(layout.left, bottom + 20, boardWidth, 3);
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
      roundedPath(context, x + 5, y + 5, layout.cellWidth - 10, layout.cellHeight - 10, 10);
      context.fillStyle = shovel ? "rgba(239, 90, 68, .2)" : graft ? "rgba(255, 209, 102, .1)" : "rgba(255, 255, 255, .07)";
      context.fill();
      context.setLineDash(shovel ? [] : [5, 5]);
      context.lineWidth = 1.5;
      context.strokeStyle = shovel ? "rgba(255, 150, 130, .9)" : graft ? "rgba(255, 209, 102, .85)" : "rgba(255, 255, 255, .45)";
      context.stroke();
      context.setLineDash([]);
      if (graft) {
        // 左上角一个加号，提示这里是“种上去杂交”。
        context.beginPath();
        context.moveTo(x + 9, y + 14);
        context.lineTo(x + 19, y + 14);
        context.moveTo(x + 14, y + 9);
        context.lineTo(x + 14, y + 19);
        context.lineWidth = 2.4;
        context.lineCap = "round";
        context.strokeStyle = GOLD;
        context.stroke();
      }
    }
  }
}

function drawFocus(context: Context, scene: ZdSceneState, layout: ZdLayout) {
  if (!scene.focus) return;
  roundedPath(context, layout.left + scene.focus.lane * layout.cellWidth + 3, layout.top + scene.focus.row * layout.cellHeight + 3, layout.cellWidth - 6, layout.cellHeight - 6, 12);
  context.fillStyle = "rgba(255, 209, 102, .14)";
  context.fill();
  context.lineWidth = 2;
  context.strokeStyle = GOLD;
  context.stroke();
}

function face(context: Context, x: number, y: number, size: number) {
  for (const side of [-1, 1]) {
    ellipsePath(context, x + side * size * 0.1, y, size * 0.034, size * 0.048);
    context.fillStyle = DARK;
    context.fill();
    gloss(context, x + side * size * 0.1 - size * 0.012, y - size * 0.016, size * 0.012, size * 0.012, 0, 0.9);
    ellipsePath(context, x + side * size * 0.17, y + size * 0.05, size * 0.04, size * 0.024);
    context.fillStyle = "rgba(255, 120, 100, .32)";
    context.fill();
  }
  context.beginPath();
  context.arc(x, y + size * 0.035, size * 0.035, 0.15 * Math.PI, 0.85 * Math.PI);
  context.lineWidth = 1.5;
  context.lineCap = "round";
  context.strokeStyle = DARK;
  context.stroke();
}

function leaves(context: Context, size: number, color: string) {
  for (const side of [-1, 1]) {
    context.save();
    context.translate(side * size * 0.2, size * 0.28);
    context.rotate(side * 0.9);
    ellipsePath(context, 0, 0, size * 0.07, size * 0.16);
    paint(context, vertical(context, -size * 0.16, size * 0.16, lighten(color, 0.25), color), darken(color, 0.3), 1.2);
    context.restore();
  }
}

function drawCapsuleShooter(context: Context, size: number, pulse: number, level: number) {
  const firing = pulse > 0;
  leaves(context, size, "#5fbf78");
  context.translate(0, firing ? size * 0.04 : 0);
  // 炮口：几级就有几个
  const muzzles = level >= 3 ? [-0.14, 0, 0.14] : level === 2 ? [-0.09, 0.09] : [0];
  const width = level >= 3 ? 0.13 : level === 2 ? 0.16 : 0.22;
  for (const offset of muzzles) {
    const lift = offset === 0 && level >= 3 ? 0.04 : 0;
    roundedPath(context, size * (offset - width / 2), -size * (0.44 + lift), size * width, size * 0.16, size * 0.045);
    paint(context, horizontal(context, size * (offset - width / 2), size * (offset + width / 2), [[0, lighten(RED, 0.1)], [1, darken(RED, 0.3)]]), darken(RED, 0.45), 1.2);
    ellipsePath(context, size * offset, -size * (0.44 + lift), size * width * 0.34, size * 0.024);
    context.fillStyle = level >= 2 ? GOLD : darken(RED, 0.6);
    context.fill();
  }
  // 胶囊身体：上半红、下半米白
  roundedPath(context, -size * 0.23, -size * 0.32, size * 0.46, size * 0.66, size * 0.23);
  paint(context, horizontal(context, -size * 0.23, size * 0.23, [[0, "#fffaf0"], [1, "#ecd9b8"]]), null);
  context.save();
  context.beginPath();
  context.rect(-size * 0.3, -size * 0.4, size * 0.6, size * 0.38);
  context.clip();
  roundedPath(context, -size * 0.23, -size * 0.32, size * 0.46, size * 0.66, size * 0.23);
  paint(context, horizontal(context, -size * 0.23, size * 0.23, [[0, lighten(RED, 0.18)], [0.6, RED], [1, darken(RED, 0.22)]]), null);
  context.restore();
  context.fillStyle = "rgba(60, 20, 10, .16)";
  context.fillRect(-size * 0.23, -size * 0.03, size * 0.46, size * 0.02);
  roundedPath(context, -size * 0.23, -size * 0.32, size * 0.46, size * 0.66, size * 0.23);
  context.lineWidth = 1.5;
  context.strokeStyle = "rgba(96, 52, 34, .55)";
  context.stroke();
  gloss(context, -size * 0.12, -size * 0.17, size * 0.035, size * 0.11, 0.1, 0.55);
  face(context, 0, size * 0.12, size);
  if (firing) {
    ellipsePath(context, 0, -size * 0.5, size * 0.09, size * 0.06);
    context.fillStyle = "rgba(255, 220, 140, .85)";
    context.fill();
  }
}

function drawMintShooter(context: Context, size: number, pulse: number, level: number) {
  const firing = pulse > 0;
  if (level >= 3) {
    // 三级：带一圈寒气
    ellipsePath(context, 0, -size * 0.02, size * 0.4, size * 0.46);
    context.fillStyle = "rgba(170, 235, 255, .2)";
    context.fill();
  }
  leaves(context, size, "#3fae8f");
  if (level >= 2) {
    for (const side of [-1, 1]) {
      context.save();
      context.translate(side * size * 0.26, size * 0.08);
      context.rotate(side * 0.5);
      ellipsePath(context, 0, 0, size * 0.055, size * 0.14);
      paint(context, lighten(MINT, 0.2), darken(MINT, 0.45), 1.2);
      context.restore();
    }
  }
  context.translate(0, firing ? size * 0.04 : 0);
  // 花苞：尖头朝上
  context.beginPath();
  context.moveTo(0, -size * 0.46);
  context.bezierCurveTo(size * 0.34, -size * 0.2, size * 0.3, size * 0.32, 0, size * 0.36);
  context.bezierCurveTo(-size * 0.3, size * 0.32, -size * 0.34, -size * 0.2, 0, -size * 0.46);
  context.closePath();
  paint(context, horizontal(context, -size * 0.28, size * 0.28, [[0, lighten(MINT, 0.35)], [0.55, MINT], [1, darken(MINT, 0.28)]]), darken(MINT, 0.5), 1.5);
  context.beginPath();
  context.moveTo(0, -size * 0.38);
  context.quadraticCurveTo(size * 0.03, -size * 0.1, 0, size * 0.02);
  context.lineWidth = 1.4;
  context.strokeStyle = "rgba(255, 255, 255, .45)";
  context.stroke();
  gloss(context, -size * 0.12, -size * 0.12, size * 0.035, size * 0.1, 0.25, 0.5);
  face(context, 0, size * 0.14, size);
  if (firing) {
    ellipsePath(context, 0, -size * 0.5, size * 0.07, size * 0.05);
    context.fillStyle = "rgba(200, 255, 240, .85)";
    context.fill();
  }
}

function drawMortar(context: Context, size: number, pulse: number, time: number, level: number) {
  const working = pulse > 0;
  // 杵
  context.save();
  context.translate(size * 0.1, -size * 0.14);
  context.rotate(0.48 + Math.sin(time * 6) * 0.16);
  roundedPath(context, -size * 0.055, -size * 0.36, size * 0.11, size * 0.46, size * 0.055);
  paint(context, horizontal(context, -size * 0.055, size * 0.055, [[0, lighten(WOOD, 0.3)], [1, darken(WOOD, 0.15)]]), darken(WOOD, 0.45), 1.2);
  context.restore();
  // 钵身
  context.beginPath();
  context.moveTo(-size * 0.36, -size * 0.04);
  context.bezierCurveTo(-size * 0.33, size * 0.3, -size * 0.14, size * 0.36, 0, size * 0.36);
  context.bezierCurveTo(size * 0.14, size * 0.36, size * 0.33, size * 0.3, size * 0.36, -size * 0.04);
  context.closePath();
  paint(context, horizontal(context, -size * 0.36, size * 0.36, [[0, "#f6f1e8"], [0.6, "#e2d9c8"], [1, "#b9ae9b"]]), "rgba(92, 78, 60, .6)", 1.5);
  ellipsePath(context, 0, -size * 0.04, size * 0.36, size * 0.1);
  paint(context, "#efe7d8", "rgba(92, 78, 60, .6)", 1.5);
  ellipsePath(context, 0, -size * 0.03, size * 0.29, size * 0.07);
  context.fillStyle = working ? GOLD : "#7fc37c";
  context.fill();
  // 升级后钵身多一道、两道金箍
  for (let band = 0; band < level - 1; band += 1) {
    context.beginPath();
    context.ellipse(0, size * (0.06 + band * 0.09), size * (0.33 - band * 0.05), size * 0.09, 0, 0.12 * Math.PI, 0.88 * Math.PI);
    context.lineWidth = size * 0.035;
    context.strokeStyle = GOLD;
    context.stroke();
  }
  if (working) {
    for (const [x, y] of [[-0.2, -0.3], [0.24, -0.26], [0, -0.42]]) {
      ellipsePath(context, x * size, y * size - (0.5 - pulse) * size * 0.2, size * 0.03, size * 0.03);
      context.fillStyle = `rgba(255, 220, 130, ${pulse * 2})`;
      context.fill();
    }
  }
}

function drawCabinet(context: Context, size: number, ratio: number, level: number) {
  if (level >= 3) {
    // 三级：柜顶一排尖刺
    for (let spike = 0; spike < 5; spike += 1) {
      const x = -size * 0.3 + spike * size * 0.15;
      context.beginPath();
      context.moveTo(x - size * 0.05, -size * 0.38);
      context.lineTo(x, -size * 0.52);
      context.lineTo(x + size * 0.05, -size * 0.38);
      context.closePath();
      paint(context, "#dfe6ee", "#7d8794", 1.1);
    }
  }
  roundedPath(context, -size * 0.36, -size * 0.36, size * 0.72, size * 0.74, size * 0.07);
  paint(context, horizontal(context, -size * 0.36, size * 0.36, [[0, lighten(WOOD, 0.12)], [1, darken(WOOD, 0.24)]]), darken(WOOD, 0.5), 1.5);
  roundedPath(context, -size * 0.39, -size * 0.4, size * 0.78, size * 0.1, size * 0.04);
  paint(context, lighten(WOOD, 0.24), darken(WOOD, 0.5), 1.5);
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 2; column += 1) {
      const x = -size * 0.3 + column * size * 0.31;
      const y = -size * 0.25 + row * size * 0.2;
      roundedPath(context, x, y, size * 0.29, size * 0.17, size * 0.03);
      paint(context, vertical(context, y, y + size * 0.17, lighten(WOOD, 0.36), lighten(WOOD, 0.14)), darken(WOOD, 0.35), 1);
      ellipsePath(context, x + size * 0.145, y + size * 0.09, size * 0.028, size * 0.028);
      paint(context, GOLD, darken(GOLD, 0.4), 1);
    }
  }
  if (level >= 2) {
    // 二级起四角包铁
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      roundedPath(context, sx * size * 0.36 - (sx > 0 ? size * 0.12 : 0), sy * size * 0.37 - (sy > 0 ? size * 0.1 : -size * 0.01), size * 0.12, size * 0.1, size * 0.02);
      paint(context, "#c9d1db", "#6f7986", 1);
    }
  }
  if (ratio < 0.66) {
    context.beginPath();
    context.moveTo(-size * 0.2, -size * 0.3);
    context.lineTo(-size * 0.07, -size * 0.08);
    context.lineTo(-size * 0.18, size * 0.1);
    if (ratio < 0.33) {
      context.moveTo(size * 0.27, size * 0.36);
      context.lineTo(size * 0.1, size * 0.12);
      context.lineTo(size * 0.2, -size * 0.1);
    }
    context.lineWidth = 1.8;
    context.strokeStyle = "rgba(50, 28, 14, .8)";
    context.stroke();
  }
}

function drawFizz(context: Context, size: number, timer: number, time: number) {
  const charge = 1 - Math.min(1, timer / ZD_UNITS.fizz.interval);
  const radius = size * 0.28 * (1 + charge * 0.22 + Math.sin(time * 30) * 0.025);
  ellipsePath(context, 0, 0, radius * 1.5, radius * 1.5);
  context.fillStyle = `rgba(255, 255, 255, ${0.1 + charge * 0.22})`;
  context.fill();
  ellipsePath(context, 0, 0, radius, radius);
  paint(context, volume(context, 0, 0, radius, "#f4f6fb", 0.6, 0.18), "rgba(110, 120, 150, .7)", 1.5);
  context.beginPath();
  context.moveTo(-radius * 0.7, 0);
  context.lineTo(radius * 0.7, 0);
  context.lineWidth = 1.5;
  context.strokeStyle = "rgba(110, 120, 150, .45)";
  context.stroke();
  for (const [x, y, r] of [[-0.36, -0.3, 0.06], [0.32, -0.36, 0.045], [0.4, 0.2, 0.055], [-0.32, 0.32, 0.04]]) {
    ellipsePath(context, x * size, y * size + Math.sin(time * 9 + x * 9) * 2, r * size, r * size);
    paint(context, "rgba(255, 255, 255, .5)", "rgba(255, 255, 255, .9)", 1);
  }
}

/** 安瓿炮：细颈朝上的玻璃安瓿，琥珀色药液。颈上的色环几级几道（最多三道）。 */
function drawAmpoule(context: Context, size: number, pulse: number, level: number) {
  const firing = pulse > 0;
  leaves(context, size, "#5fbf78");
  context.translate(0, firing ? size * 0.04 : 0);
  context.beginPath();
  context.moveTo(-size * 0.05, -size * 0.5);
  context.lineTo(size * 0.05, -size * 0.5);
  context.lineTo(size * 0.06, -size * 0.3);
  context.bezierCurveTo(size * 0.24, -size * 0.24, size * 0.24, -size * 0.1, size * 0.22, 0);
  context.lineTo(size * 0.22, size * 0.26);
  context.quadraticCurveTo(size * 0.22, size * 0.36, size * 0.12, size * 0.36);
  context.lineTo(-size * 0.12, size * 0.36);
  context.quadraticCurveTo(-size * 0.22, size * 0.36, -size * 0.22, size * 0.26);
  context.lineTo(-size * 0.22, 0);
  context.bezierCurveTo(-size * 0.24, -size * 0.1, -size * 0.24, -size * 0.24, -size * 0.06, -size * 0.3);
  context.closePath();
  paint(context, horizontal(context, -size * 0.22, size * 0.22, [[0, "#fff6dc"], [0.5, "#f3c463"], [1, "#c98a2b"]]), "rgba(120, 78, 20, .6)", 1.5);
  for (let ring = 0; ring < level; ring += 1) {
    context.fillStyle = level >= 2 ? GOLD : "#8a5a1e";
    context.fillRect(-size * 0.056, -size * (0.36 + ring * 0.045), size * 0.112, size * 0.024);
  }
  gloss(context, -size * 0.11, -size * 0.02, size * 0.03, size * 0.13, 0.08, 0.6);
  face(context, 0, size * 0.14, size);
  if (firing) {
    ellipsePath(context, 0, -size * 0.54, size * 0.1, size * 0.07);
    context.fillStyle = "rgba(255, 226, 150, .9)";
    context.fill();
  }
}

/** 酒精灯：扁圆的玻璃壶，铜灯口，烧起来火苗蹿高。 */
function drawBurner(context: Context, size: number, pulse: number, level: number) {
  const lit = pulse > 0;
  ellipsePath(context, 0, size * 0.16, size * 0.32, size * 0.22);
  paint(context, horizontal(context, -size * 0.32, size * 0.32, [[0, "#e8f6ff"], [0.55, "#8fc7ee"], [1, "#4f8fc4"]]), "rgba(40, 80, 120, .6)", 1.5);
  gloss(context, -size * 0.16, size * 0.06, size * 0.04, size * 0.08, 0.3, 0.6);
  roundedPath(context, -size * 0.11, -size * 0.14, size * 0.22, size * 0.12, size * 0.03);
  paint(context, horizontal(context, -size * 0.11, size * 0.11, [[0, lighten(GOLD, 0.2)], [1, darken(GOLD, 0.3)]]), darken(GOLD, 0.5), 1.2);
  const base = -size * 0.14;
  const flame = size * (lit ? 0.36 : 0.2) * (1 + (level - 1) * 0.07);
  context.beginPath();
  context.moveTo(0, base - flame);
  context.bezierCurveTo(flame * 0.6, base - flame * 0.45, flame * 0.42, base, 0, base);
  context.bezierCurveTo(-flame * 0.42, base, -flame * 0.6, base - flame * 0.45, 0, base - flame);
  context.closePath();
  paint(context, vertical(context, base - flame, base, "#fff2a8", "#ff7a2f"), "rgba(200, 80, 20, .6)", 1.2);
  ellipsePath(context, 0, base - flame * 0.24, flame * 0.14, flame * 0.2);
  context.fillStyle = "rgba(255, 255, 255, .75)";
  context.fill();
  face(context, 0, size * 0.18, size);
}

/** 输液架：一袋绿色药液挂在架子上，往下滴。 */
function drawDrip(context: Context, size: number, level: number) {
  // 底座、立杆和横臂
  ellipsePath(context, size * 0.2, size * 0.37, size * 0.17, size * 0.045);
  paint(context, "#aab3bf", "#5d6673", 1.2);
  roundedPath(context, size * 0.18, -size * 0.46, size * 0.045, size * 0.83, size * 0.02);
  paint(context, horizontal(context, size * 0.18, size * 0.225, [[0, "#e3e8ee"], [1, "#8d97a5"]]), "#6f7986", 1);
  roundedPath(context, -size * 0.06, -size * 0.47, size * 0.3, size * 0.04, size * 0.02);
  paint(context, "#c9d1db", "#6f7986", 1);
  // 药液袋
  context.beginPath();
  context.moveTo(0, -size * 0.44);
  context.lineTo(0, -size * 0.36);
  context.lineWidth = 1.6;
  context.strokeStyle = "#6f7986";
  context.stroke();
  roundedPath(context, -size * 0.26, -size * 0.36, size * 0.4, size * 0.5, size * 0.1);
  paint(context, vertical(context, -size * 0.36, size * 0.14, "#f1fff5", "#7fd89d"), "rgba(40, 110, 70, .6)", 1.5);
  gloss(context, -size * 0.17, -size * 0.16, size * 0.03, size * 0.1, 0.1, 0.6);
  // 袋上的绿十字，升级后变金色
  context.fillStyle = level >= 2 ? GOLD : "#2f9d5c";
  context.fillRect(-size * 0.085, -size * 0.31, size * 0.05, size * 0.13);
  context.fillRect(-size * 0.125, -size * 0.27, size * 0.13, size * 0.05);
  face(context, -size * 0.06, -size * 0.04, size * 0.9);
  // 滴管和药滴
  context.beginPath();
  context.moveTo(-size * 0.06, size * 0.14);
  context.lineTo(-size * 0.06, size * 0.24);
  context.lineWidth = 1.8;
  context.strokeStyle = "rgba(90, 190, 130, .95)";
  context.stroke();
  for (let drop = 0; drop < Math.min(3, level); drop += 1) {
    ellipsePath(context, -size * 0.06, size * (0.28 + drop * 0.05), size * 0.026, size * 0.034);
    paint(context, "#9ff0bd", "rgba(40, 110, 70, .6)", 1);
  }
}

function drawUnitShape(context: Context, kind: ZdUnitKind, size: number, unit: Pick<ZdUnit, "pulse" | "timer" | "hp" | "maxHp" | "level">, time: number) {
  context.lineJoin = "round";
  context.lineCap = "round";
  if (kind === "mortar") drawMortar(context, size, unit.pulse, time, unit.level);
  else if (kind === "cabinet") drawCabinet(context, size, unit.hp / unit.maxHp, unit.level);
  else if (kind === "fizz") drawFizz(context, size, unit.timer, time);
  else if (kind === "mint") drawMintShooter(context, size, unit.pulse, unit.level);
  else if (kind === "ampoule") drawAmpoule(context, size, unit.pulse, unit.level);
  else if (kind === "burner") drawBurner(context, size, unit.pulse, unit.level);
  else if (kind === "drip") drawDrip(context, size, unit.level);
  else drawCapsuleShooter(context, size, unit.pulse, unit.level);
}

/** 药材栏里的图标。 */
export function drawZdUnitIcon(context: Context, kind: ZdUnitKind, size: number) {
  context.clearRect(0, 0, size, size);
  context.save();
  context.translate(size / 2, size / 2 + size * 0.02);
  const definition = ZD_UNITS[kind];
  drawUnitShape(context, kind, size * 0.98, { pulse: 0, timer: definition.interval, hp: definition.hp, maxHp: definition.hp, level: 1 }, 0);
  context.restore();
}

function healthBar(context: Context, x: number, y: number, width: number, ratio: number, color: string) {
  if (ratio >= 0.999) return;
  // 血条每帧要画很多条，用最省事的矩形。
  context.fillStyle = "rgba(10, 14, 20, .55)";
  context.fillRect(x - width / 2, y, width, 4);
  context.fillStyle = color;
  context.fillRect(x - width / 2, y, Math.max(3, width * Math.max(0, ratio)), 4);
}

/** 某种药材在某个状态下的小图。动的地方（研钵的杵、开火的后坐）分成几帧，各存一张。 */
function unitSprite(kind: ZdUnitKind, level: number, pulse: number, ratio: number, time: number, size: number) {
  let state = "0";
  let shownPulse = 0;
  let shownTime = 0;
  let shownRatio = 1;
  let timer = 0;
  if (kind === "mortar") {
    const frame = Math.floor((((time * 6) % TAU) / TAU) * 8) % 8;
    shownTime = ((frame + 0.5) / 8) * (TAU / 6);
    shownPulse = pulse > 0 ? Math.ceil(pulse * 6) / 6 : 0;
    state = `${frame}:${shownPulse.toFixed(2)}`;
  } else if (kind === "cabinet") {
    shownRatio = ratio < 0.33 ? 0.2 : ratio < 0.66 ? 0.5 : 1;
    state = String(shownRatio);
  } else if (kind === "fizz") {
    // 只有杂交在别的药材上才会走到这里：画一颗没点着的。
    timer = ZD_UNITS.fizz.interval;
  } else if (pulse > 0) {
    shownPulse = 0.1;
    state = "1";
  }
  const box = size * 1.3;
  // 三级以上的样子和三级一样，等级另外用角标写出来。
  const look = Math.min(3, level);
  return sprite(`u:${kind}:${look}:${state}:${size.toFixed(1)}`, box, box, (target) => {
    drawUnitShape(target, kind, size, { pulse: shownPulse, timer, hp: shownRatio, maxHp: 1, level: look }, shownTime);
  });
}

function drawUnit(context: Context, unit: ZdUnit, layout: ZdLayout, time: number) {
  const x = layout.left + (unit.lane + 0.5) * layout.cellWidth;
  const y = layout.top + (unit.row + 0.5) * layout.cellHeight;
  const size = Math.min(layout.cellWidth, layout.cellHeight) * 0.92;
  const ratio = unit.hp / unit.maxHp;
  stampShadow(context, x, y + size * 0.36, size * 0.36, size * 0.11);
  if (unit.hurt > 0) context.globalAlpha = 0.62;
  if (unit.kind === "fizz") {
    // 泡腾片一直在鼓胀冒泡，场上最多一两颗，直接画。
    context.save();
    context.translate(x, y);
    drawUnitShape(context, unit.kind, size, unit, time);
    context.restore();
  } else if (!unit.grafts.length) {
    stamp(context, unitSprite(unit.kind, unit.level, unit.pulse, ratio, time, size), x, y, size * 1.3, size * 1.3);
  } else {
    // 杂交药材：原来那株退到后面，杂交进来的几株小一号，在前面从右往左排开；越多越小。
    const count = unit.grafts.length;
    const main = size * (count === 1 ? 0.84 : 0.78);
    const side = size * (count === 1 ? 0.6 : count === 2 ? 0.5 : count <= 4 ? 0.42 : 0.34);
    stamp(context, unitSprite(unit.kind, unit.level, unit.pulse, ratio, time, main), x - (count === 1 ? size * 0.1 : 0), y - size * (count === 1 ? 0.06 : 0.12), main * 1.3, main * 1.3);
    for (let index = 0; index < count; index += 1) {
      const offset = count === 1 ? 0.21 : 0.3 - (index * 0.6) / (count - 1);
      stamp(context, unitSprite(unit.grafts[index], unit.level, unit.pulse, ratio, time, side), x + size * offset, y + size * 0.19, side * 1.3, side * 1.3);
    }
  }
  context.globalAlpha = 1;
  if (unit.kind !== "fizz") healthBar(context, x, y + size * 0.44, size * 0.56, ratio, "#7fe08a");
  // 酒精灯烧着的时候，前方两格多、左右三路罩着一片火光。
  if (unit.pulse > 0 && (unit.kind === "burner" || unit.grafts.includes("burner"))) {
    const width = layout.cellWidth * 2.7;
    const height = layout.cellHeight * ZD_RULES.burnReach;
    const cone = sprite("flame", width, height, (target) => {
      const glow = target.createLinearGradient(0, -height / 2, 0, height / 2);
      glow.addColorStop(0, "rgba(255, 150, 60, 0)");
      glow.addColorStop(0.55, "rgba(255, 150, 60, .14)");
      glow.addColorStop(1, "rgba(255, 220, 130, .36)");
      target.beginPath();
      target.moveTo(-width * 0.5, -height / 2);
      target.lineTo(width * 0.5, -height / 2);
      target.lineTo(width * 0.1, height / 2);
      target.lineTo(-width * 0.1, height / 2);
      target.closePath();
      target.fillStyle = glow;
      target.fill();
    });
    stamp(context, cone, x, y - size * 0.3 - height / 2, width, height);
  }
  if (unit.level <= 3) {
    // 等级：格子右上角的金点，二级一颗、三级两颗。
    for (let pip = 0; pip < unit.level - 1; pip += 1) {
      ellipsePath(context, x + layout.cellWidth / 2 - 11 - pip * 9, y - layout.cellHeight / 2 + 11, 3.4, 3.4);
      paint(context, GOLD, "rgba(60, 40, 8, .8)", 1);
    }
  } else {
    // 四级以上换成写着级数的金牌。
    const badge = sprite(`lv:${unit.level}`, 30, 16, (target) => {
      roundedPath(target, -14, -7, 28, 14, 7);
      paint(target, vertical(target, -7, 7, lighten(GOLD, 0.25), darken(GOLD, 0.12)), "rgba(60, 40, 8, .8)", 1);
      target.font = "800 10px ui-rounded, \"SF Pro Rounded\", system-ui, sans-serif";
      target.textAlign = "center";
      target.textBaseline = "middle";
      target.fillStyle = "#3a2a05";
      target.fillText(String(unit.level), 0, 0.5);
    });
    stamp(context, badge, x + layout.cellWidth / 2 - 18, y - layout.cellHeight / 2 + 11, 30, 16);
  }
}

const ZOMBIE_LOOK: Record<ZdZombieKind, { scale: number; coat: string; skin: string; pace: number }> = {
  walker: { scale: 1, coat: "#e8e6f2", skin: "#aecba2", pace: 6 },
  runner: { scale: 0.94, coat: "#ffcf5c", skin: "#b6d3a8", pace: 13 },
  beaker: { scale: 1, coat: "#e8e6f2", skin: "#a3c098", pace: 6 },
  giant: { scale: 1.36, coat: "#454266", skin: "#93b08a", pace: 4 },
  thesis: { scale: 1.5, coat: "#d9d2c0", skin: "#9fbd94", pace: 4.4 },
  mentor: { scale: 1.78, coat: "#2f3a55", skin: "#8fa888", pace: 3.2 },
};

/**
 * 画一只僵尸的一帧。stride 是迈步的幅度（-1 到 1），chew 是啃咬时手臂抖动的相位；
 * intact 只对烧杯僵尸有用：烧杯有没有裂。
 */
function drawZombieBody(context: Context, kind: ZdZombieKind, biting: boolean, intact: boolean, size: number, stride: number, chew: number) {
  const zombie = { kind, biting };
  const look = ZOMBIE_LOOK[kind];
  const outline = darken(look.skin, 0.52);
  const coatLine = darken(look.coat, 0.4);
  context.lineJoin = "round";
  context.lineCap = "round";
  // 腿
  for (const side of [-1, 1]) {
    roundedPath(context, side * size * 0.13 - size * 0.07, size * 0.2 + side * stride * size * 0.035, size * 0.14, size * 0.2, size * 0.06);
    paint(context, "#4b5570", "#2f3650", 1.2);
  }
  // 外套
  context.beginPath();
  context.moveTo(-size * 0.2, -size * 0.1);
  context.quadraticCurveTo(0, -size * 0.16, size * 0.2, -size * 0.1);
  context.quadraticCurveTo(size * 0.3, size * 0.14, size * 0.24, size * 0.32);
  context.quadraticCurveTo(0, size * 0.36, -size * 0.24, size * 0.32);
  context.quadraticCurveTo(-size * 0.3, size * 0.14, -size * 0.2, -size * 0.1);
  context.closePath();
  paint(context, horizontal(context, -size * 0.28, size * 0.28, [[0, lighten(look.coat, 0.25)], [0.6, look.coat], [1, darken(look.coat, 0.22)]]), coatLine, 1.5);
  if (zombie.kind !== "runner") {
    // 领口和歪掉的领带
    context.beginPath();
    context.moveTo(-size * 0.08, -size * 0.1);
    context.lineTo(0, size * 0.02);
    context.lineTo(size * 0.08, -size * 0.1);
    context.lineWidth = 1.2;
    context.strokeStyle = coatLine;
    context.stroke();
    context.beginPath();
    context.moveTo(-size * 0.025, -size * 0.02);
    context.lineTo(size * 0.03, -size * 0.02);
    context.lineTo(size * 0.06, size * 0.16);
    context.lineTo(size * 0.01, size * 0.2);
    context.lineTo(-size * 0.02, size * 0.15);
    context.closePath();
    paint(context, zombie.kind === "giant" || zombie.kind === "mentor" ? GOLD : "#c2475a", null);
  }
  // 向前伸的两只手
  for (const side of [-1, 1]) {
    const reach = zombie.biting ? Math.sin(chew + side) * size * 0.04 : side * stride * size * 0.02;
    roundedPath(context, side * size * 0.27 - size * 0.065, -size * 0.02 + reach, size * 0.13, size * 0.26, size * 0.065);
    paint(context, horizontal(context, side * size * 0.27 - size * 0.065, side * size * 0.27 + size * 0.065, [[0, lighten(look.coat, 0.2)], [1, darken(look.coat, 0.18)]]), coatLine, 1.3);
    ellipsePath(context, side * size * 0.27, size * 0.25 + reach, size * 0.07, size * 0.065);
    paint(context, look.skin, outline, 1.3);
  }
  // 头
  const headY = -size * 0.26;
  ellipsePath(context, 0, headY, size * 0.25, size * 0.23);
  paint(context, volume(context, 0, headY, size * 0.25, look.skin, 0.3, 0.26), outline, 1.5);
  context.beginPath();
  for (const [x, lift] of [[-0.08, 0.07], [0, 0.1], [0.08, 0.06]]) {
    context.moveTo(x * size, headY - size * 0.21);
    context.quadraticCurveTo(x * size + size * 0.03, headY - size * (0.22 + lift), x * size + size * 0.06, headY - size * 0.2);
  }
  context.lineWidth = 1.6;
  context.strokeStyle = outline;
  context.stroke();
  // 一大一小的眼睛，眼皮耷拉着
  for (const [x, r] of [[-0.1, 0.075], [0.11, 0.055]]) {
    ellipsePath(context, x * size, headY - size * 0.01, r * size, r * size * 1.05);
    paint(context, "#fdfdf6", outline, 1.2);
    ellipsePath(context, x * size + size * 0.008, headY + size * 0.012, r * size * 0.38, r * size * 0.4);
    context.fillStyle = DARK;
    context.fill();
    context.beginPath();
    context.ellipse(x * size, headY - size * 0.01, r * size, r * size * 1.05, 0, Math.PI * 1.05, Math.PI * 1.95);
    context.closePath();
    context.fillStyle = darken(look.skin, zombie.kind === "giant" ? 0.4 : 0.18);
    context.fill();
  }
  // 嘴：张着，露一颗牙
  roundedPath(context, -size * 0.07, headY + size * 0.1, size * 0.15, size * (zombie.biting ? 0.085 : 0.055), size * 0.025);
  paint(context, "#4a2a35", outline, 1.1);
  context.fillStyle = "#fdfdf6";
  context.fillRect(size * 0.01, headY + size * 0.1, size * 0.035, size * 0.03);

  if (zombie.kind === "runner") {
    roundedPath(context, -size * 0.26, headY - size * 0.15, size * 0.52, size * 0.075, size * 0.03);
    paint(context, RED, darken(RED, 0.4), 1.2);
    context.beginPath();
    context.moveTo(size * 0.24, headY - size * 0.11);
    context.quadraticCurveTo(size * 0.36, headY - size * 0.22, size * 0.33, headY - size * 0.34);
    context.lineWidth = size * 0.04;
    context.strokeStyle = RED;
    context.stroke();
  } else if (zombie.kind === "beaker") {
    context.beginPath();
    context.moveTo(-size * 0.22, headY - size * 0.06);
    context.lineTo(-size * 0.27, headY - size * 0.36);
    context.lineTo(size * 0.27, headY - size * 0.36);
    context.lineTo(size * 0.22, headY - size * 0.06);
    context.closePath();
    paint(context, intact ? "rgba(160, 220, 255, .5)" : "rgba(160, 220, 255, .22)", "rgba(220, 245, 255, .9)", 1.5);
    gloss(context, -size * 0.15, headY - size * 0.22, size * 0.025, size * 0.1, 0.12, 0.6);
    if (!intact) {
      context.beginPath();
      context.moveTo(size * 0.02, headY - size * 0.36);
      context.lineTo(size * 0.08, headY - size * 0.24);
      context.lineTo(size * 0.01, headY - size * 0.16);
      context.lineWidth = 1.3;
      context.strokeStyle = "rgba(255, 255, 255, .9)";
      context.stroke();
    }
  } else if (zombie.kind === "giant") {
    context.beginPath();
    context.moveTo(0, headY - size * 0.36);
    context.lineTo(size * 0.34, headY - size * 0.24);
    context.lineTo(0, headY - size * 0.12);
    context.lineTo(-size * 0.34, headY - size * 0.24);
    context.closePath();
    paint(context, "#2b2944", "#17162a", 1.5);
    context.beginPath();
    context.moveTo(0, headY - size * 0.24);
    context.quadraticCurveTo(size * 0.3, headY - size * 0.2, size * 0.3, headY - size * 0.04);
    context.lineWidth = 1.8;
    context.strokeStyle = GOLD;
    context.stroke();
  } else if (zombie.kind === "thesis") {
    // 顶着一摞被打回来的论文
    for (const [index, tilt] of [[0, -0.08], [1, 0.07], [2, -0.03]]) {
      context.save();
      context.translate(0, headY - size * (0.2 + index * 0.055));
      context.rotate(tilt);
      roundedPath(context, -size * 0.21, -size * 0.03, size * 0.42, size * 0.06, size * 0.01);
      paint(context, "#fdfdf6", "rgba(80, 80, 110, .55)", 1);
      context.restore();
    }
    context.beginPath();
    context.moveTo(-size * 0.05, headY - size * 0.35);
    context.lineTo(size * 0.05, headY - size * 0.29);
    context.moveTo(size * 0.05, headY - size * 0.35);
    context.lineTo(-size * 0.05, headY - size * 0.29);
    context.lineWidth = 1.8;
    context.strokeStyle = "#e11d2e";
    context.stroke();
  } else if (zombie.kind === "mentor") {
    // 地中海发型和一副眼镜
    context.beginPath();
    context.arc(0, headY - size * 0.04, size * 0.25, Math.PI * 1.06, Math.PI * 1.3);
    context.arc(0, headY - size * 0.04, size * 0.25, Math.PI * 1.7, Math.PI * 1.94);
    context.lineWidth = size * 0.055;
    context.strokeStyle = "#3a3550";
    context.stroke();
    context.lineWidth = 1.8;
    context.strokeStyle = "#1f1c2e";
    for (const [x, r] of [[-0.1, 0.09], [0.11, 0.075]]) {
      ellipsePath(context, x * size, headY - size * 0.01, r * size, r * size * 1.05);
      context.stroke();
    }
    context.beginPath();
    context.moveTo(-size * 0.015, headY - size * 0.02);
    context.lineTo(size * 0.04, headY - size * 0.02);
    context.stroke();
  } else {
    // 挂科通知单
    context.save();
    context.translate(0, size * 0.13);
    context.rotate(-0.12);
    roundedPath(context, -size * 0.13, -size * 0.08, size * 0.26, size * 0.17, size * 0.02);
    paint(context, "#ffffff", "rgba(80, 80, 110, .5)", 1);
    context.fillStyle = "#e11d2e";
    context.font = `800 ${Math.round(size * 0.13)}px ui-rounded, "SF Pro Rounded", system-ui, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("59", 0, size * 0.008);
    context.restore();
  }
}

/** 一只僵尸某一帧的小图：连脚下的影子、减速时的蓝色都画在里面，对局里一只僵尸只贴一次图。 */
function zombieSprite(kind: ZdZombieKind, biting: boolean, frame: number, frames: number, intact: boolean, slow: boolean, size: number) {
  // 以僵尸的原点（身体中心）为准，内容上到 -0.64、下到 +0.52（含影子），左右各 0.42。
  const width = size * 0.84;
  const height = size * 1.16;
  return sprite(`z:${kind}:${biting ? "b" : "w"}${frame}:${intact ? 1 : 0}:${slow ? 1 : 0}`, width, height, (target) => {
    target.translate(0, size * 0.06);
    groundShadow(target, 0, size * 0.4, size * 0.34, size * 0.1, 0.45);
    const angle = ((frame + 0.5) / frames) * TAU;
    drawZombieBody(target, kind, biting, intact, size, biting ? 0 : Math.sin(angle), angle);
    if (slow) {
      // 只给已经画上去的地方罩一层蓝。
      target.globalCompositeOperation = "source-atop";
      target.fillStyle = "rgba(120, 210, 255, .36)";
      target.fillRect(-width, -height, width * 2, height * 2);
      target.globalCompositeOperation = "source-over";
    }
  });
}

/**
 * 画所有僵尸。先一只一只贴图（每只直接设一次变换矩阵，带一点左右晃），
 * 再回到正常的坐标里统一画受击的白光和血条。
 */
function drawZombies(context: Context, zombies: ZdZombie[], layout: ZdLayout, time: number) {
  if (!zombies.length) return;
  const sorted = [...zombies].sort((left, right) => left.y - right.y);
  const cell = Math.min(layout.cellWidth, layout.cellHeight) * 0.9;
  const base = typeof context.getTransform === "function" ? context.getTransform() : null;
  for (const zombie of sorted) {
    const look = ZOMBIE_LOOK[zombie.kind];
    const x = layout.left + (zombie.lane + 0.5) * layout.cellWidth;
    const y = layout.top + zombie.y * layout.cellHeight;
    const size = cell * look.scale;
    const phase = time * look.pace + zombie.id * 1.7;
    // 走路分 6 帧，啃咬分 4 帧（啃的时候脚不动）。
    const frames = zombie.biting ? 4 : 6;
    const turn = zombie.biting ? time * 15 + zombie.id : phase;
    const frame = Math.floor((((turn % TAU) + TAU) % TAU) / TAU * frames) % frames;
    const intact = zombie.kind !== "beaker" || zombie.hp / zombie.maxHp > 0.4;
    const image = zombieSprite(zombie.kind, zombie.biting, frame, frames, intact, zombie.slow > 0, size);
    const width = size * 0.84;
    const height = size * 1.16;
    const alpha = Math.min(1, Math.max(0, (zombie.y - ZD_RULES.spawnY) / 0.45));
    if (alpha < 1) context.globalAlpha = alpha;
    const wobble = Math.sin(phase) * (zombie.biting ? 0.02 : 0.05);
    if (base) {
      const cos = Math.cos(wobble);
      const sin = Math.sin(wobble);
      context.setTransform(
        base.a * cos + base.c * sin, base.b * cos + base.d * sin,
        base.c * cos - base.a * sin, base.d * cos - base.b * sin,
        base.a * x + base.c * y + base.e, base.b * x + base.d * y + base.f,
      );
      context.drawImage(image, -width / 2, -size * 0.06 - height / 2, width, height);
    } else {
      context.drawImage(image, x - width / 2, y - size * 0.06 - height / 2, width, height);
    }
    if (alpha < 1) context.globalAlpha = 1;
  }
  if (base) context.setTransform(base.a, base.b, base.c, base.d, base.e, base.f);
  for (const zombie of sorted) {
    if (zombie.y - ZD_RULES.spawnY < 0.45) continue;
    const x = layout.left + (zombie.lane + 0.5) * layout.cellWidth;
    const y = layout.top + zombie.y * layout.cellHeight;
    const size = cell * ZOMBIE_LOOK[zombie.kind].scale;
    if (zombie.hurt > 0) {
      ellipsePath(context, x, y - size * 0.02, size * 0.34, size * 0.48);
      context.fillStyle = "rgba(255, 255, 255, .45)";
      context.fill();
    }
    healthBar(context, x, y - size * 0.6, size * 0.5, zombie.hp / zombie.maxHp, "#ff7a66");
  }
}

function drawShot(context: Context, shot: ZdShot, layout: ZdLayout) {
  const x = layout.left + (shot.lane + 0.5) * layout.cellWidth;
  const y = layout.top + shot.y * layout.cellHeight;
  // 子弹连拖尾一共 36 高，小图的正中在弹头下方 8 处。
  stamp(context, sprite(`s:${shot.kind}:${shot.tint}`, 24, 48, (target) => {
    if (shot.tint) {
      // 点燃的带一团火光，带寒气的带一团冷光。
      ellipsePath(target, 0, -8, 11, 15);
      target.fillStyle = shot.tint === "fire" ? "rgba(255, 150, 50, .5)" : "rgba(150, 225, 255, .5)";
      target.fill();
    }
    paintShot(target, shot.kind, 0, -8);
    if (shot.tint) {
      target.globalCompositeOperation = "source-atop";
      target.fillStyle = shot.tint === "fire" ? "rgba(255, 130, 30, .4)" : "rgba(170, 230, 255, .45)";
      target.fillRect(-12, -24, 24, 48);
      target.globalCompositeOperation = "source-over";
    }
  }), x, y + 8, 24, 48);
}

function paintShot(context: Context, kind: ZdShot["kind"], x: number, y: number) {
  const shot = { kind };
  const color = shot.kind === "mint" ? MINT : RED;
  // 拖尾
  context.fillStyle = vertical(context, y, y + 26, shot.kind === "mint" ? "rgba(99, 217, 187, .5)" : "rgba(255, 150, 120, .5)", "rgba(255, 255, 255, 0)");
  context.beginPath();
  context.moveTo(x - 4, y);
  context.lineTo(x + 4, y);
  context.lineTo(x, y + 26);
  context.closePath();
  context.fill();
  if (shot.kind === "mint") {
    context.beginPath();
    context.moveTo(x, y - 9);
    context.bezierCurveTo(x + 8, y - 1, x + 6, y + 7, x, y + 7);
    context.bezierCurveTo(x - 6, y + 7, x - 8, y - 1, x, y - 9);
    paint(context, lighten(color, 0.3), darken(color, 0.45), 1.2);
    return;
  }
  roundedPath(context, x - 5, y - 10, 10, 19, 5);
  paint(context, CREAM, null);
  context.save();
  context.beginPath();
  context.rect(x - 6, y - 11, 12, 10.5);
  context.clip();
  roundedPath(context, x - 5, y - 10, 10, 19, 5);
  paint(context, color, null);
  context.restore();
  roundedPath(context, x - 5, y - 10, 10, 19, 5);
  context.lineWidth = 1.2;
  context.strokeStyle = "rgba(96, 52, 34, .6)";
  context.stroke();
}

function drawEffect(context: Context, effect: ZdEffect, layout: ZdLayout) {
  const x = layout.left + (effect.lane + 0.5) * layout.cellWidth;
  const y = layout.top + effect.y * layout.cellHeight;
  const progress = effect.age / effect.life;
  if (effect.kind === "boom") {
    const reach = 0.5 + progress * 1.1;
    ellipsePath(context, x, y, reach * layout.cellWidth * 1.1, reach * layout.cellHeight * 1.15);
    context.fillStyle = `rgba(255, 255, 255, ${0.5 * (1 - progress)})`;
    context.fill();
    context.lineWidth = 4 * (1 - progress) + 1;
    context.strokeStyle = `rgba(255, 255, 255, ${0.9 * (1 - progress)})`;
    context.stroke();
    for (let index = 0; index < 12; index += 1) {
      const angle = (index / 12) * Math.PI * 2 + index;
      const distance = reach * (0.55 + (index % 3) * 0.18);
      ellipsePath(context, x + Math.cos(angle) * distance * layout.cellWidth, y + Math.sin(angle) * distance * layout.cellHeight, 6 * (1 - progress) + 2, 6 * (1 - progress) + 2);
      paint(context, `rgba(255, 255, 255, ${0.45 * (1 - progress)})`, `rgba(255, 255, 255, ${1 - progress})`, 1);
    }
  } else if (effect.kind === "energy") {
    context.globalAlpha = 1 - progress * progress;
    context.font = "800 14px ui-rounded, \"SF Pro Rounded\", system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineWidth = 3;
    context.strokeStyle = "rgba(40, 28, 8, .75)";
    const label = `+${effect.amount ?? ZD_RULES.passiveEnergy}`;
    context.strokeText(label, x, y - 8 - progress * 24);
    context.fillStyle = GOLD;
    context.fillText(label, x, y - 8 - progress * 24);
    context.globalAlpha = 1;
  } else if (effect.kind === "beam") {
    // 安瓿炮的一发：从炮口一直亮到药圃顶上。
    const fade = 1 - progress;
    const width = 9 * fade + 2;
    const color = effect.tint === "fire" ? "255, 150, 60" : effect.tint === "frost" ? "150, 225, 255" : "255, 214, 120";
    context.fillStyle = `rgba(${color}, ${0.7 * fade})`;
    context.fillRect(x - width / 2, layout.top, width, Math.max(0, y - layout.top));
    context.fillStyle = `rgba(255, 255, 255, ${0.9 * fade})`;
    context.fillRect(x - width / 6, layout.top, width / 3, Math.max(0, y - layout.top));
  } else if (effect.kind === "level") {
    // 升级：一圈金光加几颗上升的星点
    ellipsePath(context, x, y, layout.cellWidth * (0.25 + progress * 0.35), layout.cellHeight * (0.25 + progress * 0.35));
    context.lineWidth = 3 * (1 - progress) + 0.5;
    context.strokeStyle = `rgba(255, 209, 102, ${1 - progress})`;
    context.stroke();
    for (const [dx, speed] of [[-16, 30], [0, 44], [15, 34]]) {
      ellipsePath(context, x + dx, y - progress * speed, 3 * (1 - progress) + 1, 3 * (1 - progress) + 1);
      context.fillStyle = `rgba(255, 230, 150, ${1 - progress})`;
      context.fill();
    }
  } else {
    for (const [dx, dy, r] of [[-10, 0, 12], [8, -4, 14], [0, 8, 10]]) {
      ellipsePath(context, x + dx * (1 + progress), y + dy * (1 + progress) - progress * 8, r * (1 + progress * 0.5), r * (1 + progress * 0.5));
      context.fillStyle = `rgba(220, 225, 235, ${0.4 * (1 - progress)})`;
      context.fill();
    }
  }
}

export function drawZdScene(context: Context, scene: ZdSceneState) {
  const layout = zdLayout(scene.width, scene.height);
  const game = scene.game;
  useSprites(context, scene, layout);
  // 天色、草地和栅栏不会变，整张存起来。
  const board = sprite("board", scene.width, scene.height, (target) => {
    target.translate(-scene.width / 2, -scene.height / 2);
    drawBoard(target, scene, layout);
  });
  context.drawImage(board, 0, 0, scene.width, scene.height);
  drawSelection(context, scene, layout);
  drawFocus(context, scene, layout);
  for (const unit of [...game.units].sort((left, right) => left.row - right.row)) drawUnit(context, unit, layout, game.time);
  for (const shot of game.shots) drawShot(context, shot, layout);
  drawZombies(context, game.zombies, layout, game.time);
  for (const effect of game.effects) drawEffect(context, effect, layout);
}

/** 主菜单的招牌图：一名胶囊射手对着一只僵尸。 */
export function drawZdMenuArt(context: Context, size: number) {
  context.clearRect(0, 0, size, size);
  context.save();
  context.translate(size * 0.66, size * 0.5);
  drawZombieBody(context, "walker", false, true, size * 0.62, 0.24, 0);
  context.restore();
  context.save();
  context.translate(size * 0.3, size * 0.6);
  context.rotate(0.42);
  drawUnitShape(context, "capsule", size * 0.5, { pulse: 0, timer: 0, hp: 1, maxHp: 1, level: 1 }, 0);
  context.restore();
}
