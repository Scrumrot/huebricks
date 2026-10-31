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
 * "Lantern": paper lanterns at a night festival. Every brick is a ribbed
 * lantern lit from inside with a soft halo (the kit's glow sprite under a
 * gel-style brick); strings of lanterns sway across the night sky and dip
 * toward the pointer, fireflies drift low over dark hills, pops burst like
 * fireworks and the popped lantern floats up and away (the `float`
 * signature), and a level clear sends embers up out of every column.
 */

export const FONT = 'Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
export const DISPLAY = '"M PLUS Rounded 1c", "Varela Round", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const NIGHT = "#15112B";
export const NIGHT_HIGH = "#1D1840";
export const HILL = "#2A2250";
export const HILL_NEAR = "#1D1840";
export const GOLD = "#F2C76B";
export const GOLD_LIGHT = "#FFE3A3";
export const GOLD_DARK = "#C9963B";
export const FRAME = "#3A2B1A";
export const TEXT = "#FFF0D6";
export const MUTED = "#B9A98E";
export const CARD = "#1D1840";

export const LANTERN_COLORS: Record<Color, string> = {
  1: "#E8453C",
  2: "#3B6FD0",
  3: "#8C55C9",
  4: "#F7C843",
  5: "#F0883A",
  6: "#58B868",
  7: "#5A5270",
};

// ---------------------------------------------------------------------------
// Lantern tile, glyphs, gold button
// ---------------------------------------------------------------------------

