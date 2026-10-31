import { RED, type Color } from "../core/color";
import type { Layout } from "../core/layout";
import { cellX, cellY, replenishY } from "../core/layout";
import type { SpriteMap } from "./assets";
import type { TitleFx } from "./backdrops";
import { rgba, roundRect, shade, type Ctx } from "./modernSkin";
import type { SlideStyle } from "./modernSlides";
import { buildSkin, makeGlyphs, seeded, type ButtonFn, type SkinSpec, type TileFn } from "./skinKit";
import { fillScreen, screenRect, heroSpot } from "./view";

/**
 * "Knit": chunky knitted squares on a felt mat. Every brick is a square of
 * zigzag stitches with a stitched (dashed) glyph; the controls are sewing
 * buttons with four holes; the tray is a wicker basket. A ball of yarn with
 * needles sits top right and unspools toward the pointer; pops come apart
 * into loose loops of yarn, and mixing re-knits the new colour from the top
 * edge down (the `curtain` mix).
 */

export const FONT = 'Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
export const DISPLAY = '"Baloo 2", "Fredoka", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const FELT = "#F3EAD9";
export const FELT_DARK = "#E6DAC4";
export const WICKER = "#B5884E";
export const WICKER_DARK = "#8A6336";
export const WICKER_LIGHT = "#D4AA72";
export const TEXT = "#3F332B";
export const MUTED = "#8C7D6B";
export const CARD = "#FBF6EC";
export const THREAD = "#FFF8EE";

export const KNIT_COLORS: Record<Color, string> = {
  1: "#D9534F",
  2: "#3F6FB5",
  3: "#7E5BA6",
  4: "#E3B93E",
  5: "#E0843A",
  6: "#5E9E62",
  7: "#4A4440",
};

// ---------------------------------------------------------------------------
// Knitted tile, stitched glyphs, sewing-button control
// ---------------------------------------------------------------------------

/** A knitted square: rows of zigzag stitches in two shades, a soft rolled edge. */
const square: TileFn = (g, x, y, w, h, base, opts = {}) => {
  const m = Math.min(w, h);
  const fill = opts.lift ? shade(base, opts.lift) : base;
  const r = opts.radius ?? m * 0.2;
  roundRect(g, x, y, w, h, r);
  g.fillStyle = fill;
  g.fill();
  g.save();
  roundRect(g, x, y, w, h, r);
  g.clip();
  const rows = 7;
  const rh = h / rows;
  const amp = rh * 0.42;
  const step = w / 6;
  for (let i = 0; i <= rows; i++) {
    const yy = y + i * rh;
    g.strokeStyle = i % 2 === 0 ? shade(fill, -0.16) : shade(fill, 0.14);
    g.lineWidth = Math.max(1, rh * 0.38);
    g.lineJoin = "round";
    g.beginPath();
    for (let k = 0; k <= 6; k++) {
      const px = x + k * step;
      const py = yy + (k % 2 === 0 ? -amp : amp);
      if (k === 0) g.moveTo(px - step, py);
      g.lineTo(px, py);
    }
    g.lineTo(x + w + step, yy - amp);
    g.stroke();
  }
  // rolled edge
  g.lineWidth = Math.max(1.5, m * 0.04);
  g.strokeStyle = shade(fill, -0.22);
  roundRect(g, x + m * 0.02, y + m * 0.02, w - m * 0.04, h - m * 0.04, r);
  g.stroke();
  g.restore();
};

/** Stitched glyphs: a dashed cream thread. */
const baseGlyphs = makeGlyphs({ stroke: THREAD, fill: rgba(THREAD, 0.95), glow: null, width: 0.05 });
const glyphs = (g: Ctx, color: Color, cx: number, cy: number, size: number): void => {
  g.save();
  g.setLineDash([size * 0.06, size * 0.045]);
  g.lineCap = "round";
  baseGlyphs(g, color, cx, cy, size);
  g.restore();
};

