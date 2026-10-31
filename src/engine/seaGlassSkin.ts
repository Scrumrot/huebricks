import { RED, type Color } from "../core/color";
import type { Layout } from "../core/layout";
import { cellX, cellY, replenishY } from "../core/layout";
import type { SpriteMap } from "./assets";
import type { TitleFx } from "./backdrops";
import { rgba, roundRect, shade, type Ctx } from "./modernSkin";
import type { SlideStyle } from "./modernSlides";
import { buildSkin, makeGlyphs, seeded, type ButtonFn, type SkinSpec, type TileFn } from "./skinKit";
import { fillScreen, screenRect } from "./view";

/**
 * "Sea Glass": frosted pebbles tumbled smooth on wet sand. Muted colours, a
 * frosted sheen on every pebble, a foam line that creeps up the sand and
 * back, shells, and a crab that scuttles off when tapped; buttons are
 * water-drop discs and the tray is a tide pool. Pops burst into bubbles
 * and leave a wet patch that dries back to sand.
 */

export const FONT = 'Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
export const DISPLAY = 'Quicksand, "Nunito", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const SAND = "#EEE3CC";
export const SAND_WET = "#D9C9A8";
export const SAND_DARK = "#C9B68F";
export const WATER = "#BFE0E6";
export const WATER_DEEP = "#8FC6D1";
export const FOAM = "#FFFFFF";
export const TEXT = "#3C4A52";
export const MUTED = "#7E8B91";
export const CARD = "#FBF7EF";

export const SEA_COLORS: Record<Color, string> = {
  1: "#E08A86",
  2: "#7FB3C9",
  3: "#B39BD6",
  4: "#E6D679",
  5: "#EFAC7E",
  6: "#8FCDB0",
  7: "#7B848C",
};

// ---------------------------------------------------------------------------
// Pebble tile, glyphs, water-drop button
// ---------------------------------------------------------------------------

/** A frosted pebble: a soft rounded square with a matte gradient and a milky sheen across the top. */
const pebble: TileFn = (g, x, y, w, h, base, opts = {}) => {
  const m = Math.min(w, h);
  const fill = opts.lift ? shade(base, opts.lift) : base;
  const r = opts.radius ?? m * 0.3;
  roundRect(g, x, y, w, h, r);
  const grad = g.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, shade(fill, 0.1));
  grad.addColorStop(1, shade(fill, -0.12));
  g.fillStyle = grad;
  g.fill();
  g.save();
  roundRect(g, x, y, w, h, r);
  g.clip();
  // frost: a grainy veil
  const rnd = seeded(opts.seed ?? 7);
  g.fillStyle = "rgba(255,255,255,0.12)";
  for (let i = 0; i < 18; i++) {
    g.beginPath();
    g.arc(x + rnd() * w, y + rnd() * h, m * (0.02 + rnd() * 0.05), 0, Math.PI * 2);
    g.fill();
  }
  // sheen
  g.fillStyle = "rgba(255,255,255,0.3)";
  g.beginPath();
  g.ellipse(x + w * 0.38, y + h * 0.26, w * 0.26, h * 0.1, -0.2, 0, Math.PI * 2);
  g.fill();
  g.restore();
  g.lineWidth = Math.max(1, m * 0.02);
  g.strokeStyle = "rgba(255,255,255,0.45)";
  roundRect(g, x + 0.5, y + 0.5, w - 1, h - 1, r);
  g.stroke();
};

const glyphs = makeGlyphs({ stroke: "rgba(255,255,255,0.92)", fill: "rgba(255,255,255,0.92)", glow: null, width: 0.04 });

