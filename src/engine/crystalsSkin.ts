import { BLACK, BLUE, GREEN, ORANGE, PURPLE, RED, YELLOW, type Color } from "../core/color";
import type { Layout } from "../core/layout";
import { cellX, cellY, replenishY } from "../core/layout";
import { SPRITE_FRAMES, type Sprite, type SpriteMap, type SpriteName } from "./assets";
import { chevronUp, gearIcon, polygon, rgba, rotateIcon, roundRect, shade, speakerIcon, sprite, text, type Ctx } from "./modernSkin";
import { buildTutorialSlides, type SlideStyle } from "./modernSlides";
import { fillScreen, screenRect } from "./view";
import type { TitleFx } from "./backdrops";

/**
 * "Crystals": cut gemstones in a dark cave. Every brick is a faceted gem with
 * a bevelled rim, a lighter table, a specular streak and a sparkle; the board
 * is a slab of slate, the replenish line sits in a geode tray whose sockets
 * fill with light as the next gem forms, and the buttons are cabochons.
 */

export const FONT = 'Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
export const DISPLAY = 'Outfit, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const BG = "#0B1020";
export const SLATE = "#141A2E";
export const SLATE_LIGHT = "#1E2640";
export const EDGE = "rgba(140,200,255,0.25)";
export const EDGE_SOFT = "rgba(140,200,255,0.12)";
export const TEXT = "#EAF2FF";
export const MUTED = "#8C9BC0";
export const ICE = "#9ED7FF";
export const QUARTZ = "#5C6B8A";

/** Gem colours by colour bits: ruby, sapphire, amethyst, citrine, fire opal, emerald, onyx. */
export const CRYSTAL_COLORS: Record<Color, string> = {
  1: "#E2304F",
  2: "#2F6FE4",
  3: "#9B5DE5",
  4: "#F7C848",
  5: "#F2803A",
  6: "#2FCB7A",
  7: "#2A2F45",
};

const NOICON_COLORS = [
  CRYSTAL_COLORS[1],
  CRYSTAL_COLORS[2],
  CRYSTAL_COLORS[3],
  CRYSTAL_COLORS[4],
  CRYSTAL_COLORS[5],
  CRYSTAL_COLORS[6],
  CRYSTAL_COLORS[7],
  QUARTZ,
];