/** A paper lantern: a tall rounded body lit from inside, ribs, dark caps and a short cord. */
const lantern: TileFn = (g, x, y, w, h, base, opts = {}) => {
  const m = Math.min(w, h);
  const fill = opts.lift ? shade(base, opts.lift) : base;
  const inset = w * 0.09;
  const bx = x + inset;
  const bw = w - inset * 2;
  const by = y + h * 0.05;
  const bh = h * 0.9;
  const r = opts.radius ?? Math.min(bw, bh) * 0.32;
  // cord above the top cap
  g.strokeStyle = FRAME;
  g.lineWidth = Math.max(1, m * 0.02);
  g.beginPath();
  g.moveTo(x + w / 2, y);
  g.lineTo(x + w / 2, by);
  g.stroke();
  // body lit from inside
  roundRect(g, bx, by, bw, bh, r);
  const lit = g.createRadialGradient(x + w / 2, y + h * 0.42, m * 0.05, x + w / 2, y + h * 0.5, m * 0.62);
  lit.addColorStop(0, shade(fill, 0.5));
  lit.addColorStop(0.5, shade(fill, 0.08));
  lit.addColorStop(1, shade(fill, -0.3));
  g.fillStyle = lit;
  g.fill();
  g.save();
  g.clip();
  // ribs
  g.strokeStyle = "rgba(0,0,0,0.18)";
  g.lineWidth = Math.max(1, m * 0.015);
  for (let k = 1; k <= 5; k++) {
    const rx = bx + (bw * k) / 6;
    g.beginPath();
    g.moveTo(rx, by);
    g.lineTo(rx, by + bh);
    g.stroke();
  }
  // a soft highlight across the upper body
  g.fillStyle = "rgba(255,255,255,0.1)";
  g.beginPath();
  g.ellipse(x + w / 2, by + bh * 0.22, bw * 0.36, bh * 0.12, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
  g.lineWidth = Math.max(1, m * 0.014);
  g.strokeStyle = "rgba(0,0,0,0.28)";
  roundRect(g, bx + 0.5, by + 0.5, bw - 1, bh - 1, r);
  g.stroke();
  // caps
  const capW = bw * 0.46;
  const capH = h * 0.075;
  g.fillStyle = FRAME;
  roundRect(g, x + w / 2 - capW / 2, by - capH * 0.3, capW, capH, capH * 0.3);
  g.fill();
  roundRect(g, x + w / 2 - capW / 2, by + bh - capH * 0.7, capW, capH, capH * 0.3);
  g.fill();
  if (!opts.plain) {
    // tassel
    g.strokeStyle = GOLD_DARK;
    g.lineWidth = Math.max(1, m * 0.02);
    g.beginPath();
    g.moveTo(x + w / 2, by + bh + capH * 0.2);
    g.lineTo(x + w / 2, y + h);
    g.stroke();
  }
};

const glyphs = makeGlyphs({ stroke: TEXT, fill: "rgba(255,240,214,0.92)", glow: GOLD_LIGHT, width: 0.045 });

/** A glowing gold disc with a dark icon. */
const goldButton: ButtonFn = (g, w, h, pressed, icon) => {
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * 0.38;
  g.save();
  g.shadowColor = rgba(GOLD, pressed ? 0.9 : 0.6);
  g.shadowBlur = r * 0.5;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  const grad = g.createRadialGradient(cx, cy - r * 0.2, r * 0.05, cx, cy, r);
  grad.addColorStop(0, pressed ? "#FFF0C8" : GOLD_LIGHT);
  grad.addColorStop(0.6, GOLD);
  grad.addColorStop(1, GOLD_DARK);
  g.fillStyle = grad;
  g.fill();
  g.restore();
  g.save();
  g.strokeStyle = FRAME;
  g.fillStyle = FRAME;
  g.lineWidth = r * 0.13;
  g.lineCap = "round";
  g.lineJoin = "round";
  icon(g, cx, cy, r);
  g.restore();
};

function panel(g: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  g.save();
  g.shadowColor = rgba(GOLD, 0.25);
  g.shadowBlur = r;
  roundRect(g, x, y, w, h, r);
  g.fillStyle = rgba(NIGHT, 0.94);
  g.fill();
  g.restore();
  g.lineWidth = 1.5;
  g.strokeStyle = rgba(GOLD, 0.45);
  roundRect(g, x, y, w, h, r);
  g.stroke();
}

/** A small hanging lantern with its halo, for strings and the logo. */
export function miniLantern(g: Ctx, cx: number, cy: number, size: number, color: string, glow = 1): void {
  const halo = g.createRadialGradient(cx, cy, size * 0.2, cx, cy, size * 1.5);
  halo.addColorStop(0, rgba(color, 0.45 * glow));
  halo.addColorStop(1, rgba(color, 0));
  g.fillStyle = halo;
  g.fillRect(cx - size * 1.5, cy - size * 1.5, size * 3, size * 3);
  lantern(g, cx - size / 2, cy - size * 0.6, size, size * 1.2, color, { plain: true });
}

/** "HueBricks" in a rounded face, cream with a gold glow, under a string of lanterns. */
function logo(g: Ctx, i: number, w: number, h: number): void {
  const size = h * 0.38;
  // the string, with lanterns hanging from it
  g.strokeStyle = GOLD_DARK;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, h * 0.12);
  g.quadraticCurveTo(w / 2, h * 0.26, w, h * 0.12);
  g.stroke();
  const rnd = seeded(9);
  const cols = [LANTERN_COLORS[RED], LANTERN_COLORS[YELLOW], LANTERN_COLORS[BLUE], LANTERN_COLORS[5], LANTERN_COLORS[6], LANTERN_COLORS[3]];
  for (let k = 0; k < 6; k++) {
    const u = 0.08 + (k / 5) * 0.84;
    const sy = h * 0.12 + (1 - (2 * u - 1) ** 2) * h * 0.07;
    miniLantern(g, w * u, sy + size * 0.22 + rnd() * 6, size * 0.2, cols[k], i === 1 ? 1.3 : 1);
  }
  g.font = `800 ${size}px ${DISPLAY}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const y = h / 2 + 18;
  g.save();
  g.shadowColor = rgba(GOLD, i === 1 ? 0.9 : 0.6);
  g.shadowBlur = i === 1 ? 30 : 18;
  g.fillStyle = TEXT;
  g.fillText("HueBricks", w / 2, y);
  g.fillText("HueBricks", w / 2, y);
  g.restore();
  g.lineWidth = size * 0.02;
  g.strokeStyle = rgba(GOLD_DARK, 0.6);
  g.strokeText("HueBricks", w / 2, y);
}

/** A band of dark hill with a lantern string across the top. */
function menuFrame(g: Ctx, w: number, h: number): void {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, HILL);
  grad.addColorStop(1, NIGHT);
  g.fillStyle = grad;
  g.fillRect(0, 8, w, h - 8);
  g.strokeStyle = rgba(GOLD, 0.6);
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(0, 10);
  g.quadraticCurveTo(w / 2, 22, w, 10);
  g.stroke();
}

// ---------------------------------------------------------------------------
// Backdrop and furniture
// ---------------------------------------------------------------------------

/** An empty hook on the string: a faint lantern outline. */
export function drawLanternWell(g: Ctx, x: number, y: number, w: number, h: number): void {
  const r = Math.min(w, h) * 0.3;
  roundRect(g, x + w * 0.09, y + h * 0.05, w * 0.82, h * 0.9, r);
  g.fillStyle = "rgba(255,240,214,0.05)";
  g.fill();
  g.lineWidth = 1;
  g.strokeStyle = "rgba(255,240,214,0.12)";
  roundRect(g, x + w * 0.09 + 0.5, y + h * 0.05 + 0.5, w * 0.82 - 1, h * 0.9 - 1, r);
  g.stroke();
}

/** The lantern string: a dark strip with a gold cord and hooks along it. */
export function drawLanternTray(g: Ctx, x: number, y: number, w: number, h: number): void {
  roundRect(g, x, y, w, h, 14);
  g.fillStyle = "rgba(0,0,0,0.3)";
  g.fill();
  g.lineWidth = 1;
  g.strokeStyle = rgba(GOLD, 0.25);
  roundRect(g, x + 0.5, y + 0.5, w - 1, h - 1, 14);
  g.stroke();
  g.strokeStyle = rgba(GOLD, 0.75);
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(x + 6, y + 6);
  g.quadraticCurveTo(x + w / 2, y + 12, x + w - 6, y + 6);
  g.stroke();
}

/** The next lantern on the string: it hangs dark in its well and brightens to the incoming colour as the timer fills, swaying as it warms. */
export function drawLanternFill(g: Ctx, x: number, y: number, w: number, h: number, level: number, colour: string, t: number): void {
  const size = w * 0.4;
  const drop = h * 0.14;
  const swing = Math.sin(t / 700 + x * 0.013) * 0.1 * (0.3 + level);
  g.save();
  g.translate(x + w / 2, y + h * 0.06);
  g.rotate(swing);
  g.strokeStyle = rgba(GOLD, 0.6);
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(0, drop);
  g.stroke();
  const cy = drop + size * 0.62;
  miniLantern(g, 0, cy, size, shade(colour, -0.5), 0);
  if (level > 0) {
    g.globalAlpha = level;
    miniLantern(g, 0, cy, size, colour, 0.4 + 0.6 * level);
  }
  g.restore();
}

/** Night sky, stars, lantern strings, fireflies and dark hills; with a layout, the board panel, hooks and the string tray. */
export function drawLanternBackdrop(g: Ctx, t: number, l?: Layout, flare = 0, fx: TitleFx | null = null): void {
  const sr = screenRect();
  const sky = g.createLinearGradient(0, 0, 0, sr.h);
  sky.addColorStop(0, NIGHT_HIGH);
  sky.addColorStop(0.7, NIGHT);
  sky.addColorStop(1, "#100C22");
  fillScreen(g, sky);
  const rnd = seeded(23);
  for (let i = 0; i < 60; i++) {
    const x = rnd() * sr.w;
    const y = rnd() * sr.h * 0.75;
    const tw = 0.3 + 0.7 * Math.max(0, Math.sin(t / 900 + rnd() * 6));
    g.fillStyle = `rgba(255,240,214,${0.45 * tw})`;
    g.fillRect(x, y, 1.5, 1.5);
  }
  // hills
  for (const [k, yy, col] of [
    [0.9, 0.74, HILL],
    [1.3, 0.84, HILL_NEAR],
  ] as const) {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(0, sr.h);
    g.lineTo(0, sr.h * yy);
    for (let x = 0; x <= sr.w; x += 30) g.lineTo(x, sr.h * yy + Math.sin((x / 190) * k + k) * 22 + Math.sin(x / 61) * 5);
    g.lineTo(sr.w, sr.h);
    g.closePath();
    g.fill();
  }
  // lantern strings across the top, swaying, dipping toward the pointer
  const cols = [LANTERN_COLORS[1], LANTERN_COLORS[4], LANTERN_COLORS[2], LANTERN_COLORS[5], LANTERN_COLORS[6], LANTERN_COLORS[3]];
  const pointer = fx?.pointer ?? null;
  // in play the strings sit behind the HUD band, so they step back
  g.save();
  if (l) g.globalAlpha = 0.45;
  for (let s = 0; s < 2; s++) {
    const baseY = sr.h * (0.07 + s * 0.08);
    const sag = sr.h * 0.05;
    const sway = Math.sin(t / 1800 + s * 2) * 6;
    const dipAt = pointer && pointer.y < sr.h * 0.4 ? pointer.x : -1;
    const yAt = (x: number) => {
      const u = x / sr.w;
      let y = baseY + (1 - (2 * u - 1) ** 2) * sag + sway;
      if (dipAt >= 0) y += Math.max(0, 1 - Math.abs(x - dipAt) / (sr.w * 0.18)) * 18;
      return y;
    };
    g.strokeStyle = rgba(GOLD_DARK, 0.7);
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(0, yAt(0));
    for (let x = 20; x <= sr.w; x += 20) g.lineTo(x, yAt(x));
    g.stroke();
    const count = Math.max(4, Math.round(sr.w / 150));
    for (let k = 0; k < count; k++) {
      const x = sr.w * ((k + 0.5) / count) + (s ? 40 : 0);
      if (x > sr.w) continue;
      const swing = Math.sin(t / 1300 + k * 1.7 + s) * 3;
      const glow = 0.9 + flare * 0.8 + 0.1 * Math.sin(t / 500 + k);
      miniLantern(g, x + swing, yAt(x) + 16, 12 + (k % 2) * 2, cols[(k + s * 3) % cols.length], glow);
    }
  }
  g.restore();
  // fireflies drifting low, more after a level clear; taps scatter them
  const flies = 14 + Math.round(flare * 16);
  const rnd2 = seeded(41);
  for (let i = 0; i < flies; i++) {
    const ph = rnd2();
    const ph2 = rnd2();
    let x = sr.w * ((ph + t / (26000 + ph2 * 9000)) % 1);
    let y = sr.h * (0.55 + ph2 * 0.4) + Math.sin(t / 1200 + ph * 9) * 14;
    for (const tap of fx?.taps ?? []) {
      const age = t - tap.t;
      if (age > 900) continue;
      const dx = x - tap.x;
      const dy = y - tap.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < 120) {
        const push = ((120 - d) / 120) * 40 * (1 - age / 900);
        x += (dx / d) * push;
        y += (dy / d) * push;
      }
    }
    const tw = 0.35 + 0.65 * Math.max(0, Math.sin(t / 600 + ph * 12));
    const halo = g.createRadialGradient(x, y, 0, x, y, 6);
    halo.addColorStop(0, `rgba(242,199,107,${0.6 * tw})`);
    halo.addColorStop(1, "rgba(242,199,107,0)");
    g.fillStyle = halo;
    g.fillRect(x - 6, y - 6, 12, 12);
    g.fillStyle = `rgba(255,227,163,${0.9 * tw})`;
    g.beginPath();
    g.arc(x, y, 1.3, 0, Math.PI * 2);
    g.fill();
  }
  if (!l) return;
  const n = l.cellNum;
  const gridBottom = cellY(l, n) - l.cellSep;
  roundRect(g, l.boardX - 12, l.boardY - 12, l.boardW + 24, gridBottom - l.boardY + 18, 16);
  g.fillStyle = "rgba(0,0,0,0.28)";
  g.fill();
  g.lineWidth = 1;
  g.strokeStyle = rgba(GOLD, 0.2);
  roundRect(g, l.boardX - 11.5, l.boardY - 11.5, l.boardW + 23, gridBottom - l.boardY + 17, 16);
  g.stroke();
  const pad = l.cellW * 0.04;
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) drawLanternWell(g, cellX(l, x) + pad, cellY(l, y) + pad, l.cellW - pad * 2, l.cellH - pad * 2);
  }
  const ry = replenishY(l);
  drawLanternTray(g, l.boardX - 8, ry - 8, l.boardW + 16, l.cellH + 16);
}

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------

const slides: SlideStyle = {
  background(g, w, h) {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, NIGHT_HIGH);
    sky.addColorStop(1, NIGHT);
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    g.fillStyle = HILL;
    g.fillRect(0, h * 0.78, w, h * 0.22);
    g.fillStyle = rgba(GOLD, 0.5);
    g.fillRect(0, h * 0.78, w, 2);
  },
  font: FONT,
  display: DISPLAY,
  text: TEXT,
  muted: MUTED,
  bgColor: NIGHT,
  dotIdle: "rgba(255,240,214,0.25)",
  card: CARD,
  cardEdge: rgba(GOLD, 0.5),
  cardShadow: "rgba(0,0,0,0.5)",
  gridLine: "rgba(255,240,214,0.06)",
  well: "rgba(255,240,214,0.05)",
  wellEdge: "rgba(255,240,214,0.12)",
  track: "rgba(255,240,214,0.14)",
  colors: LANTERN_COLORS,
  inkOn: () => TEXT,
  tile: (g, x, y, w, h, base, opts) => lantern(g, x, y, w, h, base, { radius: opts?.radius, plain: true }),
  glyphs,
  button: goldButton,
};

const SPEC: SkinSpec = {
  colors: LANTERN_COLORS,
  neutral: "#8A7A64",
  bg: NIGHT,
  text: TEXT,
  muted: MUTED,
  font: FONT,
  display: DISPLAY,
  tile: lantern,
  glyphs,
  button: goldButton,
  panel,
  logo,
  menuFrame,
  worldText: TEXT,
  worldTextShadow: "rgba(0,0,0,0.6)",
  shadow: null,
  glow: true,
  selector: "glow",
  selectorNeutral: GOLD_LIGHT,
  progress: [LANTERN_COLORS[5], GOLD],
  pop(g, t, w, h) {
    g.globalAlpha = 1 - t;
    g.strokeStyle = GOLD_LIGHT;
    g.lineCap = "round";
    g.lineWidth = 2;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const d0 = w * (0.05 + t * 0.3);
      const d1 = w * (0.12 + t * 0.42);
      g.beginPath();
      g.moveTo(w / 2 + Math.cos(a) * d0, h / 2 + Math.sin(a) * d0);
      g.lineTo(w / 2 + Math.cos(a) * d1, h / 2 + Math.sin(a) * d1);
      g.stroke();
    }
  },
  mute: LANTERN_COLORS[RED],
  well: drawLanternWell,
  slides,
};

export function buildLanternSprites(classic: SpriteMap): SpriteMap {
  return buildSkin(classic, SPEC);
}
