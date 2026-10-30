import { BLUE, GREEN, RED, YELLOW, type Color } from "../core/color";
import type { Layout } from "../core/layout";
import { cellX, cellY, replenishY } from "../core/layout";
import type { SpriteMap } from "./assets";
import { rgba, roundRect, shade, type Ctx } from "./modernSkin";
import type { SlideStyle } from "./modernSlides";
import { buildSkin, makeGlyphs, seeded, type ButtonFn, type SkinSpec, type TileFn } from "./skinKit";
import { fillScreen, screenRect } from "./view";
import { drawSnow } from "./winterSkin";
import type { TitleFx } from "./backdrops";

/**
 * "Christmas": wrapped presents under a string of lights. Gift-box tiles
 * with a ribbon and bow, bauble buttons, a candy-cane wordmark with holly,
 * snow drifting past pines on a deep green night, a felt slab under the
 * grid and a red sleigh-tray whose slots fill as the next gift is wrapped.
 */

export const FONT = 'Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
export const DISPLAY = 'Fredoka, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const BG = "#0E2A1E";
export const NIGHT = "#071A12";
export const CARD = "#FFF7EC";
export const TEXT = "#FFF7EC";
export const INK = "#3A2418";
export const MUTED = "#A9C7B3";
export const HOLLY = "#2E9E4F";
export const BERRY = "#D7263D";
export const GOLD = "#F2D16B";
export const GOLD_DARK = "#C9A43A";

export const CHRISTMAS_COLORS: Record<Color, string> = {
  1: "#D7263D",
  2: "#2F6BD6",
  3: "#8A4FD1",
  4: "#F2C230",
  5: "#F08A2E",
  6: "#2E9E4F",
  7: "#2B2B2B",
};

// ---------------------------------------------------------------------------
// Gift tile, glyphs, bauble button
// ---------------------------------------------------------------------------

const gift: TileFn = (g, x, y, w, h, base, opts = {}) => {
  const m = Math.min(w, h);
  const r = opts.radius ?? m * 0.14;
  const fill = opts.lift ? shade(base, opts.lift) : base;
  const ribbon = base === CHRISTMAS_COLORS[4] ? "#FFFFFF" : GOLD;
  roundRect(g, x, y, w, h, r);
  const grad = g.createLinearGradient(x, y, x + w * 0.4, y + h);
  grad.addColorStop(0, shade(fill, 0.2));
  grad.addColorStop(0.5, fill);
  grad.addColorStop(1, shade(fill, -0.2));
  g.fillStyle = grad;
  g.fill();
  g.save();
  g.clip();
  // lid band
  g.fillStyle = "rgba(0,0,0,0.12)";
  g.fillRect(x, y + h * 0.3, w, m * 0.02);
  g.fillStyle = "rgba(255,255,255,0.1)";
  g.fillRect(x, y, w, h * 0.3);
  // ribbon
  const rw = m * 0.09;
  const rx = x + w * 0.3;
  const ry = y + h * 0.3;
  g.fillStyle = ribbon;
  g.fillRect(rx - rw / 2, y, rw, h);
  g.fillRect(x, ry - rw / 2, w, rw);
  g.fillStyle = "rgba(0,0,0,0.12)";
  g.fillRect(rx + rw / 2 - 1, y, 1, h);
  g.fillRect(x, ry + rw / 2 - 1, w, 1);
  // bow at the top
  if (!opts.plain) {
    const bx = rx;
    const by = ry;
    g.fillStyle = ribbon;
    for (const d of [-1, 1]) {
      g.beginPath();
      g.ellipse(bx + d * m * 0.09, by - m * 0.02, m * 0.09, m * 0.055, d * 0.5, 0, Math.PI * 2);
      g.fill();
    }
    g.beginPath();
    g.arc(bx, by, m * 0.035, 0, Math.PI * 2);
    g.fillStyle = shade(ribbon, -0.25);
    g.fill();
  }
  // gloss
  const hl = g.createLinearGradient(x, y, x + w, y + h);
  hl.addColorStop(0, "rgba(255,255,255,0.25)");
  hl.addColorStop(0.4, "rgba(255,255,255,0)");
  g.fillStyle = hl;
  g.fillRect(x, y, w, h);
  g.restore();
  g.lineWidth = Math.max(1, m * 0.016);
  g.strokeStyle = "rgba(0,0,0,0.35)";
  roundRect(g, x + 0.5, y + 0.5, w - 1, h - 1, r);
  g.stroke();
};

const glyphs = makeGlyphs({ stroke: "#FFFFFF", fill: "rgba(255,255,255,0.4)", shadow: "rgba(0,0,0,0.45)", width: 0.045 });

