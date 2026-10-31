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
 * "Neon": glass tubes on a synth horizon. Every brick is a bent neon tube
 * glowing around a dark glass pane; the backdrop is a perspective grid
 * sliding toward a striped sun under stars, with faint scanlines over
 * everything; buttons are neon rings; the tray is a row of cabinet coin
 * slots. Pops flare white and throw tube shards and electric sparks, and a
 * level clear blows the sun's stripes outward.
 */

export const FONT = 'Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
export const DISPLAY = 'Audiowide, "Orbitron", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const NIGHT = "#0B0618";
export const NIGHT_HIGH = "#140B2A";
export const GLASS = "#160F2C";
export const CYAN = "#3EF2FF";
export const MAGENTA = "#FF3EDC";
export const SUN_TOP = "#FF8A3D";
export const SUN_BOTTOM = "#FF3E9E";
export const TEXT = "#F2EEFF";
export const MUTED = "#9F92C7";
export const CARD = "#150D2C";

export const NEON_COLORS: Record<Color, string> = {
  1: "#FF3E6B",
  2: "#3E8BFF",
  3: "#B06BFF",
  4: "#FFF23E",
  5: "#FF8A3D",
  6: "#3EFFB0",
  7: "#E6DFFF",
};

// ---------------------------------------------------------------------------
// Tube tile, glyphs, ring button
// ---------------------------------------------------------------------------

/** A neon tube bent into a rounded square around a dark glass pane. */
const tube: TileFn = (g, x, y, w, h, base, opts = {}) => {
  const m = Math.min(w, h);
  const fill = opts.lift ? shade(base, opts.lift) : base;
  const r = opts.radius ?? m * 0.22;
  const inset = m * 0.1;
  roundRect(g, x + inset, y + inset, w - inset * 2, h - inset * 2, r);
  g.fillStyle = GLASS;
  g.fill();
  g.save();
  g.shadowColor = fill;
  g.shadowBlur = m * (opts.plain ? 0.12 : 0.2);
  g.lineWidth = Math.max(2, m * 0.07);
  g.strokeStyle = fill;
  roundRect(g, x + inset, y + inset, w - inset * 2, h - inset * 2, r);
  g.stroke();
  g.stroke();
  g.restore();
  // the hot core of the tube
  g.lineWidth = Math.max(1, m * 0.025);
  g.strokeStyle = "rgba(255,255,255,0.85)";
  roundRect(g, x + inset, y + inset, w - inset * 2, h - inset * 2, r);
  g.stroke();
  if (!opts.plain) {
    g.save();
    roundRect(g, x + inset, y + inset, w - inset * 2, h - inset * 2, r);
    g.clip();
    const inner = g.createRadialGradient(x + w / 2, y + h / 2, m * 0.1, x + w / 2, y + h / 2, m * 0.6);
    inner.addColorStop(0, rgba(fill, 0.22));
    inner.addColorStop(1, rgba(fill, 0));
    g.fillStyle = inner;
    g.fillRect(x, y, w, h);
    g.restore();
  }
};

const glyphs = makeGlyphs({ stroke: "#FFFFFF", fill: "rgba(255,255,255,0.35)", glow: "#FFFFFF", width: 0.04 });

/** A glowing cyan ring with the icon lit inside. */
const ringButton: ButtonFn = (g, w, h, pressed, icon) => {
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * 0.36;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fillStyle = pressed ? rgba(CYAN, 0.2) : GLASS;
  g.fill();
  g.save();
  g.shadowColor = CYAN;
  g.shadowBlur = r * (pressed ? 0.6 : 0.35);
  g.lineWidth = r * 0.1;
  g.strokeStyle = CYAN;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.stroke();
  g.stroke();
  g.restore();
  g.save();
  g.strokeStyle = TEXT;
  g.fillStyle = TEXT;
  g.lineWidth = r * 0.12;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.shadowColor = CYAN;
  g.shadowBlur = r * 0.3;
  icon(g, cx, cy, r * 0.5);
  g.restore();
};