/** A round sewing button: four holes with a thread cross, the icon stitched on top. */
const sewButton: ButtonFn = (g, w, h, pressed, icon) => {
  const cx = w / 2;
  const cy = h / 2 + (pressed ? 2 : 0);
  const r = Math.min(w, h) * 0.38;
  if (!pressed) {
    g.beginPath();
    g.arc(cx, cy + 3, r, 0, Math.PI * 2);
    g.fillStyle = "rgba(60,40,20,0.22)";
    g.fill();
  }
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  const grad = g.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
  grad.addColorStop(0, pressed ? WICKER : WICKER_LIGHT);
  grad.addColorStop(1, pressed ? WICKER_DARK : WICKER);
  g.fillStyle = grad;
  g.fill();
  g.lineWidth = Math.max(1.5, r * 0.08);
  g.strokeStyle = WICKER_DARK;
  g.beginPath();
  g.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
  g.stroke();
  // holes
  g.fillStyle = WICKER_DARK;
  for (const [hx, hy] of [
    [-0.22, -0.22],
    [0.22, -0.22],
    [-0.22, 0.22],
    [0.22, 0.22],
  ]) {
    g.beginPath();
    g.arc(cx + r * hx, cy + r * hy, r * 0.07, 0, Math.PI * 2);
    g.fill();
  }
  g.save();
  g.strokeStyle = TEXT;
  g.fillStyle = TEXT;
  g.lineWidth = r * 0.13;
  g.lineCap = "round";
  g.lineJoin = "round";
  icon(g, cx, cy, r * 0.5);
  g.restore();
};

function panel(g: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  roundRect(g, x, y + 6, w, h, r);
  g.fillStyle = "rgba(60,40,20,0.14)";
  g.fill();
  roundRect(g, x, y, w, h, r);
  g.fillStyle = CARD;
  g.fill();
  g.save();
  g.setLineDash([6, 5]);
  g.lineWidth = 2;
  g.strokeStyle = rgba(WICKER, 0.7);
  roundRect(g, x + 6, y + 6, w - 12, h - 12, Math.max(4, r - 6));
  g.stroke();
  g.restore();
}

/** A ball of yarn: a disc with wrapped arcs, and a loose tail. */
export function yarnBall(g: Ctx, cx: number, cy: number, r: number, color: string, tail = 0): void {
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fillStyle = color;
  g.fill();
  g.save();
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.clip();
  g.strokeStyle = shade(color, -0.2);
  g.lineWidth = Math.max(1, r * 0.09);
  for (let k = -3; k <= 3; k++) {
    g.beginPath();
    g.ellipse(cx, cy, r * 1.05, r * 0.32 * Math.abs(k || 0.5), (k * Math.PI) / 7, 0, Math.PI * 2);
    g.stroke();
  }
  g.restore();
  if (tail > 0) {
    g.strokeStyle = color;
    g.lineWidth = Math.max(1, r * 0.12);
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(cx + r * 0.7, cy + r * 0.6);
    g.bezierCurveTo(cx + r * 2, cy + r * 1.4, cx + r * 0.5, cy + r * 2.2, cx + r * 0.2 + tail, cy + r * 2 + tail * 0.3);
    g.stroke();
  }
}

