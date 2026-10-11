// 番茄鸡蛋面的灶台画面。只负责按当前工序和火候条位置作画，不保存任何对局状态。
import type { NoodleGrade, NoodleStepId } from "./tomatoNoodleRules";

export interface NoodleSceneState {
  /** 逻辑宽高：宽固定 420，高随屏幕比例变化。 */
  width: number;
  height: number;
  stage: NoodleStepId | "idle" | "serve";
  /** 火候条指针位置与目标中心，均为 0 到 1。 */
  position: number;
  target: number;
  /** 这道工序已经判定时的档位；还在进行中为 null。 */
  grade: NoodleGrade | null;
  /** 秒，用于火苗、蒸汽等循环动画。 */
  time: number;
  stars: number;
}

const INK = "#3d2f2a";
const TOMATO = "#e8452c";
const TOMATO_DARK = "#b92f1c";
const EGG = "#ffc93c";
const LEAF = "#4c9f45";
const SWEEP_SPAN = 110;

type Context = CanvasRenderingContext2D;

function ellipse(context: Context, x: number, y: number, rx: number, ry: number, fill: string, stroke = true) {
  context.beginPath();
  context.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), 0, 0, Math.PI * 2);
  context.fillStyle = fill;
  context.fill();
  if (stroke) context.stroke();
}

function roundedRect(context: Context, x: number, y: number, width: number, height: number, radius: number, fill: string, stroke = true) {
  // iOS 15 的 WebView 没有 roundRect，用 arcTo 画圆角。
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
  context.fillStyle = fill;
  context.fill();
  if (stroke) context.stroke();
}

function mixColor(from: [number, number, number], to: [number, number, number], amount: number) {
  const t = Math.min(1, Math.max(0, amount));
  return `rgb(${from.map((value, index) => Math.round(value + (to[index] - value) * t)).join(",")})`;
}

/** 生 → 恰好 → 过火 三段取色。 */
function doneness(state: NoodleSceneState, raw: [number, number, number], ready: [number, number, number], burnt: [number, number, number]) {
  if (state.position <= state.target) return mixColor(raw, ready, state.position / Math.max(0.01, state.target));
  return mixColor(ready, burnt, (state.position - state.target) / Math.max(0.01, 1 - state.target));
}

function overcooked(state: NoodleSceneState) {
  return Math.min(1, Math.max(0, (state.position - state.target) / Math.max(0.01, 1 - state.target)));
}

function sweepX(centerX: number, value: number) {
  return centerX - SWEEP_SPAN + SWEEP_SPAN * 2 * value;
}

function drawKitchen(context: Context, state: NoodleSceneState, counterY: number) {
  const { width, height } = state;
  context.fillStyle = "#fff1d6";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "rgba(201, 143, 82, .16)";
  context.lineWidth = 2;
  for (let x = 30; x < width; x += 60) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, counterY);
    context.stroke();
  }
  for (let y = counterY - 60; y > 0; y -= 60) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
  context.fillStyle = "#c98f52";
  context.fillRect(0, counterY, width, height - counterY);
  context.fillStyle = "#e0aa6c";
  context.fillRect(0, counterY, width, 12);
  context.fillStyle = "rgba(61, 47, 42, .22)";
  context.fillRect(0, counterY + 12, width, 4);
}

function drawTomato(context: Context, x: number, y: number, radius: number) {
  ellipse(context, x, y, radius, radius * 0.92, TOMATO);
  context.beginPath();
  context.ellipse(x - radius * 0.34, y - radius * 0.36, radius * 0.26, radius * 0.15, -0.6, 0, Math.PI * 2);
  context.fillStyle = "rgba(255,255,255,.5)";
  context.fill();
  context.fillStyle = LEAF;
  context.beginPath();
  for (let index = 0; index < 5; index += 1) {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / 5;
    context.lineTo(x + Math.cos(angle) * radius * 0.36, y - radius * 0.84 + Math.sin(angle) * radius * 0.2);
    context.lineTo(x + Math.cos(angle + 0.63) * radius * 0.12, y - radius * 0.84 + Math.sin(angle + 0.63) * radius * 0.07);
  }
  context.closePath();
  context.fill();
  context.stroke();
}