/** A round water drop: pale blue disc with a light rim and a bright highlight. */
const dropButton: ButtonFn = (g, w, h, pressed, icon) => {
  const cx = w / 2;
  const cy = h / 2 + (pressed ? 2 : 0);
  const r = Math.min(w, h) * 0.38;
  if (!pressed) {
    g.beginPath();
    g.arc(cx, cy + 3, r, 0, Math.PI * 2);
    g.fillStyle = "rgba(60,74,82,0.18)";
    g.fill();
  }
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  const grad = g.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
  grad.addColorStop(0, "#FFFFFF");
  grad.addColorStop(0.5, pressed ? WATER_DEEP : WATER);
  grad.addColorStop(1, WATER_DEEP);
  g.fillStyle = grad;
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = "rgba(255,255,255,0.8)";
  g.beginPath();
  g.arc(cx, cy, r - 1, 0, Math.PI * 2);
  g.stroke();
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
  roundRect(g, x, y + 5, w, h, r);
  g.fillStyle = "rgba(60,74,82,0.12)";
  g.fill();
  roundRect(g, x, y, w, h, r);
  g.fillStyle = CARD;
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = rgba(WATER_DEEP, 0.7);
  roundRect(g, x, y, w, h, r);
  g.stroke();
}

/** A scallop shell. */
export function shell(g: Ctx, cx: number, cy: number, r: number, color: string): void {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(cx, cy + r * 0.6);
  for (let k = 0; k <= 6; k++) {
    const a = Math.PI + (k / 6) * Math.PI;
    g.lineTo(cx + Math.cos(a) * r, cy + r * 0.2 + Math.sin(a) * r * 0.9);
  }
  g.closePath();
  g.fill();
  g.strokeStyle = "rgba(60,74,82,0.25)";
  g.lineWidth = 1;
  for (let k = 1; k < 6; k++) {
    const a = Math.PI + (k / 6) * Math.PI;
    g.beginPath();
    g.moveTo(cx, cy + r * 0.6);
    g.lineTo(cx + Math.cos(a) * r * 0.9, cy + r * 0.2 + Math.sin(a) * r * 0.8);
    g.stroke();
  }
}

