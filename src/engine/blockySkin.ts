import { BLACK, BLUE, GREEN, ORANGE, PURPLE, RED, YELLOW, type Color } from "../core/color";
import type { Layout } from "../core/layout";
import { cellY, replenishY } from "../core/layout";
import { SPRITE_FRAMES, type Sprite, type SpriteMap, type SpriteName } from "./assets";
import { chevronUp, gearIcon, polygon, rotateIcon, roundRect, shade, speakerIcon, sprite, text, type Ctx } from "./modernSkin";
import { buildTutorialSlides, type SlideStyle } from "./modernSlides";
import { fillScreen, screenRect } from "./view";

/**
 * "Blocky": the third sprite set. Soft 3D toy bricks: a flat top face, a
 * darker extruded side, one light from the top-left, cel shading and no
 * gloss. The extrusion of bricks on the board is drawn live by the scene
 * (it grows when a brick lifts and squashes when it lands); sprites here
 * only carry the top face. Buttons, menu bricks and the title wall bake
 * their extrusion in.
 */

export const FONT = 'Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
export const DISPLAY = 'Outfit, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const BG = "#121826";
export const PANEL = "#1A2234";
export const PANEL_SIDE = "#0D121F";
export const PANEL_EDGE = "rgba(255,255,255,0.08)";
export const TEXT = "#F8FAFC";
export const MUTED = "#8B96AD";
export const NEUTRAL = "#232B3D";
export const BLACK_EDGE = "#6B7389";

/** Brick top-face colours, indexed by colour bits. */
export const BLOCKY_COLORS: Record<Color, string> = {
  1: "#F04E5C",
  2: "#4A86FF",
  3: "#9D66F0",
  4: "#FFC83D",
  5: "#FF8F3A",
  6: "#3BD17A",
  7: "#3A3F4F",
};

/** Extruded side colour for a top-face colour. */
export function sideOf(base: string): string {
  return shade(base, -0.35);
}

const NOICON_COLORS = [BLOCKY_COLORS[1], BLOCKY_COLORS[2], BLOCKY_COLORS[3], BLOCKY_COLORS[4], BLOCKY_COLORS[5], BLOCKY_COLORS[6], BLOCKY_COLORS[7], NEUTRAL];

export interface BlockOptions {
  radius?: number;
  /** Baked extrusion depth below the face (0 for a bare face). */
  depth?: number;
  /** Skip the top-edge highlight. */
  flat?: boolean;
}

/**
 * A toy brick: optional side slab, flat top face, one 1.5 px highlight along
 * the top edge. The black brick gets a lighter edge so it never vanishes.
 */
export function block(g: Ctx, x: number, y: number, w: number, h: number, base: string, opts: BlockOptions = {}): void {
  const r = opts.radius ?? Math.min(w, h) * 0.2;
  const depth = opts.depth ?? 0;
  if (depth > 0) {
    roundRect(g, x, y + depth, w, h, r);
    g.fillStyle = sideOf(base);
    g.fill();
  }
  roundRect(g, x, y, w, h, r);
  g.fillStyle = base;
  g.fill();
  if (opts.flat) return;
  const lw = Math.max(1.5, Math.min(w, h) * 0.024);
  g.save();
  g.clip();
  g.lineWidth = lw;
  g.strokeStyle = base === BLOCKY_COLORS[7] ? BLACK_EDGE : "rgba(255,255,255,0.3)";
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(x + r * 0.6, y + lw / 2);
  g.lineTo(x + w - r * 0.6, y + lw / 2);
  g.stroke();
  g.restore();
}

/** Raised panel used for the HUD rail, the tray and cards. */
export function panel(g: Ctx, x: number, y: number, w: number, h: number, r: number, depth = 6): void {
  roundRect(g, x, y + depth, w, h, r);
  g.fillStyle = PANEL_SIDE;
  g.fill();
  roundRect(g, x, y, w, h, r);
  g.fillStyle = PANEL;
  g.fill();
  g.lineWidth = 1;
  g.strokeStyle = PANEL_EDGE;
  g.stroke();
}

// ---------------------------------------------------------------------------
// Glyphs
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