function drawTomatoHalf(context: Context, x: number, y: number, radius: number, side: -1 | 1) {
  context.beginPath();
  context.ellipse(x, y, radius, radius * 0.92, 0, side < 0 ? Math.PI / 2 : -Math.PI / 2, side < 0 ? -Math.PI / 2 : Math.PI / 2);
  context.closePath();
  context.fillStyle = TOMATO;
  context.fill();
  context.stroke();
  ellipse(context, x + side * radius * 0.08, y, radius * 0.16, radius * 0.7, "#ff9d7a", false);
  context.fillStyle = "#ffe9a8";
  for (const offset of [-0.4, 0, 0.4]) {
    context.beginPath();
    context.ellipse(x + side * radius * 0.1, y + radius * offset, 2.6, 4, 0, 0, Math.PI * 2);
    context.fill();
  }
}

function drawEgg(context: Context, x: number, y: number, tilt = 0) {
  context.save();
  context.translate(x, y);
  context.rotate(tilt);
  ellipse(context, 0, 0, 21, 27, "#fff6e3");
  context.beginPath();
  context.ellipse(-7, -10, 5, 8, -0.5, 0, Math.PI * 2);
  context.fillStyle = "rgba(255,255,255,.85)";
  context.fill();
  context.restore();
}

function drawFlames(context: Context, x: number, y: number, time: number, strength: number) {
  for (let index = 0; index < 5; index += 1) {
    const offset = (index - 2) * 26;
    const flicker = 1 + Math.sin(time * 9 + index * 1.7) * 0.18;
    const height = (22 + (index % 2) * 8) * flicker * (0.75 + strength * 0.5);
    for (const [scale, color] of [[1, "#ff8a1f"], [0.55, "#ffd23f"]] as const) {
      context.beginPath();
      context.moveTo(x + offset - 10 * scale, y);
      context.quadraticCurveTo(x + offset - 12 * scale, y - height * 0.5 * scale, x + offset, y - height * scale);
      context.quadraticCurveTo(x + offset + 12 * scale, y - height * 0.5 * scale, x + offset + 10 * scale, y);
      context.closePath();
      context.fillStyle = color;
      context.fill();
    }
  }
}

function drawSteam(context: Context, x: number, y: number, time: number, amount: number, color = "255,255,255") {
  context.save();
  context.lineCap = "round";
  context.lineWidth = 6;
  for (let index = 0; index < 3; index += 1) {
    const drift = (time * 0.6 + index * 0.33) % 1;
    const baseX = x + (index - 1) * 44;
    const baseY = y - drift * 54;
    context.strokeStyle = `rgba(${color},${(1 - drift) * 0.75 * amount})`;
    context.beginPath();
    context.moveTo(baseX, baseY);
    context.bezierCurveTo(baseX - 12, baseY - 14, baseX + 12, baseY - 26, baseX, baseY - 40);
    context.stroke();
  }
  context.restore();
}

function drawStove(context: Context, x: number, counterY: number, time: number, strength: number) {
  roundedRect(context, x - 104, counterY - 16, 208, 22, 8, "#5d5552");
  drawFlames(context, x, counterY - 16, time, strength);
}

function drawWok(context: Context, x: number, y: number, contents: (context: Context) => void) {
  roundedRect(context, x + 108, y - 9, 86, 16, 8, "#8a5a36");
  context.beginPath();
  context.ellipse(x, y, 124, 76, 0, 0, Math.PI);
  context.closePath();
  context.fillStyle = "#4a4543";
  context.fill();
  context.stroke();
  ellipse(context, x, y, 124, 26, "#2f2b2a");
  context.save();
  context.beginPath();
  context.ellipse(x, y + 3, 110, 19, 0, 0, Math.PI * 2);
  context.clip();
  contents(context);
  context.restore();
}

