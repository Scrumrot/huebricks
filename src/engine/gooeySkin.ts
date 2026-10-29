import { BLUE, PURPLE, RED, type Color } from "../core/color";
import type { Layout } from "../core/layout";
import { cellX, cellY, replenishY } from "../core/layout";
import type { SpriteMap } from "./assets";
import type { TitleFx } from "./backdrops";
import { chipPath, rgba, roundRect, shade, type Ctx } from "./modernSkin";
import type { SlideStyle } from "./modernSlides";
import { buildSkin, makeGlyphs, seeded, type ButtonFn, type SkinSpec, type TileFn } from "./skinKit";
import { fillScreen, screenRect } from "./view";

/**
 * "Gooey": blobs of glossy slime in a dark lab. Wobbly-edged jelly tiles
 * with a wet highlight, bubbles inside and drips off the bottom, slime-blob
 * buttons, bubbles rising through the dark, a petri-dish slab under the grid
 * and a beaker tray whose wells fill with goo.
 */

export const FONT = 'Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
export const DISPLAY = 'Fredoka, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const BG = "#141026";
export const LAB = "#1F1838";
export const CARD = "#221A3E";
export const TEXT = "#F2F0FF";
export const MUTED = "#9A92BF";
export const SLIME = "#8CF23B";
export const SLIME_DARK = "#5FBF1E";
export const INK = "#1A1430";

export const GOOEY_COLORS: Record<Color, string> = {
  1: "#FF4F7A",
  2: "#3FA0FF",
  3: "#B266FF",
  4: "#FFE14D",
  5: "#FF9A3C",
  6: "#8CF23B",
  7: "#2C2742",
};

// ---------------------------------------------------------------------------
// Slime tile, glyphs, blob button
// ---------------------------------------------------------------------------