function seeded(seed: number): () => number {
  let s = (seed * 9301 + 49297) % 233280;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

// ---------------------------------------------------------------------------
// Gems
// ---------------------------------------------------------------------------

/** Four-point sparkle star. */
export function sparkle(g: Ctx, cx: number, cy: number, r: number, color = "#FFFFFF"): void {
  g.beginPath();
  g.moveTo(cx, cy - r);
  g.quadraticCurveTo(cx, cy, cx + r, cy);
  g.quadraticCurveTo(cx, cy, cx, cy + r);
  g.quadraticCurveTo(cx, cy, cx - r, cy);
  g.quadraticCurveTo(cx, cy, cx, cy - r);
  g.closePath();
  g.fillStyle = color;
  g.fill();
}

export interface GemOptions {
  radius?: number;
  /** Lighter table, for hover / pressed frames. */
  lift?: number;
  /** Skip the sparkle. */
  plain?: boolean;
}

/**
 * A square-cut gem: bevelled facets around a lighter table, lit from the
 * top-left, with a diagonal specular streak and a sparkle on the rim.
 */
export function gem(g: Ctx, x: number, y: number, w: number, h: number, base: string, opts: GemOptions = {}): void {
  const m = Math.min(w, h);
  const r = opts.radius ?? m * 0.12;
  const b = m * 0.17;
  const core = opts.lift ? shade(base, opts.lift) : base;
  g.save();
  roundRect(g, x, y, w, h, r);
  g.clip();
  g.fillStyle = shade(core, -0.4);
  g.fillRect(x, y, w, h);
  const facet = (pts: number[][], color: string) => {
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
    g.fillStyle = color;
    g.fill();
  };
  facet(
    [
      [x, y],
      [x + w, y],
      [x + w - b, y + b],
      [x + b, y + b],
    ],
    shade(core, 0.4),
  );
  facet(
    [
      [x, y],
      [x + b, y + b],
      [x + b, y + h - b],
      [x, y + h],
    ],
    shade(core, 0.08),
  );
  facet(
    [
      [x + w, y],
      [x + w, y + h],
      [x + w - b, y + h - b],
      [x + w - b, y + b],
    ],
    shade(core, -0.22),
  );
  facet(
    [
      [x, y + h],
      [x + b, y + h - b],
      [x + w - b, y + h - b],
      [x + w, y + h],
    ],
    shade(core, -0.45),
  );
  // table
  const tx = x + b;
  const ty = y + b;
  const tw = w - b * 2;
  const th = h - b * 2;
  const grad = g.createLinearGradient(tx, ty, tx + tw, ty + th);
  grad.addColorStop(0, shade(core, 0.22));
  grad.addColorStop(0.5, core);
  grad.addColorStop(1, shade(core, -0.12));
  g.fillStyle = grad;
  g.fillRect(tx, ty, tw, th);
  // specular streak across the table
  g.save();
  g.beginPath();
  g.rect(tx, ty, tw, th);
  g.clip();
  g.fillStyle = "rgba(255,255,255,0.22)";
  g.beginPath();
  g.moveTo(tx + tw * 0.1, ty + th);
  g.lineTo(tx + tw * 0.45, ty);
  g.lineTo(tx + tw * 0.7, ty);
  g.lineTo(tx + tw * 0.35, ty + th);
  g.closePath();
  g.fill();
  g.fillStyle = "rgba(255,255,255,0.1)";
  g.beginPath();
  g.moveTo(tx + tw * 0.75, ty + th);
  g.lineTo(tx + tw * 0.95, ty);
  g.lineTo(tx + tw * 1.05, ty);
  g.lineTo(tx + tw * 0.85, ty + th);
  g.closePath();
  g.fill();
  g.restore();
  // facet seams
  g.strokeStyle = "rgba(255,255,255,0.18)";
  g.lineWidth = Math.max(1, m * 0.012);
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(tx, ty);
  g.moveTo(x + w, y);
  g.lineTo(tx + tw, ty);
  g.moveTo(x + w, y + h);
  g.lineTo(tx + tw, ty + th);
  g.moveTo(x, y + h);
  g.lineTo(tx, ty + th);
  g.stroke();
  g.strokeRect(tx + 0.5, ty + 0.5, tw - 1, th - 1);
  g.restore();
  // outer edge
  g.lineWidth = Math.max(1, m * 0.016);
  g.strokeStyle = "rgba(255,255,255,0.3)";
  roundRect(g, x + 0.5, y + 0.5, w - 1, h - 1, r);
  g.stroke();
  if (!opts.plain) sparkle(g, x + b * 0.9, y + b * 0.9, m * 0.08);
}

/** Dark glass panel with an icy edge. */
export function slab(g: Ctx, x: number, y: number, w: number, h: number, r: number, alpha = 0.96): void {
  roundRect(g, x, y, w, h, r);
  g.fillStyle = rgba(SLATE, alpha);
  g.fill();
  g.lineWidth = 1.5;
  g.strokeStyle = EDGE;
  g.stroke();
  g.fillStyle = "rgba(255,255,255,0.08)";
  g.fillRect(x + r, y + 1, w - r * 2, 1);
}

// ---------------------------------------------------------------------------
// Glyphs: engraved light
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

/** White lines cut into the table, with a dark engraving shadow and a glow; innermost shape filled on mixes. */
export function drawCrystalGlyphs(g: Ctx, color: Color, cx: number, cy: number, size: number): void {
  const glyphs = GLYPHS[color];
  const radii = glyphs.length === 1 ? [0.22] : glyphs.length === 2 ? [0.25, 0.14] : [0.26, 0.17, 0.09];
  g.save();
  g.lineJoin = "round";
  g.lineWidth = size * 0.03;
  g.strokeStyle = "rgba(0,0,0,0.35)";
  glyphs.forEach((gl, i) => {
    glyphPath(g, gl, cx + size * 0.008, cy + size * 0.012, size * radii[i]);
    g.stroke();
  });
  g.strokeStyle = "rgba(255,255,255,0.95)";
  g.fillStyle = "rgba(255,255,255,0.35)";
  g.shadowColor = "rgba(255,255,255,0.45)";
  g.shadowBlur = size * 0.06;
  glyphs.forEach((gl, i) => {
    glyphPath(g, gl, cx, cy, size * radii[i]);
    if (glyphs.length > 1 && i === glyphs.length - 1) g.fill();
    g.stroke();
  });
  g.restore();
}

// ---------------------------------------------------------------------------
// Buttons: cabochons
// ---------------------------------------------------------------------------

/** Round polished stone: dark glass dome with a bright rim and a specular arc; pressed glows. */
export function gemButton(g: Ctx, w: number, h: number, pressed: boolean, icon: (g: Ctx, cx: number, cy: number, r: number) => void): void {
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * 0.4;
  g.save();
  g.shadowColor = "rgba(120,190,255,0.35)";
  g.shadowBlur = r * 0.3;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  const dome = g.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
  dome.addColorStop(0, pressed ? "#4A5A8A" : "#334066");
  dome.addColorStop(1, pressed ? "#1E2640" : SLATE);
  g.fillStyle = dome;
  g.fill();
  g.restore();
  g.lineWidth = r * 0.06;
  g.strokeStyle = "rgba(255,255,255,0.35)";
  g.beginPath();
  g.arc(cx, cy, r - r * 0.03, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = r * 0.03;
  g.strokeStyle = EDGE;
  g.beginPath();
  g.arc(cx, cy, r * 0.84, 0, Math.PI * 2);
  g.stroke();
  // specular arc
  g.lineWidth = r * 0.08;
  g.lineCap = "round";
  g.strokeStyle = "rgba(255,255,255,0.5)";
  g.beginPath();
  g.arc(cx, cy, r * 0.7, -Math.PI * 0.85, -Math.PI * 0.45);
  g.stroke();
  g.save();
  g.strokeStyle = TEXT;
  g.fillStyle = TEXT;
  g.lineWidth = r * 0.13;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.shadowColor = "rgba(255,255,255,0.4)";
  g.shadowBlur = r * 0.15;
  icon(g, cx, cy, r);
  g.restore();
}

// ---------------------------------------------------------------------------
// Backdrop and board furniture
// ---------------------------------------------------------------------------

/**
 * Deep blue-black cave: two slow coloured glows, faint light shafts falling
 * from the top-left, twinkling motes, and with a layout a slate slab under
 * the grid plus the geode tray under the replenish line.
 */
export function drawCrystalsBackdrop(g: Ctx, t: number, l?: Layout, flare = 0, fx: TitleFx | null = null): void {
  fillScreen(g, BG);
  const sr = screenRect();
  const pointer = fx?.pointer ?? null;
  // a tap sends a ring of light out through the motes
  const rings = (fx?.taps ?? []).filter((tap) => t - tap.t < 1400);
  const bx = l ? l.boardX + l.boardW / 2 : sr.w / 2;
  const by = l ? (cellY(l, l.cellNum) - l.cellSep) / 2 : sr.h / 2;
  const blob = (x: number, y: number, r: number, color: string, a: number) => {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, rgba(color, a));
    grad.addColorStop(1, rgba(color, 0));
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  };
  const p = (t / 36000) * Math.PI * 2;
  blob(bx + Math.cos(p) * 160, by + Math.sin(p * 0.6) * 90, 300, "#1E6F8C", 0.16 + flare * 0.25);
  blob(bx - Math.cos(p * 0.7) * 170, by - Math.sin(p) * 70, 280, "#5B2E8C", 0.16 + flare * 0.25);
  // light shafts
  g.save();
  g.translate(sr.w * 0.25, 0);
  g.rotate(0.35);
  for (const [sx, sw, a] of [
    [0, 60, 0.035],
    [140, 30, 0.025],
    [260, 90, 0.02],
  ]) {
    g.fillStyle = `rgba(200,230,255,${a})`;
    g.fillRect(sx, -sr.h, sw, sr.h * 4);
  }
  g.restore();
  // motes
  const rnd = seeded(77);
  for (let i = 0; i < 40; i++) {
    const x = rnd() * sr.w;
    const y = rnd() * sr.h;
    const ph = rnd() * Math.PI * 2;
    const a = 0.25 + 0.75 * Math.max(0, Math.sin(t / 900 + ph));
    const size = 0.8 + rnd() * 1.4;
    // motes light up around the cursor and as a tap's ring passes
    let near = pointer ? Math.max(0, 1 - Math.hypot(x - pointer.x, y - pointer.y) / 110) : 0;
    for (const tap of rings) {
      const off = Math.abs(Math.hypot(x - tap.x, y - tap.y) - (t - tap.t) * 0.55);
      near = Math.max(near, (1 - Math.min(1, off / 70)) * (1 - (t - tap.t) / 1400) * 1.5);
    }
    g.fillStyle = `rgba(220,240,255,${Math.min(1, (0.5 + flare + near * 1.2) * Math.max(a, near * 0.8))})`;
    g.beginPath();
    g.arc(x, y, size + near * 1.8, 0, Math.PI * 2);
    g.fill();
  }
  if (!l) return;
  const n = l.cellNum;
  const gridBottom = cellY(l, n) - l.cellSep;
  g.save();
  g.shadowColor = "rgba(0,0,0,0.6)";
  g.shadowBlur = 24;
  g.shadowOffsetY = 8;
  roundRect(g, l.boardX - 10, l.boardY - 10, l.boardW + 20, gridBottom - l.boardY + 13, 12);
  g.fillStyle = SLATE;
  g.fill();
  g.restore();
  g.lineWidth = 1.5;
  g.strokeStyle = EDGE;
  roundRect(g, l.boardX - 10, l.boardY - 10, l.boardW + 20, gridBottom - l.boardY + 13, 12);
  g.stroke();
  g.fillStyle = "rgba(255,255,255,0.08)";
  g.fillRect(l.boardX, l.boardY - 9, l.boardW, 1);
  const pad = l.cellW * 0.04;
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) drawCrystalWell(g, cellX(l, x) + pad, cellY(l, y) + pad, l.cellW - pad * 2, l.cellH - pad * 2);
  }
  const ry = replenishY(l);
  drawCrystalTray(g, l.boardX - 8, ry - 8, l.boardW + 16, l.cellH + 16);
}

