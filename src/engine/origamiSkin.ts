import { BLUE, RED, YELLOW, type Color } from "../core/color";
import type { Layout } from "../core/layout";
import { cellX, cellY, replenishY } from "../core/layout";
import type { SpriteMap } from "./assets";
import type { TitleFx } from "./backdrops";
import { rgba, roundRect, shade, type Ctx } from "./modernSkin";
import type { SlideStyle } from "./modernSlides";
import { buildSkin, makeGlyphs, seeded, type ButtonFn, type SkinSpec, type TileFn } from "./skinKit";
import { fillScreen, screenRect } from "./view";

/**
 * "Origami": folded paper squares on a kraft desk. Every brick is a flat
 * sheet with a diagonal crease and a lifted corner showing the paper's pale
 * back; buttons are sticky notes, the desk has ruled lines and layered
 * paper-cut hills, and a paper crane perches top right and flaps on a level
 * clear. Colour mixing folds the new colour over the old (the `fold` mix),
 * and pops tear into paper scraps.
 */

export const FONT = 'Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
export const DISPLAY = 'Nunito, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const KRAFT = "#D6BE9B";
export const KRAFT_DARK = "#CDB38E";
export const KRAFT_DEEP = "#B99B74";
export const KRAFT_SHADOW = "#A88761";
export const KRAFT_FAR = "#8F7250";
export const PAPER = "#FFF7EA";
export const PAPER_EDGE = "#EADCC6";
export const TEXT = "#3A2E22";
export const MUTED = "#7A6650";

export const ORIGAMI_COLORS: Record<Color, string> = {
  1: "#E5483F",
  2: "#2F6FD6",
  3: "#8A4BC9",
  4: "#F4C542",
  5: "#F2893B",
  6: "#4CB36B",
  7: "#3C3C3C",
};

// ---------------------------------------------------------------------------
// Folded sheet, glyphs, sticky-note button
// ---------------------------------------------------------------------------

/** A folded square: flat colour, a diagonal crease with the upper half catching more light, and a lifted corner. */
const sheet: TileFn = (g, x, y, w, h, base, opts = {}) => {
  const m = Math.min(w, h);
  const r = opts.radius ?? m * 0.04;
  const fill = opts.lift ? shade(base, opts.lift) : base;
  g.save();
  roundRect(g, x, y, w, h, r);
  g.clip();
  g.fillStyle = fill;
  g.fillRect(x, y, w, h);
  // the upper-right half of the crease catches more light
  g.fillStyle = "rgba(255,255,255,0.09)";
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + w, y);
  g.lineTo(x + w, y + h);
  g.closePath();
  g.fill();
  g.strokeStyle = "rgba(0,0,0,0.14)";
  g.lineWidth = Math.max(0.8, m * 0.012);
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + w, y + h);
  g.stroke();
  if (!opts.plain) {
    // lifted corner, bottom right: the darker sheet beneath and the pale back of the flap
    const c = m * 0.26;
    g.fillStyle = shade(fill, -0.3);
    g.beginPath();
    g.moveTo(x + w, y + h - c);
    g.lineTo(x + w, y + h);
    g.lineTo(x + w - c, y + h);
    g.closePath();
    g.fill();
    g.save();
    g.shadowColor = "rgba(0,0,0,0.25)";
    g.shadowBlur = m * 0.03;
    g.shadowOffsetX = -m * 0.01;
    g.shadowOffsetY = -m * 0.01;
    g.fillStyle = PAPER;
    g.beginPath();
    g.moveTo(x + w - c, y + h);
    g.lineTo(x + w, y + h - c);
    g.lineTo(x + w - c * 0.96, y + h - c * 0.96);
    g.closePath();
    g.fill();
    g.restore();
    g.fillStyle = "rgba(0,0,0,0.06)";
    g.beginPath();
    g.moveTo(x + w - c, y + h);
    g.lineTo(x + w, y + h - c);
    g.lineTo(x + w - c * 0.6, y + h - c * 0.6);
    g.closePath();
    g.fill();
  }
  g.restore();
  g.lineWidth = Math.max(0.8, m * 0.01);
  g.strokeStyle = "rgba(0,0,0,0.12)";
  roundRect(g, x + 0.5, y + 0.5, w - 1, h - 1, r);
  g.stroke();
};