function drawPot(context: Context, x: number, y: number, contents: (context: Context) => void) {
  roundedRect(context, x - 132, y + 10, 36, 14, 7, "#7d8a93");
  roundedRect(context, x + 96, y + 10, 36, 14, 7, "#7d8a93");
  context.beginPath();
  context.moveTo(x - 100, y);
  context.lineTo(x - 100, y + 84);
  context.quadraticCurveTo(x - 100, y + 104, x - 80, y + 104);
  context.lineTo(x + 80, y + 104);
  context.quadraticCurveTo(x + 100, y + 104, x + 100, y + 84);
  context.lineTo(x + 100, y);
  context.closePath();
  context.fillStyle = "#b9c4cc";
  context.fill();
  context.stroke();
  context.fillStyle = "rgba(255,255,255,.35)";
  context.fillRect(x - 84, y + 22, 12, 62);
  ellipse(context, x, y, 100, 24, "#8f9ba3");
  context.save();
  context.beginPath();
  context.ellipse(x, y + 2, 90, 18, 0, 0, Math.PI * 2);
  context.clip();
  contents(context);
  context.restore();
}

function drawNoodleStrands(context: Context, x: number, y: number, width: number, color: string, wobble: number, lineWidth = 5) {
  context.save();
  context.lineCap = "round";
  context.lineWidth = lineWidth;
  context.strokeStyle = color;
  for (let index = 0; index < 5; index += 1) {
    const offsetY = (index - 2) * 6;
    context.beginPath();
    context.moveTo(x - width, y + offsetY);
    context.bezierCurveTo(
      x - width * 0.4, y + offsetY - 9 + Math.sin(wobble + index) * 4,
      x + width * 0.4, y + offsetY + 9 + Math.cos(wobble + index) * 4,
      x + width, y + offsetY,
    );
    context.stroke();
  }
  context.restore();
}

/** 一碗做好的番茄鸡蛋面；主菜单和出锅画面共用。 */
export function drawNoodleBowl(context: Context, x: number, y: number, scale = 1) {
  context.save();
  context.translate(x, y);
  context.scale(scale, scale);
  context.lineWidth = 3;
  context.strokeStyle = INK;
  context.lineJoin = "round";
  context.beginPath();
  context.moveTo(-112, 0);
  context.bezierCurveTo(-104, 66, -62, 92, -44, 92);
  context.lineTo(44, 92);
  context.bezierCurveTo(62, 92, 104, 66, 112, 0);
  context.closePath();
  context.fillStyle = "#fffdf7";
  context.fill();
  context.stroke();
  context.save();
  context.clip();
  context.fillStyle = TOMATO;
  context.fillRect(-120, 30, 240, 9);
  context.fillStyle = "#2f6fb5";
  context.fillRect(-120, 46, 240, 4);
  context.restore();
  roundedRect(context, -40, 90, 80, 12, 5, "#f1e7d6");
  ellipse(context, 0, 0, 112, 28, "#fffdf7");
  ellipse(context, 0, 1, 100, 21, "#f0623a");
  context.save();
  context.beginPath();
  context.ellipse(0, 1, 98, 20, 0, 0, Math.PI * 2);
  context.clip();
  drawNoodleStrands(context, 0, 2, 82, "#fbe6a6", 0.6, 5);
  context.restore();
  for (const [eggX, eggY, eggR] of [[-46, -3, 15], [-18, 7, 12], [36, 8, 13]]) {
    ellipse(context, eggX, eggY, eggR, eggR * 0.55, EGG);
  }
  for (const [tomatoX, tomatoY] of [[14, -7], [58, -2], [-74, 5]]) {
    ellipse(context, tomatoX, tomatoY, 12, 7, TOMATO);
  }
  context.fillStyle = LEAF;
  for (const [leafX, leafY] of [[-30, -10], [2, 8], [28, -2], [70, 9], [-58, 12], [46, -11]]) {
    context.fillRect(leafX, leafY, 6, 3);
  }
  context.restore();
}

function drawSmallBowl(context: Context, x: number, y: number, fill: string) {
  context.beginPath();
  context.moveTo(x - 62, y);
  context.bezierCurveTo(x - 56, y + 42, x - 30, y + 56, x - 22, y + 56);
  context.lineTo(x + 22, y + 56);
  context.bezierCurveTo(x + 30, y + 56, x + 56, y + 42, x + 62, y);
  context.closePath();
  context.fillStyle = "#eaf4fb";
  context.fill();
  context.stroke();
  ellipse(context, x, y, 62, 15, "#fdfefe");
  ellipse(context, x, y + 1, 52, 10, fill, false);
}

