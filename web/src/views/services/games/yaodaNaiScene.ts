// 合成药大奶的画面。十个等级各是一张奶蛙的图（src/assets/yaoda-nai），对局里裁成圆贴上去；
// 换形象只需要替换图片文件。

import level01 from "@/assets/yaoda-nai/level-01.webp";
import level02 from "@/assets/yaoda-nai/level-02.webp";
import level03 from "@/assets/yaoda-nai/level-03.webp";
import level04 from "@/assets/yaoda-nai/level-04.webp";
import level05 from "@/assets/yaoda-nai/level-05.webp";
import level06 from "@/assets/yaoda-nai/level-06.webp";
import level07 from "@/assets/yaoda-nai/level-07.webp";
import level08 from "@/assets/yaoda-nai/level-08.webp";
import level09 from "@/assets/yaoda-nai/level-09.webp";
import level10 from "@/assets/yaoda-nai/level-10.webp";
import { lighten, mix, roundedPath, type Context } from "./gameArt";
import { naiBodyRadius, naiLevelRadius, NAI_LEVELS, NAI_MAX_LEVEL, NAI_RULES, type NaiState } from "./yaodaNaiEngine";

const ART = [level01, level02, level03, level04, level05, level06, level07, level08, level09, level10];

/** 每一级圆框的颜色，球很小的时候也能分清等级。 */
const TINTS = ["#b9d86a", "#8fae52", "#8ec5ea", "#4fc2b4", "#7fb4e8", "#f08d7a", "#8f8be0", "#7f8798", "#e0667a", "#ffbf3c"];

function tintOf(level: number) {
  return TINTS[Math.min(NAI_MAX_LEVEL, Math.max(1, level)) - 1];
}

const images: Array<HTMLImageElement | null> = ART.map(() => null);
const sprites = new Map<number, HTMLCanvasElement>();
const SPRITE_PAD = 1.03;

function loadArt() {
  if (typeof Image === "undefined") return Promise.resolve();
  return Promise.all(ART.map((source, index) => new Promise<void>((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      images[index] = image;
      sprites.delete(index + 1);
      resolve();
    };
    // 图没加载出来就一直用纯色圆顶着，不影响玩。
    image.onerror = () => resolve();
    image.src = source;
  }))).then(() => undefined);
}

/** 十张图都加载完（或失败）以后完成，页面据此重画已经画出去的小图标。 */
export const naiArtReady = loadArt();

/** 每一级画一次存起来，对局里只贴图。 */
function sprite(level: number) {
  let cached = sprites.get(level);
  if (cached) return cached;
  const size = Math.min(480, Math.max(160, Math.ceil(naiLevelRadius(level) * 2 * 2.5)));
  cached = document.createElement("canvas");
  cached.width = size;
  cached.height = size;
  const context = cached.getContext("2d");
  const tint = tintOf(level);
  const image = images[level - 1];
  if (context) {
    const unit = size / 2 / SPRITE_PAD;
    context.translate(size / 2, size / 2);
    context.scale(unit, unit);
    context.save();
    context.beginPath();
    context.arc(0, 0, 0.985, 0, Math.PI * 2);
    context.clip();
    if (image) {
      context.imageSmoothingQuality = "high";
      context.drawImage(image, -1, -1, 2, 2);
    } else {
      const fill = context.createRadialGradient(-0.2, -0.35, 0.1, 0, 0, 1.05);
      fill.addColorStop(0, "#ffffff");
      fill.addColorStop(1, mix(tint, "#ffffff", 0.5));
      context.fillStyle = fill;
      context.fillRect(-1, -1, 2, 2);
    }
    context.restore();
    // 细细一圈边框。
    context.beginPath();
    context.arc(0, 0, 0.972, 0, Math.PI * 2);
    context.lineWidth = 0.05;
    context.strokeStyle = mix(tint, "#ffffff", 0.18);
    context.stroke();
    context.beginPath();
    context.arc(0, 0, 0.936, 0, Math.PI * 2);
    context.lineWidth = 0.02;
    context.strokeStyle = "rgba(255, 255, 255, 0.8)";
    context.stroke();
  }
  // 图还没到的时候不存，下次再画。
  if (image) sprites.set(level, cached);
  return cached;
}

/** 在 (x, y) 画一只半径 radius 的球，整张圆图跟着球一起转。 */
export function drawNaiBall(context: Context, level: number, x: number, y: number, radius: number, rotation = 0, alpha = 1) {
  const half = radius * SPRITE_PAD;
  context.save();
  context.globalAlpha *= alpha;
  context.translate(x, y);
  context.rotate(rotation);
  context.drawImage(sprite(level), -half, -half, half * 2, half * 2);
  context.restore();
}

export interface NaiLayout {
  scale: number;
  /** 罐子内侧左上角（警戒线左端）在画布里的位置。 */
  left: number;
  top: number;
}

