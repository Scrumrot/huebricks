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
 * "Nature": smooth river stones on a wooden board in a sunny meadow. Stone
 * tiles with a soft organic sheen and a sprouting leaf, wood-slice buttons,
 * a sun, drifting clouds and leaves blowing across rolling hills, and a log
 * trough for the replenish line whose hollows fill with water.
 */

export const FONT = 'Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
export const DISPLAY = 'Fredoka, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const SKY = "#CFE8F5";
export const MEADOW = "#9BCB7A";
export const HILL = "#7DB862";
export const HILL_FAR = "#A9D68E";
export const CARD = "#FBF7EC";
export const TEXT = "#2E3A26";
export const MUTED = "#6F8260";
export const LEAF = "#5BAE4E";
export const LEAF_DARK = "#3C8A36";
export const WOOD = "#B9834E";
export const WOOD_DARK = "#8C5F34";
export const BARK = "#6B4426";
export const SUN = "#FFE27A";

export const NATURE_COLORS: Record<Color, string> = {
  1: "#D9534F",
  2: "#3F8FD2",
  3: "#8E63C9",
  4: "#F2C94C",
  5: "#E8893A",
  6: "#5BAE4E",
  7: "#3E3128",
};

/** A little leaf: pointed ellipse with a vein. */
export function leaf(g: Ctx, cx: number, cy: number, len: number, angle: number, color: string): void {
  g.save();
  g.translate(cx, cy);
  g.rotate(angle);
  g.beginPath();
  g.moveTo(-len / 2, 0);
  g.quadraticCurveTo(0, -len * 0.42, len / 2, 0);
  g.quadraticCurveTo(0, len * 0.42, -len / 2, 0);
  g.closePath();
  g.fillStyle = color;
  g.fill();
  g.strokeStyle = "rgba(0,0,0,0.2)";
  g.lineWidth = Math.max(0.6, len * 0.04);
  g.beginPath();
  g.moveTo(-len * 0.4, 0);
  g.lineTo(len * 0.4, 0);
  g.stroke();
  g.restore();
}

// ---------------------------------------------------------------------------
// Stone tile, glyphs, wood-slice button
// ---------------------------------------------------------------------------

/** A smooth stone: soft organic gradient, a broad sheen, speckles and a sprout in the corner. */
const stone: TileFn = (g, x, y, w, h, base, opts = {}) => {
  const m = Math.min(w, h);
  const r = opts.radius ?? m * 0.3;
  const fill = opts.lift ? shade(base, opts.lift) : base;
  const rnd = seeded((opts.seed ?? 1) + 21);
  roundRect(g, x, y, w, h, r);
  const grad = g.createRadialGradient(x + w * 0.35, y + h * 0.3, m * 0.05, x + w * 0.5, y + h * 0.55, m * 0.8);
  grad.addColorStop(0, shade(fill, 0.3));
  grad.addColorStop(0.55, fill);
  grad.addColorStop(1, shade(fill, -0.28));
  g.fillStyle = grad;
  g.fill();
  g.save();
  g.clip();
  // mineral speckles
  for (let k = 0; k < 14; k++) {
    g.fillStyle = rnd() < 0.5 ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.12)";
    g.beginPath();
    g.arc(x + rnd() * w, y + rnd() * h, 0.6 + rnd() * 1.4, 0, Math.PI * 2);
    g.fill();
  }
  // broad sheen
  g.fillStyle = "rgba(255,255,255,0.22)";
  g.beginPath();
  g.ellipse(x + w * 0.38, y + h * 0.24, w * 0.3, h * 0.12, -0.3, 0, Math.PI * 2);
  g.fill();
  g.restore();
  g.lineWidth = Math.max(1, m * 0.016);
  g.strokeStyle = "rgba(0,0,0,0.28)";
  roundRect(g, x + 0.5, y + 0.5, w - 1, h - 1, r);
  g.stroke();
  // a sprout from the bottom-right corner
  if (!opts.plain) {
    const sx = x + w * 0.84;
    const sy = y + h * 0.9;
    g.strokeStyle = LEAF_DARK;
    g.lineWidth = Math.max(1, m * 0.025);
    g.beginPath();
    g.moveTo(sx, sy);
    g.quadraticCurveTo(sx + m * 0.06, sy - m * 0.1, sx + m * 0.04, sy - m * 0.2);
    g.stroke();
    leaf(g, sx + m * 0.1, sy - m * 0.16, m * 0.14, -0.5, LEAF);
    leaf(g, sx - m * 0.02, sy - m * 0.22, m * 0.12, -1.3, LEAF);
  }
};