/** White glyphs sitting a pixel up-left to match the light; innermost shape filled on mixes. */
export function drawBlockyGlyphs(g: Ctx, color: Color, cx: number, cy: number, size: number): void {
  const glyphs = GLYPHS[color];
  const ox = cx - size * 0.016;
  const oy = cy - size * 0.016;
  g.lineWidth = size * 0.04;
  g.lineJoin = "round";
  g.strokeStyle = "rgba(255,255,255,0.92)";
  const radii = glyphs.length === 1 ? [0.26] : glyphs.length === 2 ? [0.3, 0.17] : [0.31, 0.2, 0.1];
  glyphs.forEach((gl, i) => {
    glyphPath(g, gl, ox, oy, size * radii[i]);
    if (glyphs.length > 1 && i === glyphs.length - 1) {
      g.save();
      g.fillStyle = "rgba(255,255,255,0.4)";
      g.fill();
      g.restore();
    }
    g.stroke();
  });
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

/** Round toy button: a dark face on a 6 px extrusion; pressed sits down to 2 px. */
export function toyButton(g: Ctx, w: number, h: number, pressed: boolean, icon: (g: Ctx, cx: number, cy: number, r: number) => void): void {
  const cx = w / 2;
  const r = Math.min(w, h) * 0.4;
  const depth = Math.min(w, h) * (pressed ? 0.012 : 0.035);
  const cy = h / 2 - Math.min(w, h) * 0.018 + (pressed ? Math.min(w, h) * 0.023 : 0);
  g.beginPath();
  g.arc(cx, cy + depth, r, 0, Math.PI * 2);
  g.fillStyle = PANEL_SIDE;
  g.fill();
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fillStyle = pressed ? "#161d2c" : PANEL;
  g.fill();
  g.lineWidth = r * 0.03;
  g.strokeStyle = PANEL_EDGE;
  g.stroke();
  g.strokeStyle = TEXT;
  g.fillStyle = TEXT;
  g.lineWidth = r * 0.13;
  g.lineCap = "round";
  g.lineJoin = "round";
  icon(g, cx, cy, r);
}

// ---------------------------------------------------------------------------
// Backdrop
// ---------------------------------------------------------------------------

/**
 * Flat dark background with a 48 px dot grid behind the board and a faint
 * horizon band sliding very slowly. With a layout, also the raised HUD rail
 * panel on the left and the tray under the replenish line.
 */
export function drawBlockyBackdrop(g: Ctx, t: number, l?: Layout): void {
  fillScreen(g, BG);
  const sr = screenRect();
  const x0 = l ? l.boardX : 0;
  const x1 = l ? l.boardX + l.boardW : sr.w;
  const y1 = l ? cellY(l, l.cellNum) - l.cellSep : sr.h;
  const cxm = (x0 + x1) / 2;
  g.fillStyle = "rgba(255,255,255,0.03)";
  for (let x = cxm - Math.floor((cxm - x0) / 48) * 48; x <= x1; x += 48) {
    for (let y = 24; y < y1; y += 48) {
      g.beginPath();
      g.arc(x, y, 1.5, 0, Math.PI * 2);
      g.fill();
    }
  }
  const band = ((t / 60000) % 1) * sr.h;
  g.fillStyle = "rgba(255,255,255,0.05)";
  g.fillRect(0, band, sr.w, 1);
  if (l) {
    if (!l.portrait) panel(g, l.boardX - l.railW + 8, 8, l.railW - 16, sr.h - 22, 14);
    const ry = replenishY(l);
    panel(g, l.boardX - 6, ry - 6, l.boardW + 12, l.cellH + 12, 12);
  }
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
    block(g, pad, pad, w - pad * 2, h - pad * 2, BLOCKY_COLORS[color]);
    drawBlockyGlyphs(g, color, w / 2, h / 2, w);
  });
}

/** Title wall and menu bricks: extrusion baked in (the face sits above a 9% slab). */
function buildNoIcon(): Sprite {
  return sprite("brick_noicon_sprite", S, S, (g, i, w, h) => {
    const pad = w * PAD;
    const depth = w * 0.09;
    block(g, pad, pad, w - pad * 2, h - pad * 2 - depth, NOICON_COLORS[i], { depth });
  });
}

/** Soft ambient shadow drawn under every board brick (offset and scaled by the scene). */
function buildShadow(): Sprite {
  return sprite("brick_shadow_sprite", S, S, (g, _i, w, h) => {
    const pad = w * 0.12;
    g.shadowColor = "rgba(0,0,0,0.6)";
    g.shadowBlur = w * 0.14;
    g.shadowOffsetX = w * 4;
    g.fillStyle = "#000";
    roundRect(g, pad - w * 4, pad, w - pad * 2, h - pad * 2, w * 0.2);
    g.fill();
  });
}