/** An empty socket cut into the slate: dark, with an icy inner edge and one facet seam. */
export function drawCrystalWell(g: Ctx, x: number, y: number, w: number, h: number): void {
  const m = Math.min(w, h);
  const r = m * 0.12;
  roundRect(g, x, y, w, h, r);
  g.fillStyle = "rgba(0,0,0,0.38)";
  g.fill();
  g.lineWidth = 1;
  g.strokeStyle = EDGE_SOFT;
  roundRect(g, x + 0.5, y + 0.5, w - 1, h - 1, r);
  g.stroke();
  g.strokeStyle = "rgba(255,255,255,0.05)";
  g.beginPath();
  g.moveTo(x + w * 0.15, y + h);
  g.lineTo(x + w * 0.55, y);
  g.stroke();
}

/** The geode tray: a slate trough with a glowing icy rim. */
export function drawCrystalTray(g: Ctx, x: number, y: number, w: number, h: number): void {
  g.save();
  g.shadowColor = "rgba(120,190,255,0.3)";
  g.shadowBlur = 16;
  roundRect(g, x, y, w, h, 12);
  g.fillStyle = SLATE_LIGHT;
  g.fill();
  g.restore();
  roundRect(g, x + 3, y + 3, w - 6, h - 6, 9);
  g.fillStyle = SLATE;
  g.fill();
  g.lineWidth = 1.5;
  g.strokeStyle = EDGE;
  roundRect(g, x, y, w, h, 12);
  g.stroke();
  g.fillStyle = "rgba(255,255,255,0.1)";
  g.fillRect(x + 12, y + 1, w - 24, 1);
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
    gem(g, pad, pad, w - pad * 2, h - pad * 2, CRYSTAL_COLORS[color]);
    drawCrystalGlyphs(g, color, w / 2, h / 2, w);
  });
}

