import type { Sprite } from "./assets";

/** `draw_sprite_stretched` */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: Sprite,
  frame: number,
  x: number,
  y: number,
  w: number,
  h: number,
  alpha = 1,
): void {
  const img = sprite.frames[Math.max(0, Math.min(sprite.frames.length - 1, Math.floor(frame)))];
  if (alpha !== 1) {
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = prev * alpha;
    ctx.drawImage(img, x, y, w, h);
    ctx.globalAlpha = prev;
  } else {
    ctx.drawImage(img, x, y, w, h);
  }
}

/** `draw_sprite_part_ext` restricted to a left portion of the frame, stretched horizontally. */
export function drawSpritePartX(
  ctx: CanvasRenderingContext2D,
  sprite: Sprite,
  frame: number,
  fraction: number,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const img = sprite.frames[frame];
  const sw = Math.max(0, Math.min(1, fraction)) * sprite.width;
  if (sw <= 0) return;
  ctx.drawImage(img, 0, 0, sw, sprite.height, x, y, w * (sw / sprite.width), h);
}

/**
 * `block_draw.gml`: draw a cell-sized sprite at (sx, sy), scaled about its
 * centre by (xs, ys) and offset by (xo, yo).
 */
export function drawBlock(
  ctx: CanvasRenderingContext2D,
  sprite: Sprite,
  frame: number,
  sx: number,
  sy: number,
  cellW: number,
  cellH: number,
  xs = 1,
  ys = 1,
  xo = 0,
  yo = 0,
  alpha = 1,
): void {
  const xd = (xs - 1) / 2;
  const yd = (ys - 1) / 2;
  const cw = Math.floor(cellW);
  const ch = Math.floor(cellH);
  drawSprite(ctx, sprite, frame, Math.floor(sx) - cw * xd + xo, Math.floor(sy) - ch * yd + yo, cw * xs, ch * ys, alpha);
}

export interface TextStyle {
  size?: number;
  color?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  bold?: boolean;
  shadow?: string;
  font?: string;
}

let defaultFont = "Arial, Helvetica, sans-serif";

/** Font stack used by `drawText` when a style does not name one (set by the theme). */
export function setDefaultFont(font: string): void {
  defaultFont = font;
}

export function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, style: TextStyle = {}): void {
  const { size = 16, color = "#000", align = "center", baseline = "middle", bold = true, shadow, font = defaultFont } = style;
  ctx.font = `${bold ? "bold " : ""}${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  const lines = text.split("\n");
  const lineH = size * 1.2;
  const startY = baseline === "middle" ? y - ((lines.length - 1) * lineH) / 2 : y;
  lines.forEach((line, i) => {
    const ly = startY + i * lineH;
    if (shadow) {
      ctx.fillStyle = shadow;
      ctx.fillText(line, x + 1, ly + 1);
    }
    ctx.fillStyle = color;
    ctx.fillText(line, x, ly);
  });
}

export function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string | CanvasGradient,
  stroke?: string,
  lineWidth = 1,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

/** A translucent dark panel used by the modern theme's overlays. */
export function drawCard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 18): void {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 8;
  fillRoundRect(ctx, x, y, w, h, r, "rgba(17,24,39,0.96)", "rgba(255,255,255,0.10)", 1);
  ctx.restore();
}

export interface PillButton {
  id: string;
  label: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
  primary?: boolean;
}

/** Modern pill button with hover and pressed states. */
export function drawPillButton(ctx: CanvasRenderingContext2D, b: PillButton, hover: boolean, pressed: boolean, font?: string): void {
  const scale = pressed ? 0.97 : 1;
  const w = b.w * scale;
  const h = b.h * scale;
  const x = b.cx - w / 2;
  const y = b.cy - h / 2;
  let fill: string;
  if (b.primary) fill = pressed ? "#2f63d8" : hover ? "#5a92ff" : "#3b7cff";
  else fill = pressed ? "rgba(255,255,255,0.08)" : hover ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.12)";
  fillRoundRect(ctx, x, y, w, h, h / 2, fill, b.primary ? undefined : "rgba(255,255,255,0.14)", 1);
  drawText(ctx, b.label, b.cx, b.cy + 1, { size: h * 0.42, color: "#f8fafc", bold: true, font });
}

export function drawLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, width: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