function drawStars(context: Context, x: number, y: number, count: number, time: number) {
  for (let index = 0; index < 3; index += 1) {
    const starX = x + (index - 1) * 58;
    const starY = y - (index === 1 ? 12 : 0) + Math.sin(time * 4 + index) * 3;
    context.beginPath();
    for (let point = 0; point < 10; point += 1) {
      const radius = point % 2 === 0 ? 22 : 9.5;
      const angle = -Math.PI / 2 + (point * Math.PI) / 5;
      context.lineTo(starX + Math.cos(angle) * radius, starY + Math.sin(angle) * radius);
    }
    context.closePath();
    context.fillStyle = index < count ? "#ffc21a" : "rgba(61,47,42,.16)";
    context.fill();
    context.stroke();
  }
}

function drawCut(context: Context, state: NoodleSceneState, x: number, counterY: number) {
  roundedRect(context, x - 150, counterY - 26, 300, 30, 10, "#e9c48d");
  const tomatoX = sweepX(x, state.target);
  const tomatoY = counterY - 66;
  const knifeX = sweepX(x, state.position);
  const cut = state.grade !== null;
  const hit = cut && state.grade !== "miss";
  if (hit) {
    const spread = state.grade === "perfect" ? 15 : 11;
    drawTomatoHalf(context, tomatoX - spread, tomatoY, 42, -1);
    drawTomatoHalf(context, tomatoX + spread, tomatoY, 42, 1);
  } else {
    drawTomato(context, tomatoX, tomatoY, 42);
    if (!cut) {
      context.save();
      context.setLineDash([7, 7]);
      context.strokeStyle = "rgba(255,255,255,.9)";
      context.beginPath();
      context.moveTo(tomatoX, tomatoY - 36);
      context.lineTo(tomatoX, tomatoY + 36);
      context.stroke();
      context.restore();
    }
  }
  const knifeY = cut ? counterY - 122 : counterY - 196 + Math.sin(state.time * 6) * 3;
  roundedRect(context, knifeX - 9, knifeY - 54, 18, 56, 7, "#8a5a36");
  context.beginPath();
  context.moveTo(knifeX - 13, knifeY);
  context.lineTo(knifeX + 13, knifeY);
  context.lineTo(knifeX + 13, knifeY + 76);
  context.quadraticCurveTo(knifeX - 10, knifeY + 92, knifeX - 13, knifeY + 60);
  context.closePath();
  context.fillStyle = "#dfe6ea";
  context.fill();
  context.stroke();
  context.fillStyle = "rgba(255,255,255,.7)";
  context.fillRect(knifeX + 4, knifeY + 6, 4, 60);
}

function drawCrackEgg(context: Context, state: NoodleSceneState, x: number, counterY: number) {
  const bowlX = sweepX(x, state.target);
  const bowlY = counterY - 54;
  const eggX = sweepX(x, state.position);
  const cracked = state.grade !== null;
  const hit = cracked && state.grade !== "miss";
  drawSmallBowl(context, bowlX, bowlY, hit ? "#ffe9a0" : "#dfeaf2");
  if (hit) ellipse(context, bowlX + (eggX - bowlX) * 0.5, bowlY + 1, 15, 8, "#ff9f1c");
  if (!cracked) {
    drawEgg(context, eggX, counterY - 168 + Math.sin(state.time * 6) * 3, Math.sin(state.time * 5) * 0.12);
    return;
  }
  if (!hit) {
    ellipse(context, eggX, counterY - 6, 34, 9, "#fff6e3");
    ellipse(context, eggX + 4, counterY - 7, 12, 5, "#ff9f1c");
  }
  // 两瓣蛋壳
  for (const side of [-1, 1] as const) {
    context.save();
    context.translate(eggX + side * 24, hit ? bowlY - 44 : counterY - 30);
    context.rotate(side * 0.7);
    context.beginPath();
    context.ellipse(0, 0, 18, 22, 0, Math.PI, 0);
    context.lineTo(12, 5);
    context.lineTo(6, -2);
    context.lineTo(0, 5);
    context.lineTo(-6, -2);
    context.lineTo(-12, 5);
    context.closePath();
    context.fillStyle = "#fff6e3";
    context.fill();
    context.stroke();
    context.restore();
  }
}

