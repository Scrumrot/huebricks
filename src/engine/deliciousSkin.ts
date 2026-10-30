import { BLACK, BLUE, GREEN, ORANGE, PURPLE, RED, YELLOW, type Color } from "../core/color";
import type { Layout } from "../core/layout";
import { cellX, cellY, replenishY } from "../core/layout";
import { SPRITE_FRAMES, type Sprite, type SpriteMap, type SpriteName } from "./assets";
import { chevronUp, gearIcon, polygon, rgba, rotateIcon, roundRect, shade, speakerIcon, sprite, text, type Ctx } from "./modernSkin";
import { buildTutorialSlides, type SlideStyle } from "./modernSlides";
import { fillScreen, screenRect } from "./view";

/**
 * "Delicious": frosted tarts on a bakery counter. Every brick is a square
 * tart with a fluted golden crust, a glossy fruit-coloured filling, white
 * piped-icing glyphs and a scatter of sprinkles. Buttons are macarons, the
 * mode buttons are glazed eclairs, the board sits on a gingham cloth and the
 * replenish line waits on a baking tray.
 */

export const FONT = 'Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
export const DISPLAY = 'Fredoka, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const CREAM = "#FFF4EA";
export const GINGHAM = "#F4C9D3";
export const COCOA = "#4A2E2A";
export const MUTED = "#A07E74";
export const CARD = "#FFFBF6";
export const CRUST = "#DDA76C";
export const CRUST_DARK = "#B97B3F";
export const CRUST_LIGHT = "#F3CF98";
export const BISCUIT = "#E3C9A6";
export const PINK = "#F29AB2";
export const PINK_DARK = "#D9748E";
export const FILLING = "#FFF1E3";
export const TRAY = "#D6D8DD";
export const TRAY_RIM = "#A6A9B2";

/** Filling colours by colour bits: strawberry, blueberry, blackberry, lemon, apricot, pistachio, chocolate. */
export const DELICIOUS_COLORS: Record<Color, string> = {
  1: "#E8445A",
  2: "#4A7BE0",
  3: "#8E5BD6",
  4: "#F5C542",
  5: "#F28C3A",
  6: "#4FBF7A",
  7: "#3A2A28",
};

const NOICON_COLORS = [
  DELICIOUS_COLORS[1],
  DELICIOUS_COLORS[2],
  DELICIOUS_COLORS[3],
  DELICIOUS_COLORS[4],
  DELICIOUS_COLORS[5],
  DELICIOUS_COLORS[6],
  DELICIOUS_COLORS[7],
  BISCUIT,
];

/** Sprinkle colours: sugar white, pink, lemon, mint. */
const SPRINKLES = ["#FFFFFF", "#F7A9C4", "#FFE27A", "#9DE3C1"];

function seeded(seed: number): () => number {
  let s = (seed * 9301 + 49297) % 233280;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

// ---------------------------------------------------------------------------
// Pastry
// ---------------------------------------------------------------------------

/** Golden crust gradient: lighter at the top, baked darker at the bottom. */
function crustFill(g: Ctx, y: number, h: number): CanvasGradient {
  const grad = g.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, CRUST_LIGHT);
  grad.addColorStop(0.5, CRUST);
  grad.addColorStop(1, CRUST_DARK);
  return grad;
}

/**
 * A fluted crust ring: the outer rounded square in crust gradient, a ring of
 * little scallops just inside the edge, and a baked-dark outline.
 */
