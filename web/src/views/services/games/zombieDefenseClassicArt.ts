// 药大人大战僵尸的“经典”画面：最早那一版手画的药材、僵尸和药圃。设置里把画面风格切到“经典”时用它，
// 平时用的是 zombieDefenseScene.ts 里的插画。这里只管怎么画一样东西，贴图、缓存和布局都在那边。
import { darken, ellipsePath, lighten, paint, roundedPath, vertical, type Context } from "./gameArt";
import { ZD_RULES, ZD_UNITS, type ZdUnit, type ZdUnitKind, type ZdZombieKind } from "./zombieDefenseEngine";

interface ClassicLayout {
  left: number;
  top: number;
  cellWidth: number;
  cellHeight: number;
}

const RED = "#ef5a44";
const MINT = "#63d9bb";
const GOLD = "#ffd166";
const WOOD = "#b98556";
const DARK = "#2b2330";

/** 上亮下暗的体积感填充。 */
function volume(context: Context, x: number, y: number, radius: number, base: string, light = 0.32, dark = 0.2) {
  const fill = context.createRadialGradient(x - radius * 0.35, y - radius * 0.42, radius * 0.08, x, y, radius * 1.08);
  fill.addColorStop(0, lighten(base, light));
  fill.addColorStop(0.55, base);
  fill.addColorStop(1, darken(base, dark));
  return fill;
}

function horizontal(context: Context, left: number, right: number, stops: Array<[number, string]>) {
  const fill = context.createLinearGradient(left, 0, right, 0);
  for (const [offset, color] of stops) fill.addColorStop(offset, color);
  return fill;
}

/** 高光：一小片半透明的白。 */
function gloss(context: Context, x: number, y: number, rx: number, ry: number, rotation = -0.6, alpha = 0.5) {
  ellipsePath(context, x, y, rx, ry, rotation);
  context.fillStyle = `rgba(255, 255, 255, ${alpha})`;
  context.fill();
}

/** 经典画面的药圃：黄昏的天色、深浅相间的草地和一排木栅栏。 */
export function drawClassicBoard(context: Context, scene: { width: number; height: number }, layout: ClassicLayout) {
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

/** 经典画面里的一株药材，原点在它的正中。 */
export function drawClassicUnit(context: Context, kind: ZdUnitKind, size: number, unit: Pick<ZdUnit, "pulse" | "timer" | "hp" | "maxHp" | "level">, time: number) {
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

export const CLASSIC_ZOMBIE_LOOK: Record<ZdZombieKind, { scale: number; coat: string; skin: string; pace: number }> = {
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
export function drawClassicZombie(context: Context, kind: ZdZombieKind, biting: boolean, intact: boolean, size: number, stride: number, chew: number) {
  const zombie = { kind, biting };
  const look = CLASSIC_ZOMBIE_LOOK[kind];
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
