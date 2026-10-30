import { BLUE, RED, YELLOW, type Color } from "../core/color";
import type { Layout } from "../core/layout";
import { cellX, cellY, replenishY } from "../core/layout";
import type { SpriteMap } from "./assets";
import type { TitleFx } from "./backdrops";
import { canvas, chipPath, rgba, roundRect, shade, type Ctx } from "./modernSkin";
import type { SlideStyle } from "./modernSlides";
import { buildSkin, makeGlyphs, seeded, type ButtonFn, type SkinSpec, type TileFn } from "./skinKit";
import { fillScreen, screenRect } from "./view";

/**
 * "Vintage": letterpress tiles on aged paper. Muted inks printed slightly
 * out of register, paper grain, a halftone backdrop with a coffee ring,
 * badge buttons with double rules, a serif wordmark with ornaments, a pasted
 * paper sheet under the grid and a wooden type case for the replenish line.
 */

export const FONT = 'Georgia, "Times New Roman", Times, serif';
export const DISPLAY = 'Georgia, "Times New Roman", Times, serif';

export const PAPER = "#E8DCC2";
export const PAPER_LIGHT = "#F3EAD6";
export const CARD = "#F3EAD6";
export const INK = "#2B2622";
export const MUTED = "#7A6E5E";
export const RULE = "#5A4E42";
export const ACCENT = "#B5412F";
export const WOOD = "#6B4A2E";
export const WOOD_DARK = "#4A3220";

export const VINTAGE_COLORS: Record<Color, string> = {
  1: "#B5412F",
  2: "#2F4A6B",
  3: "#6B3E6B",
  4: "#C9A227",
  5: "#C96A2B",
  6: "#5E7A3A",
  7: "#2B2622",
};

let grainPattern: CanvasPattern | null = null;
let halftonePattern: CanvasPattern | null = null;

/** Fine paper grain, cached as a repeating pattern. */
function grain(g: Ctx): CanvasPattern | null {
  if (grainPattern) return grainPattern;
  const rnd = seeded(77);
  const c = canvas(96, 96, (gg, w, h) => {
    for (let i = 0; i < 900; i++) {
      const v = rnd();
      gg.fillStyle = v < 0.5 ? "rgba(60,40,20,0.08)" : "rgba(255,255,255,0.12)";
      gg.fillRect(Math.floor(rnd() * w), Math.floor(rnd() * h), 1, 1);
    }
  });
  grainPattern = g.createPattern(c, "repeat");
  return grainPattern;
}

/** Halftone dots, cached. */
function halftone(g: Ctx): CanvasPattern | null {
  if (halftonePattern) return halftonePattern;
  const c = canvas(12, 12, (gg) => {
    gg.fillStyle = "rgba(43,38,34,0.07)";
    gg.beginPath();
    gg.arc(3, 3, 1.4, 0, Math.PI * 2);
    gg.arc(9, 9, 1.4, 0, Math.PI * 2);
    gg.fill();
  });
  halftonePattern = g.createPattern(c, "repeat");
  return halftonePattern;
}

// ---------------------------------------------------------------------------
// Printed tile, glyphs, badge button
// ---------------------------------------------------------------------------

/** A printed tile: flat ink with a misregistered second pass, paper grain, worn corners and a thin rule. */
const printed: TileFn = (g, x, y, w, h, base, opts = {}) => {
  const m = Math.min(w, h);
  const r = opts.radius ?? m * 0.1;
  const fill = opts.lift ? shade(base, opts.lift) : base;
  const seed = (opts.seed ?? 1) + 11;
  // misregistered pass in a shifted tint, peeking out at the top-left
  roundRect(g, x - m * 0.02, y - m * 0.02, w, h, r);
  g.fillStyle = rgba(shade(fill, 0.25), 0.55);
  g.fill();
  roundRect(g, x, y, w, h, r);
  g.fillStyle = fill;
  g.fill();
  g.save();
  g.clip();
  const gr = grain(g);
  if (gr) {
    g.globalAlpha = 0.9;
    g.fillStyle = gr;
    g.fillRect(x, y, w, h);
    g.globalAlpha = 1;
  }
  // worn ink: lighter speckles along the edges
  const rnd = seeded(seed);
  g.fillStyle = rgba(PAPER, 0.35);
  for (let k = 0; k < 10; k++) {
    const ex = rnd() < 0.5 ? x + rnd() * m * 0.12 : x + w - rnd() * m * 0.12;
    const ey = y + rnd() * h;
    g.fillRect(ex, ey, 1 + rnd() * 2, 1 + rnd());
  }
  // soft lower shade
  const sh = g.createLinearGradient(x, y + h * 0.7, x, y + h);
  sh.addColorStop(0, "rgba(0,0,0,0)");
  sh.addColorStop(1, "rgba(0,0,0,0.12)");
  g.fillStyle = sh;
  g.fillRect(x, y + h * 0.7, w, h * 0.3);
  g.restore();
  g.lineWidth = Math.max(1, m * 0.014);
  g.strokeStyle = rgba(INK, 0.7);
  roundRect(g, x + 0.5, y + 0.5, w - 1, h - 1, r);
  g.stroke();
  // inner rule
  g.lineWidth = 1;
  g.strokeStyle = rgba(PAPER, 0.35);
  roundRect(g, x + m * 0.06, y + m * 0.06, w - m * 0.12, h - m * 0.12, r * 0.6);
  g.stroke();
};