function crust(g: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const m = Math.min(w, h);
  roundRect(g, x, y, w, h, r);
  g.fillStyle = crustFill(g, y, h);
  g.fill();
  // scallops along each edge
  const bump = m * 0.055;
  const inset = m * 0.07;
  const per = Math.max(3, Math.round(m / (bump * 2.6)));
  g.fillStyle = rgba(CRUST_DARK, 0.35);
  for (let i = 0; i < per; i++) {
    const t = (i + 0.5) / per;
    const px = x + r * 0.6 + t * (w - r * 1.2);
    const py = y + r * 0.6 + t * (h - r * 1.2);
    for (const [cx, cy] of [
      [px, y + inset],
      [px, y + h - inset],
      [x + inset, py],
      [x + w - inset, py],
    ]) {
      g.beginPath();
      g.arc(cx, cy, bump, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.lineWidth = Math.max(1, m * 0.018);
  g.strokeStyle = rgba(CRUST_DARK, 0.9);
  roundRect(g, x, y, w, h, r);
  g.stroke();
}

export interface TartOptions {
  radius?: number;
  /** Sprinkle scatter seed; 0 means no sprinkles. */
  seed?: number;
  /** Lighter filling, for hover / pressed frames. */
  lift?: number;
}

/**
 * A square tart: fluted crust around a glossy filling with a jam-dark rim,
 * a soft highlight at the top-left and a few sprinkles.
 */
export function tart(g: Ctx, x: number, y: number, w: number, h: number, base: string, opts: TartOptions = {}): void {
  const m = Math.min(w, h);
  const r = opts.radius ?? m * 0.2;
  crust(g, x, y, w, h, r);
  const inset = m * 0.14;
  const fx = x + inset;
  const fy = y + inset;
  const fw = w - inset * 2;
  const fh = h - inset * 2;
  const fr = Math.max(2, r * 0.6);
  const fill = opts.lift ? shade(base, opts.lift) : base;
  // jam-dark rim where the filling meets the crust
  roundRect(g, fx, fy, fw, fh, fr);
  g.fillStyle = shade(fill, -0.3);
  g.fill();
  const rim = Math.max(1, m * 0.02);
  roundRect(g, fx + rim, fy + rim, fw - rim * 2, fh - rim * 2, fr);
  const grad = g.createLinearGradient(fx, fy, fx + fw * 0.4, fy + fh);
  grad.addColorStop(0, shade(fill, 0.18));
  grad.addColorStop(0.55, fill);
  grad.addColorStop(1, shade(fill, -0.12));
  g.fillStyle = grad;
  g.fill();
  g.save();
  g.clip();
  // glossy highlight
  const hl = g.createRadialGradient(fx + fw * 0.3, fy + fh * 0.25, 0, fx + fw * 0.3, fy + fh * 0.25, fw * 0.5);
  hl.addColorStop(0, "rgba(255,255,255,0.45)");
  hl.addColorStop(0.5, "rgba(255,255,255,0.1)");
  hl.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = hl;
  g.fillRect(fx, fy, fw, fh);
  // sprinkles
  const seed = opts.seed ?? 1;
  if (seed) {
    const rnd = seeded(seed);
    const n = 7 + Math.floor(rnd() * 4);
    const len = m * 0.075;
    const thick = m * 0.03;
    for (let i = 0; i < n; i++) {
      const sx = fx + fw * (0.1 + rnd() * 0.8);
      const sy = fy + fh * (0.1 + rnd() * 0.8);
      const a = rnd() * Math.PI;
      g.save();
      g.translate(sx, sy);
      g.rotate(a);
      g.fillStyle = SPRINKLES[Math.floor(rnd() * SPRINKLES.length)];
      roundRect(g, -len / 2, -thick / 2, len, thick, thick / 2);
      g.fill();
      g.restore();
    }
  }
  g.restore();
}

/** Cream card with a crust-coloured edge, for overlays, slides and menus. */
export function pastryCard(g: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  g.save();
  g.shadowColor = "rgba(120,70,40,0.18)";
  g.shadowBlur = r;
  g.shadowOffsetY = r * 0.3;
  roundRect(g, x, y, w, h, r);
  g.fillStyle = CARD;
  g.fill();
  g.restore();
  g.lineWidth = 2;
  g.strokeStyle = rgba(CRUST, 0.7);
  roundRect(g, x, y, w, h, r);
  g.stroke();
}

// ---------------------------------------------------------------------------
// Glyphs: white piped icing
// ---------------------------------------------------------------------------

type Glyph = "octagon" | "diamond" | "circle";

const GLYPHS: Record<Color, Glyph[]> = {
  1: ["octagon"],
  2: ["diamond"],
  3: ["diamond", "octagon"],
  4: ["circle"],
  5: ["octagon", "circle"],
  6: ["circle", "diamond"],
  7: ["octagon", "diamond", "circle"],
};

function glyphPath(g: Ctx, glyph: Glyph, cx: number, cy: number, r: number): void {
  switch (glyph) {
    case "octagon":
      polygon(g, cx, cy, r, 8, Math.PI / 8);
      break;
    case "diamond":
      polygon(g, cx, cy, r, 4, 0);
      break;
    case "circle":
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      break;
  }
}

/** Thick white icing lines with a little relief shadow; innermost shape filled on mixes. */
export function drawDeliciousGlyphs(g: Ctx, color: Color, cx: number, cy: number, size: number): void {
  const glyphs = GLYPHS[color];
  const radii = glyphs.length === 1 ? [0.24] : glyphs.length === 2 ? [0.27, 0.15] : [0.28, 0.18, 0.09];
  g.save();
  g.lineJoin = "round";
  g.lineCap = "round";
  // relief: a darker pass offset down-right
  g.lineWidth = size * 0.05;
  g.strokeStyle = "rgba(0,0,0,0.18)";
  glyphs.forEach((gl, i) => {
    glyphPath(g, gl, cx + size * 0.012, cy + size * 0.016, size * radii[i]);
    g.stroke();
  });
  g.strokeStyle = "#FFFFFF";
  g.fillStyle = "rgba(255,255,255,0.9)";
  glyphs.forEach((gl, i) => {
    glyphPath(g, gl, cx, cy, size * radii[i]);
    if (glyphs.length > 1 && i === glyphs.length - 1) g.fill();
    g.stroke();
  });
  // a sugar sheen along the top of the icing
  g.lineWidth = size * 0.016;
  g.strokeStyle = "rgba(255,255,255,0.6)";
  glyphs.forEach((gl, i) => {
    glyphPath(g, gl, cx - size * 0.006, cy - size * 0.01, size * radii[i]);
    g.stroke();
  });
  g.restore();
}

// ---------------------------------------------------------------------------
// Buttons: macarons
// ---------------------------------------------------------------------------

/** A pink macaron seen from the front: two shells with a cream filling; pressed squashes the top shell down. */
export function macaronButton(g: Ctx, w: number, h: number, pressed: boolean, icon: (g: Ctx, cx: number, cy: number, r: number) => void): void {
  const cx = w / 2;
  const r = Math.min(w, h) * 0.4;
  const gap = r * (pressed ? 0.08 : 0.16);
  const cy = h / 2;
  const shell = (y: number, color: string) => {
    g.beginPath();
    g.ellipse(cx, y, r, r * 0.92, 0, 0, Math.PI * 2);
    g.fillStyle = color;
    g.fill();
  };
  // soft ground shadow
  g.save();
  g.shadowColor = "rgba(120,70,40,0.25)";
  g.shadowBlur = r * 0.25;
  g.shadowOffsetY = r * 0.1;
  shell(cy + gap, PINK_DARK);
  g.restore();
  // ruffled "feet" of the bottom shell
  g.fillStyle = shade(PINK_DARK, -0.15);
  for (let i = -3; i <= 3; i++) {
    g.beginPath();
    g.arc(cx + i * r * 0.27, cy + gap * 0.5, r * 0.12, 0, Math.PI * 2);
    g.fill();
  }
  // filling band
  g.beginPath();
  g.ellipse(cx, cy, r * 0.96, r * 0.5, 0, 0, Math.PI * 2);
  g.fillStyle = FILLING;
  g.fill();
  // top shell
  shell(cy - gap, PINK);
  const hl = g.createRadialGradient(cx - r * 0.3, cy - gap - r * 0.4, 0, cx - r * 0.3, cy - gap - r * 0.4, r * 0.9);
  hl.addColorStop(0, "rgba(255,255,255,0.4)");
  hl.addColorStop(1, "rgba(255,255,255,0)");
  g.beginPath();
  g.ellipse(cx, cy - gap, r, r * 0.92, 0, 0, Math.PI * 2);
  g.fillStyle = hl;
  g.fill();
  g.save();
  g.strokeStyle = COCOA;
  g.fillStyle = COCOA;
  g.lineWidth = r * 0.13;
  g.lineCap = "round";
  g.lineJoin = "round";
  icon(g, cx, cy - gap, r);
  g.restore();
}

// ---------------------------------------------------------------------------
// Backdrop
// ---------------------------------------------------------------------------

/** Cream cloth with a pale pink gingham check. */
export function drawGingham(g: Ctx, x: number, y: number, w: number, h: number, pitch = 20): void {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = CREAM;
  g.fillRect(x, y, w, h);
  g.fillStyle = rgba(GINGHAM, 0.3);
  const band = pitch * 0.5;
  for (let gx = x - (x % (pitch * 2)); gx < x + w; gx += pitch * 2) g.fillRect(gx, y, band, h);
  for (let gy = y - (y % (pitch * 2)); gy < y + h; gy += pitch * 2) g.fillRect(x, gy, w, band);
  g.restore();
}

/**
 * Gingham cloth, a soft warm vignette, paper tart cases in every board cell
 * and a baking tray under the replenish line.
 */
export function drawDeliciousBackdrop(g: Ctx, t: number, l?: Layout): void {
  fillScreen(g, CREAM);
  const sr = screenRect();
  drawGingham(g, 0, 0, sr.w, sr.h);
  const cx = sr.w / 2 + 12 * Math.sin((t / 24000) * Math.PI * 2);
  const cy = sr.h / 2;
  const vig = g.createRadialGradient(cx, cy, Math.min(sr.w, sr.h) * 0.35, cx, cy, Math.max(sr.w, sr.h) * 0.75);
  vig.addColorStop(0, "rgba(255,236,220,0)");
  vig.addColorStop(1, "rgba(240,200,190,0.5)");
  g.fillStyle = vig;
  g.fillRect(0, 0, sr.w, sr.h);
  if (!l) return;
  const n = l.cellNum;
  const pad = l.cellW * 0.04;
  // board: a parchment sheet under the grid
  const gridBottom = cellY(l, n) - l.cellSep;
  g.save();
  g.shadowColor = "rgba(120,70,40,0.15)";
  g.shadowBlur = 14;
  g.shadowOffsetY = 4;
  roundRect(g, l.boardX - 10, l.boardY - 10, l.boardW + 20, gridBottom - l.boardY + 13, 14);
  g.fillStyle = "#FFF9F1";
  g.fill();
  g.restore();
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) drawTartCase(g, cellX(l, x) + pad, cellY(l, y) + pad, l.cellW - pad * 2, l.cellH - pad * 2);
  }
  // baking tray under the replenish line
  const ry = replenishY(l);
  drawBakingTray(g, l.boardX - 8, ry - 8, l.boardW + 16, l.cellH + 16);
}

/** An empty paper tart case: pale, fluted, slightly sunk. */
export function drawTartCase(g: Ctx, x: number, y: number, w: number, h: number): void {
  const m = Math.min(w, h);
  const r = m * 0.2;
  roundRect(g, x, y, w, h, r);
  g.fillStyle = "#F7E6D8";
  g.fill();
  g.lineWidth = 1;
  g.strokeStyle = rgba(CRUST, 0.45);
  g.stroke();
  // fluting
  g.strokeStyle = rgba(CRUST, 0.22);
  const per = 6;
  g.beginPath();
  for (let i = 1; i < per; i++) {
    const t = i / per;
    const px = x + r * 0.5 + t * (w - r);
    const py = y + r * 0.5 + t * (h - r);
    g.moveTo(px, y + m * 0.04);
    g.lineTo(px, y + m * 0.1);
    g.moveTo(px, y + h - m * 0.04);
    g.lineTo(px, y + h - m * 0.1);
    g.moveTo(x + m * 0.04, py);
    g.lineTo(x + m * 0.1, py);
    g.moveTo(x + w - m * 0.04, py);
    g.lineTo(x + w - m * 0.1, py);
  }
  g.stroke();
}

/** A silver baking tray with a rolled rim and a soft shadow. */
export function drawBakingTray(g: Ctx, x: number, y: number, w: number, h: number): void {
  g.save();
  g.shadowColor = "rgba(120,70,40,0.22)";
  g.shadowBlur = 12;
  g.shadowOffsetY = 4;
  roundRect(g, x, y, w, h, 10);
  g.fillStyle = TRAY_RIM;
  g.fill();
  g.restore();
  const grad = g.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, "#E6E7EB");
  grad.addColorStop(1, TRAY);
  roundRect(g, x + 4, y + 4, w - 8, h - 8, 7);
  g.fillStyle = grad;
  g.fill();
  g.lineWidth = 1;
  g.strokeStyle = "rgba(255,255,255,0.7)";
  roundRect(g, x + 1.5, y + 1.5, w - 3, h - 3, 9);
  g.stroke();
}