function buildNoIcon(): Sprite {
  return sprite("brick_noicon_sprite", S, S, (g, i, w, h) => {
    const pad = w * PAD;
    gem(g, pad, pad, w - pad * 2, h - pad * 2, NOICON_COLORS[i]);
  });
}

/** Soft coloured light under each gem, drawn by the scene at 1.4x cell size. */
function buildGlow(): Sprite {
  return sprite("brick_glow_sprite", S, S, (g, i, w, h) => {
    const color = (i + 1) as Color;
    const pad = w * 0.26;
    g.shadowColor = CRYSTAL_COLORS[color];
    g.shadowBlur = w * 0.16;
    g.shadowOffsetX = w * 4;
    g.fillStyle = CRYSTAL_COLORS[color];
    roundRect(g, pad - w * 4, pad, w - pad * 2, h - pad * 2, w * 0.1);
    g.fill();
  });
}

function buildBorder(): Sprite {
  return sprite("brick_border_sprite", S, S, (g, _i, w, h) => {
    const pad = w * 0.05;
    g.lineWidth = w * 0.05;
    g.strokeStyle = TEXT;
    roundRect(g, pad, pad, w - pad * 2, h - pad * 2, w * 0.12);
    g.stroke();
  });
}

/** A burst of sparkles flying outward and fading. */
function buildPop(): Sprite {
  const n = SPRITE_FRAMES.brick_pop_sprite;
  return sprite("brick_pop_sprite", 64, 64, (g, i, w, h) => {
    const t = i / (n - 1);
    g.globalAlpha = 1 - t;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + t * 0.6;
      const d = w * (0.1 + t * 0.4);
      sparkle(g, w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d, 2 + 3 * (1 - t));
    }
  });
}