const glyphs = makeGlyphs({ stroke: "#FFFFFF", fill: "rgba(255,255,255,0.35)", shadow: "rgba(0,0,0,0.35)" });

/** A slice of log: bark rim, pale wood with growth rings, dark icon. */
const woodButton: ButtonFn = (g, w, h, pressed, icon) => {
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * 0.4;
  g.save();
  g.shadowColor = "rgba(46,58,38,0.3)";
  g.shadowBlur = r * 0.25;
  g.shadowOffsetY = r * 0.1;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fillStyle = BARK;
  g.fill();
  g.restore();
  g.beginPath();
  g.arc(cx, cy, r * 0.86, 0, Math.PI * 2);
  const grad = g.createRadialGradient(cx - r * 0.2, cy - r * 0.2, r * 0.1, cx, cy, r * 0.9);
  grad.addColorStop(0, pressed ? "#F0D2A6" : "#E8C692");
  grad.addColorStop(1, WOOD);
  g.fillStyle = grad;
  g.fill();
  g.strokeStyle = rgba(WOOD_DARK, 0.5);
  g.lineWidth = r * 0.025;
  for (let k = 1; k <= 4; k++) {
    g.beginPath();
    g.ellipse(cx + k * r * 0.02, cy, r * 0.17 * k, r * 0.16 * k, 0.2, 0, Math.PI * 2);
    g.stroke();
  }
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
  g.shadowColor = "rgba(46,58,38,0.22)";
  g.shadowBlur = r;
  g.shadowOffsetY = r * 0.3;
  roundRect(g, x, y, w, h, r);
  g.fillStyle = CARD;
  g.fill();
  g.restore();
  g.lineWidth = 2.5;
  g.strokeStyle = LEAF;
  roundRect(g, x, y, w, h, r);
  g.stroke();
  // vine along the top-left corner
  g.strokeStyle = LEAF_DARK;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(x + r, y + 2);
  g.quadraticCurveTo(x + r * 2.4, y - 6, x + r * 3.6, y + 4);
  g.stroke();
  leaf(g, x + r * 1.6, y - 4, 16, -0.6, LEAF);
  leaf(g, x + r * 3, y - 2, 14, 0.4, LEAF);
}