/** "HueBricks" in the rounded face, stitched, with a yarn ball and needles. */
function logo(g: Ctx, i: number, w: number, h: number): void {
  const size = h * 0.38;
  yarnBall(g, w * 0.88, h * 0.3, h * 0.13, KNIT_COLORS[RED], i === 1 ? 24 : 10);
  g.strokeStyle = WICKER_DARK;
  g.lineWidth = 3;
  g.lineCap = "round";
  for (const a of [-0.9, -1.4]) {
    g.beginPath();
    g.moveTo(w * 0.88 - Math.cos(a) * h * 0.3, h * 0.3 - Math.sin(a) * h * 0.3);
    g.lineTo(w * 0.88 + Math.cos(a) * h * 0.3, h * 0.3 + Math.sin(a) * h * 0.3);
    g.stroke();
  }
  g.font = `800 ${size}px ${DISPLAY}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const y = h / 2 + 10;
  g.save();
  g.setLineDash([size * 0.06, size * 0.05]);
  g.lineWidth = size * 0.05;
  g.strokeStyle = rgba(THREAD, 0.9);
  g.fillStyle = TEXT;
  g.fillText("HueBricks", w / 2, y);
  g.strokeText("HueBricks", w / 2, y);
  g.restore();
}

/** A menu's bottom band: felt with the basket rim along its top edge, so the text on it stays readable. */
function menuFrame(g: Ctx, w: number, h: number): void {
  g.fillStyle = FELT_DARK;
  g.fillRect(0, 8, w, h - 8);
  drawWicker(g, -4, 4, w + 8, 16, 6);
}

/** Woven wicker: alternating over/under blocks in two shades, a rolled rim on top. */
export function drawWicker(g: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  g.save();
  roundRect(g, x, y, w, h, r);
  g.clip();
  g.fillStyle = WICKER;
  g.fillRect(x, y, w, h);
  const bw = 14;
  const bh = 8;
  for (let yy = 0; yy < h; yy += bh) {
    const odd = Math.floor(yy / bh) % 2 === 1;
    for (let xx = odd ? -bw / 2 : 0; xx < w; xx += bw) {
      const over = (Math.floor(xx / bw) + (odd ? 1 : 0)) % 2 === 0;
      g.fillStyle = over ? WICKER_LIGHT : WICKER_DARK;
      roundRect(g, x + xx + 1, y + yy + 1, bw - 2, bh - 2, 2);
      g.fill();
    }
  }
  g.restore();
  g.lineWidth = 3;
  g.strokeStyle = WICKER_DARK;
  roundRect(g, x + 1.5, y + 1.5, w - 3, h - 3, r);
  g.stroke();
}

// ---------------------------------------------------------------------------
// Backdrop and furniture
// ---------------------------------------------------------------------------

/** An empty place on the mat: a faint stitched square. */
export function drawKnitWell(g: Ctx, x: number, y: number, w: number, h: number): void {
  const r = Math.min(w, h) * 0.2;
  roundRect(g, x, y, w, h, r);
  g.fillStyle = "rgba(60,40,20,0.06)";
  g.fill();
  g.save();
  g.setLineDash([5, 4]);
  g.lineWidth = 1.2;
  g.strokeStyle = "rgba(60,40,20,0.22)";
  roundRect(g, x + 2, y + 2, w - 4, h - 4, r);
  g.stroke();
  g.restore();
}

/** The wicker basket the yarn waits in. */
export function drawKnitTray(g: Ctx, x: number, y: number, w: number, h: number): void {
  roundRect(g, x, y + 5, w, h, 12);
  g.fillStyle = "rgba(60,40,20,0.18)";
  g.fill();
  drawWicker(g, x, y, w, h, 12);
}

/** The next ball of yarn winding up in the basket: it grows with the timer, turning as it winds, its loose end waving. */
export function drawKnitFill(g: Ctx, x: number, y: number, w: number, h: number, level: number, colour: string, t: number): void {
  if (level <= 0) return;
  const r = Math.min(w, h) * (0.08 + 0.3 * level);
  const cx = x + w / 2;
  const cy = y + h * 0.56;
  g.save();
  g.translate(cx, cy);
  g.rotate(level * 4);
  yarnBall(g, 0, 0, r, colour);
  g.restore();
  // the end still being wound on, waving inside the well
  g.save();
  g.strokeStyle = colour;
  g.lineWidth = Math.max(1.5, r * 0.14);
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(cx + r * 0.9, cy - r * 0.2);
  g.bezierCurveTo(cx + r * 1.8, cy - r, cx + w * 0.3, y + h * 0.2 + Math.sin(t / 260) * 3, x + w - 3, y + h * 0.25 + Math.cos(t / 310) * 2);
  g.stroke();
  g.restore();
}

/** Felt mat with a dot texture, the yarn ball and needles top right unspooling toward the pointer, the basket rim along the bottom. */
export function drawKnitBackdrop(g: Ctx, t: number, l?: Layout, flare = 0, fx: TitleFx | null = null): void {
  const sr = screenRect();
  fillScreen(g, FELT);
  g.fillStyle = "rgba(60,40,20,0.06)";
  for (let y = 6; y < sr.h; y += 12) {
    for (let x = (y / 12) % 2 === 0 ? 6 : 12; x < sr.w; x += 12) g.fillRect(x, y, 1.5, 1.5);
  }
  // the yarn ball and its thread, pulled toward the pointer
  const { x: bx, y: by } = heroSpot(34, l !== undefined);
  const pointer = fx?.pointer ?? null;
  const tx = pointer ? pointer.x : bx - 120 - Math.sin(t / 2600) * 30;
  const ty = pointer ? pointer.y : by + 70 + Math.cos(t / 2100) * 20;
  g.strokeStyle = KNIT_COLORS[RED];
  g.lineWidth = 3;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(bx - 20, by + 20);
  g.bezierCurveTo(bx - 60, by + 90, tx + 80, ty - 60, tx, ty);
  g.stroke();
  yarnBall(g, bx, by, 30 + flare * 4, KNIT_COLORS[RED]);
  g.strokeStyle = WICKER_DARK;
  g.lineWidth = 4;
  for (const a of [-0.8, -1.3]) {
    g.beginPath();
    g.moveTo(bx - Math.cos(a) * 60, by - Math.sin(a) * 60);
    g.lineTo(bx + Math.cos(a) * 60, by + Math.sin(a) * 60);
    g.stroke();
  }
  // stray buttons scattered on the mat
  const rnd = seeded(13);
  for (let i = 0; i < 6; i++) {
    const x = rnd() * sr.w;
    const y = sr.h * (0.6 + rnd() * 0.3);
    const r = 5 + rnd() * 4;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = [WICKER_LIGHT, KNIT_COLORS[2], KNIT_COLORS[6], KNIT_COLORS[4]][i % 4];
    g.fill();
    g.fillStyle = "rgba(60,40,20,0.4)";
    for (const [hx, hy] of [
      [-0.3, -0.3],
      [0.3, -0.3],
      [-0.3, 0.3],
      [0.3, 0.3],
    ]) {
      g.beginPath();
      g.arc(x + r * hx, y + r * hy, r * 0.12, 0, Math.PI * 2);
      g.fill();
    }
  }
  // basket rim along the bottom
  drawWicker(g, -4, sr.h - 26, sr.w + 8, 40, 10);
  if (!l) return;
  const n = l.cellNum;
  const gridBottom = cellY(l, n) - l.cellSep;
  roundRect(g, l.boardX - 12, l.boardY - 12, l.boardW + 24, gridBottom - l.boardY + 18, 14);
  g.fillStyle = FELT_DARK;
  g.fill();
  g.save();
  g.setLineDash([7, 5]);
  g.lineWidth = 2;
  g.strokeStyle = rgba(WICKER, 0.6);
  roundRect(g, l.boardX - 8, l.boardY - 8, l.boardW + 16, gridBottom - l.boardY + 10, 10);
  g.stroke();
  g.restore();
  const pad = l.cellW * 0.04;
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) drawKnitWell(g, cellX(l, x) + pad, cellY(l, y) + pad, l.cellW - pad * 2, l.cellH - pad * 2);
  }
  drawKnitTray(g, l.boardX - 8, replenishY(l) - 8, l.boardW + 16, l.cellH + 16);
}

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------

const slides: SlideStyle = {
  background(g, w, h) {
    g.fillStyle = FELT;
    g.fillRect(0, 0, w, h);
    drawWicker(g, -4, h * 0.86, w + 8, h * 0.2, 8);
  },
  font: FONT,
  display: DISPLAY,
  text: TEXT,
  muted: MUTED,
  bgColor: FELT,
  dotIdle: "rgba(63,51,43,0.25)",
  card: CARD,
  cardEdge: rgba(WICKER, 0.6),
  cardShadow: "rgba(60,40,20,0.18)",
  gridLine: "rgba(63,51,43,0.08)",
  well: "rgba(60,40,20,0.06)",
  wellEdge: "rgba(60,40,20,0.22)",
  track: "rgba(60,40,20,0.12)",
  colors: KNIT_COLORS,
  inkOn: () => THREAD,
  tile: (g, x, y, w, h, base, opts) => square(g, x, y, w, h, base, { radius: opts?.radius, plain: true }),
  glyphs,
  button: sewButton,
};

const SPEC: SkinSpec = {
  colors: KNIT_COLORS,
  neutral: "#C9BBA6",
  bg: FELT,
  text: TEXT,
  muted: MUTED,
  font: FONT,
  display: DISPLAY,
  tile: square,
  glyphs,
  button: sewButton,
  panel,
  logo,
  menuFrame,
  worldText: THREAD,
  worldTextShadow: "rgba(60,40,20,0.5)",
  shadow: "rgba(60,40,20,0.22)",
  glow: false,
  selector: "ink",
  selectorNeutral: TEXT,
  progress: [KNIT_COLORS[RED], KNIT_COLORS[5]],
  pop(g, t, w, h) {
    // a strand pulling loose in a loop
    g.globalAlpha = 1 - t;
    g.strokeStyle = THREAD;
    g.lineWidth = 3;
    g.lineCap = "round";
    g.beginPath();
    g.arc(w / 2, h / 2, w * (0.15 + t * 0.35), Math.PI * 0.2 + t * 4, Math.PI * 1.4 + t * 4);
    g.stroke();
  },
  mute: KNIT_COLORS[RED],
  well: drawKnitWell,
  slides,
};

export function buildKnitSprites(classic: SpriteMap): SpriteMap {
  return buildSkin(classic, SPEC);
}
