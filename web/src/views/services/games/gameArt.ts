// 小游戏画面共用的画法：同色系细描边、柔和明暗和投影，不用粗黑线。

export type Context = CanvasRenderingContext2D;

function channels(hex: string) {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.split("").map((digit) => digit + digit).join("") : value;
  return [0, 2, 4].map((index) => parseInt(full.slice(index, index + 2), 16));
}

/** 向另一种颜色混合；amount 为 0 到 1。 */
export function mix(from: string, to: string, amount: number) {
  const a = channels(from);
  const b = channels(to);
  const t = Math.min(1, Math.max(0, amount));
  return `rgb(${a.map((value, index) => Math.round(value + (b[index] - value) * t)).join(",")})`;
}

export const darken = (hex: string, amount = 0.28) => mix(hex, "#2a1d16", amount);
export const lighten = (hex: string, amount = 0.3) => mix(hex, "#ffffff", amount);

/** 物体落在台面上的软影。 */
export function groundShadow(context: Context, x: number, y: number, rx: number, ry: number, alpha = 0.16) {
  const shadow = context.createRadialGradient(x, y, 0, x, y, Math.max(1, rx));
  shadow.addColorStop(0, `rgba(70, 42, 20, ${alpha})`);
  shadow.addColorStop(1, "rgba(70, 42, 20, 0)");
  context.save();
  context.translate(x, y);
  context.scale(1, Math.max(0.01, ry / Math.max(1, rx)));
  context.translate(-x, -y);
  context.fillStyle = shadow;
  context.beginPath();
  context.arc(x, y, Math.max(1, rx), 0, Math.PI * 2);
  context.fill();
  context.restore();
}

export function vertical(context: Context, top: number, bottom: number, from: string, to: string) {
  const fill = context.createLinearGradient(0, top, 0, bottom);
  fill.addColorStop(0, from);
  fill.addColorStop(1, to);
  return fill;
}

/** 填充并用更深的同色系描一圈细边。outline 传 null 则不描边。 */
export function paint(context: Context, fill: string | CanvasGradient, outline: string | null, lineWidth = 1.5) {
  context.fillStyle = fill;
  context.fill();
  if (!outline) return;
  context.lineWidth = lineWidth;
  context.strokeStyle = outline;
  context.stroke();
}

export function ellipsePath(context: Context, x: number, y: number, rx: number, ry: number, rotation = 0) {
  context.beginPath();
  context.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), rotation, 0, Math.PI * 2);
}

export function roundedPath(context: Context, x: number, y: number, width: number, height: number, radius: number) {
  // iOS 15 的 WebView 没有 roundRect，用 arcTo 画圆角。
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}