const glyphs = makeGlyphs({ stroke: PAPER_LIGHT, fill: "rgba(243,234,214,0.35)", shadow: "rgba(0,0,0,0.3)", width: 0.038 });

/** A printed badge: paper disc with a double ink rule and an ink icon; pressed inverts the rim. */
const badgeButton: ButtonFn = (g, w, h, pressed, icon) => {
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * 0.4;
  g.save();
  g.shadowColor = "rgba(43,38,34,0.3)";
  g.shadowBlur = r * 0.25;
  g.shadowOffsetY = r * 0.1;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fillStyle = pressed ? "#E2D4B4" : PAPER_LIGHT;
  g.fill();
  g.restore();
  const gr = grain(g);
  if (gr) {
    g.save();
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = gr;
    g.fillRect(cx - r, cy - r, r * 2, r * 2);
    g.restore();
  }
  g.strokeStyle = INK;
  g.lineWidth = r * 0.06;
  g.beginPath();
  g.arc(cx, cy, r * 0.94, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = r * 0.025;
  g.beginPath();
  g.arc(cx, cy, r * 0.82, 0, Math.PI * 2);
  g.stroke();
  g.save();
  g.strokeStyle = INK;
  g.fillStyle = INK;
  g.lineWidth = r * 0.12;
  g.lineCap = "round";
  g.lineJoin = "round";
  icon(g, cx, cy, r);
  g.restore();
};

function panel(g: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  g.save();
  g.shadowColor = "rgba(43,38,34,0.25)";
  g.shadowBlur = r;
  g.shadowOffsetY = r * 0.3;
  roundRect(g, x, y, w, h, r * 0.4);
  g.fillStyle = CARD;
  g.fill();
  g.restore();
  const gr = grain(g);
  if (gr) {
    g.save();
    roundRect(g, x, y, w, h, r * 0.4);
    g.clip();
    g.fillStyle = gr;
    g.fillRect(x, y, w, h);
    g.restore();
  }
  g.strokeStyle = INK;
  g.lineWidth = 2;
  roundRect(g, x + 6, y + 6, w - 12, h - 12, r * 0.3);
  g.stroke();
  g.lineWidth = 1;
  roundRect(g, x + 11, y + 11, w - 22, h - 22, r * 0.25);
  g.stroke();
}

/** Small typographic ornament: a diamond flanked by rules. */
function ornament(g: Ctx, cx: number, cy: number, w: number, color: string): void {
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(cx - w / 2, cy);
  g.lineTo(cx - 10, cy);
  g.moveTo(cx + 10, cy);
  g.lineTo(cx + w / 2, cy);
  g.stroke();
  g.beginPath();
  g.moveTo(cx, cy - 5);
  g.lineTo(cx + 5, cy);
  g.lineTo(cx, cy + 5);
  g.lineTo(cx - 5, cy);
  g.closePath();
  g.fill();
}

/** "HueBricks" set in serif, ink over a red misregistered pass, with ornaments above and below. */
function logo(g: Ctx, i: number, w: number, h: number): void {
  const size = h * 0.36;
  g.font = `700 ${size}px ${DISPLAY}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const tw = g.measureText("HueBricks").width;
  const y = h / 2 - 4;
  g.fillStyle = rgba(ACCENT, i === 1 ? 0.9 : 0.75);
  g.fillText("HueBricks", w / 2 + size * 0.04, y + size * 0.035);
  g.fillStyle = INK;
  g.fillText("HueBricks", w / 2, y);
  // ink wear
  const gr = grain(g);
  if (gr) {
    g.save();
    g.globalCompositeOperation = "source-atop";
    g.globalAlpha = 0.5;
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    g.restore();
  }
  ornament(g, w / 2, y - size * 0.62, tw * 0.5, RULE);
  ornament(g, w / 2, y + size * 0.6, tw * 0.5, RULE);
  g.font = `400 ${size * 0.17}px ${DISPLAY}`;
  g.fillStyle = MUTED;
  g.fillText("E S T .   2 0 1 4", w / 2, y + size * 0.84);
  const mini = size * 0.2;
  [VINTAGE_COLORS[RED], VINTAGE_COLORS[BLUE], VINTAGE_COLORS[YELLOW]].forEach((c, k) => {
    printed(g, w / 2 - mini * 1.9 + k * mini * 1.3, y + size * 1.02, mini, mini, c, { plain: true, seed: k });
  });
}

/** Lighter paper band with double ink rules along the bottom of the title screen. */
function menuFrame(g: Ctx, w: number, h: number): void {
  g.fillStyle = PAPER_LIGHT;
  g.fillRect(0, 0, w, h);
  const gr = grain(g);
  if (gr) {
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  }
  g.fillStyle = INK;
  g.fillRect(0, 0, w, 3);
  g.fillRect(0, 6, w, 1);
}

// ---------------------------------------------------------------------------
// Backdrop and furniture
// ---------------------------------------------------------------------------

export function drawVintageWell(g: Ctx, x: number, y: number, w: number, h: number): void {
  const r = Math.min(w, h) * 0.1;
  roundRect(g, x, y, w, h, r);
  g.fillStyle = "rgba(43,38,34,0.06)";
  g.fill();
  g.setLineDash([3, 3]);
  g.lineWidth = 1;
  g.strokeStyle = rgba(INK, 0.35);
  roundRect(g, x + 0.5, y + 0.5, w - 1, h - 1, r);
  g.stroke();
  g.setLineDash([]);
}

/** The type case: dark wood with a brass rule. */
export function drawVintageTray(g: Ctx, x: number, y: number, w: number, h: number): void {
  g.save();
  g.shadowColor = "rgba(43,38,34,0.35)";
  g.shadowBlur = 12;
  g.shadowOffsetY = 4;
  roundRect(g, x, y, w, h, 6);
  const grad = g.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, WOOD);
  grad.addColorStop(1, WOOD_DARK);
  g.fillStyle = grad;
  g.fill();
  g.restore();
  g.strokeStyle = "rgba(0,0,0,0.25)";
  g.lineWidth = 1;
  for (let k = 0; k < 5; k++) {
    const gy = y + 4 + ((h - 8) * (k + 0.5)) / 5;
    g.beginPath();
    g.moveTo(x + 6, gy);
    for (let gx = x + 6; gx <= x + w - 6; gx += 24) g.lineTo(gx, gy + Math.sin(gx / 40 + k) * 1.2);
    g.stroke();
  }
  g.lineWidth = 1.5;
  g.strokeStyle = "#C9A227";
  roundRect(g, x + 3, y + 3, w - 6, h - 6, 4);
  g.stroke();
}

/** Aged paper with halftone and grain, a coffee ring and ink specks; with a layout a pasted sheet, printed cells and the type case. */
export function drawVintageBackdrop(g: Ctx, t: number, l?: Layout, flare = 0, fx: TitleFx | null = null): void {
  const sr = screenRect();
  fillScreen(g, PAPER);
  const ht = halftone(g);
  if (ht) {
    g.fillStyle = ht;
    g.fillRect(0, 0, sr.w, sr.h);
  }
  const gr = grain(g);
  if (gr) {
    g.fillStyle = gr;
    g.fillRect(0, 0, sr.w, sr.h);
  }
  // sun-faded vignette, warmer after a level clear
  const vig = g.createRadialGradient(sr.w / 2, sr.h / 2, Math.min(sr.w, sr.h) * 0.3, sr.w / 2, sr.h / 2, Math.max(sr.w, sr.h) * 0.75);
  vig.addColorStop(0, `rgba(255,245,220,${0.1 + flare * 0.4})`);
  vig.addColorStop(1, "rgba(120,90,50,0.22)");
  g.fillStyle = vig;
  g.fillRect(0, 0, sr.w, sr.h);
  // coffee ring
  g.strokeStyle = "rgba(120,80,40,0.16)";
  g.lineWidth = 7;
  g.beginPath();
  g.arc(sr.w * 0.14, sr.h * 0.78, 48, 0.3, Math.PI * 1.75);
  g.stroke();
  g.lineWidth = 2;
  g.beginPath();
  g.arc(sr.w * 0.14, sr.h * 0.78, 54, Math.PI * 0.9, Math.PI * 2.2);
  g.stroke();
  // ink specks, and taps splash a few more that soak in
  const rnd = seeded(45);
  g.fillStyle = rgba(INK, 0.35);
  for (let i = 0; i < 40; i++) {
    g.beginPath();
    g.arc(rnd() * sr.w, rnd() * sr.h, 0.5 + rnd() * 1.2, 0, Math.PI * 2);
    g.fill();
  }
  for (const tap of fx?.taps ?? []) {
    const age = t - tap.t;
    if (age > 2400) continue;
    const a = (1 - age / 2400) * 0.5;
    const r2 = seeded(Math.floor(tap.x + tap.y * 7));
    g.fillStyle = rgba(ACCENT, a);
    for (let k = 0; k < 9; k++) {
      const ang = r2() * Math.PI * 2;
      const d = 6 + r2() * 30 * Math.min(1, age / 250);
      g.beginPath();
      g.arc(tap.x + Math.cos(ang) * d, tap.y + Math.sin(ang) * d, 1 + r2() * 3, 0, Math.PI * 2);
      g.fill();
    }
  }
  if (!l) return;
  const n = l.cellNum;
  const gridBottom = cellY(l, n) - l.cellSep;
  // pasted sheet with a deckled edge
  g.save();
  g.shadowColor = "rgba(43,38,34,0.3)";
  g.shadowBlur = 14;
  g.shadowOffsetY = 4;
  chipPath(g, l.boardX - 12, l.boardY - 12, l.boardW + 24, gridBottom - l.boardY + 17, 6, 2.5, 4);
  g.fillStyle = PAPER_LIGHT;
  g.fill();
  g.restore();
  if (gr) {
    g.save();
    chipPath(g, l.boardX - 12, l.boardY - 12, l.boardW + 24, gridBottom - l.boardY + 17, 6, 2.5, 4);
    g.clip();
    g.fillStyle = gr;
    g.fillRect(l.boardX - 12, l.boardY - 12, l.boardW + 24, gridBottom - l.boardY + 17);
    g.restore();
  }
  const pad = l.cellW * 0.04;
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) drawVintageWell(g, cellX(l, x) + pad, cellY(l, y) + pad, l.cellW - pad * 2, l.cellH - pad * 2);
  }
  const ry = replenishY(l);
  drawVintageTray(g, l.boardX - 8, ry - 8, l.boardW + 16, l.cellH + 16);
}

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------

const slides: SlideStyle = {
  background(g, w, h) {
    g.fillStyle = PAPER;
    g.fillRect(0, 0, w, h);
    const ht = halftone(g);
    if (ht) {
      g.fillStyle = ht;
      g.fillRect(0, 0, w, h);
    }
    g.fillStyle = INK;
    g.fillRect(0, h * 0.78, w, h * 0.22);
    g.fillStyle = PAPER;
    g.fillRect(0, h * 0.78 + 6, w, 2);
  },
  font: FONT,
  display: DISPLAY,
  text: INK,
  muted: MUTED,
  bgColor: PAPER,
  dotIdle: rgba(INK, 0.25),
  card: CARD,
  cardEdge: rgba(INK, 0.6),
  cardShadow: "rgba(43,38,34,0.25)",
  gridLine: rgba(INK, 0.2),
  well: "rgba(43,38,34,0.06)",
  wellEdge: rgba(INK, 0.35),
  track: rgba(INK, 0.15),
  colors: VINTAGE_COLORS,
  inkOn: () => PAPER_LIGHT,
  tile: (g, x, y, w, h, base, opts) => printed(g, x, y, w, h, base, { radius: opts?.radius, plain: true, seed: 2 }),
  glyphs,
  button: badgeButton,
};

const SPEC: SkinSpec = {
  colors: VINTAGE_COLORS,
  neutral: "#9C8E78",
  bg: PAPER,
  text: INK,
  muted: MUTED,
  font: FONT,
  display: DISPLAY,
  tile: printed,
  glyphs,
  button: badgeButton,
  panel,
  logo,
  menuFrame,
  worldText: PAPER_LIGHT,
  worldTextShadow: "rgba(0,0,0,0.35)",
  shadow: "rgba(43,38,34,0.5)",
  glow: false,
  selector: "ink",
  selectorNeutral: INK,
  progress: [ACCENT, INK],
  pop(g, t, w, h) {
    g.globalAlpha = 1 - t;
    g.strokeStyle = INK;
    g.lineWidth = 2 * (1 - t) + 0.5;
    g.beginPath();
    g.arc(w / 2, h / 2, w * (0.12 + t * 0.35), 0, Math.PI * 2);
    g.stroke();
  },
  mute: ACCENT,
  well: drawVintageWell,
  slides,
};

export function buildVintageSprites(classic: SpriteMap): SpriteMap {
  return buildSkin(classic, SPEC);
}