function buildBorder(): Sprite {
  return sprite("brick_border_sprite", S, S, (g, _i, w, h) => {
    const pad = w * 0.05;
    g.lineWidth = w * 0.05;
    g.strokeStyle = TEXT;
    roundRect(g, pad, pad, w - pad * 2, h - pad * 2, w * 0.2);
    g.stroke();
  });
}

function buildPop(): Sprite {
  const n = SPRITE_FRAMES.brick_pop_sprite;
  return sprite("brick_pop_sprite", 64, 64, (g, i, w, h) => {
    const t = i / (n - 1);
    g.lineWidth = 3 * (1 - t) + 1;
    g.strokeStyle = `rgba(255,255,255,${0.8 * (1 - t)})`;
    g.beginPath();
    g.arc(w / 2, h / 2, w * (0.15 + t * 0.33), 0, Math.PI * 2);
    g.stroke();
  });
}

function blank(name: SpriteName): Sprite {
  return sprite(name, 8, 8, () => undefined);
}

/** 3 px white rounded outline; the colour frames add a faint fill. */
function buildSelector(): Sprite {
  return sprite("replenish_selector_sprite", S, S, (g, i, w, h) => {
    const colour = i < 7 ? BLOCKY_COLORS[(i + 1) as Color] : null;
    const pad = w * 0.035;
    const lw = w * 0.045;
    roundRect(g, pad + lw / 2, pad + lw / 2, w - pad * 2 - lw, h - pad * 2 - lw, w * 0.22);
    if (colour) {
      g.fillStyle = colour;
      g.globalAlpha = 0.15;
      g.fill();
      g.globalAlpha = 1;
    }
    g.lineWidth = lw;
    g.strokeStyle = TEXT;
    g.lineJoin = "round";
    g.stroke();
  });
}

function buildReplenishFrame(): Sprite {
  return sprite("replenish_frame_sprite", S, S, (g, _i, w, h) => {
    const pad = w * 0.06;
    roundRect(g, pad, pad, w - pad * 2, h - pad * 2, w * 0.2);
    g.fillStyle = "rgba(0,0,0,0.28)";
    g.fill();
    g.lineWidth = w * 0.012;
    g.strokeStyle = PANEL_EDGE;
    g.stroke();
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
    toyButton(g, w, h, i % 2 === 1, (gg, cx, cy, r) => rotateIcon(gg, cx, cy, r, i >= 2));
  });
}

