import type { Sprite } from "./assets";
import type { UiPalette } from "./theme";

/** `draw_sprite_stretched` */
export function drawSprite(ctx: CanvasRenderingContext2D, sprite: Sprite, frame: number, x: number, y: number, w: number, h: number, alpha = 1): void {
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
  drawSprite(ctx, sprite, frame, sx - cellW * xd + xo, sy - cellH * yd + yo, cellW * xs, cellH * ys, alpha);
}

/**
 * Draw a cell-sized sprite with a full transform: scaled about its centre,
 * rotated by `rot` radians, offset by (xo, yo).
 */
export function drawBlockTransformed(
  ctx: CanvasRenderingContext2D,
  sprite: Sprite,
  frame: number,
  sx: number,
  sy: number,
  cellW: number,
  cellH: number,
  xs: number,
  ys: number,
  rot: number,
  xo = 0,
  yo = 0,
  alpha = 1,
): void {
  if (rot === 0) {
    drawBlock(ctx, sprite, frame, sx, sy, cellW, cellH, xs, ys, xo, yo, alpha);
    return;
  }
  const cx = sx + cellW / 2 + xo;
  const cy = sy + cellH / 2 + yo;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  drawSprite(ctx, sprite, frame, (-cellW * xs) / 2, (-cellH * ys) / 2, cellW * xs, cellH * ys, alpha);
  ctx.restore();
}

export interface TextStyle {
  size?: number;
  color?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  bold?: boolean;
  /** CSS font weight; overrides `bold` when set. */
  weight?: number;
  shadow?: string;
  font?: string;
  /** Lay digits out on a fixed advance (tabular numerals). */
  tabular?: boolean;
}

let defaultFont = "Arial, Helvetica, sans-serif";

/** Font stack used by `drawText` when a style does not name one (set by the theme). */
export function setDefaultFont(font: string): void {
  defaultFont = font;
}

function fontString(style: TextStyle): string {
  const { size = 16, bold = true, weight, font = defaultFont } = style;
  const w = weight !== undefined ? String(weight) : bold ? "bold" : "normal";
  return `${w} ${size}px ${font}`;
}

export function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, style: TextStyle = {}): void {
  const { size = 16, color = "#000", align = "center", baseline = "middle", shadow, tabular } = style;
  ctx.font = fontString(style);
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  const lines = text.split("\n");
  const lineH = size * 1.2;
  const startY = baseline === "middle" ? y - ((lines.length - 1) * lineH) / 2 : y;
  lines.forEach((line, i) => {
    const ly = startY + i * lineH;
    if (tabular) {
      drawTabularLine(ctx, line, x, ly, align, color, shadow);
      return;
    }
    if (shadow) {
      ctx.fillStyle = shadow;
      ctx.fillText(line, x + 1, ly + 1);
    }
    ctx.fillStyle = color;
    ctx.fillText(line, x, ly);
  });
}

/**
 * Lay a line out character by character, giving every digit the advance of
 * "0" so numbers never jitter while they count up. Canvas has no font
 * feature settings, so this is done by hand.
 */
function drawTabularLine(ctx: CanvasRenderingContext2D, line: string, x: number, y: number, align: CanvasTextAlign, color: string, shadow?: string): void {
  const digitW = ctx.measureText("0").width;
  const chars = Array.from(line);
  const widths = chars.map((c) => (c >= "0" && c <= "9" ? digitW : ctx.measureText(c).width));
  const total = widths.reduce((a, b) => a + b, 0);
  let cx = align === "center" ? x - total / 2 : align === "right" || align === "end" ? x - total : x;
  ctx.textAlign = "center";
  chars.forEach((c, i) => {
    const w = widths[i];
    if (shadow) {
      ctx.fillStyle = shadow;
      ctx.fillText(c, cx + w / 2 + 1, y + 1);
    }
    ctx.fillStyle = color;
    ctx.fillText(c, cx + w / 2, y);
    cx += w;
  });
}

/** Width of `text` in the given style (for layout). */
export function measureText(ctx: CanvasRenderingContext2D, text: string, style: TextStyle = {}): number {
  ctx.font = fontString(style);
  if (style.tabular) {
    const digitW = ctx.measureText("0").width;
    return Array.from(text).reduce((a, c) => a + (c >= "0" && c <= "9" ? digitW : ctx.measureText(c).width), 0);
  }
  return ctx.measureText(text).width;
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

/** Overlay card in the theme's colours with a hard offset shadow. */
export function drawCard(ctx: CanvasRenderingContext2D, ui: UiPalette, x: number, y: number, w: number, h: number, r = 18): void {
  fillRoundRect(ctx, x, y + 6, w, h, r, ui.cardShadow);
  fillRoundRect(ctx, x, y, w, h, r, ui.card, ui.cardEdge, 1);
}

export interface PillButton {
  id: string;
  label: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
  primary?: boolean;
  /** Visual scale driven by the feel layer (press / hover tweens). */
  scale?: number;
}

/** Pill button in the theme's colours with hover and pressed states. */
export function drawPillButton(ctx: CanvasRenderingContext2D, ui: UiPalette, b: PillButton, hover: boolean, pressed: boolean, font?: string): void {
  const scale = b.scale ?? (pressed ? 0.96 : hover ? 1.03 : 1);
  const w = b.w * scale;
  const h = b.h * scale;
  const x = b.cx - w / 2;
  const y = b.cy - h / 2;
  if (b.primary) {
    fillRoundRect(ctx, x, y, w, h, h / 2, hover ? ui.primaryHover : ui.primary);
  } else {
    fillRoundRect(ctx, x, y, w, h, h / 2, hover ? ui.secondaryHover : ui.secondary, ui.secondaryEdge, 1.5);
  }
  drawText(ctx, b.label, b.cx, b.cy + 1, { size: h * 0.4, color: b.primary ? ui.primaryText : ui.secondaryText, weight: 700, font });
}

export function drawLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, width: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