function blank(name: SpriteName): Sprite {
  return sprite(name, 8, 8, () => undefined);
}

/** Glowing ring in the gem's colour with a white inner line; frame 7 is white. */
function buildSelector(): Sprite {
  return sprite("replenish_selector_sprite", S, S, (g, i, w, h) => {
    const colour = i < 7 ? CRYSTAL_COLORS[(i + 1) as Color] : TEXT;
    const pad = w * 0.03;
    const lw = w * 0.04;
    g.save();
    g.shadowColor = colour;
    g.shadowBlur = w * 0.08;
    g.lineWidth = lw;
    g.strokeStyle = colour;
    g.lineJoin = "round";
    roundRect(g, pad + lw / 2, pad + lw / 2, w - pad * 2 - lw, h - pad * 2 - lw, w * 0.12);
    g.stroke();
    g.stroke();
    g.restore();
    g.lineWidth = lw * 0.35;
    g.strokeStyle = "rgba(255,255,255,0.8)";
    roundRect(g, pad + lw * 1.6, pad + lw * 1.6, w - pad * 2 - lw * 3.2, h - pad * 2 - lw * 3.2, w * 0.1);
    g.stroke();
    if (i < 7) {
      g.fillStyle = rgba(colour, 0.12);
      g.fill();
    }
  });
}

function buildReplenishFrame(): Sprite {
  return sprite("replenish_frame_sprite", S, S, (g, _i, w, h) => {
    const pad = w * 0.06;
    drawCrystalWell(g, pad, pad, w - pad * 2, h - pad * 2);
  });
}

function buildFlat(name: SpriteName): Sprite {
  return sprite(name, 16, 16, (g, _i, w, h) => {
    g.fillStyle = BG;
    g.fillRect(0, 0, w, h);
  });
}

function buildRotate(): Sprite {
  return sprite("rotate_button_sprite", S, S, (g, i, w, h) => {
    gemButton(g, w, h, i % 2 === 1, (gg, cx, cy, r) => rotateIcon(gg, cx, cy, r, i >= 2));
  });
}