// ---------------------------------------------------------------------------
// Sprite builders
// ---------------------------------------------------------------------------

const S = 256;
const PAD = 0.04;

function buildBricks(): Sprite {
  return sprite("brick_sprite", S, S, (g, i, w, h) => {
    const color = (i + 1) as Color;
    const pad = w * PAD;
    tart(g, pad, pad, w - pad * 2, h - pad * 2, DELICIOUS_COLORS[color], { seed: 11 + i * 7 });
    drawDeliciousGlyphs(g, color, w / 2, h / 2, w);
  });
}

function buildNoIcon(): Sprite {
  return sprite("brick_noicon_sprite", S, S, (g, i, w, h) => {
    const pad = w * PAD;
    tart(g, pad, pad, w - pad * 2, h - pad * 2, NOICON_COLORS[i], { seed: 31 + i * 5 });
  });
}

function buildSoftShadow(): Sprite {
  return sprite("brick_shadow_sprite", S, S, (g, _i, w, h) => {
    const pad = w * 0.14;
    g.shadowColor = "rgba(120,70,40,0.5)";
    g.shadowBlur = w * 0.12;
    g.shadowOffsetX = w * 4;
    g.fillStyle = "#000";
    roundRect(g, pad - w * 4, pad, w - pad * 2, h - pad * 2, w * 0.18);
    g.fill();
  });
}