/** A red bauble with a gold cap; pressed brightens the highlight. */
const baubleButton: ButtonFn = (g, w, h, pressed, icon) => {
  const cx = w / 2;
  const cy = h / 2 + h * 0.04;
  const r = Math.min(w, h) * 0.37;
  // cap and loop
  g.strokeStyle = GOLD_DARK;
  g.lineWidth = r * 0.06;
  g.beginPath();
  g.arc(cx, cy - r * 1.12, r * 0.09, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = GOLD;
  roundRect(g, cx - r * 0.16, cy - r * 1.1, r * 0.32, r * 0.22, r * 0.04);
  g.fill();
  g.save();
  g.shadowColor = "rgba(0,0,0,0.4)";
  g.shadowBlur = r * 0.3;
  g.shadowOffsetY = r * 0.12;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  const grad = g.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r);
  grad.addColorStop(0, pressed ? "#FF8A99" : "#F26B7A");
  grad.addColorStop(0.6, BERRY);
  grad.addColorStop(1, "#8E1427");
  g.fillStyle = grad;
  g.fill();
  g.restore();
  // gold band
  g.strokeStyle = rgba(GOLD, 0.8);
  g.lineWidth = r * 0.05;
  g.beginPath();
  g.ellipse(cx, cy, r * 0.98, r * 0.35, 0, 0, Math.PI, false);
  g.stroke();
  g.save();
  g.strokeStyle = "#FFFFFF";
  g.fillStyle = "#FFFFFF";
  g.lineWidth = r * 0.13;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.shadowColor = "rgba(0,0,0,0.3)";
  g.shadowBlur = r * 0.1;
  icon(g, cx, cy, r);
  g.restore();
};

function panel(g: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  g.save();
  g.shadowColor = "rgba(0,0,0,0.45)";
  g.shadowBlur = r;
  roundRect(g, x, y, w, h, r);
  g.fillStyle = "rgba(10,36,26,0.97)";
  g.fill();
  g.restore();
  g.lineWidth = 2;
  g.strokeStyle = rgba(GOLD, 0.7);
  roundRect(g, x, y, w, h, r);
  g.stroke();
}

function holly(g: Ctx, cx: number, cy: number, s: number): void {
  g.fillStyle = HOLLY;
  for (const d of [-1, 1]) {
    g.beginPath();
    g.moveTo(cx, cy);
    g.quadraticCurveTo(cx + d * s * 0.5, cy - s * 0.6, cx + d * s * 1.1, cy - s * 0.3);
    g.quadraticCurveTo(cx + d * s * 0.9, cy, cx + d * s * 1.1, cy + s * 0.3);
    g.quadraticCurveTo(cx + d * s * 0.5, cy + s * 0.5, cx, cy);
    g.closePath();
    g.fill();
  }
  g.fillStyle = BERRY;
  for (const [ox, oy] of [
    [0, -0.12],
    [-0.16, 0.14],
    [0.16, 0.14],
  ]) {
    g.beginPath();
    g.arc(cx + ox * s, cy + oy * s, s * 0.14, 0, Math.PI * 2);
    g.fill();
  }
}

