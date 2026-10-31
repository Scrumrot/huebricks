import { BLUE, RED, YELLOW, type Color } from "../core/color";
import type { Layout } from "../core/layout";
import { cellX, cellY, replenishY } from "../core/layout";
import type { SpriteMap } from "./assets";
import { rgba, roundRect, shade, type Ctx } from "./modernSkin";
import type { SlideStyle } from "./modernSlides";
import { buildSkin, makeGlyphs, seeded, type ButtonFn, type SkinSpec, type TileFn } from "./skinKit";
import { fillScreen, screenRect } from "./view";
import type { TitleFx } from "./backdrops";

/**
 * "Winter": coloured ice cubes with a cap of snow, on a bright snowy day.
 * Snowball buttons, snow falling over distant hills and pines, a frosted
 * glass slab under the grid and an ice shelf whose sockets fill with
 * meltwater as the next cube freezes.
 */

export const FONT = 'Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
export const DISPLAY = 'Outfit, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const BG = "#DCEBF7";
export const SKY = "#BFDCF2";
export const SNOW = "#FFFFFF";
export const CARD = "#FFFFFF";
export const TEXT = "#1E3448";
export const MUTED = "#6F8AA3";
export const ICE_EDGE = "#8FC0E8";
export const DEEP = "#3F86E8";
export const PINE = "#2E4A5C";

export const WINTER_COLORS: Record<Color, string> = {
  1: "#E5534B",
  2: "#3F86E8",
  3: "#8E6BE0",
  4: "#F0C94A",
  5: "#F0914A",
  6: "#3FBF8A",
  7: "#2B3240",
};

/** Falling snow: dots drift down and sway; seeded so the field is stable between frames. */
/** Points that shove snow aside: the cursor, and a tap for a moment after it lands. */
function snowPushers(t: number, fx: TitleFx | null): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  if (fx?.pointer) out.push([fx.pointer.x, fx.pointer.y, 90]);
  for (const tap of fx?.taps ?? []) {
    const age = t - tap.t;
    if (age < 700) out.push([tap.x, tap.y, 60 + (age / 700) * 160]);
  }
  return out;
}

export function drawSnow(g: Ctx, t: number, w: number, h: number, count = 70, seed = 3, fx: TitleFx | null = null): void {
  const rnd = seeded(seed);
  const pushers = snowPushers(t, fx);
  for (let i = 0; i < count; i++) {
    const sx = rnd() * w;
    const speed = 18 + rnd() * 30;
    const size = 1 + rnd() * 2.2;
    const ph = rnd();
    const sway = rnd() * 20;
    let y = ((ph * h + (t / 1000) * speed) % (h + 20)) - 10;
    let x = sx + Math.sin(t / 1500 + ph * 7) * sway;
    for (const [cx, cy, reach] of pushers) {
      // flakes swirl away from the cursor and burst out from a tap
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.hypot(dx, dy);
      if (d < reach && d > 0.01) {
        const push = ((reach - d) / reach) * 36;
        x += (dx / d) * push;
        y += (dy / d) * push;
      }
    }
    g.fillStyle = `rgba(255,255,255,${0.5 + size * 0.2})`;
    g.beginPath();
    g.arc(x, y, size, 0, Math.PI * 2);
    g.fill();
  }
}

// ---------------------------------------------------------------------------
// Ice cube tile, glyphs, snowball button
// ---------------------------------------------------------------------------