function buildBorder(): Sprite {
  return sprite("brick_border_sprite", S, S, (g, _i, w, h) => {
    const pad = w * 0.05;
    g.lineWidth = w * 0.05;
    g.strokeStyle = "#FFFFFF";
    roundRect(g, pad, pad, w - pad * 2, h - pad * 2, w * 0.2);
    g.stroke();
  });
}

/** A burst of sprinkles flying outward and fading. */
function buildPop(): Sprite {
  const n = SPRITE_FRAMES.brick_pop_sprite;
  return sprite("brick_pop_sprite", 64, 64, (g, i, w, h) => {
    const t = i / (n - 1);
    const rnd = seeded(5);
    g.globalAlpha = 1 - t;
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + rnd() * 0.4;
      const d = w * (0.12 + t * 0.38);
      g.save();
      g.translate(w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d);
      g.rotate(a + rnd() * 2);
      g.fillStyle = SPRINKLES[k % SPRINKLES.length];
      roundRect(g, -3, -1.2, 6, 2.4, 1.2);
      g.fill();
      g.restore();
    }
  });
}

function blank(name: SpriteName): Sprite {
  return sprite(name, 8, 8, () => undefined);
}

/** Piped icing ring in the brick's colour with a white sugar edge; frame 7 is cocoa. */
function buildSelector(): Sprite {
  return sprite("replenish_selector_sprite", S, S, (g, i, w, h) => {
    const colour = i < 7 ? DELICIOUS_COLORS[(i + 1) as Color] : COCOA;
    const pad = w * 0.03;
    const lw = w * 0.05;
    g.lineJoin = "round";
    g.lineWidth = lw * 1.6;
    g.strokeStyle = "#FFFFFF";
    roundRect(g, pad + lw / 2, pad + lw / 2, w - pad * 2 - lw, h - pad * 2 - lw, w * 0.2);
    g.stroke();
    g.lineWidth = lw;
    g.strokeStyle = colour;
    g.stroke();
    if (i < 7) {
      g.fillStyle = rgba(colour, 0.1);
      g.fill();
    }
  });
}