const TOP_RESERVE = 78;
const DROP_ZONE = 118;
const STRIP = 50;
const SIDE = 10;

export function naiLayout(width: number, height: number): NaiLayout {
  const needed = DROP_ZONE + NAI_RULES.height;
  const room = height - TOP_RESERVE - STRIP - 14;
  const scale = Math.min(1, (width - SIDE * 2) / NAI_RULES.width, room / needed);
  const spare = Math.max(0, room - needed * scale);
  return {
    scale,
    left: (width - NAI_RULES.width * scale) / 2,
    top: TOP_RESERVE + DROP_ZONE * scale + spare * 0.5,
  };
}

/** 画布横坐标换成罐子里的横坐标。 */
export function naiAimAt(layout: NaiLayout, x: number) {
  return (x - layout.left) / layout.scale;
}

function backdrop(context: Context, width: number, height: number) {
  const sky = context.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#fffbe2");
  sky.addColorStop(0.55, "#f7f3cf");
  sky.addColorStop(1, "#dcebbd");
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);
  const sun = context.createRadialGradient(width * 0.12, height * 0.04, 0, width * 0.12, height * 0.04, width * 0.7);
  sun.addColorStop(0, "rgba(255, 255, 255, 0.9)");
  sun.addColorStop(1, "rgba(255, 255, 255, 0)");
  context.fillStyle = sun;
  context.fillRect(0, 0, width, height);
  const hill = context.createRadialGradient(width * 0.9, height * 1.02, 0, width * 0.9, height * 1.02, width * 0.62);
  hill.addColorStop(0, "rgba(176, 208, 138, 0.5)");
  hill.addColorStop(1, "rgba(176, 208, 138, 0)");
  context.fillStyle = hill;
  context.fillRect(0, 0, width, height);
  context.beginPath();
  for (let x = 14; x < width; x += 30) {
    context.moveTo(x, 0);
    context.lineTo(x, height);
  }
  for (let y = 12; y < height; y += 30) {
    context.moveTo(0, y);
    context.lineTo(width, y);
  }
  context.lineWidth = 1;
  context.strokeStyle = "rgba(126, 150, 92, 0.085)";
  context.stroke();
}

function jar(context: Context, danger: number, time: number) {
  const { width, height } = NAI_RULES;
  roundedPath(context, -6, -DROP_ZONE + 8, width + 12, height + DROP_ZONE - 2, 24);
  context.fillStyle = "rgba(255, 255, 255, 0.5)";
  context.fill();
  context.lineWidth = 2;
  context.strokeStyle = "rgba(168, 196, 128, 0.75)";
  context.stroke();
  // 罐壁和罐底
  context.beginPath();
  context.moveTo(-3, -20);
  context.lineTo(-3, height - 18);
  context.quadraticCurveTo(-3, height + 3, 18, height + 3);
  context.lineTo(width - 18, height + 3);
  context.quadraticCurveTo(width + 3, height + 3, width + 3, height - 18);
  context.lineTo(width + 3, -20);
  context.lineWidth = 6;
  context.lineCap = "round";
  context.strokeStyle = "#a9c98a";
  context.stroke();
  context.lineWidth = 2;
  context.strokeStyle = "rgba(255, 255, 255, 0.7)";
  context.stroke();

  // 警戒线：快判负时变粗、闪烁。
  const pulse = danger > 0 ? 0.55 + 0.45 * Math.sin(time * 14) : 0;
  context.save();
  context.beginPath();
  context.setLineDash([12, 9]);
  context.moveTo(4, 0);
  context.lineTo(width - 4, 0);
  context.lineWidth = 2.5 + danger * 2.5;
  context.strokeStyle = danger > 0 ? `rgba(232, 72, 92, ${0.65 + 0.35 * pulse})` : "rgba(238, 138, 156, 0.9)";
  context.stroke();
  context.restore();
  roundedPath(context, 8, -25, 56, 20, 10);
  context.fillStyle = danger > 0 ? "rgba(255, 214, 220, 0.96)" : "rgba(255, 236, 238, 0.92)";
  context.fill();
  context.font = '700 11px "HarmonyOS Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#d9596c";
  context.fillText("警戒线", 36, -14.5);
}