const cube: TileFn = (g, x, y, w, h, base, opts = {}) => {
  const m = Math.min(w, h);
  const r = opts.radius ?? m * 0.16;
  const fill = opts.lift ? shade(base, opts.lift) : base;
  roundRect(g, x, y, w, h, r);
  const grad = g.createLinearGradient(x, y, x + w * 0.3, y + h);
  grad.addColorStop(0, shade(fill, 0.3));
  grad.addColorStop(0.5, fill);
  grad.addColorStop(1, shade(fill, -0.18));
  g.fillStyle = grad;
  g.fill();
  g.save();
  g.clip();
  // frosty inner facets
  g.fillStyle = "rgba(255,255,255,0.22)";
  g.beginPath();
  g.moveTo(x + w * 0.15, y + h);
  g.lineTo(x + w * 0.45, y);
  g.lineTo(x + w * 0.62, y);
  g.lineTo(x + w * 0.32, y + h);
  g.closePath();
  g.fill();
  g.fillStyle = "rgba(255,255,255,0.12)";
  g.beginPath();
  g.moveTo(x + w * 0.7, y + h);
  g.lineTo(x + w * 0.88, y);
  g.lineTo(x + w * 0.98, y);
  g.lineTo(x + w * 0.8, y + h);
  g.closePath();
  g.fill();
  // inner frost edge
  g.lineWidth = m * 0.06;
  g.strokeStyle = "rgba(255,255,255,0.35)";
  roundRect(g, x + m * 0.02, y + m * 0.02, w - m * 0.04, h - m * 0.04, r);
  g.stroke();
  // snow cap along the top, wavy underside
  if (!opts.plain) {
    g.fillStyle = SNOW;
    g.beginPath();
    g.moveTo(x - 2, y - 2);
    g.lineTo(x + w + 2, y - 2);
    g.lineTo(x + w + 2, y + h * 0.16);
    const bumps = 4;
    for (let k = bumps; k >= 0; k--) {
      const bx = x + (w * k) / bumps;
      const depth = k % 2 === 0 ? 0.3 : 0.18;
      g.quadraticCurveTo(bx + w / (bumps * 2), y + h * depth, bx, y + h * 0.16);
    }
    g.closePath();
    g.fill();
    g.fillStyle = "rgba(143,192,232,0.35)";
    g.fillRect(x, y + h * 0.16 - 1, w, 1.5);
  }
  g.restore();
  g.lineWidth = Math.max(1, m * 0.016);
  g.strokeStyle = "rgba(255,255,255,0.8)";
  roundRect(g, x + 0.5, y + 0.5, w - 1, h - 1, r);
  g.stroke();
};

const glyphs = makeGlyphs({ stroke: "#FFFFFF", fill: "rgba(255,255,255,0.35)", shadow: "rgba(30,52,72,0.4)" });