function buildPause(): Sprite {
  return sprite("pause_button_sprite", S, S, (g, _i, w, h) => {
    toyButton(g, w, h, false, (gg, cx, cy, r) => {
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
  return sprite("speedup_button_sprite", S, S, (g, i, w, h) => toyButton(g, w, h, i === 1, chevronUp));
}

function buildSound(): Sprite {
  return sprite("sound_button_sprite", S, S, (g, i, w, h) => {
    const muted = i >= 2;
    toyButton(g, w, h, i % 2 === 1, (gg, cx, cy, r) => {
      if (muted) {
        gg.fillStyle = "rgba(248,250,252,0.45)";
        gg.strokeStyle = gg.fillStyle;
      }
      speakerIcon(gg, cx, cy, r, muted);
      if (muted) {
        gg.strokeStyle = BLOCKY_COLORS[RED];
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
  return sprite("settings_button_sprite", S, S, (g, i, w, h) => toyButton(g, w, h, i === 1, gearIcon));
}

function buildBack(): Sprite {
  return sprite("back_button_sprite", S, S, (g, i, w, h) => {
    const right = i >= 2;
    toyButton(g, w, h, i % 2 === 1, (gg, cx, cy, r) => {
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
    toyButton(g, w, h, i === 1, (gg, cx, cy, r) => text(gg, "i", cx, cy + r * 0.04, r * 1.2, TEXT, 700, "center", DISPLAY));
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
      grad.addColorStop(0, BLOCKY_COLORS[BLUE]);
      grad.addColorStop(0.5, BLOCKY_COLORS[PURPLE]);
      grad.addColorStop(1, BLOCKY_COLORS[RED]);
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
    }
  });
}

function buildLevelComplete(): Sprite {
  return sprite("level_complete_sprite", 640, 160, (g, _i, w, h) => {
    panel(g, 4, 4, w - 8, h - 14, h * 0.2);
    text(g, "Level complete", w / 2, h / 2 - 4, h * 0.4, TEXT, 700, "center", DISPLAY);
  });
}

/** "HueBricks": every letter sits on a toy brick of its own colour. */
function buildLogo(): Sprite {
  const letters: Array<[string, Color]> = [
    ["H", RED],
    ["u", BLUE],
    ["e", YELLOW],
    ["B", PURPLE],
    ["r", ORANGE],
    ["i", GREEN],
    ["c", RED],
    ["k", BLUE],
    ["s", YELLOW],
  ];
  return sprite("logo_sprite", 768, 220, (g, i, w, h) => {
    const n = letters.length;
    const size = 80;
    const gap = 4;
    const total = n * size + (n - 1) * gap;
    const x0 = w / 2 - total / 2;
    const y = h / 2 - size / 2 - 6 + (i === 1 ? 6 : 0);
    const depth = i === 1 ? 3 : 9;
    letters.forEach(([ch, c], k) => {
      const x = x0 + k * (size + gap);
      // small stagger so the row reads as laid by hand
      const dy = (k % 2 === 0 ? -1 : 1) * 4;
      block(g, x, y + dy, size, size, BLOCKY_COLORS[c], { radius: size * 0.2, depth });
      text(g, ch, x + size / 2, y + dy + size / 2 + 2, size * 0.78, TEXT, 700, "center", DISPLAY);
    });
  });
}

function buildMenuButton(): Sprite {
  return sprite("menu_button_sprite", S, S, (g, i, w, h) => {
    const pad = w * 0.08;
    const depth = i === 1 ? 3 : 10;
    block(g, pad, pad + (i === 1 ? 6 : 0), w - pad * 2, h - pad * 2 - 10, PANEL, { radius: w * 0.2, depth, flat: true });
    const cx = w / 2;
    const cy = h / 2 - 5 + (i === 1 ? 6 : 0);
    g.fillStyle = TEXT;
    g.beginPath();
    g.moveTo(cx, cy - h * 0.22);
    g.lineTo(cx + w * 0.24, cy - h * 0.02);
    g.lineTo(cx + w * 0.17, cy - h * 0.02);
    g.lineTo(cx + w * 0.17, cy + h * 0.2);
    g.lineTo(cx - w * 0.17, cy + h * 0.2);
    g.lineTo(cx - w * 0.17, cy - h * 0.02);
    g.lineTo(cx - w * 0.24, cy - h * 0.02);
    g.closePath();
    g.fill();
  });
}

/** Title bottom bar: a raised panel strip. */
function buildMenuFrame(): Sprite {
  return sprite("menu_frame_sprite", 760, 127, (g, _i, w, h) => {
    g.fillStyle = PANEL_SIDE;
    g.fillRect(0, 0, w, h);
    g.fillStyle = PANEL;
    g.fillRect(0, 6, w, h - 6);
    g.fillStyle = PANEL_EDGE;
    g.fillRect(0, 6, w, 1);
  });
}

function modeGlyph(g: Ctx, glyph: Glyph, cx: number, cy: number, r: number): void {
  g.lineWidth = r * 0.18;
  g.lineJoin = "round";
  g.strokeStyle = "rgba(255,255,255,0.92)";
  glyphPath(g, glyph, cx, cy, r);
  g.stroke();
}

function buildModeButton(name: SpriteName, label: string, base: string, glyph: Glyph): Sprite {
  return sprite(name, 512, 256, (g, i, w, h) => {
    const pad = h * 0.1;
    const pressed = i === 1;
    const depth = pressed ? 4 : 12;
    const dy = pressed ? 8 : 0;
    block(g, pad, pad + dy, w - pad * 2, h - pad * 2 - 12, base, { radius: h * 0.22, depth });
    modeGlyph(g, glyph, w * 0.2, h / 2 - 6 + dy, h * 0.15);
    text(g, label, w * 0.61, h / 2 - 4 + dy, h * 0.3, TEXT, 700, "center", DISPLAY);
  });
}

function buildWorldButton(world: number): Sprite {
  const name = `world${world}_sprite` as SpriteName;
  const colorOf = [null, RED, YELLOW, BLUE, ORANGE, PURPLE, GREEN, BLACK] as const;
  const base = world === 0 ? NEUTRAL : BLOCKY_COLORS[colorOf[world] as Color];
  return sprite(name, S, S, (g, i, w, h) => {
    const pad = w * 0.07;
    const pressed = i === 1;
    const depth = pressed ? 3 : 10;
    const dy = pressed ? 7 : 0;
    block(g, pad, pad + dy, w - pad * 2, h - pad * 2 - 10, base, { radius: w * 0.2, depth });
    if (world === 0) {
      text(g, "Tutorial", w / 2, h / 2 - 5 + dy, w * 0.19, TEXT, 700, "center", DISPLAY);
    } else {
      text(g, "WORLD", w / 2, h * 0.35 + dy, w * 0.13, "rgba(255,255,255,0.75)", 700);
      text(g, String(world), w / 2, h * 0.6 + dy, w * 0.38, TEXT, 700, "center", DISPLAY);
    }
  });
}

function buildLevelSelect(): Sprite {
  return sprite("level_select_sprite", 512, 256, (g, _i, w, h) => panel(g, 3, 3, w - 6, h - 12, h * 0.12));
}

function buildCredits(): Sprite {
  return sprite("credits_sprite", 1024, 512, (g, _i, w, h) => {
    panel(g, 4, 4, w - 8, h - 14, h * 0.1);
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
export const BLOCKY_SLIDES: SlideStyle = {
  background(g, w, h) {
    g.fillStyle = BG;
    g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(255,255,255,0.03)";
    for (let x = 24; x < w; x += 48) {
      for (let y = 24; y < h * 0.78; y += 48) {
        g.beginPath();
        g.arc(x, y, 1.5, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.fillStyle = PANEL_SIDE;
    g.fillRect(0, h * 0.78, w, h * 0.22);
    g.fillStyle = PANEL;
    g.fillRect(0, h * 0.78 + 6, w, h * 0.22 - 6);
  },
  font: FONT,
  display: DISPLAY,
  text: TEXT,
  muted: MUTED,
  bgColor: BG,
  dotIdle: "rgba(255,255,255,0.25)",
  card: PANEL,
  cardEdge: PANEL_EDGE,
  cardShadow: PANEL_SIDE,
  gridLine: "rgba(255,255,255,0.06)",
  well: "rgba(0,0,0,0.28)",
  wellEdge: "rgba(255,255,255,0.1)",
  track: "rgba(255,255,255,0.14)",
  colors: BLOCKY_COLORS,
  inkOn: () => TEXT,
  tile: (g, x, y, w, h, base, opts) => block(g, x, y, w, h - Math.min(w, h) * 0.09, base, { radius: opts?.radius, depth: Math.min(w, h) * 0.09 }),
  glyphs: (g, c, cx, cy, size) => drawBlockyGlyphs(g, c, cx, cy - size * 0.045, size),
  button: toyButton,
};

/** Build the Blocky sprite set, falling back to the classic sprites where no art exists. */
export function buildBlockySprites(classic: SpriteMap): SpriteMap {
  const skin: Partial<SpriteMap> = {
    brick_sprite: buildBricks(),
    brick_noicon_sprite: buildNoIcon(),
    brick_shadow_sprite: buildShadow(),
    brick_glow_sprite: blank("brick_glow_sprite"),
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
    normal_button_sprite: buildModeButton("normal_button_sprite", "Normal", BLOCKY_COLORS[YELLOW], "diamond"),
    puzzle_button_sprite: buildModeButton("puzzle_button_sprite", "Puzzle", BLOCKY_COLORS[RED], "octagon"),
    zen_button_sprite: buildModeButton("zen_button_sprite", "Zen", BLOCKY_COLORS[BLUE], "circle"),
    arcade_button_sprite: buildModeButton("arcade_button_sprite", "Arcade", BLOCKY_COLORS[GREEN], "octagon"),
    back_button_sprite: buildBack(),
    info_button_sprite: buildInfo(),
    settings_button_sprite: buildSettings(),
    level_select_sprite: buildLevelSelect(),
    credits_sprite: buildCredits(),
  };
  for (let w = 0; w <= 7; w++) {
    skin[`world${w}_sprite` as SpriteName] = buildWorldButton(w);
  }
  const slides = buildTutorialSlides(skin.logo_sprite!, BLOCKY_SLIDES);
  skin.tutorial_intro_sprite = slides.intro;
  skin.tutorial_outro_sprite = slides.outro;
  return { ...classic, ...skin } as SpriteMap;
}