/** A small crab, legs out, facing `dir`. */
export function crab(g: Ctx, cx: number, cy: number, s: number, dir = 1): void {
  g.save();
  g.translate(cx, cy);
  g.scale(dir, 1);
  g.strokeStyle = "#D9705C";
  g.lineWidth = Math.max(1, s * 0.12);
  g.lineCap = "round";
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      g.moveTo(side * s * 0.4, s * (k - 1) * 0.25);
      g.lineTo(side * s * 0.9, s * (k - 0.6) * 0.35);
      g.stroke();
    }
  }
  g.fillStyle = "#E4836F";
  g.beginPath();
  g.ellipse(0, 0, s * 0.55, s * 0.4, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#3C4A52";
  g.beginPath();
  g.arc(-s * 0.2, -s * 0.3, s * 0.08, 0, Math.PI * 2);
  g.arc(s * 0.2, -s * 0.3, s * 0.08, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** "HueBricks" in the rounded face over a wave of water, a shell beside it. */
function logo(g: Ctx, i: number, w: number, h: number): void {
  const size = h * 0.36;
  // a foam line under the wordmark
  g.strokeStyle = rgba(WATER_DEEP, i === 1 ? 0.9 : 0.6);
  g.lineWidth = 3;
  g.lineCap = "round";
  g.beginPath();
  for (let x = w * 0.1; x <= w * 0.9; x += 8) {
    const y = h * 0.74 + Math.sin(x / 26) * 4;
    if (x === w * 0.1) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
  shell(g, w * 0.9, h * 0.3, h * 0.12, SEA_COLORS[5]);
  g.font = `700 ${size}px ${DISPLAY}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = TEXT;
  g.fillText("HueBricks", w / 2, h / 2 + 4);
}

function menuFrame(g: Ctx, w: number, h: number): void {
  g.fillStyle = WATER;
  g.fillRect(0, 8, w, h - 8);
  g.fillStyle = FOAM;
  g.beginPath();
  g.moveTo(0, 8);
  for (let x = 0; x <= w; x += 10) g.lineTo(x, 8 + Math.sin(x / 30) * 3);
  g.lineTo(w, 14);
  g.lineTo(0, 14);
  g.closePath();
  g.fill();
}

// ---------------------------------------------------------------------------
// Backdrop and furniture
// ---------------------------------------------------------------------------

/** A damp hollow in the sand. */
export function drawSeaWell(g: Ctx, x: number, y: number, w: number, h: number): void {
  const r = Math.min(w, h) * 0.3;
  roundRect(g, x, y, w, h, r);
  g.fillStyle = rgba(SAND_WET, 0.7);
  g.fill();
  g.lineWidth = 1;
  g.strokeStyle = rgba(SAND_DARK, 0.6);
  roundRect(g, x + 0.5, y + 0.5, w - 1, h - 1, r);
  g.stroke();
}

/** The tide pool: a rounded pool of water with a foam edge. */
export function drawSeaTray(g: Ctx, x: number, y: number, w: number, h: number): void {
  roundRect(g, x, y, w, h, 16);
  g.fillStyle = SAND_WET;
  g.fill();
  roundRect(g, x + 3, y + 3, w - 6, h - 6, 14);
  const grad = g.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, WATER);
  grad.addColorStop(1, WATER_DEEP);
  g.fillStyle = grad;
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = rgba(FOAM, 0.8);
  roundRect(g, x + 4, y + 4, w - 8, h - 8, 13);
  g.stroke();
}

/** Wet sand with a foam line creeping in and out, shells and a crab that scuttles off when tapped; with a layout, the board and the pool. */
export function drawSeaBackdrop(g: Ctx, t: number, l?: Layout, flare = 0, fx: TitleFx | null = null): void {
  const sr = screenRect();
  fillScreen(g, SAND);
  // sand grain
  const rnd = seeded(19);
  g.fillStyle = "rgba(60,74,82,0.05)";
  for (let i = 0; i < 300; i++) g.fillRect(rnd() * sr.w, rnd() * sr.h, 1.5, 1.5);
  // the tide: water across the top, its foam line creeping down and back; a clear brings it further
  // at rest the water keeps to the top edge; a level clear brings it halfway down the screen and back
  const tide = sr.h * (0.045 + 0.02 * Math.sin(t / 3200) + flare * 0.5);
  const waterGrad = g.createLinearGradient(0, 0, 0, tide);
  waterGrad.addColorStop(0, WATER_DEEP);
  waterGrad.addColorStop(1, WATER);
  g.fillStyle = waterGrad;
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(sr.w, 0);
  g.lineTo(sr.w, tide);
  for (let x = sr.w; x >= 0; x -= 10) g.lineTo(x, tide + Math.sin(x / 48 + t / 900) * 7 + Math.sin(x / 17 - t / 700) * 3);
  g.closePath();
  g.fill();
  // wet band below the foam
  g.fillStyle = rgba(SAND_WET, 0.8);
  g.beginPath();
  g.moveTo(0, tide + 4);
  for (let x = 0; x <= sr.w; x += 10) g.lineTo(x, tide + 4 + Math.sin(x / 48 + t / 900) * 7);
  g.lineTo(sr.w, tide + 26);
  g.lineTo(0, tide + 26);
  g.closePath();
  g.fill();
  g.strokeStyle = FOAM;
  g.lineWidth = 3;
  g.beginPath();
  for (let x = 0; x <= sr.w; x += 10) {
    const y = tide + Math.sin(x / 48 + t / 900) * 7 + Math.sin(x / 17 - t / 700) * 3;
    if (x === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
  // shells
  const rnd2 = seeded(3);
  for (let i = 0; i < 5; i++) shell(g, rnd2() * sr.w, sr.h * (0.5 + rnd2() * 0.45), 7 + rnd2() * 6, [SEA_COLORS[5], SEA_COLORS[4], "#F6EADB"][i % 3]);
  // the crab: sits low right; a tap near it sends it scuttling the other way
  let cx = sr.w * 0.85;
  let dir = -1;
  for (const tap of fx?.taps ?? []) {
    const age = t - tap.t;
    if (age > 1500 || Math.abs(tap.x - cx) > 160) continue;
    const run = Math.min(1, age / 1500) * 220;
    dir = tap.x < cx ? 1 : -1;
    cx += dir * run;
  }
  crab(g, cx, sr.h * 0.92 + Math.sin(t / 150) * (fx?.taps.length ? 1.5 : 0.4), 10, dir);
  if (!l) return;
  const n = l.cellNum;
  const gridBottom = cellY(l, n) - l.cellSep;
  roundRect(g, l.boardX - 12, l.boardY - 12, l.boardW + 24, gridBottom - l.boardY + 18, 18);
  g.fillStyle = rgba(SAND, 0.9);
  g.fill();
  g.lineWidth = 1.5;
  g.strokeStyle = rgba(SAND_DARK, 0.6);
  roundRect(g, l.boardX - 12, l.boardY - 12, l.boardW + 24, gridBottom - l.boardY + 18, 18);
  g.stroke();
  const pad = l.cellW * 0.04;
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) drawSeaWell(g, cellX(l, x) + pad, cellY(l, y) + pad, l.cellW - pad * 2, l.cellH - pad * 2);
  }
  drawSeaTray(g, l.boardX - 8, replenishY(l) - 8, l.boardW + 16, l.cellH + 16);
}

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------

const slides: SlideStyle = {
  background(g, w, h) {
    g.fillStyle = SAND;
    g.fillRect(0, 0, w, h);
    g.fillStyle = WATER;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(w, 0);
    g.lineTo(w, h * 0.12);
    for (let x = w; x >= 0; x -= 10) g.lineTo(x, h * 0.12 + Math.sin(x / 40) * 5);
    g.closePath();
    g.fill();
  },
  font: FONT,
  display: DISPLAY,
  text: TEXT,
  muted: MUTED,
  bgColor: SAND,
  dotIdle: "rgba(60,74,82,0.25)",
  card: CARD,
  cardEdge: rgba(WATER_DEEP, 0.7),
  cardShadow: "rgba(60,74,82,0.14)",
  gridLine: "rgba(60,74,82,0.08)",
  well: rgba(SAND_WET, 0.7),
  wellEdge: rgba(SAND_DARK, 0.6),
  track: "rgba(60,74,82,0.12)",
  colors: SEA_COLORS,
  inkOn: () => "#FFFFFF",
  tile: (g, x, y, w, h, base, opts) => pebble(g, x, y, w, h, base, { radius: opts?.radius, plain: true }),
  glyphs,
  button: dropButton,
};

const SPEC: SkinSpec = {
  colors: SEA_COLORS,
  neutral: "#C8BFAE",
  bg: SAND,
  text: TEXT,
  muted: MUTED,
  font: FONT,
  display: DISPLAY,
  tile: pebble,
  glyphs,
  button: dropButton,
  panel,
  logo,
  menuFrame,
  worldText: "#FFFFFF",
  worldTextShadow: "rgba(60,74,82,0.5)",
  shadow: "rgba(60,74,82,0.2)",
  glow: false,
  selector: "ink",
  selectorNeutral: TEXT,
  progress: [WATER_DEEP, SEA_COLORS[6]],
  pop(g, t, w, h) {
    // bubbles rising out of the pebble
    g.globalAlpha = 1 - t;
    g.strokeStyle = "rgba(255,255,255,0.9)";
    g.lineWidth = 1.5;
    const rnd = seeded(5);
    for (let k = 0; k < 6; k++) {
      const bx = w * (0.25 + rnd() * 0.5);
      const by = h * (0.6 - t * 0.9 - rnd() * 0.2);
      g.beginPath();
      g.arc(bx, by, w * (0.04 + rnd() * 0.05) * (0.6 + t), 0, Math.PI * 2);
      g.stroke();
    }
  },
  mute: SEA_COLORS[RED],
  well: drawSeaWell,
  slides,
};

export function buildSeaGlassSprites(classic: SpriteMap): SpriteMap {
  return buildSkin(classic, SPEC);
}