/** "HueBricks" in Fredoka with candy-cane stripes, a white outline and a sprig of holly. */
function logo(g: Ctx, i: number, w: number, h: number): void {
  const size = h * 0.4;
  g.font = `600 ${size}px ${DISPLAY}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const tw = g.measureText("HueBricks").width;
  const x0 = w / 2 - tw / 2;
  const y = h / 2 - 6;
  g.save();
  g.shadowColor = "rgba(0,0,0,0.45)";
  g.shadowBlur = i === 1 ? 6 : 14;
  g.shadowOffsetY = 5;
  g.lineJoin = "round";
  g.lineWidth = size * 0.14;
  g.strokeStyle = "#FFFFFF";
  g.strokeText("HueBricks", w / 2, y);
  g.restore();
  g.fillStyle = i === 1 ? "#E8415A" : BERRY;
  g.fillText("HueBricks", w / 2, y);
  // stripes, clipped to the letters
  g.save();
  g.globalCompositeOperation = "source-atop";
  g.fillStyle = "rgba(255,255,255,0.85)";
  const step = size * 0.22;
  for (let sx = x0 - size; sx < x0 + tw + size; sx += step) {
    g.beginPath();
    g.moveTo(sx, y + size * 0.6);
    g.lineTo(sx + size * 0.5, y - size * 0.6);
    g.lineTo(sx + size * 0.5 + step * 0.4, y - size * 0.6);
    g.lineTo(sx + step * 0.4, y + size * 0.6);
    g.closePath();
    g.fill();
  }
  g.restore();
  holly(g, x0 + tw * 0.08, y - size * 0.42, size * 0.18);
  const mini = size * 0.2;
  [CHRISTMAS_COLORS[RED], CHRISTMAS_COLORS[GREEN], CHRISTMAS_COLORS[BLUE]].forEach((c, k) => {
    gift(g, w / 2 - mini * 1.9 + k * mini * 1.3, y + size * 0.7, mini, mini, c, {});
  });
}

/** Green felt with gold trim along the bottom of the title screen. */
function menuFrame(g: Ctx, w: number, h: number): void {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#133B2A");
  grad.addColorStop(1, "#0A241A");
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  g.fillStyle = GOLD;
  g.fillRect(0, 0, w, 4);
  g.fillStyle = GOLD_DARK;
  g.fillRect(0, 4, w, 1);
  g.fillStyle = "rgba(255,255,255,0.05)";
  g.fillRect(0, 5, w, h * 0.3);
}

// ---------------------------------------------------------------------------
// Backdrop and furniture
// ---------------------------------------------------------------------------

export function drawChristmasWell(g: Ctx, x: number, y: number, w: number, h: number): void {
  const r = Math.min(w, h) * 0.14;
  roundRect(g, x, y, w, h, r);
  g.fillStyle = "rgba(0,0,0,0.3)";
  g.fill();
  g.lineWidth = 1;
  g.strokeStyle = rgba(GOLD, 0.25);
  roundRect(g, x + 0.5, y + 0.5, w - 1, h - 1, r);
  g.stroke();
}

/** The sleigh tray: red lacquer with gold runners. */
export function drawChristmasTray(g: Ctx, x: number, y: number, w: number, h: number): void {
  g.save();
  g.shadowColor = "rgba(0,0,0,0.5)";
  g.shadowBlur = 14;
  g.shadowOffsetY = 5;
  roundRect(g, x, y, w, h, 12);
  g.fillStyle = "#A8182C";
  g.fill();
  g.restore();
  roundRect(g, x + 3, y + 3, w - 6, h - 6, 9);
  g.fillStyle = "#7C1120";
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = GOLD;
  roundRect(g, x, y, w, h, 12);
  g.stroke();
}

/** Deep green night, a sagging string of glowing bulbs, pines and snow; with a layout the felt slab, wells and sleigh tray. */
export function drawChristmasBackdrop(g: Ctx, t: number, l?: Layout, flare = 0, fx: TitleFx | null = null): void {
  const sr = screenRect();
  const pointer = fx?.pointer ?? null;
  // a tap sends a wave of brightness running along the string of lights
  const waves = (fx?.taps ?? []).filter((tap) => t - tap.t < 1600);
  const sky = g.createLinearGradient(0, 0, 0, sr.h);
  sky.addColorStop(0, NIGHT);
  sky.addColorStop(1, BG);
  fillScreen(g, sky);
  // pines along the bottom
  g.fillStyle = "#06150E";
  const rnd = seeded(61);
  for (let i = 0; i < 14; i++) {
    const px = (i / 14) * sr.w + rnd() * 40;
    const ph = 40 + rnd() * 50;
    const py = sr.h + 6;
    for (let tier = 0; tier < 3; tier++) {
      const tw = ph * (0.45 - tier * 0.1);
      const ty = py - tier * ph * 0.3;
      g.beginPath();
      g.moveTo(px - tw, ty);
      g.lineTo(px, ty - ph * 0.55);
      g.lineTo(px + tw, ty);
      g.closePath();
      g.fill();
    }
  }
  // string of lights
  const bulbColors = [CHRISTMAS_COLORS[1], CHRISTMAS_COLORS[4], CHRISTMAS_COLORS[6], CHRISTMAS_COLORS[2], CHRISTMAS_COLORS[5]];
  const segs = Math.max(2, Math.round(sr.w / 260));
  for (let s = 0; s < segs; s++) {
    const xa = (sr.w * s) / segs;
    const xb = (sr.w * (s + 1)) / segs;
    const ya = 10;
    const sag = 34;
    g.strokeStyle = "rgba(0,0,0,0.6)";
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(xa, ya);
    g.quadraticCurveTo((xa + xb) / 2, ya + sag * 2, xb, ya);
    g.stroke();
    const bulbs = 6;
    for (let b = 1; b < bulbs; b++) {
      const u = b / bulbs;
      const bx = xa + (xb - xa) * u;
      const by = (1 - u) * (1 - u) * ya + 2 * (1 - u) * u * (ya + sag * 2) + u * u * ya;
      const c = bulbColors[(s * 5 + b) % bulbColors.length];
      let near = pointer ? Math.max(0, 1 - Math.hypot(bx - pointer.x, by - pointer.y) / 90) : 0;
      for (const tap of waves) {
        const ring = (t - tap.t) * 0.6;
        const off = Math.abs(Math.hypot(bx - tap.x, by - tap.y) - ring);
        near = Math.max(near, (1 - Math.min(1, off / 60)) * (1 - (t - tap.t) / 1600) * 1.4);
      }
      const tw = (0.6 + 0.4 * Math.sin(t / 500 + s * 1.7 + b * 2.1)) * (1 + flare * 2.5 + near * 1.5);
      g.save();
      g.shadowColor = c;
      g.shadowBlur = 12 * tw;
      g.fillStyle = c;
      g.beginPath();
      g.ellipse(bx, by + 7, 3.5 + flare * 2 + near * 1.5, 5 + flare * 2.5 + near * 1.5, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
      g.fillStyle = "#333";
      g.fillRect(bx - 1.5, by, 3, 3);
    }
  }
  drawSnow(g, t, sr.w, sr.h, 50, 7, fx);
  if (!l) return;
  const n = l.cellNum;
  const gridBottom = cellY(l, n) - l.cellSep;
  g.save();
  g.shadowColor = "rgba(0,0,0,0.55)";
  g.shadowBlur = 22;
  g.shadowOffsetY = 8;
  roundRect(g, l.boardX - 10, l.boardY - 10, l.boardW + 20, gridBottom - l.boardY + 13, 14);
  g.fillStyle = "#133B2A";
  g.fill();
  g.restore();
  g.lineWidth = 2;
  g.strokeStyle = rgba(GOLD, 0.6);
  roundRect(g, l.boardX - 10, l.boardY - 10, l.boardW + 20, gridBottom - l.boardY + 13, 14);
  g.stroke();
  const pad = l.cellW * 0.04;
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) drawChristmasWell(g, cellX(l, x) + pad, cellY(l, y) + pad, l.cellW - pad * 2, l.cellH - pad * 2);
  }
  const ry = replenishY(l);
  drawChristmasTray(g, l.boardX - 8, ry - 8, l.boardW + 16, l.cellH + 16);
}

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------

const slides: SlideStyle = {
  background(g, w, h) {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, NIGHT);
    sky.addColorStop(1, BG);
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    drawSnow(g, 0, w, h, 30, 11);
    const grad = g.createLinearGradient(0, h * 0.78, 0, h);
    grad.addColorStop(0, "#C21F36");
    grad.addColorStop(1, "#8E1427");
    g.fillStyle = grad;
    g.fillRect(0, h * 0.78, w, h * 0.22);
    g.fillStyle = GOLD;
    g.fillRect(0, h * 0.78, w, 3);
  },
  font: FONT,
  display: DISPLAY,
  text: TEXT,
  muted: MUTED,
  bgColor: BG,
  dotIdle: "rgba(255,255,255,0.25)",
  card: "#0A241A",
  cardEdge: rgba(GOLD, 0.7),
  cardShadow: "rgba(0,0,0,0.45)",
  gridLine: "rgba(255,255,255,0.05)",
  well: "rgba(0,0,0,0.3)",
  wellEdge: rgba(GOLD, 0.25),
  track: "rgba(255,255,255,0.14)",
  colors: CHRISTMAS_COLORS,
  inkOn: () => "#FFFFFF",
  tile: (g, x, y, w, h, base, opts) => gift(g, x, y, w, h, base, { radius: opts?.radius, plain: true }),
  glyphs,
  button: baubleButton,
};

const SPEC: SkinSpec = {
  colors: CHRISTMAS_COLORS,
  neutral: "#C9B98F",
  bg: BG,
  text: TEXT,
  muted: MUTED,
  font: FONT,
  display: DISPLAY,
  tile: gift,
  glyphs,
  button: baubleButton,
  panel,
  logo,
  menuFrame,
  worldText: "#FFFFFF",
  worldTextShadow: "rgba(0,0,0,0.6)",
  shadow: "rgba(0,0,0,0.6)",
  glow: false,
  selector: "ink",
  selectorNeutral: GOLD,
  progress: [BERRY, GOLD],
  pop(g, t, w, h) {
    g.globalAlpha = 1 - t;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const d = w * (0.1 + t * 0.4);
      g.fillStyle = k % 2 ? GOLD : "#FFFFFF";
      g.beginPath();
      g.arc(w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d, 1.5 + 2.5 * (1 - t), 0, Math.PI * 2);
      g.fill();
    }
  },
  mute: CHRISTMAS_COLORS[YELLOW],
  well: drawChristmasWell,
  slides,
};

export function buildChristmasSprites(classic: SpriteMap): SpriteMap {
  return buildSkin(classic, SPEC);
}