/** A snowball: white sphere shaded blue underneath; pressed squashes it a touch. */
const snowballButton: ButtonFn = (g, w, h, pressed, icon) => {
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * 0.4;
  g.save();
  g.shadowColor = "rgba(30,52,72,0.25)";
  g.shadowBlur = r * 0.3;
  g.shadowOffsetY = r * 0.12;
  g.beginPath();
  g.ellipse(cx, cy + (pressed ? r * 0.04 : 0), r * (pressed ? 1.04 : 1), r * (pressed ? 0.94 : 1), 0, 0, Math.PI * 2);
  const grad = g.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
  grad.addColorStop(0, "#FFFFFF");
  grad.addColorStop(0.7, "#EEF5FB");
  grad.addColorStop(1, "#BBD4EA");
  g.fillStyle = grad;
  g.fill();
  g.restore();
  // a few packed-snow flecks
  g.fillStyle = "rgba(143,192,232,0.3)";
  for (const [ox, oy] of [
    [-0.4, 0.3],
    [0.35, 0.45],
    [0.1, -0.5],
  ]) {
    g.beginPath();
    g.arc(cx + ox * r, cy + oy * r, r * 0.06, 0, Math.PI * 2);
    g.fill();
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
  g.shadowColor = "rgba(30,52,72,0.18)";
  g.shadowBlur = r;
  g.shadowOffsetY = r * 0.3;
  roundRect(g, x, y, w, h, r);
  g.fillStyle = CARD;
  g.fill();
  g.restore();
  g.lineWidth = 2;
  g.strokeStyle = rgba(ICE_EDGE, 0.8);
  roundRect(g, x, y, w, h, r);
  g.stroke();
}

/** "HueBricks" in Outfit, snow white over ice blue, with icicles hanging off the letters. */
function logo(g: Ctx, i: number, w: number, h: number): void {
  const size = h * 0.4;
  g.font = `700 ${size}px ${DISPLAY}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const tw = g.measureText("HueBricks").width;
  const x0 = w / 2 - tw / 2;
  const y = h / 2 - 6;
  g.save();
  g.shadowColor = "rgba(63,134,232,0.45)";
  g.shadowBlur = i === 1 ? 8 : 18;
  g.shadowOffsetY = 4;
  g.lineJoin = "round";
  g.lineWidth = size * 0.1;
  g.strokeStyle = DEEP;
  g.strokeText("HueBricks", w / 2, y);
  g.restore();
  const grad = g.createLinearGradient(0, y - size / 2, 0, y + size / 2);
  grad.addColorStop(0, "#FFFFFF");
  grad.addColorStop(0.6, "#F2F8FF");
  grad.addColorStop(1, "#C7E0F5");
  g.fillStyle = grad;
  g.fillText("HueBricks", w / 2, y);
  // icicles
  const rnd = seeded(23);
  g.fillStyle = "#CFE6F9";
  for (let k = 0; k < 7; k++) {
    const ix = x0 + tw * (0.06 + rnd() * 0.88);
    const iw = size * (0.03 + rnd() * 0.03);
    const il = size * (0.08 + rnd() * 0.16);
    g.beginPath();
    g.moveTo(ix - iw, y + size * 0.3);
    g.lineTo(ix + iw, y + size * 0.3);
    g.lineTo(ix, y + size * 0.3 + il);
    g.closePath();
    g.fill();
  }
  const mini = size * 0.2;
  [WINTER_COLORS[RED], WINTER_COLORS[BLUE], WINTER_COLORS[YELLOW]].forEach((c, k) => {
    cube(g, w / 2 - mini * 1.9 + k * mini * 1.3, y + size * 0.74, mini, mini, c, {});
  });
}

/** Snow bank along the bottom of the title screen. */
function menuFrame(g: Ctx, w: number, h: number): void {
  g.fillStyle = "rgba(143,192,232,0.35)";
  g.fillRect(0, 0, w, h);
  g.fillStyle = SNOW;
  g.beginPath();
  g.moveTo(0, h);
  g.lineTo(0, 14);
  for (let x = 0; x <= w; x += 20) g.lineTo(x, 10 + Math.sin(x / 60) * 5 + Math.sin(x / 23) * 2);
  g.lineTo(w, h);
  g.closePath();
  g.fill();
  g.fillStyle = "rgba(143,192,232,0.25)";
  g.fillRect(0, h - 3, w, 3);
}

// ---------------------------------------------------------------------------
// Backdrop and furniture
// ---------------------------------------------------------------------------

export function drawWinterWell(g: Ctx, x: number, y: number, w: number, h: number): void {
  const r = Math.min(w, h) * 0.16;
  roundRect(g, x, y, w, h, r);
  g.fillStyle = "rgba(143,192,232,0.22)";
  g.fill();
  g.lineWidth = 1;
  g.strokeStyle = rgba(ICE_EDGE, 0.6);
  roundRect(g, x + 0.5, y + 0.5, w - 1, h - 1, r);
  g.stroke();
}

/** The ice shelf: pale blue slab with a white rim and a cold shadow. */
export function drawWinterTray(g: Ctx, x: number, y: number, w: number, h: number): void {
  g.save();
  g.shadowColor = "rgba(30,52,72,0.2)";
  g.shadowBlur = 12;
  g.shadowOffsetY = 4;
  roundRect(g, x, y, w, h, 12);
  g.fillStyle = "#EAF4FB";
  g.fill();
  g.restore();
  roundRect(g, x + 3, y + 3, w - 6, h - 6, 9);
  g.fillStyle = "#D4E7F6";
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = "#FFFFFF";
  roundRect(g, x, y, w, h, 12);
  g.stroke();
}

/** Winter sky, snowy hills, a few pines, falling snow; with a layout the frosted slab, wells and shelf. */
export function drawWinterBackdrop(g: Ctx, t: number, l?: Layout, flare = 0, fx: TitleFx | null = null): void {
  const sr = screenRect();
  const sky = g.createLinearGradient(0, 0, 0, sr.h);
  sky.addColorStop(0, SKY);
  sky.addColorStop(1, BG);
  fillScreen(g, sky);
  // low sun glow
  const glow = g.createRadialGradient(sr.w * 0.2, sr.h * 0.15, 0, sr.w * 0.2, sr.h * 0.15, sr.w * 0.35);
  glow.addColorStop(0, `rgba(255,255,255,${0.5 + flare * 0.45})`);
  glow.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, sr.w, sr.h);
  // hills
  for (const [k, yy, col] of [
    [0.7, 0.72, "#EEF5FB"],
    [1.1, 0.8, "#F7FBFE"],
  ] as const) {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(0, sr.h);
    g.lineTo(0, sr.h * yy);
    for (let x = 0; x <= sr.w; x += 30) g.lineTo(x, sr.h * yy + Math.sin((x / 160) * k) * 16 + Math.sin(x / 61) * 5);
    g.lineTo(sr.w, sr.h);
    g.closePath();
    g.fill();
  }
  // pines along the far hill
  g.fillStyle = PINE;
  const rnd = seeded(41);
  for (let i = 0; i < 9; i++) {
    const px = rnd() * sr.w;
    const ph = 18 + rnd() * 22;
    const py = sr.h * 0.72 + Math.sin((px / 160) * 0.7) * 16 + Math.sin(px / 61) * 5 + 4;
    for (let tier = 0; tier < 3; tier++) {
      const tw = ph * (0.5 - tier * 0.12);
      const ty = py - tier * ph * 0.28;
      g.beginPath();
      g.moveTo(px - tw, ty);
      g.lineTo(px, ty - ph * 0.5);
      g.lineTo(px + tw, ty);
      g.closePath();
      g.fill();
    }
  }
  drawSnow(g, t, sr.w, sr.h, 70, 3, fx);
  if (flare > 0) {
    // a flurry kicked up by the level clear
    g.globalAlpha = flare;
    drawSnow(g, t * 4, sr.w, sr.h, 90, 5);
    g.globalAlpha = 1;
  }
  if (!l) return;
  const n = l.cellNum;
  const gridBottom = cellY(l, n) - l.cellSep;
  g.save();
  g.shadowColor = "rgba(30,52,72,0.2)";
  g.shadowBlur = 20;
  g.shadowOffsetY = 6;
  roundRect(g, l.boardX - 10, l.boardY - 10, l.boardW + 20, gridBottom - l.boardY + 13, 14);
  g.fillStyle = "rgba(255,255,255,0.7)";
  g.fill();
  g.restore();
  g.lineWidth = 2;
  g.strokeStyle = "#FFFFFF";
  roundRect(g, l.boardX - 10, l.boardY - 10, l.boardW + 20, gridBottom - l.boardY + 13, 14);
  g.stroke();
  const pad = l.cellW * 0.04;
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) drawWinterWell(g, cellX(l, x) + pad, cellY(l, y) + pad, l.cellW - pad * 2, l.cellH - pad * 2);
  }
  const ry = replenishY(l);
  drawWinterTray(g, l.boardX - 8, ry - 8, l.boardW + 16, l.cellH + 16);
}

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------

const slides: SlideStyle = {
  background(g, w, h) {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, SKY);
    sky.addColorStop(1, BG);
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    drawSnow(g, 0, w, h, 40, 9);
    g.fillStyle = SNOW;
    g.fillRect(0, h * 0.78, w, h * 0.22);
    g.fillStyle = "rgba(143,192,232,0.35)";
    g.fillRect(0, h * 0.78, w, 2);
  },
  font: FONT,
  display: DISPLAY,
  text: TEXT,
  muted: MUTED,
  bgColor: BG,
  dotIdle: rgba(TEXT, 0.25),
  card: CARD,
  cardEdge: rgba(ICE_EDGE, 0.8),
  cardShadow: "rgba(30,52,72,0.18)",
  gridLine: rgba(ICE_EDGE, 0.3),
  well: "rgba(143,192,232,0.22)",
  wellEdge: rgba(ICE_EDGE, 0.6),
  track: rgba(TEXT, 0.12),
  colors: WINTER_COLORS,
  inkOn: () => "#FFFFFF",
  tile: (g, x, y, w, h, base, opts) => cube(g, x, y, w, h, base, { radius: opts?.radius, plain: true }),
  glyphs,
  button: snowballButton,
};

const SPEC: SkinSpec = {
  colors: WINTER_COLORS,
  neutral: "#9FB6CC",
  bg: BG,
  text: TEXT,
  muted: MUTED,
  font: FONT,
  display: DISPLAY,
  tile: cube,
  glyphs,
  button: snowballButton,
  panel,
  logo,
  menuFrame,
  worldText: "#FFFFFF",
  worldTextShadow: "rgba(30,52,72,0.5)",
  shadow: "rgba(30,52,72,0.45)",
  glow: false,
  selector: "ink",
  selectorNeutral: TEXT,
  progress: ["#FFFFFF", DEEP],
  pop(g, t, w, h) {
    g.globalAlpha = 1 - t;
    g.fillStyle = "#FFFFFF";
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.3;
      const d = w * (0.1 + t * 0.4);
      g.beginPath();
      g.arc(w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d, 1.5 + 2.5 * (1 - t), 0, Math.PI * 2);
      g.fill();
    }
  },
  mute: WINTER_COLORS[RED],
  well: drawWinterWell,
  slides,
};

export function buildWinterSprites(classic: SpriteMap): SpriteMap {
  return buildSkin(classic, SPEC);
}