function effects(context: Context, game: NaiState) {
  for (const effect of game.effects) {
    const progress = Math.min(1, effect.age / 0.6);
    const radius = naiLevelRadius(effect.level);
    const tint = tintOf(effect.level);
    const fade = 1 - progress;
    context.save();
    context.translate(effect.x, effect.y);
    context.globalAlpha = fade;
    context.beginPath();
    context.arc(0, 0, radius * (0.9 + progress * (effect.kind === "clear" ? 1.6 : 0.7)), 0, Math.PI * 2);
    context.lineWidth = (effect.kind === "clear" ? 10 : 5) * fade + 1;
    context.strokeStyle = lighten(tint, 0.2);
    context.stroke();
    const count = effect.kind === "clear" ? 16 : 8;
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2 + effect.level;
      const distance = radius * (0.8 + progress * (effect.kind === "clear" ? 2.2 : 1.1));
      context.beginPath();
      context.arc(Math.cos(angle) * distance, Math.sin(angle) * distance, (effect.kind === "clear" ? 6 : 3.4) * fade + 0.6, 0, Math.PI * 2);
      context.fillStyle = index % 2 ? "#ffffff" : lighten(tint, 0.1);
      context.fill();
    }
    context.restore();
  }
}

/** 底部的合成表：十个等级从小到大排一行，出现过的才点亮。 */
function strip(context: Context, width: number, y: number, reached: number) {
  const gap = Math.min(39, (width - 28) / NAI_MAX_LEVEL);
  const start = (width - gap * (NAI_MAX_LEVEL - 1)) / 2;
  roundedPath(context, start - 22, y - 20, gap * (NAI_MAX_LEVEL - 1) + 44, 40, 20);
  context.fillStyle = "rgba(255, 255, 255, 0.62)";
  context.fill();
  context.lineWidth = 1;
  context.strokeStyle = "rgba(168, 196, 128, 0.6)";
  context.stroke();
  for (let level = 1; level <= NAI_MAX_LEVEL; level += 1) {
    drawNaiBall(context, level, start + gap * (level - 1), y, 15.5, 0, level <= reached ? 1 : 0.38);
  }
}

export interface NaiSceneOptions {
  width: number;
  height: number;
  game: NaiState;
  /** 罐子坐标里的瞄准位置。 */
  aim: number;
  /** 准备阶段不画手里的球的落点线。 */
  playing: boolean;
}

export function drawNaiScene(context: Context, options: NaiSceneOptions) {
  const { width, height, game, aim, playing } = options;
  const layout = naiLayout(width, height);
  backdrop(context, width, height);

  context.save();
  context.translate(layout.left, layout.top);
  context.scale(layout.scale, layout.scale);
  jar(context, game.danger, game.time);

  // 手里的球和它的落点线。冷却时新球从小长出来。
  if (!game.over) {
    const ready = 1 - game.cooldown / NAI_RULES.dropCooldown;
    const radius = naiLevelRadius(game.current);
    if (playing && ready >= 1) {
      context.save();
      context.beginPath();
      context.setLineDash([5, 7]);
      context.moveTo(aim, NAI_RULES.dropY + radius + 4);
      context.lineTo(aim, NAI_RULES.height - 4);
      context.lineWidth = 1.5;
      context.strokeStyle = "rgba(110, 140, 80, 0.42)";
      context.stroke();
      context.restore();
    }
    if (ready > 0.25) drawNaiBall(context, game.current, aim, NAI_RULES.dropY, radius * Math.min(1, 0.4 + ready * 0.6), 0, Math.min(1, ready * 1.4));
  }

  for (const body of game.bodies) {
    const radius = naiBodyRadius(body);
    const warn = body.above > 0.25 && Math.sin(game.time * 16) > 0 ? 0.72 : 1;
    drawNaiBall(context, body.level, body.x, body.y, radius, body.angle, warn);
  }
  effects(context, game);
  context.restore();

  strip(context, width, layout.top + NAI_RULES.height * layout.scale + 12 + STRIP / 2, game.maxLevel);
}

/** 小画布上的单只图标，用在“下一个”和设置页的图鉴里。 */
export function drawNaiIcon(context: Context, level: number, size: number) {
  context.clearRect(0, 0, size, size);
  drawNaiBall(context, level, size / 2, size / 2, size / 2 / SPRITE_PAD);
}

/** 主菜单的插画：药大奶居中，几只低等级的围在旁边。 */
export function drawNaiMenuArt(context: Context, size: number) {
  context.clearRect(0, 0, size, size);
  const unit = size / 248;
  const fill = context.createLinearGradient(0, 0, 0, size);
  fill.addColorStop(0, "#fffbe2");
  fill.addColorStop(1, "#e2efc2");
  context.fillStyle = fill;
  context.fillRect(0, 0, size, size);
  const balls: Array<[number, number, number, number, number]> = [
    [1, 44, 196, 20, -0.3], [2, 206, 60, 24, 0.25], [4, 44, 78, 32, -0.2], [5, 204, 176, 38, 0.2], [8, 60, 140, 30, 0.1],
    [10, 126, 126, 78, 0],
  ];
  for (const [level, x, y, radius, rotation] of balls) drawNaiBall(context, level, x * unit, y * unit, radius * unit, rotation);
}

export const NAI_LEVEL_NAMES = NAI_LEVELS.map((level) => level.name);