function drawScramble(context: Context, state: NoodleSceneState, x: number, counterY: number) {
  const burnt = overcooked(state);
  drawStove(context, x, counterY, state.time, 0.6 + state.position * 0.4);
  const wokY = counterY - 108;
  const color = doneness(state, [255, 244, 176], [255, 201, 60], [74, 46, 30]);
  drawWok(context, x, wokY, (inner) => {
    inner.fillStyle = "#5b4a3d";
    inner.fillRect(x - 120, wokY - 30, 240, 60);
    const set = Math.min(1, state.position / Math.max(0.01, state.target));
    const curds: Array<[number, number, number]> = [[-62, 2, 24], [-20, -4, 28], [26, 6, 26], [66, -1, 22], [0, 10, 20]];
    for (const [offsetX, offsetY, radius] of curds) {
      // 蛋液由一整片逐渐凝成小块
      const size = radius * (1.5 - set * 0.5);
      inner.beginPath();
      inner.ellipse(x + offsetX, wokY + offsetY, size, size * 0.42, 0, 0, Math.PI * 2);
      inner.fillStyle = color;
      inner.fill();
      inner.stroke();
    }
  });
  drawSteam(context, x, wokY - 30, state.time, 0.5 + state.position * 0.5);
  if (burnt > 0.25) drawSteam(context, x + 16, wokY - 46, state.time * 1.3, burnt, "70,60,56");
}

function drawTomatoSoup(context: Context, state: NoodleSceneState, x: number, counterY: number) {
  const burnt = overcooked(state);
  drawStove(context, x, counterY, state.time, 0.6 + state.position * 0.4);
  const wokY = counterY - 108;
  const soup = doneness(state, [255, 214, 170], [226, 58, 34], [86, 34, 22]);
  const juicy = Math.min(1, state.position / Math.max(0.01, state.target));
  drawWok(context, x, wokY, (inner) => {
    inner.fillStyle = "#5b4a3d";
    inner.fillRect(x - 120, wokY - 30, 240, 60);
    ellipse(inner, x, wokY + 4, 108 * (0.35 + juicy * 0.65), 18 * (0.35 + juicy * 0.65), soup, false);
    const chunks: Array<[number, number]> = [[-66, 0], [-30, 8], [6, -3], [40, 7], [72, 0], [-8, 12]];
    for (const [offsetX, offsetY] of chunks) {
      const size = 17 - juicy * 6;
      inner.beginPath();
      inner.ellipse(x + offsetX, wokY + offsetY, size, size * 0.55, 0, 0, Math.PI * 2);
      inner.fillStyle = burnt > 0.3 ? mixColor([232, 69, 44], [70, 30, 22], burnt) : TOMATO;
      inner.fill();
      inner.stroke();
    }
  });
  drawSteam(context, x, wokY - 30, state.time, 0.5 + state.position * 0.5);
  if (burnt > 0.25) drawSteam(context, x + 16, wokY - 46, state.time * 1.3, burnt, "70,60,56");
}

function drawBoil(context: Context, state: NoodleSceneState, x: number, counterY: number) {
  const mushy = overcooked(state);
  drawStove(context, x, counterY, state.time, 0.7 + state.position * 0.3);
  const potY = counterY - 136;
  const noodle = doneness(state, [255, 253, 240], [250, 224, 150], [222, 198, 150]);
  drawPot(context, x, potY, (inner) => {
    inner.fillStyle = "#e9573a";
    inner.fillRect(x - 100, potY - 30, 200, 60);
    drawNoodleStrands(inner, x, potY + 2, 76, noodle, state.time * (2 + state.position * 5), 5 + mushy * 5);
    inner.fillStyle = "rgba(255,255,255,.8)";
    const bubbles = 3 + Math.round(state.position * 7);
    for (let index = 0; index < bubbles; index += 1) {
      const phase = (state.time * (1.2 + state.position * 2) + index * 0.37) % 1;
      inner.beginPath();
      inner.arc(x - 78 + ((index * 53) % 156), potY + 12 - phase * 18, 2.5 + phase * 3.5, 0, Math.PI * 2);
      inner.fill();
    }
  });
  if (mushy > 0.2) {
    // 煮过头：汤沫漫出锅沿
    for (let index = 0; index < 6; index += 1) {
      ellipse(context, x - 84 + index * 34, potY + 2 + (index % 2) * 5, 16 * mushy + 5, 10 * mushy + 3, "#fff6e3");
    }
  }
  drawSteam(context, x, potY - 28, state.time, 0.55 + state.position * 0.45);
}