function panel(g: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  roundRect(g, x, y, w, h, r);
  g.fillStyle = rgba(CARD, 0.95);
  g.fill();
  g.save();
  g.shadowColor = MAGENTA;
  g.shadowBlur = 14;
  g.lineWidth = 2;
  g.strokeStyle = MAGENTA;
  roundRect(g, x, y, w, h, r);
  g.stroke();
  g.restore();
}

/** The striped sun: a disc with dark bands across its lower half. `blow` pushes the bands outward. */
export function drawSun(g: Ctx, cx: number, cy: number, r: number, blow = 0): void {
  g.save();
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.clip();
  const grad = g.createLinearGradient(0, cy - r, 0, cy + r);
  grad.addColorStop(0, SUN_TOP);
  grad.addColorStop(1, SUN_BOTTOM);
  g.fillStyle = grad;
  g.fillRect(cx - r, cy - r, r * 2, r * 2);
  g.fillStyle = NIGHT;
  for (let k = 0; k < 6; k++) {
    const u = 0.35 + k * 0.11;
    const yy = cy - r + r * 2 * u + blow * r * (k - 2.5) * 0.12;
    g.fillRect(cx - r, yy, r * 2, r * 0.035 * (k + 1) * (1 + blow * 0.5));
  }
  g.restore();
}