/** "HueBricks" in Fredoka, leaf green over cream with a sprout on the H and a few petals. */
function logo(g: Ctx, i: number, w: number, h: number): void {
  const size = h * 0.4;
  g.font = `600 ${size}px ${DISPLAY}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const tw = g.measureText("HueBricks").width;
  const x0 = w / 2 - tw / 2;
  const y = h / 2 - 6;
  g.save();
  g.shadowColor = "rgba(46,58,38,0.3)";
  g.shadowBlur = i === 1 ? 6 : 14;
  g.shadowOffsetY = 5;
  g.lineJoin = "round";
  g.lineWidth = size * 0.14;
  g.strokeStyle = CARD;
  g.strokeText("HueBricks", w / 2, y);
  g.restore();
  const grad = g.createLinearGradient(0, y - size / 2, 0, y + size / 2);
  grad.addColorStop(0, i === 1 ? "#8BD07A" : "#7CC66A");
  grad.addColorStop(1, LEAF_DARK);
  g.fillStyle = grad;
  g.fillText("HueBricks", w / 2, y);
  g.lineWidth = size * 0.025;
  g.strokeStyle = LEAF_DARK;
  g.strokeText("HueBricks", w / 2, y);
  // sprout off the first letter
  g.strokeStyle = LEAF_DARK;
  g.lineWidth = size * 0.04;
  g.beginPath();
  g.moveTo(x0 + size * 0.1, y - size * 0.36);
  g.quadraticCurveTo(x0 + size * 0.02, y - size * 0.6, x0 + size * 0.14, y - size * 0.78);
  g.stroke();
  leaf(g, x0 + size * 0.26, y - size * 0.7, size * 0.3, -0.5, LEAF);
  leaf(g, x0 - size * 0.02, y - size * 0.82, size * 0.26, -1.4, LEAF);
  // petals drifting past
  const rnd = seeded(33);
  for (let k = 0; k < 6; k++) {
    leaf(g, x0 + tw * (0.2 + rnd() * 0.8), y - size * (0.3 + rnd() * 0.5), size * (0.08 + rnd() * 0.06), rnd() * Math.PI, k % 2 ? "#F7B2C4" : LEAF);
  }
  const mini = size * 0.2;
  [NATURE_COLORS[RED], NATURE_COLORS[BLUE], NATURE_COLORS[YELLOW]].forEach((c, k) => {
    stone(g, w / 2 - mini * 1.9 + k * mini * 1.3, y + size * 0.7, mini, mini, c, { plain: true, seed: k });
  });
}

/** Grass band with blades along the top of the title screen's bar. */
function menuFrame(g: Ctx, w: number, h: number): void {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, HILL);
  grad.addColorStop(1, "#5E9A47");
  g.fillStyle = grad;
  g.fillRect(0, 8, w, h - 8);
  g.fillStyle = HILL;
  const rnd = seeded(13);
  for (let x = 0; x < w; x += 7) {
    const bh = 6 + rnd() * 10;
    g.beginPath();
    g.moveTo(x, 10);
    g.lineTo(x + 3 + rnd() * 2, 10 - bh);
    g.lineTo(x + 7, 10);
    g.closePath();
    g.fill();
  }
  g.fillStyle = "rgba(255,255,255,0.12)";
  g.fillRect(0, 9, w, 2);
}

// ---------------------------------------------------------------------------
// Backdrop and furniture
// ---------------------------------------------------------------------------

export function drawNatureWell(g: Ctx, x: number, y: number, w: number, h: number): void {
  const r = Math.min(w, h) * 0.28;
  roundRect(g, x, y, w, h, r);
  g.fillStyle = "rgba(62,49,40,0.28)";
  g.fill();
  g.lineWidth = 1;
  g.strokeStyle = "rgba(0,0,0,0.18)";
  roundRect(g, x + 0.5, y + 0.5, w - 1, h - 1, r);
  g.stroke();
}

/** The log trough: bark outside, hollowed wood inside. */
export function drawNatureTray(g: Ctx, x: number, y: number, w: number, h: number): void {
  g.save();
  g.shadowColor = "rgba(46,58,38,0.3)";
  g.shadowBlur = 12;
  g.shadowOffsetY = 5;
  roundRect(g, x, y, w, h, 16);
  g.fillStyle = BARK;
  g.fill();
  g.restore();
  roundRect(g, x + 4, y + 4, w - 8, h - 8, 12);
  const grad = g.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, WOOD);
  grad.addColorStop(1, WOOD_DARK);
  g.fillStyle = grad;
  g.fill();
  g.strokeStyle = "rgba(0,0,0,0.15)";
  g.lineWidth = 1;
  for (let k = 0; k < 3; k++) {
    const gy = y + 10 + ((h - 20) * (k + 0.5)) / 3;
    g.beginPath();
    g.moveTo(x + 10, gy);
    for (let gx = x + 10; gx <= x + w - 10; gx += 20) g.lineTo(gx, gy + Math.sin(gx / 36 + k) * 1.5);
    g.stroke();
  }
}

/** Sky, sun, drifting clouds, rolling hills and blowing leaves; with a layout the wooden board, hollows and log trough. */
export function drawNatureBackdrop(g: Ctx, t: number, l?: Layout, flare = 0, fx: TitleFx | null = null): void {
  const sr = screenRect();
  const sky = g.createLinearGradient(0, 0, 0, sr.h);
  sky.addColorStop(0, "#B9DDF2");
  sky.addColorStop(0.6, SKY);
  sky.addColorStop(1, "#E6F2E0");
  fillScreen(g, sky);
  // sun with rays
  const sx = sr.w * 0.82;
  const sy = sr.h * 0.18;
  const srad = Math.min(sr.w, sr.h) * 0.07;
  const glow = g.createRadialGradient(sx, sy, srad, sx, sy, srad * 4);
  glow.addColorStop(0, `rgba(255,226,122,${0.35 + flare * 0.4})`);
  glow.addColorStop(1, "rgba(255,226,122,0)");
  g.fillStyle = glow;
  g.fillRect(sx - srad * 4, sy - srad * 4, srad * 8, srad * 8);
  g.save();
  g.translate(sx, sy);
  g.rotate(t / 60000);
  g.fillStyle = `rgba(255,226,122,${0.18 + flare * 0.3})`;
  for (let k = 0; k < 12; k++) {
    g.rotate(Math.PI / 6);
    g.beginPath();
    g.moveTo(srad * 1.2, -srad * 0.18);
    g.lineTo(srad * (2.3 + (k % 2) * 0.5), 0);
    g.lineTo(srad * 1.2, srad * 0.18);
    g.closePath();
    g.fill();
  }
  g.restore();
  g.beginPath();
  g.arc(sx, sy, srad, 0, Math.PI * 2);
  g.fillStyle = SUN;
  g.fill();
  // clouds drifting
  const cloud = (cx: number, cy: number, s: number) => {
    g.fillStyle = "rgba(255,255,255,0.9)";
    for (const [ox, oy, orr] of [
      [0, 0, 1],
      [-1.1, 0.25, 0.7],
      [1.1, 0.2, 0.75],
      [0.4, -0.4, 0.7],
      [-0.5, -0.3, 0.6],
    ]) {
      g.beginPath();
      g.arc(cx + ox * s, cy + oy * s, orr * s, 0, Math.PI * 2);
      g.fill();
    }
    g.fillRect(cx - s * 1.4, cy, s * 2.8, s * 0.7);
  };
  for (let k = 0; k < 3; k++) {
    const ph = ((t / (90000 + k * 20000) + k * 0.33) % 1) * 1.3 - 0.15;
    cloud(sr.w * ph, sr.h * (0.12 + k * 0.1), 14 + k * 5);
  }
  // hills
  for (const [k, yy, col] of [
    [0.8, 0.68, HILL_FAR],
    [1.2, 0.76, MEADOW],
    [0.6, 0.84, HILL],
  ] as const) {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(0, sr.h);
    g.lineTo(0, sr.h * yy);
    for (let x = 0; x <= sr.w; x += 30) g.lineTo(x, sr.h * yy + Math.sin((x / 170) * k) * 18 + Math.sin(x / 53) * 4);
    g.lineTo(sr.w, sr.h);
    g.closePath();
    g.fill();
  }
  // leaves on the breeze: drift right and down, tumbling; the cursor and taps gust them aside
  const pushers: Array<[number, number, number]> = [];
  if (fx?.pointer) pushers.push([fx.pointer.x, fx.pointer.y, 90]);
  for (const tap of fx?.taps ?? []) {
    const age = t - tap.t;
    if (age < 800) pushers.push([tap.x, tap.y, 60 + (age / 800) * 200]);
  }
  const rnd = seeded(53);
  const count = 22 + Math.round(flare * 20);
  for (let i = 0; i < count; i++) {
    const ph = rnd();
    const speed = 30 + rnd() * 40;
    const size = 7 + rnd() * 7;
    const sway = rnd() * 30;
    const hue = rnd();
    let x = ((ph * sr.w + (t / 1000) * speed) % (sr.w + 40)) - 20;
    let y = ((ph * 7 * sr.h + (t / 1000) * speed * 0.45) % (sr.h + 40)) - 20 + Math.sin(t / 900 + ph * 8) * sway;
    for (const [px, py, reach] of pushers) {
      const dx = x - px;
      const dy = y - py;
      const d = Math.hypot(dx, dy);
      if (d < reach && d > 0.01) {
        const push = ((reach - d) / reach) * 46;
        x += (dx / d) * push;
        y += (dy / d) * push;
      }
    }
    leaf(g, x, y, size, t / (400 + ph * 400) + ph * 6, hue < 0.6 ? LEAF : hue < 0.85 ? "#E8893A" : "#F7B2C4");
  }
  if (!l) return;
  const n = l.cellNum;
  const gridBottom = cellY(l, n) - l.cellSep;
  // wooden board under the grid
  g.save();
  g.shadowColor = "rgba(46,58,38,0.35)";
  g.shadowBlur = 20;
  g.shadowOffsetY = 8;
  roundRect(g, l.boardX - 12, l.boardY - 12, l.boardW + 24, gridBottom - l.boardY + 17, 14);
  const wood = g.createLinearGradient(l.boardX, l.boardY, l.boardX + l.boardW, l.boardY);
  wood.addColorStop(0, WOOD);
  wood.addColorStop(0.5, "#C8925C");
  wood.addColorStop(1, WOOD_DARK);
  g.fillStyle = wood;
  g.fill();
  g.restore();
  g.save();
  roundRect(g, l.boardX - 12, l.boardY - 12, l.boardW + 24, gridBottom - l.boardY + 17, 14);
  g.clip();
  g.strokeStyle = "rgba(0,0,0,0.12)";
  g.lineWidth = 1;
  for (let k = 0; k < 9; k++) {
    const gy = l.boardY - 12 + ((gridBottom - l.boardY + 17) * (k + 0.5)) / 9;
    g.beginPath();
    g.moveTo(l.boardX - 12, gy);
    for (let gx = l.boardX - 12; gx <= l.boardX + l.boardW + 12; gx += 24) g.lineTo(gx, gy + Math.sin(gx / 50 + k * 1.3) * 2);
    g.stroke();
  }
  g.restore();
  const pad = l.cellW * 0.04;
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) drawNatureWell(g, cellX(l, x) + pad, cellY(l, y) + pad, l.cellW - pad * 2, l.cellH - pad * 2);
  }
  const ry = replenishY(l);
  drawNatureTray(g, l.boardX - 8, ry - 8, l.boardW + 16, l.cellH + 16);
}

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------

const slides: SlideStyle = {
  background(g, w, h) {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#B9DDF2");
    sky.addColorStop(1, "#E6F2E0");
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    g.fillStyle = HILL;
    g.fillRect(0, h * 0.78, w, h * 0.22);
    g.fillStyle = "rgba(255,255,255,0.15)";
    g.fillRect(0, h * 0.78, w, 2);
  },
  font: FONT,
  display: DISPLAY,
  text: TEXT,
  muted: MUTED,
  bgColor: SKY,
  dotIdle: rgba(TEXT, 0.25),
  card: CARD,
  cardEdge: LEAF,
  cardShadow: "rgba(46,58,38,0.22)",
  gridLine: "rgba(0,0,0,0.1)",
  well: "rgba(62,49,40,0.28)",
  wellEdge: "rgba(0,0,0,0.18)",
  track: rgba(TEXT, 0.12),
  colors: NATURE_COLORS,
  inkOn: () => "#FFFFFF",
  tile: (g, x, y, w, h, base, opts) => stone(g, x, y, w, h, base, { radius: opts?.radius, plain: true, seed: 2 }),
  glyphs,
  button: woodButton,
};

const SPEC: SkinSpec = {
  colors: NATURE_COLORS,
  neutral: "#A89A86",
  bg: SKY,
  text: TEXT,
  muted: MUTED,
  font: FONT,
  display: DISPLAY,
  tile: stone,
  glyphs,
  button: woodButton,
  panel,
  logo,
  menuFrame,
  worldText: "#FFFFFF",
  worldTextShadow: "rgba(0,0,0,0.45)",
  shadow: "rgba(46,58,38,0.45)",
  glow: false,
  selector: "ink",
  selectorNeutral: TEXT,
  progress: [LEAF, NATURE_COLORS[YELLOW]],
  pop(g, t, w, h) {
    g.globalAlpha = 1 - t;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const d = w * (0.1 + t * 0.38);
      leaf(g, w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d, 5 + 3 * (1 - t), a + t * 3, k % 2 ? LEAF : "#E8893A");
    }
  },
  mute: NATURE_COLORS[RED],
  well: drawNatureWell,
  slides,
};

export function buildNatureSprites(classic: SpriteMap): SpriteMap {
  return buildSkin(classic, SPEC);
}