function drawSeason(context: Context, state: NoodleSceneState, x: number, counterY: number) {
  const bowlX = sweepX(x, state.target * 0.6 + 0.2);
  drawNoodleBowl(context, bowlX, counterY - 96, 0.86);
  const shakerX = sweepX(x, state.position * 0.6 + 0.2);
  const pouring = state.grade !== null;
  context.save();
  context.translate(shakerX, counterY - 214 + (pouring ? 12 : Math.sin(state.time * 6) * 3));
  context.rotate(pouring ? Math.PI * 0.82 : Math.PI * 0.12);
  roundedRect(context, -17, -26, 34, 46, 9, "#ffffff");
  roundedRect(context, -19, -40, 38, 18, 8, "#9aa5ad");
  context.fillStyle = INK;
  for (const dot of [-8, 0, 8]) context.fillRect(dot - 1.5, -34, 3, 3);
  context.fillStyle = "#2f6fb5";
  context.font = "900 13px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("盐", 0, 0);
  context.restore();
  if (pouring) {
    context.fillStyle = "#ffffff";
    for (let index = 0; index < 9; index += 1) {
      const fall = (state.time * 2.4 + index * 0.11) % 1;
      context.fillRect(shakerX - 14 + ((index * 17) % 28), counterY - 178 + fall * 64, 3, 3);
    }
  }
}

function drawIdle(context: Context, state: NoodleSceneState, x: number, counterY: number) {
  roundedRect(context, x - 150, counterY - 26, 300, 30, 10, "#e9c48d");
  drawTomato(context, x - 100, counterY - 62, 38);
  drawTomato(context, x - 46, counterY - 54, 30);
  drawEgg(context, x + 6, counterY - 52, 0.4);
  drawEgg(context, x + 42, counterY - 50, -0.5);
  // 一把挂面
  roundedRect(context, x + 70, counterY - 50, 72, 24, 7, "#fbe6a6");
  context.save();
  context.lineWidth = 1.5;
  context.strokeStyle = "rgba(61, 47, 42, .28)";
  for (const offset of [-6, 0, 6]) {
    context.beginPath();
    context.moveTo(x + 74, counterY - 38 + offset);
    context.lineTo(x + 138, counterY - 38 + offset);
    context.stroke();
  }
  context.restore();
  roundedRect(context, x + 98, counterY - 53, 16, 30, 4, TOMATO);
}

export function drawNoodleScene(context: Context, state: NoodleSceneState) {
  const x = state.width / 2;
  // 台面贴着底部的火候条摆放；屏幕很矮时至少留出上半屏给工序提示。
  const counterY = Math.round(Math.max(state.height * 0.5, state.height - 262));
  context.clearRect(0, 0, state.width, state.height);
  drawKitchen(context, state, counterY);
  context.lineWidth = 3;
  context.strokeStyle = INK;
  context.lineJoin = "round";
  if (state.stage === "cut") drawCut(context, state, x, counterY);
  else if (state.stage === "egg") drawCrackEgg(context, state, x, counterY);
  else if (state.stage === "scramble") drawScramble(context, state, x, counterY);
  else if (state.stage === "tomato") drawTomatoSoup(context, state, x, counterY);
  else if (state.stage === "boil") drawBoil(context, state, x, counterY);
  else if (state.stage === "season") drawSeason(context, state, x, counterY);
  else if (state.stage === "serve") {
    drawNoodleBowl(context, x, counterY - 104, 1.12);
    drawSteam(context, x, counterY - 136, state.time, 0.9);
    context.lineWidth = 3;
    context.strokeStyle = INK;
    drawStars(context, x, counterY - 226, state.stars, state.time);
  } else drawIdle(context, state, x, counterY);
}