function buildReplenishFrame(): Sprite {
  return sprite("replenish_frame_sprite", S, S, (g, _i, w, h) => {
    const pad = w * 0.06;
    drawTartCase(g, pad, pad, w - pad * 2, h - pad * 2);
  });
}

function buildFlat(name: SpriteName): Sprite {
  return sprite(name, 16, 16, (g, _i, w, h) => {
    g.fillStyle = CREAM;
    g.fillRect(0, 0, w, h);
  });
}

function buildRotate(): Sprite {
  return sprite("rotate_button_sprite", S, S, (g, i, w, h) => {
    macaronButton(g, w, h, i % 2 === 1, (gg, cx, cy, r) => rotateIcon(gg, cx, cy, r, i >= 2));
  });
}

function buildPause(): Sprite {
  return sprite("pause_button_sprite", S, S, (g, _i, w, h) => {
    macaronButton(g, w, h, false, (gg, cx, cy, r) => {
      const bw = r * 0.16;
      const bh = r * 0.6;
      roundRect(gg, cx - bw * 1.6, cy - bh / 2, bw, bh, bw / 3);
      gg.fill();
      roundRect(gg, cx + bw * 0.6, cy - bh / 2, bw, bh, bw / 3);
      gg.fill();
    });
  });
}

function buildSpeed(): Sprite {
  return sprite("speedup_button_sprite", S, S, (g, i, w, h) => macaronButton(g, w, h, i === 1, chevronUp));
}

function buildSound(): Sprite {
  return sprite("sound_button_sprite", S, S, (g, i, w, h) => {
    const muted = i >= 2;
    macaronButton(g, w, h, i % 2 === 1, (gg, cx, cy, r) => {
      if (muted) {
        gg.fillStyle = rgba(COCOA, 0.45);
        gg.strokeStyle = gg.fillStyle;
      }
      if (muted) gg.strokeStyle = DELICIOUS_COLORS[RED];
      speakerIcon(gg, cx, cy, r, muted);
    });
  });
}

function buildSettings(): Sprite {
  return sprite("settings_button_sprite", S, S, (g, i, w, h) => macaronButton(g, w, h, i === 1, gearIcon));
}

function buildBack(): Sprite {
  return sprite("back_button_sprite", S, S, (g, i, w, h) => {
    const right = i >= 2;
    macaronButton(g, w, h, i % 2 === 1, (gg, cx, cy, r) => {
      const d = right ? 1 : -1;
      const s = r * 0.42;
      gg.beginPath();
      gg.moveTo(cx - d * s * 0.9, cy);
      gg.lineTo(cx + d * s * 0.9, cy);
      gg.stroke();
      gg.beginPath();
      gg.moveTo(cx + d * s * 0.1, cy - s * 0.8);
      gg.lineTo(cx + d * s * 0.9, cy);
      gg.lineTo(cx + d * s * 0.1, cy + s * 0.8);
      gg.stroke();
    });
  });
}

function buildInfo(): Sprite {
  return sprite("info_button_sprite", S, S, (g, i, w, h) => {
    macaronButton(g, w, h, i === 1, (gg, cx, cy, r) => text(gg, "i", cx, cy + r * 0.04, r * 1.2, COCOA, 700, "center", DISPLAY));
  });
}

function buildProgress(): Sprite {
  return sprite("progressbar_sprite", 256, 8, (g, i, w, h) => {
    if (i === 2) {
      g.fillStyle = rgba(COCOA, 0.1);
      g.fillRect(0, 0, w, h);
    } else if (i === 1) {
      g.fillStyle = rgba(COCOA, 0.22);
      g.fillRect(0, 0, w, h);
    } else {
      const grad = g.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, PINK);
      grad.addColorStop(1, DELICIOUS_COLORS[RED]);
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
    }
  });
}

function buildLevelComplete(): Sprite {
  return sprite("level_complete_sprite", 640, 160, (g, _i, w, h) => {
    pastryCard(g, 6, 6, w - 12, h - 12, h * 0.2);
    text(g, "Level complete", w / 2, h / 2, h * 0.4, COCOA, 600, "center", DISPLAY);
  });
}