const glyphs = makeGlyphs({ stroke: PAPER, fill: "rgba(255,247,234,0.95)", width: 0.045 });

/** A sticky note: a paper square with a curled corner and a soft shadow, dark icon. */
const noteButton: ButtonFn = (g, w, h, pressed, icon) => {
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * 0.4;
  const s = r * 1.8;
  const x = cx - s / 2;
  const y = cy - s / 2;
  g.save();
  g.shadowColor = "rgba(58,46,34,0.3)";
  g.shadowBlur = r * 0.25;
  g.shadowOffsetY = r * 0.1;
  g.fillStyle = pressed ? "#F6EAD6" : PAPER;
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + s, y);
  g.lineTo(x + s, y + s * 0.8);
  g.lineTo(x + s * 0.8, y + s);
  g.lineTo(x, y + s);
  g.closePath();
  g.fill();
  g.restore();
  g.fillStyle = PAPER_EDGE;
  g.beginPath();
  g.moveTo(x + s, y + s * 0.8);
  g.lineTo(x + s * 0.8, y + s);
  g.lineTo(x + s * 0.8, y + s * 0.8);
  g.closePath();
  g.fill();
  g.save();
  g.strokeStyle = TEXT;
  g.fillStyle = TEXT;
  g.lineWidth = r * 0.13;
  g.lineCap = "round";
  g.lineJoin = "round";
  icon(g, cx, cy, r);
  g.restore();
};

function panel(g: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  g.save();
  g.shadowColor = "rgba(58,46,34,0.25)";
  g.shadowBlur = r;
  g.shadowOffsetY = r * 0.3;
  roundRect(g, x, y, w, h, r);
  g.fillStyle = PAPER;
  g.fill();
  g.restore();
  g.lineWidth = 1;
  g.strokeStyle = rgba(TEXT, 0.15);
  roundRect(g, x, y, w, h, r);
  g.stroke();
  // folded top-right corner
  const c = Math.min(28, r * 2);
  g.fillStyle = KRAFT;
  g.beginPath();
  g.moveTo(x + w - c, y);
  g.lineTo(x + w, y + c);
  g.lineTo(x + w, y);
  g.closePath();
  g.fill();
  g.fillStyle = PAPER_EDGE;
  g.beginPath();
  g.moveTo(x + w - c, y);
  g.lineTo(x + w, y + c);
  g.lineTo(x + w - c, y + c);
  g.closePath();
  g.fill();
}

/** A paper crane in profile, wings angled by `flap` (0 rest, 1 raised). */
export function crane(g: Ctx, cx: number, cy: number, s: number, flap: number, color = PAPER): void {
  g.save();
  g.translate(cx, cy);
  g.fillStyle = color;
  g.strokeStyle = "rgba(58,46,34,0.25)";
  g.lineWidth = Math.max(0.8, s * 0.03);
  g.lineJoin = "round";
  // body: a kite
  g.beginPath();
  g.moveTo(-s * 0.5, 0);
  g.lineTo(0, -s * 0.22);
  g.lineTo(s * 0.55, 0);
  g.lineTo(0, s * 0.3);
  g.closePath();
  g.fill();
  g.stroke();
  // neck and head
  g.beginPath();
  g.moveTo(-s * 0.5, 0);
  g.lineTo(-s * 0.72, -s * 0.5);
  g.lineTo(-s * 0.56, -s * 0.46);
  g.lineTo(-s * 0.4, -s * 0.1);
  g.closePath();
  g.fill();
  g.stroke();
  // tail
  g.beginPath();
  g.moveTo(s * 0.55, 0);
  g.lineTo(s * 0.8, -s * 0.42);
  g.lineTo(s * 0.48, -s * 0.08);
  g.closePath();
  g.fill();
  g.stroke();
  // wings
  const lift = -s * (0.5 + flap * 0.4);
  g.fillStyle = shade(color, -0.08);
  g.beginPath();
  g.moveTo(-s * 0.1, -s * 0.15);
  g.lineTo(s * 0.1 - flap * s * 0.2, lift);
  g.lineTo(s * 0.35, -s * 0.05);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
}