function buildPause(): Sprite {
  return sprite("pause_button_sprite", S, S, (g, _i, w, h) => {
    gemButton(g, w, h, false, (gg, cx, cy, r) => {
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
  return sprite("speedup_button_sprite", S, S, (g, i, w, h) => gemButton(g, w, h, i === 1, chevronUp));
}

function buildSound(): Sprite {
  return sprite("sound_button_sprite", S, S, (g, i, w, h) => {
    const muted = i >= 2;
    gemButton(g, w, h, i % 2 === 1, (gg, cx, cy, r) => {
      if (muted) {
        gg.fillStyle = "rgba(234,242,255,0.45)";
        gg.strokeStyle = gg.fillStyle;
      }
      speakerIcon(gg, cx, cy, r, muted);
      if (muted) {
        gg.strokeStyle = CRYSTAL_COLORS[RED];
        gg.lineWidth = r * 0.16;
        gg.beginPath();
        gg.moveTo(cx - r * 0.5, cy - r * 0.5);
        gg.lineTo(cx + r * 0.5, cy + r * 0.5);
        gg.stroke();
      }
    });
  });
}

function buildSettings(): Sprite {
  return sprite("settings_button_sprite", S, S, (g, i, w, h) => gemButton(g, w, h, i === 1, gearIcon));
}

function buildBack(): Sprite {
  return sprite("back_button_sprite", S, S, (g, i, w, h) => {
    const right = i >= 2;
    gemButton(g, w, h, i % 2 === 1, (gg, cx, cy, r) => {
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
    gemButton(g, w, h, i === 1, (gg, cx, cy, r) => text(gg, "i", cx, cy + r * 0.04, r * 1.2, TEXT, 700, "center", DISPLAY));
  });
}

function buildProgress(): Sprite {
  return sprite("progressbar_sprite", 256, 8, (g, i, w, h) => {
    if (i === 2) {
      g.fillStyle = "rgba(255,255,255,0.12)";
      g.fillRect(0, 0, w, h);
    } else if (i === 1) {
      g.fillStyle = "rgba(255,255,255,0.3)";
      g.fillRect(0, 0, w, h);
    } else {
      const grad = g.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, ICE);
      grad.addColorStop(1, CRYSTAL_COLORS[PURPLE]);
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
    }
  });
}

function buildLevelComplete(): Sprite {
  return sprite("level_complete_sprite", 640, 160, (g, _i, w, h) => {
    slab(g, 4, 4, w - 8, h - 8, h * 0.2);
    text(g, "Level complete", w / 2, h / 2, h * 0.4, TEXT, 700, "center", DISPLAY);
  });
}

/** Ice-to-amethyst gradient across the wordmark. */
function prism(g: Ctx, y0: number, y1: number): CanvasGradient {
  const grad = g.createLinearGradient(0, y0, 0, y1);
  grad.addColorStop(0, "#FFFFFF");
  grad.addColorStop(0.45, ICE);
  grad.addColorStop(1, "#C9A8FF");
  return grad;
}

/** "HueBricks" in Outfit, cut from ice: white-to-violet fill, bright edge, soft bloom and sparkles. */
function buildLogo(): Sprite {
  return sprite("logo_sprite", 768, 400, (g, i, w, h) => {
    const size = h * 0.4;
    g.font = `700 ${size}px ${DISPLAY}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    const tw = g.measureText("HueBricks").width;
    const x0 = w / 2 - tw / 2;
    const y = h / 2 - 6;
    g.save();
    g.shadowColor = "rgba(127,200,255,0.6)";
    g.shadowBlur = i === 1 ? 12 : 28;
    g.fillStyle = prism(g, y - size / 2, y + size / 2);
    g.fillText("HueBricks", w / 2, y);
    g.restore();
    g.lineWidth = size * 0.03;
    g.lineJoin = "round";
    g.strokeStyle = "rgba(255,255,255,0.7)";
    g.strokeText("HueBricks", w / 2, y);
    // a facet line through the letters
    g.save();
    g.globalCompositeOperation = "source-atop";
    g.fillStyle = "rgba(255,255,255,0.35)";
    g.beginPath();
    g.moveTo(x0, y + size * 0.1);
    g.lineTo(x0 + tw, y - size * 0.2);
    g.lineTo(x0 + tw, y - size * 0.14);
    g.lineTo(x0, y + size * 0.16);
    g.closePath();
    g.fill();
    g.restore();
    const rnd = seeded(13);
    for (let k = 0; k < 5; k++) {
      sparkle(g, x0 + tw * (0.05 + rnd() * 0.9), y - size * 0.45 + rnd() * size * 0.9, size * (0.05 + rnd() * 0.06));
    }
    // three small gems under the word
    const mini = size * 0.2;
    [CRYSTAL_COLORS[RED], CRYSTAL_COLORS[BLUE], CRYSTAL_COLORS[YELLOW]].forEach((c, k) => {
      gem(g, w / 2 - mini * 1.9 + k * mini * 1.3, y + size * 0.68, mini, mini, c, { plain: true });
    });
  });
}

function buildMenuButton(): Sprite {
  return sprite("menu_button_sprite", S, S, (g, i, w, h) => {
    const pad = w * 0.08;
    gem(g, pad, pad, w - pad * 2, h - pad * 2, QUARTZ, { lift: i === 1 ? 0.15 : 0, plain: true });
    const cx = w / 2;
    const cy = h / 2;
    g.fillStyle = TEXT;
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

/** Slate ledge along the bottom of the title screen. */
function buildMenuFrame(): Sprite {
  return sprite("menu_frame_sprite", 760, 127, (g, _i, w, h) => {
    g.fillStyle = rgba(SLATE, 0.92);
    g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(255,255,255,0.12)";
    g.fillRect(0, 0, w, 1);
    g.fillStyle = EDGE_SOFT;
    g.fillRect(0, 1, w, 2);
  });
}

function modeGlyph(g: Ctx, glyph: Glyph, cx: number, cy: number, r: number, color: string): void {
  g.save();
  g.lineWidth = r * 0.18;
  g.lineJoin = "round";
  g.strokeStyle = color;
  g.shadowColor = color;
  g.shadowBlur = r * 0.6;
  glyphPath(g, glyph, cx, cy, r);
  g.stroke();
  g.stroke();
  g.restore();
}

/** A bevelled bar of coloured crystal with the label cut into it. */
function buildModeButton(name: SpriteName, label: string, base: string, glyph: Glyph): Sprite {
  return sprite(name, 512, 256, (g, i, w, h) => {
    const pad = h * 0.1;
    const pressed = i === 1;
    g.save();
    g.shadowColor = rgba(base, 0.5);
    g.shadowBlur = h * 0.1;
    gem(g, pad, pad, w - pad * 2, h - pad * 2, pressed ? shade(base, 0.15) : base, { radius: h * 0.16, plain: true });
    g.restore();
    modeGlyph(g, glyph, w * 0.22, h / 2, h * 0.14, "#FFFFFF");
    g.save();
    g.shadowColor = "rgba(0,0,0,0.5)";
    g.shadowBlur = 4;
    g.shadowOffsetY = 2;
    text(g, label, w * 0.62, h / 2 + 1, h * 0.3, TEXT, 700, "center", DISPLAY);
    g.restore();
  });
}

function buildWorldButton(world: number): Sprite {
  const name = `world${world}_sprite` as SpriteName;
  const colorOf = [null, RED, YELLOW, BLUE, ORANGE, PURPLE, GREEN, BLACK] as const;
  const base = world === 0 ? QUARTZ : CRYSTAL_COLORS[colorOf[world] as Color];
  return sprite(name, S, S, (g, i, w, h) => {
    const pad = w * 0.07;
    gem(g, pad, pad, w - pad * 2, h - pad * 2, base, { lift: i === 1 ? 0.15 : 0 });
    g.save();
    g.shadowColor = "rgba(0,0,0,0.5)";
    g.shadowBlur = 6;
    g.shadowOffsetY = 2;
    if (world === 0) {
      text(g, "Tutorial", w / 2, h / 2, w * 0.18, TEXT, 700, "center", DISPLAY);
    } else {
      text(g, "WORLD", w / 2, h * 0.37, w * 0.12, "rgba(255,255,255,0.85)", 700);
      text(g, String(world), w / 2, h * 0.61, w * 0.36, TEXT, 700, "center", DISPLAY);
    }
    g.restore();
  });
}

function buildLevelSelect(): Sprite {
  return sprite("level_select_sprite", 512, 256, (g, _i, w, h) => slab(g, 3, 3, w - 6, h - 6, h * 0.12));
}

function buildCredits(): Sprite {
  return sprite("credits_sprite", 1024, 512, (g, _i, w, h) => {
    slab(g, 4, 4, w - 8, h - 8, h * 0.1);
    text(g, "Credits", w / 2, h * 0.14, h * 0.12, TEXT, 700, "center", DISPLAY);
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
      text(g, v, w * 0.49, y, size, TEXT, 700, "left");
    });
    const y = h * 0.28 + rows.length * size * 1.35 + size * 0.6;
    text(g, "Special Thanks:", w * 0.47, y, size, MUTED, 500, "right");
    text(g, "Connor McCarthy, Ajani Thomas,", w * 0.49, y, size, TEXT, 700, "left");
    text(g, "Chris Dodson, Pat Frank, Kris Klink", w * 0.49, y + size * 1.3, size, TEXT, 700, "left");
    text(g, "Browser remake in TypeScript", w / 2, h * 0.92, size * 0.85, MUTED, 500);
  });
}

/** How the tutorial slides look in this theme. */
export const CRYSTALS_SLIDES: SlideStyle = {
  background(g, w, h) {
    g.fillStyle = BG;
    g.fillRect(0, 0, w, h);
    const glow = g.createRadialGradient(w / 2, h * 0.4, 0, w / 2, h * 0.4, w * 0.5);
    glow.addColorStop(0, "rgba(140,200,255,0.1)");
    glow.addColorStop(1, "rgba(140,200,255,0)");
    g.fillStyle = glow;
    g.fillRect(0, 0, w, h);
    g.fillStyle = rgba(SLATE, 0.92);
    g.fillRect(0, h * 0.78, w, h * 0.22);
    g.fillStyle = "rgba(255,255,255,0.12)";
    g.fillRect(0, h * 0.78, w, 1);
  },
  font: FONT,
  display: DISPLAY,
  text: TEXT,
  muted: MUTED,
  bgColor: BG,
  dotIdle: "rgba(255,255,255,0.25)",
  card: SLATE,
  cardEdge: EDGE,
  cardShadow: "rgba(0,0,0,0.5)",
  gridLine: "rgba(255,255,255,0.05)",
  well: "rgba(0,0,0,0.38)",
  wellEdge: EDGE_SOFT,
  track: "rgba(255,255,255,0.14)",
  colors: CRYSTAL_COLORS,
  inkOn: () => TEXT,
  tile: (g, x, y, w, h, base, opts) => gem(g, x, y, w, h, base, { radius: opts?.radius, plain: true }),
  glyphs: drawCrystalGlyphs,
  button: gemButton,
};

/** Build the Crystals sprite set, falling back to the classic sprites where no art exists. */
export function buildCrystalsSprites(classic: SpriteMap): SpriteMap {
  const skin: Partial<SpriteMap> = {
    brick_sprite: buildBricks(),
    brick_noicon_sprite: buildNoIcon(),
    brick_glow_sprite: buildGlow(),
    brick_shadow_sprite: blank("brick_shadow_sprite"),
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
    normal_button_sprite: buildModeButton("normal_button_sprite", "Normal", CRYSTAL_COLORS[YELLOW], "diamond"),
    puzzle_button_sprite: buildModeButton("puzzle_button_sprite", "Puzzle", CRYSTAL_COLORS[RED], "octagon"),
    zen_button_sprite: buildModeButton("zen_button_sprite", "Zen", CRYSTAL_COLORS[BLUE], "circle"),
    arcade_button_sprite: buildModeButton("arcade_button_sprite", "Arcade", CRYSTAL_COLORS[GREEN], "octagon"),
    back_button_sprite: buildBack(),
    info_button_sprite: buildInfo(),
    settings_button_sprite: buildSettings(),
    level_select_sprite: buildLevelSelect(),
    credits_sprite: buildCredits(),
  };
  for (let w = 0; w <= 7; w++) {
    skin[`world${w}_sprite` as SpriteName] = buildWorldButton(w);
  }
  const slides = buildTutorialSlides(skin.logo_sprite!, CRYSTALS_SLIDES);
  skin.tutorial_intro_sprite = slides.intro;
  skin.tutorial_outro_sprite = slides.outro;
  return { ...classic, ...skin } as SpriteMap;
}