/** "HueBricks" piped in pink frosting with a cream outline, drips and sprinkles. */
function buildLogo(): Sprite {
  return sprite("logo_sprite", 768, 400, (g, i, w, h) => {
    const size = h * 0.4;
    g.font = `600 ${size}px ${DISPLAY}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    const tw = g.measureText("HueBricks").width;
    const x0 = w / 2 - tw / 2;
    const y = h / 2 - 6;
    // drips: capsules hanging below the letters, outlined like the word itself
    const rnd = seeded(9);
    const drips: Array<[number, number, number]> = [];
    for (let k = 0; k < 4; k++) {
      drips.push([x0 + tw * (0.12 + rnd() * 0.76), size * (0.05 + rnd() * 0.035), size * (0.03 + rnd() * 0.09)]);
    }
    const dripPath = (dx: number, dr: number, len: number) => roundRect(g, dx - dr / 2, y + size * 0.15, dr, size * 0.2 + len, dr / 2);
    g.lineJoin = "round";
    for (const [dx, dr, len] of drips) {
      dripPath(dx, dr, len);
      g.lineWidth = size * 0.1;
      g.strokeStyle = CRUST;
      g.save();
      g.translate(0, size * 0.06);
      g.stroke();
      g.restore();
      g.lineWidth = size * 0.07;
      g.strokeStyle = FILLING;
      g.stroke();
    }
    // crust-coloured shadow plate, then cream outline, then frosting fill
    g.lineWidth = size * 0.22;
    g.strokeStyle = CRUST;
    g.strokeText("HueBricks", w / 2, y + size * 0.06);
    g.lineWidth = size * 0.16;
    g.strokeStyle = FILLING;
    g.strokeText("HueBricks", w / 2, y);
    const grad = g.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    grad.addColorStop(0, i === 1 ? "#FFB5C8" : PINK);
    grad.addColorStop(1, PINK_DARK);
    g.fillStyle = grad;
    g.fillText("HueBricks", w / 2, y);
    // the drips themselves, in the darker frosting the letters fade into
    for (const [dx, dr, len] of drips) {
      dripPath(dx, dr, len);
      g.fillStyle = PINK_DARK;
      g.fill();
    }
    // sprinkles over the letters
    g.save();
    g.font = `600 ${size}px ${DISPLAY}`;
    for (let k = 0; k < 22; k++) {
      const sx = x0 + rnd() * tw;
      const sy = y - size * 0.3 + rnd() * size * 0.5;
      g.save();
      g.translate(sx, sy);
      g.rotate(rnd() * Math.PI);
      g.fillStyle = SPRINKLES[k % SPRINKLES.length];
      roundRect(g, -size * 0.045, -size * 0.014, size * 0.09, size * 0.028, size * 0.014);
      g.fill();
      g.restore();
    }
    g.restore();
    // a little tart dotting the i? keep it simple: three mini tarts under the word
    const mini = size * 0.22;
    [DELICIOUS_COLORS[RED], DELICIOUS_COLORS[BLUE], DELICIOUS_COLORS[YELLOW]].forEach((c, k) => {
      tart(g, w / 2 - mini * 1.9 + k * mini * 1.3, y + size * 0.72, mini, mini, c, { seed: 3 + k });
    });
  });
}

function buildMenuButton(): Sprite {
  return sprite("menu_button_sprite", S, S, (g, i, w, h) => {
    const pad = w * 0.08;
    tart(g, pad, pad, w - pad * 2, h - pad * 2, BISCUIT, { seed: 0, lift: i === 1 ? 0.15 : 0 });
    const cx = w / 2;
    const cy = h / 2;
    g.fillStyle = COCOA;
    g.beginPath();
    g.moveTo(cx, cy - h * 0.2);
    g.lineTo(cx + w * 0.2, cy - h * 0.02);
    g.lineTo(cx + w * 0.14, cy - h * 0.02);
    g.lineTo(cx + w * 0.14, cy + h * 0.18);
    g.lineTo(cx - w * 0.14, cy + h * 0.18);
    g.lineTo(cx - w * 0.14, cy - h * 0.02);
    g.lineTo(cx - w * 0.2, cy - h * 0.02);
    g.closePath();
    g.fill();
  });
}

/** Wooden counter along the bottom of the title screen. */
function buildMenuFrame(): Sprite {
  return sprite("menu_frame_sprite", 760, 127, (g, _i, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#E2B07A");
    grad.addColorStop(1, "#C98E55");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    // grain
    const rnd = seeded(21);
    g.strokeStyle = "rgba(120,70,40,0.12)";
    g.lineWidth = 1;
    for (let k = 0; k < 14; k++) {
      const y = 8 + rnd() * (h - 16);
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= w; x += 40) g.lineTo(x, y + Math.sin(x / 90 + k) * 1.5);
      g.stroke();
    }
    g.fillStyle = "rgba(255,255,255,0.35)";
    g.fillRect(0, 0, w, 3);
    g.fillStyle = "rgba(120,70,40,0.25)";
    g.fillRect(0, 3, w, 1);
  });
}

function modeGlyph(g: Ctx, glyph: Glyph, cx: number, cy: number, r: number): void {
  g.save();
  g.lineWidth = r * 0.2;
  g.lineJoin = "round";
  g.strokeStyle = "rgba(0,0,0,0.15)";
  glyphPath(g, glyph, cx + r * 0.05, cy + r * 0.07, r);
  g.stroke();
  g.strokeStyle = "#FFFFFF";
  glyphPath(g, glyph, cx, cy, r);
  g.stroke();
  g.restore();
}

/** An eclair: choux pastry pill with a coloured glaze dripping over the top. */
function buildModeButton(name: SpriteName, label: string, base: string, glyph: Glyph): Sprite {
  return sprite(name, 512, 256, (g, i, w, h) => {
    const pad = h * 0.1;
    const pressed = i === 1;
    const x = pad;
    const y = pad + (pressed ? h * 0.03 : 0);
    const bw = w - pad * 2;
    const bh = h - pad * 2;
    const r = bh / 2;
    if (!pressed) {
      g.save();
      g.shadowColor = "rgba(120,70,40,0.25)";
      g.shadowBlur = h * 0.08;
      g.shadowOffsetY = h * 0.04;
      roundRect(g, x, y, bw, bh, r);
      g.fillStyle = CRUST;
      g.fill();
      g.restore();
    }
    roundRect(g, x, y, bw, bh, r);
    g.fillStyle = crustFill(g, y, bh);
    g.fill();
    // glaze: top of the pill with a wavy lower edge
    g.save();
    roundRect(g, x, y, bw, bh, r);
    g.clip();
    const gl = pressed ? shade(base, 0.12) : base;
    g.fillStyle = shade(gl, -0.2);
    g.beginPath();
    g.moveTo(x - 2, y - 2);
    g.lineTo(x + bw + 2, y - 2);
    g.lineTo(x + bw + 2, y + bh * 0.6);
    for (let px = x + bw; px >= x - 10; px -= bw / 9) {
      g.quadraticCurveTo(px - bw / 36, y + bh * 0.72, px - bw / 18, y + bh * 0.6);
    }
    g.closePath();
    g.fill();
    g.translate(0, -bh * 0.05);
    g.fillStyle = gl;
    g.fill();
    const hl = g.createLinearGradient(0, y, 0, y + bh * 0.4);
    hl.addColorStop(0, "rgba(255,255,255,0.35)");
    hl.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = hl;
    g.fill();
    g.restore();
    modeGlyph(g, glyph, x + bw * 0.16, y + bh * 0.42, bh * 0.16);
    g.save();
    g.shadowColor = "rgba(0,0,0,0.25)";
    g.shadowBlur = 4;
    g.shadowOffsetY = 2;
    text(g, label, x + bw * 0.6, y + bh * 0.42, bh * 0.32, "#FFFFFF", 600, "center", DISPLAY);
    g.restore();
  });
}

function buildWorldButton(world: number): Sprite {
  const name = `world${world}_sprite` as SpriteName;
  const colorOf = [null, RED, YELLOW, BLUE, ORANGE, PURPLE, GREEN, BLACK] as const;
  const base = world === 0 ? BISCUIT : DELICIOUS_COLORS[colorOf[world] as Color];
  return sprite(name, S, S, (g, i, w, h) => {
    const pad = w * 0.07;
    tart(g, pad, pad, w - pad * 2, h - pad * 2, base, { seed: 40 + world, lift: i === 1 ? 0.15 : 0 });
    g.save();
    if (world === 0) {
      text(g, "Tutorial", w / 2, h / 2, w * 0.18, COCOA, 600, "center", DISPLAY);
    } else {
      g.shadowColor = "rgba(0,0,0,0.25)";
      g.shadowBlur = 4;
      g.shadowOffsetY = 2;
      text(g, "WORLD", w / 2, h * 0.37, w * 0.12, "rgba(255,255,255,0.9)", 700);
      text(g, String(world), w / 2, h * 0.6, w * 0.36, "#FFFFFF", 600, "center", DISPLAY);
    }
    g.restore();
  });
}

function buildLevelSelect(): Sprite {
  return sprite("level_select_sprite", 512, 256, (g, _i, w, h) => pastryCard(g, 4, 4, w - 8, h - 8, h * 0.12));
}

function buildCredits(): Sprite {
  return sprite("credits_sprite", 1024, 512, (g, _i, w, h) => {
    pastryCard(g, 6, 6, w - 12, h - 12, h * 0.1);
    text(g, "Credits", w / 2, h * 0.14, h * 0.12, COCOA, 600, "center", DISPLAY);
    const rows: [string, string][] = [
      ["Game Design", "Tim Frank, Ben Cochrane"],
      ["Game Concept", "Tim Frank"],
      ["Game Development", "Ben Cochrane"],
      ["UI", "Tim Frank"],
      ["Game Art", "Tim Frank"],
      ["Sound Design", "Nathan Bützer"],
      ["Music", "Nathan Bützer"],
    ];
    const size = h * 0.055;
    rows.forEach(([k, v], i) => {
      const y = h * 0.28 + i * size * 1.35;
      text(g, `${k}:`, w * 0.47, y, size, MUTED, 500, "right");
      text(g, v, w * 0.49, y, size, COCOA, 700, "left");
    });
    const y = h * 0.28 + rows.length * size * 1.35 + size * 0.6;
    text(g, "Special Thanks:", w * 0.47, y, size, MUTED, 500, "right");
    text(g, "Connor McCarthy, Ajani Thomas,", w * 0.49, y, size, COCOA, 700, "left");
    text(g, "Chris Dodson, Pat Frank, Kris Klink", w * 0.49, y + size * 1.3, size, COCOA, 700, "left");
    text(g, "Browser remake in TypeScript", w / 2, h * 0.92, size * 0.85, MUTED, 500);
  });
}

/** How the tutorial slides look in this theme. */
export const DELICIOUS_SLIDES: SlideStyle = {
  background(g, w, h) {
    drawGingham(g, 0, 0, w, h);
    const grad = g.createLinearGradient(0, h * 0.78, 0, h);
    grad.addColorStop(0, "#E2B07A");
    grad.addColorStop(1, "#C98E55");
    g.fillStyle = grad;
    g.fillRect(0, h * 0.78, w, h * 0.22);
    g.fillStyle = "rgba(255,255,255,0.35)";
    g.fillRect(0, h * 0.78, w, 3);
  },
  font: FONT,
  display: DISPLAY,
  text: COCOA,
  muted: MUTED,
  bgColor: CREAM,
  dotIdle: rgba(COCOA, 0.25),
  card: CARD,
  cardEdge: rgba(CRUST, 0.7),
  cardShadow: "rgba(120,70,40,0.2)",
  gridLine: rgba(CRUST, 0.3),
  well: "#F7E6D8",
  wellEdge: rgba(CRUST, 0.45),
  track: rgba(COCOA, 0.12),
  colors: DELICIOUS_COLORS,
  inkOn: () => "#FFFFFF",
  tile: (g, x, y, w, h, base, opts) => tart(g, x, y, w, h, base, { radius: opts?.radius, seed: 0 }),
  glyphs: drawDeliciousGlyphs,
  button: macaronButton,
};

/** Build the Delicious sprite set, falling back to the classic sprites where no art exists. */
export function buildDeliciousSprites(classic: SpriteMap): SpriteMap {
  const skin: Partial<SpriteMap> = {
    brick_sprite: buildBricks(),
    brick_noicon_sprite: buildNoIcon(),
    brick_glow_sprite: blank("brick_glow_sprite"),
    brick_shadow_sprite: buildSoftShadow(),
    brick_border_sprite: buildBorder(),
    brick_pop_sprite: buildPop(),
    red_expand_sprite: blank("red_expand_sprite"),
    blue_expand_sprite: blank("blue_expand_sprite"),
    yellow_expand_sprite: blank("yellow_expand_sprite"),
    purple_expand_sprite: blank("purple_expand_sprite"),
    orange_expand_sprite: blank("orange_expand_sprite"),
    green_expand_sprite: blank("green_expand_sprite"),
    black_expand_sprite: blank("black_expand_sprite"),
    replenish_selector_sprite: buildSelector(),
    replenish_frame_sprite: buildReplenishFrame(),
    worldbg_sprite: buildFlat("worldbg_sprite"),
    sidebar_sprite: buildFlat("sidebar_sprite"),
    rotate_button_sprite: buildRotate(),
    pause_button_sprite: buildPause(),
    speedup_button_sprite: buildSpeed(),
    sound_button_sprite: buildSound(),
    progressbar_sprite: buildProgress(),
    level_complete_sprite: buildLevelComplete(),
    logo_sprite: buildLogo(),
    menu_button_sprite: buildMenuButton(),
    menu_frame_sprite: buildMenuFrame(),
    normal_button_sprite: buildModeButton("normal_button_sprite", "Normal", DELICIOUS_COLORS[YELLOW], "diamond"),
    puzzle_button_sprite: buildModeButton("puzzle_button_sprite", "Puzzle", DELICIOUS_COLORS[RED], "octagon"),
    zen_button_sprite: buildModeButton("zen_button_sprite", "Zen", DELICIOUS_COLORS[BLUE], "circle"),
    arcade_button_sprite: buildModeButton("arcade_button_sprite", "Arcade", DELICIOUS_COLORS[GREEN], "octagon"),
    back_button_sprite: buildBack(),
    info_button_sprite: buildInfo(),
    settings_button_sprite: buildSettings(),
    level_select_sprite: buildLevelSelect(),
    credits_sprite: buildCredits(),
  };
  for (let w = 0; w <= 7; w++) {
    skin[`world${w}_sprite` as SpriteName] = buildWorldButton(w);
  }
  const slides = buildTutorialSlides(skin.logo_sprite!, DELICIOUS_SLIDES);
  skin.tutorial_intro_sprite = slides.intro;
  skin.tutorial_outro_sprite = slides.outro;
  return { ...classic, ...skin } as SpriteMap;
}
