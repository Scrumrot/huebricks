import { BLUE, PURPLE, RED, type Color } from "../core/color";
import type { Layout } from "../core/layout";
import { cellX, cellY, replenishY } from "../core/layout";
import type { SpriteMap } from "./assets";
import { rgba, roundRect, shade, type Ctx } from "./modernSkin";
import type { SlideStyle } from "./modernSlides";
import { buildSkin, makeGlyphs, seeded, type ButtonFn, type SkinSpec, type TileFn } from "./skinKit";
import { fillScreen, screenRect } from "./view";

/**
 * "Halloween": wrapped candies on a moonlit night. Glossy candy tiles with a
 * drip of slime off the bottom edge, jack-o'-lantern buttons, a bat-flecked
 * sky with a big moon, fog over the hills and a cauldron for the replenish
 * line whose bowls fill with brew.
 */

export const FONT = 'Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
export const DISPLAY = 'Fredoka, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const BG = "#120A1F";
export const NIGHT = "#2A1540";
export const CARD = "#1E1230";
export const TEXT = "#F3E9FF";
export const MUTED = "#9C8BB5";
export const PUMPKIN = "#F27A1A";
export const PUMPKIN_DARK = "#C45A0C";
export const SLIME = "#7FE33A";
export const STEM = "#4E8A2E";
export const INK = "#1F1A24";

export const HALLOWEEN_COLORS: Record<Color, string> = {
  1: "#D9303F",
  2: "#3C6BE0",
  3: "#8B3FD9",
  4: "#F2C230",
  5: "#F27A1A",
  6: "#5BD63A",
  7: "#1F1A24",
};

// ---------------------------------------------------------------------------
// Candy tile, glyphs, pumpkin button
// ---------------------------------------------------------------------------

const candy: TileFn = (g, x, y, w, h, base, opts = {}) => {
  const m = Math.min(w, h);
  const r = opts.radius ?? m * 0.22;
  const fill = opts.lift ? shade(base, opts.lift) : base;
  // slime drips off the bottom edge
  if (!opts.plain) {
    const rnd = seeded((opts.seed ?? 1) + 3);
    g.fillStyle = shade(fill, -0.25);
    for (let k = 0; k < 2; k++) {
      const dx = x + w * (0.25 + rnd() * 0.5);
      const dr = m * (0.05 + rnd() * 0.04);
      const len = m * (0.06 + rnd() * 0.08);
      roundRect(g, dx - dr / 2, y + h - m * 0.1, dr, m * 0.1 + len, dr / 2);
      g.fill();
    }
  }
  roundRect(g, x, y, w, h, r);
  const grad = g.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, shade(fill, 0.25));
  grad.addColorStop(0.5, fill);
  grad.addColorStop(1, shade(fill, -0.2));
  g.fillStyle = grad;
  g.fill();
  g.save();
  g.clip();
  const hl = g.createRadialGradient(x + w * 0.3, y + h * 0.2, 0, x + w * 0.3, y + h * 0.2, w * 0.5);
  hl.addColorStop(0, "rgba(255,255,255,0.4)");
  hl.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = hl;
  g.fillRect(x, y, w, h);
  g.restore();
  g.lineWidth = Math.max(1, m * 0.02);
  g.strokeStyle = rgba(INK, 0.6);
  roundRect(g, x, y, w, h, r);
  g.stroke();
};

const glyphs = makeGlyphs({ stroke: "#FFFFFF", fill: "rgba(255,255,255,0.35)", shadow: "rgba(0,0,0,0.35)", glow: "rgba(255,255,255,0.45)" });

/** A jack-o'-lantern: ridged orange sphere with a stem; pressed glows from inside. */
const pumpkinButton: ButtonFn = (g, w, h, pressed, icon) => {
  const cx = w / 2;
  const cy = h / 2 + h * 0.03;
  const r = Math.min(w, h) * 0.38;
  // stem
  g.fillStyle = STEM;
  roundRect(g, cx - r * 0.1, cy - r * 1.08, r * 0.2, r * 0.3, r * 0.05);
  g.fill();
  g.save();
  if (pressed) {
    g.shadowColor = "rgba(255,180,60,0.7)";
    g.shadowBlur = r * 0.4;
  }
  g.beginPath();
  g.ellipse(cx, cy, r, r * 0.9, 0, 0, Math.PI * 2);
  const grad = g.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
  grad.addColorStop(0, pressed ? "#FFB347" : "#FF9A3C");
  grad.addColorStop(1, PUMPKIN_DARK);
  g.fillStyle = grad;
  g.fill();
  g.restore();
  // ridges
  g.strokeStyle = rgba(PUMPKIN_DARK, 0.6);
  g.lineWidth = r * 0.05;
  for (const k of [-0.5, 0, 0.5]) {
    g.beginPath();
    g.ellipse(cx + k * r * 0.5, cy, r * (0.3 + Math.abs(k) * 0.3), r * 0.88, 0, 0, Math.PI * 2);
    g.stroke();
  }
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
  g.strokeStyle = rgba(PUMPKIN, 0.6);
  roundRect(g, x, y, w, h, r);
  g.stroke();
}