/** Jelly blob: wobbly outline, glossy gradient, inner bubbles, wet highlight, drips below. */
const slime: TileFn = (g, x, y, w, h, base, opts = {}) => {
  const m = Math.min(w, h);
  const r = opts.radius ?? m * 0.3;
  const fill = opts.lift ? shade(base, opts.lift) : base;
  const seed = (opts.seed ?? 1) + 5;
  const rnd = seeded(seed);
  // drips hanging off the bottom edge
  if (!opts.plain) {
    g.fillStyle = shade(fill, -0.1);
    for (let k = 0; k < 2; k++) {
      const dx = x + w * (0.2 + rnd() * 0.6);
      const dr = m * (0.07 + rnd() * 0.05);
      const len = m * (0.05 + rnd() * 0.1);
      roundRect(g, dx - dr / 2, y + h - m * 0.12, dr, m * 0.12 + len, dr / 2);
      g.fill();
    }
  }
  chipPath(g, x, y, w, h, r, m * 0.035, seed);
  const grad = g.createLinearGradient(x, y, x + w * 0.3, y + h);
  grad.addColorStop(0, shade(fill, 0.25));
  grad.addColorStop(0.55, fill);
  grad.addColorStop(1, shade(fill, -0.25));
  g.fillStyle = grad;
  g.fill();
  g.save();
  g.clip();
  // inner bubbles
  g.fillStyle = "rgba(255,255,255,0.14)";
  for (let k = 0; k < 4; k++) {
    g.beginPath();
    g.arc(x + w * (0.15 + rnd() * 0.7), y + h * (0.35 + rnd() * 0.5), m * (0.03 + rnd() * 0.05), 0, Math.PI * 2);
    g.fill();
  }
  // wet highlight
  g.fillStyle = "rgba(255,255,255,0.55)";
  g.beginPath();
  g.ellipse(x + w * 0.32, y + h * 0.22, w * 0.2, h * 0.09, -0.35, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "rgba(255,255,255,0.3)";
  g.beginPath();
  g.arc(x + w * 0.72, y + h * 0.3, m * 0.04, 0, Math.PI * 2);
  g.fill();
  // darker rim at the bottom
  const rim = g.createLinearGradient(x, y + h * 0.6, x, y + h);
  rim.addColorStop(0, "rgba(0,0,0,0)");
  rim.addColorStop(1, "rgba(0,0,0,0.25)");
  g.fillStyle = rim;
  g.fillRect(x, y + h * 0.6, w, h * 0.4);
  g.restore();
  g.lineWidth = Math.max(1, m * 0.02);
  g.strokeStyle = rgba(INK, 0.5);
  chipPath(g, x, y, w, h, r, m * 0.035, seed);
  g.stroke();
};

const glyphs = makeGlyphs({ stroke: "#FFFFFF", fill: "rgba(255,255,255,0.35)", shadow: "rgba(0,0,0,0.3)", width: 0.05 });

/** A blob of lime slime with a dark icon; pressed squashes wider. */
const blobButton: ButtonFn = (g, w, h, pressed, icon) => {
  const cx = w / 2;
  const cy = h / 2 + h * 0.02;
  const r = Math.min(w, h) * 0.38;
  const sx = pressed ? 1.08 : 1;
  const sy = pressed ? 0.92 : 1;
  g.save();
  g.translate(cx, cy);
  g.scale(sx, sy);
  g.shadowColor = rgba(SLIME, 0.5);
  g.shadowBlur = r * 0.35;
  chipPath(g, -r, -r, r * 2, r * 2, r, r * 0.06, 9);
  const grad = g.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
  grad.addColorStop(0, "#C5FF7A");
  grad.addColorStop(0.6, SLIME);
  grad.addColorStop(1, SLIME_DARK);
  g.fillStyle = grad;
  g.fill();
  g.shadowBlur = 0;
  g.fillStyle = "rgba(255,255,255,0.5)";
  g.beginPath();
  g.ellipse(-r * 0.3, -r * 0.45, r * 0.3, r * 0.14, -0.4, 0, Math.PI * 2);
  g.fill();
  // a drip under the blob
  g.fillStyle = SLIME_DARK;
  roundRect(g, r * 0.15, r * 0.8, r * 0.18, r * 0.42, r * 0.09);
  g.fill();
  g.restore();
  g.save();
  g.strokeStyle = INK;
  g.fillStyle = INK;
  g.lineWidth = r * 0.13;
  g.lineCap = "round";
  g.lineJoin = "round";
  icon(g, cx, cy, r);
  g.restore();
};

function panel(g: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  g.save();
  g.shadowColor = "rgba(0,0,0,0.5)";
  g.shadowBlur = r;
  roundRect(g, x, y, w, h, r);
  g.fillStyle = CARD;
  g.fill();
  g.restore();
  g.lineWidth = 2;
  g.strokeStyle = rgba(SLIME, 0.55);
  roundRect(g, x, y, w, h, r);
  g.stroke();
  // slime drips over the top edge
  g.fillStyle = SLIME;
  const rnd = seeded(3);
  for (let k = 0; k < 5; k++) {
    const dx = x + r + rnd() * (w - r * 2);
    const dw = 6 + rnd() * 8;
    const dl = 10 + rnd() * 22;
    roundRect(g, dx - dw / 2, y - 1, dw, dl, dw / 2);
    g.fill();
  }
  g.fillRect(x + r, y - 1, w - r * 2, 6);
}

/** "HueBricks" in Fredoka, lime slime with a wet shine and big drips. */
function logo(g: Ctx, i: number, w: number, h: number): void {
  const size = h * 0.4;
  g.font = `600 ${size}px ${DISPLAY}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const tw = g.measureText("HueBricks").width;
  const x0 = w / 2 - tw / 2;
  const y = h / 2 - 6;
  const rnd = seeded(27);
  const drips: Array<[number, number, number]> = [];
  for (let k = 0; k < 5; k++) drips.push([x0 + tw * (0.08 + rnd() * 0.84), size * (0.06 + rnd() * 0.04), size * (0.06 + rnd() * 0.18)]);
  g.lineJoin = "round";
  for (const [dx, dr, len] of drips) {
    roundRect(g, dx - dr / 2, y + size * 0.12, dr, size * 0.22 + len, dr / 2);
    g.lineWidth = size * 0.07;
    g.strokeStyle = INK;
    g.stroke();
  }
  g.save();
  g.shadowColor = rgba(SLIME, 0.55);
  g.shadowBlur = i === 1 ? 10 : 24;
  g.lineWidth = size * 0.14;
  g.strokeStyle = INK;
  g.strokeText("HueBricks", w / 2, y);
  g.restore();
  const grad = g.createLinearGradient(0, y - size / 2, 0, y + size / 2);
  grad.addColorStop(0, i === 1 ? "#D6FF99" : "#C5FF7A");
  grad.addColorStop(0.5, SLIME);
  grad.addColorStop(1, SLIME_DARK);
  g.fillStyle = grad;
  g.fillText("HueBricks", w / 2, y);
  for (const [dx, dr, len] of drips) {
    roundRect(g, dx - dr / 2, y + size * 0.12, dr, size * 0.22 + len, dr / 2);
    g.fillStyle = SLIME_DARK;
    g.fill();
  }
  // shine across the top of the letters
  g.save();
  g.globalCompositeOperation = "source-atop";
  g.fillStyle = "rgba(255,255,255,0.35)";
  g.fillRect(x0, y - size * 0.42, tw, size * 0.16);
  g.restore();
  const mini = size * 0.2;
  [GOOEY_COLORS[RED], GOOEY_COLORS[BLUE], GOOEY_COLORS[PURPLE]].forEach((c, k) => {
    slime(g, w / 2 - mini * 1.9 + k * mini * 1.3, y + size * 0.78, mini, mini, c, { plain: true, seed: k });
  });
}

function menuFrame(g: Ctx, w: number, h: number): void {
  g.fillStyle = rgba(LAB, 0.95);
  g.fillRect(0, 0, w, h);
  // a slime drip line along the top
  g.fillStyle = SLIME;
  g.fillRect(0, 0, w, 4);
  const rnd = seeded(8);
  for (let k = 0; k < 18; k++) {
    const dx = rnd() * w;
    const dw = 5 + rnd() * 9;
    const dl = 6 + rnd() * 20;
    roundRect(g, dx - dw / 2, 0, dw, dl, dw / 2);
    g.fill();
  }
}

// ---------------------------------------------------------------------------
// Backdrop and furniture
// ---------------------------------------------------------------------------

export function drawGooeyWell(g: Ctx, x: number, y: number, w: number, h: number): void {
  const r = Math.min(w, h) * 0.28;
  roundRect(g, x, y, w, h, r);
  g.fillStyle = "rgba(0,0,0,0.35)";
  g.fill();
  g.lineWidth = 1;
  g.strokeStyle = rgba(SLIME, 0.22);
  roundRect(g, x + 0.5, y + 0.5, w - 1, h - 1, r);
  g.stroke();
}

/** The beaker: dark glass trough with a slime rim and a liquid line. */
export function drawGooeyTray(g: Ctx, x: number, y: number, w: number, h: number): void {
  g.save();
  g.shadowColor = rgba(SLIME, 0.4);
  g.shadowBlur = 16;
  roundRect(g, x, y, w, h, 14);
  g.fillStyle = "#2A2250";
  g.fill();
  g.restore();
  roundRect(g, x + 3, y + 3, w - 6, h - 6, 11);
  g.fillStyle = "#1B1538";
  g.fill();
  g.fillStyle = rgba(SLIME, 0.18);
  g.fillRect(x + 6, y + h * 0.55, w - 12, h * 0.45 - 6);
  g.lineWidth = 2;
  g.strokeStyle = rgba(SLIME, 0.6);
  roundRect(g, x, y, w, h, 14);
  g.stroke();
  g.fillStyle = "rgba(255,255,255,0.1)";
  g.fillRect(x + 14, y + 2, w - 28, 1);
}

/** Dark lab, a slime-green glow, bubbles rising (and dodging the cursor); with a layout the dish, wells and beaker. */
export function drawGooeyBackdrop(g: Ctx, t: number, l?: Layout, flare = 0, fx: TitleFx | null = null): void {
  const sr = screenRect();
  const sky = g.createLinearGradient(0, 0, 0, sr.h);
  sky.addColorStop(0, BG);
  sky.addColorStop(1, LAB);
  fillScreen(g, sky);
  const glow = g.createRadialGradient(sr.w / 2, sr.h * 0.9, 0, sr.w / 2, sr.h * 0.9, sr.w * 0.6);
  glow.addColorStop(0, rgba(SLIME, 0.16 + flare * 0.3));
  glow.addColorStop(1, rgba(SLIME, 0));
  g.fillStyle = glow;
  g.fillRect(0, 0, sr.w, sr.h);
  // bubbles rising through the dark
  const pushers: Array<[number, number, number]> = [];
  if (fx?.pointer) pushers.push([fx.pointer.x, fx.pointer.y, 80]);
  for (const tap of fx?.taps ?? []) {
    const age = t - tap.t;
    if (age < 800) pushers.push([tap.x, tap.y, 50 + (age / 800) * 180]);
  }
  const rnd = seeded(19);
  for (let i = 0; i < 36; i++) {
    const bx = rnd() * sr.w;
    const speed = 12 + rnd() * 26;
    const size = 2 + rnd() * 6;
    const ph = rnd();
    const sway = rnd() * 16;
    let y = sr.h + 10 - ((ph * sr.h + (t / 1000) * speed) % (sr.h + 20));
    let x = bx + Math.sin(t / 1300 + ph * 9) * sway;
    for (const [px, py, reach] of pushers) {
      const dx = x - px;
      const dy = y - py;
      const d = Math.hypot(dx, dy);
      if (d < reach && d > 0.01) {
        const push = ((reach - d) / reach) * 40;
        x += (dx / d) * push;
        y += (dy / d) * push;
      }
    }
    g.strokeStyle = `rgba(200,255,150,${0.25 + flare * 0.4})`;
    g.lineWidth = 1.2;
    g.beginPath();
    g.arc(x, y, size, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = "rgba(255,255,255,0.35)";
    g.beginPath();
    g.arc(x - size * 0.35, y - size * 0.35, size * 0.25, 0, Math.PI * 2);
    g.fill();
  }
  // goo sliding down from the top edge
  g.fillStyle = rgba(SLIME, 0.9);
  g.fillRect(0, 0, sr.w, 6);
  const dr = seeded(31);
  for (let k = 0; k < 14; k++) {
    const dx = dr() * sr.w;
    const dw = 8 + dr() * 14;
    const base = 12 + dr() * 34;
    const dl = base + Math.sin(t / 2600 + k) * 6;
    roundRect(g, dx - dw / 2, 0, dw, dl, dw / 2);
    g.fill();
  }
  if (!l) return;
  const n = l.cellNum;
  const gridBottom = cellY(l, n) - l.cellSep;
  g.save();
  g.shadowColor = "rgba(0,0,0,0.6)";
  g.shadowBlur = 24;
  g.shadowOffsetY = 8;
  roundRect(g, l.boardX - 10, l.boardY - 10, l.boardW + 20, gridBottom - l.boardY + 13, 18);
  g.fillStyle = "rgba(30,22,58,0.94)";
  g.fill();
  g.restore();
  g.lineWidth = 2;
  g.strokeStyle = rgba(SLIME, 0.35);
  roundRect(g, l.boardX - 10, l.boardY - 10, l.boardW + 20, gridBottom - l.boardY + 13, 18);
  g.stroke();
  const pad = l.cellW * 0.04;
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) drawGooeyWell(g, cellX(l, x) + pad, cellY(l, y) + pad, l.cellW - pad * 2, l.cellH - pad * 2);
  }
  const ry = replenishY(l);
  drawGooeyTray(g, l.boardX - 8, ry - 8, l.boardW + 16, l.cellH + 16);
}

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------

const slides: SlideStyle = {
  background(g, w, h) {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, BG);
    sky.addColorStop(1, LAB);
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    g.fillStyle = rgba(LAB, 0.95);
    g.fillRect(0, h * 0.78, w, h * 0.22);
    g.fillStyle = SLIME;
    g.fillRect(0, h * 0.78, w, 3);
  },
  font: FONT,
  display: DISPLAY,
  text: TEXT,
  muted: MUTED,
  bgColor: BG,
  dotIdle: "rgba(255,255,255,0.25)",
  card: CARD,
  cardEdge: rgba(SLIME, 0.55),
  cardShadow: "rgba(0,0,0,0.5)",
  gridLine: "rgba(255,255,255,0.05)",
  well: "rgba(0,0,0,0.35)",
  wellEdge: rgba(SLIME, 0.22),
  track: "rgba(255,255,255,0.14)",
  colors: GOOEY_COLORS,
  inkOn: () => "#FFFFFF",
  tile: (g, x, y, w, h, base, opts) => slime(g, x, y, w, h, base, { radius: opts?.radius, plain: true, seed: 2 }),
  glyphs,
  button: blobButton,
};

const SPEC: SkinSpec = {
  colors: GOOEY_COLORS,
  neutral: "#6C6390",
  bg: BG,
  text: TEXT,
  muted: MUTED,
  font: FONT,
  display: DISPLAY,
  tile: slime,
  glyphs,
  button: blobButton,
  panel,
  logo,
  menuFrame,
  worldText: "#FFFFFF",
  worldTextShadow: "rgba(0,0,0,0.5)",
  shadow: null,
  glow: true,
  selector: "glow",
  selectorNeutral: TEXT,
  progress: [SLIME, GOOEY_COLORS[PURPLE]],
  pop(g, t, w, h) {
    g.globalAlpha = 1 - t;
    g.fillStyle = SLIME;
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      const d = w * (0.1 + t * 0.38);
      g.beginPath();
      g.arc(w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d, 2 + 3 * (1 - t), 0, Math.PI * 2);
      g.fill();
    }
  },
  mute: GOOEY_COLORS[RED],
  well: drawGooeyWell,
  slides,
};

export function buildGooeySprites(classic: SpriteMap): SpriteMap {
  return buildSkin(classic, SPEC);
}