/** "HueBricks" in a rounded bold, ink on kraft with a paper-cut offset, and three folded tiles. */
function logo(g: Ctx, i: number, w: number, h: number): void {
  const size = h * 0.4;
  g.font = `800 ${size}px ${DISPLAY}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const y = h / 2 - 8;
  g.fillStyle = KRAFT_DEEP;
  g.fillText("HueBricks", w / 2 + 5, y + 6);
  g.fillStyle = PAPER;
  g.fillText("HueBricks", w / 2 + 2, y + 3);
  g.fillStyle = i === 1 ? "#4A3C2E" : TEXT;
  g.fillText("HueBricks", w / 2, y);
  const tw = g.measureText("HueBricks").width;
  crane(g, w / 2 + tw / 2 + size * 0.15, y - size * 0.62, size * 0.42, i === 1 ? 1 : 0.2);
  const mini = size * 0.2;
  [ORIGAMI_COLORS[RED], ORIGAMI_COLORS[BLUE], ORIGAMI_COLORS[YELLOW]].forEach((c, k) => {
    sheet(g, w / 2 - mini * 1.9 + k * mini * 1.3, y + size * 0.68, mini, mini, c, { seed: k });
  });
}

/** Layered paper-cut hills along the band. */
function menuFrame(g: Ctx, w: number, h: number): void {
  g.fillStyle = KRAFT_DARK;
  g.fillRect(0, 8, w, h - 8);
  for (const [col, yy, k] of [
    [KRAFT_DEEP, 0.3, 0.9],
    [KRAFT_SHADOW, 0.55, 1.4],
  ] as const) {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(0, h);
    g.lineTo(0, 8 + h * yy);
    for (let x = 0; x <= w; x += 60) g.lineTo(x + 30, 8 + h * yy - 10 * k * ((x / 60) % 2 ? 1 : -1));
    g.lineTo(w, h);
    g.closePath();
    g.fill();
  }
}

// ---------------------------------------------------------------------------
// Backdrop and furniture
// ---------------------------------------------------------------------------

/** An empty place on the desk: a slightly darker square with a light edge. */
export function drawOrigamiWell(g: Ctx, x: number, y: number, w: number, h: number): void {
  const r = Math.min(w, h) * 0.04;
  roundRect(g, x, y, w, h, r);
  g.fillStyle = "rgba(58,46,34,0.08)";
  g.fill();
  g.lineWidth = 1;
  g.strokeStyle = "rgba(255,247,234,0.35)";
  roundRect(g, x + 0.5, y + 0.5, w - 1, h - 1, r);
  g.stroke();
}

/** The pocket folder: a kraft pocket with a diagonal fold and a darker lip. */
export function drawOrigamiTray(g: Ctx, x: number, y: number, w: number, h: number): void {
  g.save();
  g.shadowColor = "rgba(58,46,34,0.28)";
  g.shadowBlur = 12;
  g.shadowOffsetY = 5;
  roundRect(g, x, y, w, h, 6);
  g.fillStyle = KRAFT_DEEP;
  g.fill();
  g.restore();
  roundRect(g, x + 3, y + 3, w - 6, h - 6, 4);
  g.fillStyle = "#C9AE86";
  g.fill();
  g.fillStyle = "rgba(0,0,0,0.08)";
  g.beginPath();
  g.moveTo(x + 3, y + h - 3);
  g.lineTo(x + 3, y + h * 0.55);
  g.lineTo(x + h * 0.5, y + h - 3);
  g.closePath();
  g.fill();
  g.fillStyle = "rgba(0,0,0,0.1)";
  g.fillRect(x + 3, y + h - 12, w - 6, 9);
  g.fillStyle = "rgba(255,247,234,0.3)";
  g.fillRect(x + 3, y + h - 12, w - 6, 1);
}

/** The next sheet sliding up out of the pocket as the well fills: coloured paper with a lifted corner, rising from a slot across the well. */
export function drawOrigamiFill(g: Ctx, x: number, y: number, w: number, h: number, level: number, colour: string): void {
  const lip = y + h * 0.7;
  // the slot the sheet rises from is there whether or not anything shows yet
  g.fillStyle = "rgba(58,46,34,0.2)";
  g.fillRect(x + w * 0.06, lip, w * 0.88, 1.5);
  if (level <= 0) return;
  const top = lip - (lip - (y + h * 0.04)) * level;
  const sx = x + w * 0.08;
  const sw = w * 0.84;
  g.save();
  g.beginPath();
  g.rect(x, y, w, lip - y);
  g.clip();
  g.fillStyle = "rgba(58,46,34,0.16)";
  g.fillRect(sx + 2, top + 3, sw, lip - top);
  g.fillStyle = colour;
  g.fillRect(sx, top, sw, lip - top + 2);
  // the lifted corner, folded back to show the paper's white underside
  const c = w * 0.22;
  g.fillStyle = rgba(PAPER, 0.85);
  g.beginPath();
  g.moveTo(sx + sw, top);
  g.lineTo(sx + sw, top + c);
  g.lineTo(sx + sw - c, top);
  g.closePath();
  g.fill();
  g.strokeStyle = "rgba(58,46,34,0.22)";
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(sx, lip);
  g.lineTo(sx + sw - c, top);
  g.stroke();
  g.restore();
}

/** Kraft desk with ruled lines, paper-cut hills along the bottom and a crane top right; with a layout, the mat, cells and folder. */
export function drawOrigamiBackdrop(g: Ctx, t: number, l?: Layout, flare = 0, fx: TitleFx | null = null): void {
  const sr = screenRect();
  fillScreen(g, KRAFT);
  g.strokeStyle = "rgba(58,46,34,0.07)";
  g.lineWidth = 1;
  for (let y = 24; y < sr.h; y += 26) {
    g.beginPath();
    g.moveTo(0, y + 0.5);
    g.lineTo(sr.w, y + 0.5);
    g.stroke();
  }
  // paper-cut hills
  for (const [col, yy, k, ph] of [
    [KRAFT_DARK, 0.76, 0.8, 0],
    [KRAFT_DEEP, 0.84, 1.1, 1.3],
    [KRAFT_SHADOW, 0.91, 1.5, 2.6],
  ] as const) {
    g.save();
    g.shadowColor = "rgba(58,46,34,0.18)";
    g.shadowBlur = 10;
    g.shadowOffsetY = -3;
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(0, sr.h);
    g.lineTo(0, sr.h * yy);
    const step = 90;
    for (let x = 0; x <= sr.w + step; x += step) g.lineTo(x + step / 2, sr.h * yy + Math.sin(x / 170 + ph) * 16 * k);
    g.lineTo(sr.w, sr.h);
    g.closePath();
    g.fill();
    g.restore();
  }
  // the crane, perched top right, flapping after a clear and when the pointer comes close
  const cxr = sr.w * 0.86;
  const cyr = sr.h * 0.14;
  const cs = Math.min(sr.w, sr.h) * 0.07;
  let near = 0;
  if (fx?.pointer) near = Math.max(0, 1 - Math.hypot(fx.pointer.x - cxr, fx.pointer.y - cyr) / (cs * 3));
  for (const tap of fx?.taps ?? []) {
    const age = t - tap.t;
    if (age < 700 && Math.hypot(tap.x - cxr, tap.y - cyr) < cs * 3) near = Math.max(near, 1 - age / 700);
  }
  const flap = Math.max(flare, near) * (0.5 + 0.5 * Math.sin(t / 110));
  const hover = flare * Math.sin(t / 260) * cs * 0.15;
  g.save();
  g.shadowColor = "rgba(58,46,34,0.3)";
  g.shadowBlur = 8;
  g.shadowOffsetY = 4;
  crane(g, cxr, cyr + hover, cs, flap);
  g.restore();
  if (!l) return;
  const n = l.cellNum;
  const gridBottom = cellY(l, n) - l.cellSep;
  // the desk mat
  g.save();
  g.shadowColor = "rgba(58,46,34,0.25)";
  g.shadowBlur = 16;
  g.shadowOffsetY = 6;
  roundRect(g, l.boardX - 12, l.boardY - 12, l.boardW + 24, gridBottom - l.boardY + 18, 6);
  g.fillStyle = PAPER;
  g.fill();
  g.restore();
  g.fillStyle = "rgba(58,46,34,0.05)";
  g.beginPath();
  g.moveTo(l.boardX - 12, l.boardY - 12);
  g.lineTo(l.boardX + l.boardW + 12, gridBottom + 6);
  g.lineTo(l.boardX + l.boardW + 12, l.boardY - 12);
  g.closePath();
  g.fill();
  const pad = l.cellW * 0.04;
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) drawOrigamiWell(g, cellX(l, x) + pad, cellY(l, y) + pad, l.cellW - pad * 2, l.cellH - pad * 2);
  }
  const ry = replenishY(l);
  drawOrigamiTray(g, l.boardX - 8, ry - 8, l.boardW + 16, l.cellH + 16);
}

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------

const slides: SlideStyle = {
  background(g, w, h) {
    g.fillStyle = KRAFT;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(58,46,34,0.07)";
    for (let y = 24; y < h; y += 26) {
      g.beginPath();
      g.moveTo(0, y + 0.5);
      g.lineTo(w, y + 0.5);
      g.stroke();
    }
    g.fillStyle = KRAFT_DEEP;
    g.fillRect(0, h * 0.78, w, h * 0.22);
    g.fillStyle = "rgba(255,247,234,0.3)";
    g.fillRect(0, h * 0.78, w, 2);
  },
  font: FONT,
  display: DISPLAY,
  text: TEXT,
  muted: MUTED,
  bgColor: KRAFT,
  dotIdle: rgba(TEXT, 0.25),
  card: PAPER,
  cardEdge: rgba(TEXT, 0.15),
  cardShadow: "rgba(58,46,34,0.25)",
  gridLine: "rgba(58,46,34,0.1)",
  well: "rgba(58,46,34,0.08)",
  wellEdge: "rgba(255,247,234,0.35)",
  track: rgba(TEXT, 0.12),
  colors: ORIGAMI_COLORS,
  inkOn: () => PAPER,
  tile: (g, x, y, w, h, base, opts) => sheet(g, x, y, w, h, base, { radius: opts?.radius, plain: true, seed: 2 }),
  glyphs,
  button: noteButton,
};

const SPEC: SkinSpec = {
  colors: ORIGAMI_COLORS,
  neutral: "#C4AD8C",
  bg: KRAFT,
  text: TEXT,
  muted: MUTED,
  font: FONT,
  display: DISPLAY,
  tile: sheet,
  glyphs,
  button: noteButton,
  panel,
  logo,
  menuFrame,
  worldText: PAPER,
  worldTextShadow: "rgba(0,0,0,0.35)",
  shadow: "rgba(58,46,34,0.45)",
  glow: false,
  selector: "ink",
  selectorNeutral: TEXT,
  progress: [ORIGAMI_COLORS[RED], ORIGAMI_COLORS[YELLOW]],
  pop(g, t, w, h) {
    g.globalAlpha = 1 - t;
    const rnd = seeded(5);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + rnd();
      const d = w * (0.08 + t * 0.4);
      g.save();
      g.translate(w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d);
      g.rotate(a + t * 4);
      g.fillStyle = k % 2 ? PAPER : KRAFT_DEEP;
      g.fillRect(-3, -2, 6, 4);
      g.restore();
    }
  },
  mute: ORIGAMI_COLORS[RED],
  well: drawOrigamiWell,
  slides,
};

export function buildOrigamiSprites(classic: SpriteMap): SpriteMap {
  return buildSkin(classic, SPEC);
}