/** "HueBricks" in the display face, cyan over magenta with a glow, under a small sun. */
function logo(g: Ctx, i: number, w: number, h: number): void {
  const size = h * 0.3;
  drawSun(g, w / 2, h * 0.3, h * 0.26, i === 1 ? 0.6 : 0);
  g.font = `400 ${size}px ${DISPLAY}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const y = h * 0.66;
  g.save();
  g.shadowColor = MAGENTA;
  g.shadowBlur = i === 1 ? 30 : 18;
  g.fillStyle = MAGENTA;
  g.fillText("HueBricks", w / 2 + 3, y + 3);
  g.restore();
  g.save();
  g.shadowColor = CYAN;
  g.shadowBlur = i === 1 ? 30 : 18;
  g.fillStyle = TEXT;
  g.fillText("HueBricks", w / 2, y);
  g.fillText("HueBricks", w / 2, y);
  g.restore();
}

function menuFrame(g: Ctx, w: number, h: number): void {
  g.fillStyle = NIGHT_HIGH;
  g.fillRect(0, 8, w, h - 8);
  drawGrid(g, 0, 10, w, h - 10, 0, 0.5);
  g.save();
  g.shadowColor = CYAN;
  g.shadowBlur = 10;
  g.strokeStyle = CYAN;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, 10);
  g.lineTo(w, 10);
  g.stroke();
  g.restore();
}

/** The perspective grid: lines converging on a horizon at the top of the box, rows sliding toward the viewer. */
export function drawGrid(g: Ctx, x: number, y: number, w: number, h: number, t: number, alpha: number): void {
  const vx = x + w / 2;
  g.strokeStyle = rgba(MAGENTA, alpha);
  g.lineWidth = 1;
  for (let k = -8; k <= 8; k++) {
    g.beginPath();
    g.moveTo(vx, y);
    g.lineTo(vx + k * w * 0.18, y + h);
    g.stroke();
  }
  const phase = (t / 1800) % 1;
  for (let k = 0; k < 9; k++) {
    const u = ((k + phase) / 9) ** 2.2;
    const yy = y + u * h;
    g.globalAlpha = alpha * (0.3 + 0.7 * u);
    g.beginPath();
    g.moveTo(x, yy);
    g.lineTo(x + w, yy);
    g.stroke();
  }
  g.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// Backdrop and furniture
// ---------------------------------------------------------------------------

/** An unlit tube outline. */
export function drawNeonWell(g: Ctx, x: number, y: number, w: number, h: number): void {
  const r = Math.min(w, h) * 0.22;
  const inset = Math.min(w, h) * 0.1;
  roundRect(g, x + inset, y + inset, w - inset * 2, h - inset * 2, r);
  g.fillStyle = rgba(GLASS, 0.7);
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = "rgba(242,238,255,0.1)";
  roundRect(g, x + inset, y + inset, w - inset * 2, h - inset * 2, r);
  g.stroke();
}

/** A cabinet panel with coin slots: a dark strip with a cyan edge and slot marks. */
export function drawNeonTray(g: Ctx, x: number, y: number, w: number, h: number): void {
  roundRect(g, x, y, w, h, 10);
  g.fillStyle = rgba(GLASS, 0.9);
  g.fill();
  g.save();
  g.shadowColor = CYAN;
  g.shadowBlur = 8;
  g.lineWidth = 1.5;
  g.strokeStyle = rgba(CYAN, 0.7);
  roundRect(g, x + 0.75, y + 0.75, w - 1.5, h - 1.5, 10);
  g.stroke();
  g.restore();
  g.fillStyle = rgba(CYAN, 0.35);
  for (let px = x + 14; px < x + w - 10; px += 22) g.fillRect(px, y + 4, 10, 2);
}

/** A coin slot lighting in the incoming colour: the tube strikes with a stutter, then its glow swells with the timer. */
export function drawNeonFill(g: Ctx, x: number, y: number, w: number, h: number, level: number, colour: string, t: number): void {
  if (level <= 0) return;
  const r = Math.min(w, h) * 0.22;
  const inset = Math.min(w, h) * 0.1;
  const strike = level < 0.12 ? (Math.sin(t / 19) > -0.2 ? 1 : 0.2) : 1;
  const fh = (h - inset * 2) * level;
  g.save();
  roundRect(g, x + inset, y + inset, w - inset * 2, h - inset * 2, r);
  g.clip();
  g.fillStyle = rgba(colour, 0.3 * strike * (0.4 + 0.6 * level));
  g.fillRect(x, y + h - inset - fh, w, fh);
  g.restore();
  g.save();
  g.shadowColor = colour;
  g.shadowBlur = 6 + 12 * level;
  g.lineWidth = 2;
  g.strokeStyle = rgba(colour, (0.3 + 0.7 * level) * strike);
  roundRect(g, x + inset, y + inset, w - inset * 2, h - inset * 2, r);
  g.stroke();
  g.restore();
}

/** Night sky with stars, the striped sun on the horizon, the sliding grid below, scanlines over everything. */
export function drawNeonBackdrop(g: Ctx, t: number, l?: Layout, flare = 0, fx: TitleFx | null = null): void {
  const sr = screenRect();
  const sky = g.createLinearGradient(0, 0, 0, sr.h);
  sky.addColorStop(0, NIGHT);
  sky.addColorStop(0.6, NIGHT_HIGH);
  sky.addColorStop(1, NIGHT);
  fillScreen(g, sky);
  const rnd = seeded(31);
  for (let i = 0; i < 70; i++) {
    const x = rnd() * sr.w;
    const y = rnd() * sr.h * 0.55;
    const tw = 0.3 + 0.7 * Math.max(0, Math.sin(t / 700 + rnd() * 6));
    g.fillStyle = `rgba(242,238,255,${0.5 * tw})`;
    g.fillRect(x, y, 1.5, 1.5);
  }
  const horizon = sr.h * 0.62;
  const pointer = fx?.pointer ?? null;
  const sunX = sr.w * 0.5 + (pointer ? (pointer.x - sr.w / 2) * 0.05 : 0);
  drawSun(g, sunX, horizon - sr.h * 0.02, sr.h * 0.2, flare);
  g.save();
  g.shadowColor = MAGENTA;
  g.shadowBlur = 16;
  g.strokeStyle = rgba(MAGENTA, 0.9);
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, horizon);
  g.lineTo(sr.w, horizon);
  g.stroke();
  g.restore();
  drawGrid(g, 0, horizon, sr.w, sr.h - horizon, t * (1 + flare * 2), 0.45);
  // scanlines
  g.fillStyle = "rgba(0,0,0,0.12)";
  for (let y = 0; y < sr.h; y += 3) g.fillRect(0, y, sr.w, 1);
  // taps leave a brief electric arc
  for (const tap of fx?.taps ?? []) {
    const age = t - tap.t;
    if (age > 400) continue;
    const a = 1 - age / 400;
    g.save();
    g.shadowColor = CYAN;
    g.shadowBlur = 12;
    g.strokeStyle = rgba(CYAN, a);
    g.lineWidth = 2;
    const r2 = seeded(Math.floor(tap.t));
    g.beginPath();
    g.moveTo(tap.x, tap.y);
    let px = tap.x;
    let py = tap.y;
    for (let k = 0; k < 6; k++) {
      px += (r2() - 0.5) * 40;
      py += (r2() - 0.5) * 40;
      g.lineTo(px, py);
    }
    g.stroke();
    g.restore();
  }
  if (!l) return;
  const n = l.cellNum;
  const gridBottom = cellY(l, n) - l.cellSep;
  // opaque enough that the sun behind reads as a glow, not as stripes across the bricks
  roundRect(g, l.boardX - 12, l.boardY - 12, l.boardW + 24, gridBottom - l.boardY + 18, 12);
  g.fillStyle = rgba(NIGHT, 0.9);
  g.fill();
  g.save();
  g.shadowColor = CYAN;
  g.shadowBlur = 10;
  g.lineWidth = 1.5;
  g.strokeStyle = rgba(CYAN, 0.5);
  roundRect(g, l.boardX - 12, l.boardY - 12, l.boardW + 24, gridBottom - l.boardY + 18, 12);
  g.stroke();
  g.restore();
  const pad = l.cellW * 0.04;
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) drawNeonWell(g, cellX(l, x) + pad, cellY(l, y) + pad, l.cellW - pad * 2, l.cellH - pad * 2);
  }
  drawNeonTray(g, l.boardX - 8, replenishY(l) - 8, l.boardW + 16, l.cellH + 16);
}

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------

const slides: SlideStyle = {
  background(g, w, h) {
    g.fillStyle = NIGHT;
    g.fillRect(0, 0, w, h);
    drawGrid(g, 0, h * 0.7, w, h * 0.3, 0, 0.35);
    g.strokeStyle = MAGENTA;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, h * 0.7);
    g.lineTo(w, h * 0.7);
    g.stroke();
  },
  font: FONT,
  display: DISPLAY,
  text: TEXT,
  muted: MUTED,
  bgColor: NIGHT,
  dotIdle: "rgba(242,238,255,0.25)",
  card: CARD,
  cardEdge: rgba(MAGENTA, 0.7),
  cardShadow: "rgba(0,0,0,0.5)",
  gridLine: "rgba(242,238,255,0.06)",
  well: rgba(GLASS, 0.7),
  wellEdge: "rgba(242,238,255,0.1)",
  track: "rgba(242,238,255,0.14)",
  colors: NEON_COLORS,
  inkOn: () => "#FFFFFF",
  tile: (g, x, y, w, h, base, opts) => tube(g, x, y, w, h, base, { radius: opts?.radius, plain: true }),
  glyphs,
  button: ringButton,
};

const SPEC: SkinSpec = {
  colors: NEON_COLORS,
  neutral: "#4A4070",
  bg: NIGHT,
  text: TEXT,
  muted: MUTED,
  font: FONT,
  display: DISPLAY,
  tile: tube,
  glyphs,
  button: ringButton,
  panel,
  logo,
  menuFrame,
  worldText: TEXT,
  worldTextShadow: "rgba(0,0,0,0.6)",
  shadow: null,
  glow: true,
  selector: "glow",
  selectorNeutral: CYAN,
  progress: [CYAN, MAGENTA],
  pop(g, t, w, h) {
    // the tube flickers twice then dies: outline flashes at two moments, then shards
    const flick = t < 0.15 || (t > 0.3 && t < 0.4);
    g.globalAlpha = flick ? 1 : 1 - t;
    g.strokeStyle = "#FFFFFF";
    g.lineWidth = 2;
    const inset = w * 0.1 + t * w * 0.2;
    roundRect(g, inset, inset, w - inset * 2, h - inset * 2, w * 0.2);
    g.stroke();
  },
  mute: NEON_COLORS[RED],
  well: drawNeonWell,
  slides,
};

export function buildNeonSprites(classic: SpriteMap): SpriteMap {
  return buildSkin(classic, SPEC);
}