function bat(g: Ctx, cx: number, cy: number, s: number, flap: number): void {
  g.beginPath();
  g.moveTo(cx, cy);
  g.quadraticCurveTo(cx - s * 0.5, cy - s * (0.6 + flap * 0.4), cx - s, cy - s * 0.2 * flap);
  g.quadraticCurveTo(cx - s * 0.7, cy + s * 0.1, cx - s * 0.45, cy + s * 0.05);
  g.quadraticCurveTo(cx - s * 0.2, cy + s * 0.25, cx, cy + s * 0.15);
  g.quadraticCurveTo(cx + s * 0.2, cy + s * 0.25, cx + s * 0.45, cy + s * 0.05);
  g.quadraticCurveTo(cx + s * 0.7, cy + s * 0.1, cx + s, cy - s * 0.2 * flap);
  g.quadraticCurveTo(cx + s * 0.5, cy - s * (0.6 + flap * 0.4), cx, cy);
  g.closePath();
  g.fill();
}

/** "HueBricks" in Fredoka, pumpkin-to-purple with slime drips and a couple of bats. */
function logo(g: Ctx, i: number, w: number, h: number): void {
  const size = h * 0.4;
  g.font = `600 ${size}px ${DISPLAY}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const tw = g.measureText("HueBricks").width;
  const x0 = w / 2 - tw / 2;
  const y = h / 2 - 6;
  const rnd = seeded(17);
  const drips: Array<[number, number, number]> = [];
  for (let k = 0; k < 4; k++) drips.push([x0 + tw * (0.1 + rnd() * 0.8), size * (0.05 + rnd() * 0.03), size * (0.04 + rnd() * 0.12)]);
  g.lineJoin = "round";
  for (const [dx, dr, len] of drips) {
    roundRect(g, dx - dr / 2, y + size * 0.15, dr, size * 0.2 + len, dr / 2);
    g.lineWidth = size * 0.07;
    g.strokeStyle = INK;
    g.stroke();
  }
  g.save();
  g.shadowColor = "rgba(242,122,26,0.5)";
  g.shadowBlur = i === 1 ? 10 : 22;
  g.lineWidth = size * 0.14;
  g.strokeStyle = INK;
  g.strokeText("HueBricks", w / 2, y);
  g.restore();
  const grad = g.createLinearGradient(0, y - size / 2, 0, y + size / 2);
  grad.addColorStop(0, i === 1 ? "#FFB347" : "#FF9A3C");
  grad.addColorStop(0.55, PUMPKIN);
  grad.addColorStop(1, "#8B3FD9");
  g.fillStyle = grad;
  g.fillText("HueBricks", w / 2, y);
  for (const [dx, dr, len] of drips) {
    roundRect(g, dx - dr / 2, y + size * 0.15, dr, size * 0.2 + len, dr / 2);
    g.fillStyle = SLIME;
    g.fill();
  }
  g.fillStyle = INK;
  bat(g, x0 + tw * 0.12, y - size * 0.55, size * 0.22, 1);
  bat(g, x0 + tw * 0.86, y - size * 0.62, size * 0.16, 0.6);
  // three candies under the word
  const mini = size * 0.2;
  [HALLOWEEN_COLORS[RED], HALLOWEEN_COLORS[BLUE], HALLOWEEN_COLORS[PURPLE]].forEach((c, k) => {
    candy(g, w / 2 - mini * 1.9 + k * mini * 1.3, y + size * 0.72, mini, mini, c, { plain: true });
  });
}

function menuFrame(g: Ctx, w: number, h: number): void {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, rgba(NIGHT, 0.6));
  grad.addColorStop(1, rgba(BG, 0.97));
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  g.fillStyle = rgba(PUMPKIN, 0.5);
  g.fillRect(0, 0, w, 2);
}

// ---------------------------------------------------------------------------
// Backdrop and furniture
// ---------------------------------------------------------------------------

export function drawHalloweenWell(g: Ctx, x: number, y: number, w: number, h: number): void {
  const r = Math.min(w, h) * 0.2;
  roundRect(g, x, y, w, h, r);
  g.fillStyle = "rgba(0,0,0,0.35)";
  g.fill();
  g.lineWidth = 1;
  g.strokeStyle = rgba(PUMPKIN, 0.25);
  roundRect(g, x + 0.5, y + 0.5, w - 1, h - 1, r);
  g.stroke();
}

/** The cauldron: black iron trough with a green glow licking the rim. */
export function drawHalloweenTray(g: Ctx, x: number, y: number, w: number, h: number): void {
  g.save();
  g.shadowColor = rgba(SLIME, 0.45);
  g.shadowBlur = 18;
  roundRect(g, x, y, w, h, 14);
  g.fillStyle = "#17121C";
  g.fill();
  g.restore();
  roundRect(g, x + 3, y + 3, w - 6, h - 6, 11);
  g.fillStyle = "#0E0A12";
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = rgba(SLIME, 0.5);
  roundRect(g, x, y, w, h, 14);
  g.stroke();
  g.fillStyle = "rgba(255,255,255,0.08)";
  g.fillRect(x + 14, y + 2, w - 28, 1);
}

/**
 * Night sky with a glowing moon, stars, bats on slow loops, black hills and
 * a band of fog; with a layout a dark slab under the grid, candy-dark wells
 * and the cauldron.
 */
export function drawHalloweenBackdrop(g: Ctx, t: number, l?: Layout, flare = 0): void {
  const sr = screenRect();
  const sky = g.createLinearGradient(0, 0, 0, sr.h);
  sky.addColorStop(0, BG);
  sky.addColorStop(1, NIGHT);
  fillScreen(g, sky);
  const rnd = seeded(5);
  for (let i = 0; i < 50; i++) {
    const x = rnd() * sr.w;
    const y = rnd() * sr.h * 0.7;
    const tw = 0.4 + 0.6 * Math.max(0, Math.sin(t / 700 + rnd() * 6));
    g.fillStyle = `rgba(255,240,220,${0.5 * tw})`;
    g.fillRect(x, y, 1.5, 1.5);
  }
  // moon
  const mx = sr.w * 0.82;
  const my = sr.h * 0.2;
  const mr = Math.min(sr.w, sr.h) * 0.11;
  const glow = g.createRadialGradient(mx, my, mr * 0.8, mx, my, mr * 3);
  glow.addColorStop(0, `rgba(255,230,160,${0.25 + flare * 0.45})`);
  glow.addColorStop(1, "rgba(255,230,160,0)");
  g.fillStyle = glow;
  g.fillRect(mx - mr * 3, my - mr * 3, mr * 6, mr * 6);
  g.beginPath();
  g.arc(mx, my, mr, 0, Math.PI * 2);
  g.fillStyle = "#FFE9A8";
  g.fill();
  g.fillStyle = "rgba(200,170,110,0.35)";
  for (const [ox, oy, orr] of [
    [-0.3, -0.2, 0.18],
    [0.25, 0.1, 0.12],
    [-0.05, 0.4, 0.1],
    [0.35, -0.4, 0.08],
  ]) {
    g.beginPath();
    g.arc(mx + ox * mr, my + oy * mr, orr * mr, 0, Math.PI * 2);
    g.fill();
  }
  // bats
  g.fillStyle = INK;
  for (let i = 0; i < 5; i++) {
    const ph = (t / (14000 + i * 2300) + i * 0.37) % 1;
    const x = sr.w * (ph * 1.3 - 0.15);
    const y = sr.h * (0.12 + 0.25 * Math.sin(ph * Math.PI * 2 + i)) + Math.sin(t / 300 + i) * 4;
    bat(g, x, y, 10 + i * 2, 0.5 + 0.5 * Math.sin(t / (120 - flare * 70) + i));
  }
  // hills and fog
  g.fillStyle = "#0B0612";
  g.beginPath();
  g.moveTo(0, sr.h);
  g.lineTo(0, sr.h * 0.82);
  for (let x = 0; x <= sr.w; x += 40) g.lineTo(x, sr.h * 0.82 + Math.sin(x / 140) * 14 + Math.sin(x / 57) * 6);
  g.lineTo(sr.w, sr.h);
  g.closePath();
  g.fill();
  for (let k = 0; k < 3; k++) {
    const fy = sr.h * (0.78 + k * 0.07);
    const fog = g.createLinearGradient(0, fy - 30, 0, fy + 30);
    fog.addColorStop(0, "rgba(180,160,210,0)");
    fog.addColorStop(0.5, `rgba(180,160,210,${0.08 + 0.03 * Math.sin(t / 2000 + k)})`);
    fog.addColorStop(1, "rgba(180,160,210,0)");
    g.fillStyle = fog;
    g.fillRect(0, fy - 30, sr.w, 60);
  }
  if (!l) return;
  const n = l.cellNum;
  const gridBottom = cellY(l, n) - l.cellSep;
  g.save();
  g.shadowColor = "rgba(0,0,0,0.6)";
  g.shadowBlur = 24;
  g.shadowOffsetY = 8;
  roundRect(g, l.boardX - 10, l.boardY - 10, l.boardW + 20, gridBottom - l.boardY + 13, 14);
  g.fillStyle = "rgba(20,10,32,0.92)";
  g.fill();
  g.restore();
  g.lineWidth = 2;
  g.strokeStyle = rgba(PUMPKIN, 0.4);
  roundRect(g, l.boardX - 10, l.boardY - 10, l.boardW + 20, gridBottom - l.boardY + 13, 14);
  g.stroke();
  const pad = l.cellW * 0.04;
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) drawHalloweenWell(g, cellX(l, x) + pad, cellY(l, y) + pad, l.cellW - pad * 2, l.cellH - pad * 2);
  }
  const ry = replenishY(l);
  drawHalloweenTray(g, l.boardX - 8, ry - 8, l.boardW + 16, l.cellH + 16);
}

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------

const slides: SlideStyle = {
  background(g, w, h) {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, BG);
    sky.addColorStop(1, NIGHT);
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    g.fillStyle = rgba(BG, 0.9);
    g.fillRect(0, h * 0.78, w, h * 0.22);
    g.fillStyle = rgba(PUMPKIN, 0.5);
    g.fillRect(0, h * 0.78, w, 2);
  },
  font: FONT,
  display: DISPLAY,
  text: TEXT,
  muted: MUTED,
  bgColor: BG,
  dotIdle: "rgba(255,255,255,0.25)",
  card: CARD,
  cardEdge: rgba(PUMPKIN, 0.6),
  cardShadow: "rgba(0,0,0,0.5)",
  gridLine: "rgba(255,255,255,0.05)",
  well: "rgba(0,0,0,0.35)",
  wellEdge: rgba(PUMPKIN, 0.25),
  track: "rgba(255,255,255,0.14)",
  colors: HALLOWEEN_COLORS,
  inkOn: () => "#FFFFFF",
  tile: (g, x, y, w, h, base, opts) => candy(g, x, y, w, h, base, { radius: opts?.radius, plain: true }),
  glyphs,
  button: pumpkinButton,
};

const SPEC: SkinSpec = {
  colors: HALLOWEEN_COLORS,
  neutral: "#5A4B6B",
  bg: BG,
  text: TEXT,
  muted: MUTED,
  font: FONT,
  display: DISPLAY,
  tile: candy,
  glyphs,
  button: pumpkinButton,
  panel,
  logo,
  menuFrame,
  worldText: "#FFFFFF",
  worldTextShadow: "rgba(0,0,0,0.5)",
  shadow: "rgba(0,0,0,0.6)",
  glow: false,
  selector: "glow",
  selectorNeutral: TEXT,
  progress: [PUMPKIN, "#8B3FD9"],
  pop(g, t, w, h) {
    g.globalAlpha = 1 - t;
    g.fillStyle = SLIME;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const d = w * (0.1 + t * 0.4);
      g.beginPath();
      g.arc(w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d, 2 + 2.5 * (1 - t), 0, Math.PI * 2);
      g.fill();
    }
  },
  mute: HALLOWEEN_COLORS[RED],
  well: drawHalloweenWell,
  slides,
};

export function buildHalloweenSprites(classic: SpriteMap): SpriteMap {
  return buildSkin(classic, SPEC);
}

