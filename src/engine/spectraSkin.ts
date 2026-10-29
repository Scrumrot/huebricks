import { BLACK, BLUE, GREEN, ORANGE, PURPLE, RED, YELLOW, type Color } from "../core/color";
import type { Layout } from "../core/layout";
import { cellX, cellY, replenishY } from "../core/layout";
import { SPRITE_FRAMES, type Sprite, type SpriteMap, type SpriteName } from "./assets";
import { chevronUp, gearIcon, polygon, rgba, rotateIcon, roundRect, shade, speakerIcon, sprite, text, type Ctx } from "./modernSkin";
import { buildTutorialSlides, type SlideStyle } from "./modernSlides";
import { fillScreen, screenRect } from "./view";
import type { TitleFx } from "./backdrops";

/**
 * "Spectra": glowing gel tiles on a deep dark field. Light instead of gloss:
 * every brick has an inner glow, a crisp inner edge and a soft outer bloom
 * (drawn by the scene from `brick_glow_sprite`) so bricks of one colour read
 * as a single glowing group.
 */

export const FONT = 'Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
export const DISPLAY = '"Space Grotesk", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const BG = "#07070C";
export const GLASS = "#111119";
export const GLASS_EDGE = "rgba(255,255,255,0.12)";
export const TEXT = "#F2F2F7";
export const MUTED = "#8A8AA3";
export const NEUTRAL = "#171722";
export const BLACK_EDGE = "#8C8CA8";

/** Gel colours, indexed by colour bits. */
export const SPECTRA_COLORS: Record<Color, string> = {
  1: "#FF4D5E",
  2: "#3D8BFF",
  3: "#A66CFF",
  4: "#FFD23F",
  5: "#FF9A3C",
  6: "#3EE88A",
  7: "#2A2A36",
};

const NOICON_COLORS = [SPECTRA_COLORS[1], SPECTRA_COLORS[2], SPECTRA_COLORS[3], SPECTRA_COLORS[4], SPECTRA_COLORS[5], SPECTRA_COLORS[6], SPECTRA_COLORS[7], NEUTRAL];

/**
 * A gel tile: flat fill, soft inner glow in a lighter tint, a crisp 1.5 px
 * inner edge at 35% white. The black tile gets a visible light edge.
 */
export function gel(g: Ctx, x: number, y: number, w: number, h: number, base: string, opts: { radius?: number; glow?: number } = {}): void {
  const r = opts.radius ?? Math.min(w, h) * 0.22;
  const m = Math.min(w, h);
  roundRect(g, x, y, w, h, r);
  g.fillStyle = base;
  g.fill();
  g.save();
  g.clip();
  // inner glow: a blurred lighter stroke just inside the edge
  g.lineWidth = m * 0.12;
  g.strokeStyle = shade(base, 0.45);
  g.shadowColor = shade(base, 0.6);
  g.shadowBlur = m * (opts.glow ?? 0.22);
  roundRect(g, x - m * 0.04, y - m * 0.04, w + m * 0.08, h + m * 0.08, r);
  g.stroke();
  g.shadowBlur = 0;
  // crisp inner edge
  const lw = Math.max(1.5, m * 0.024);
  g.lineWidth = lw;
  g.strokeStyle = base === SPECTRA_COLORS[7] ? BLACK_EDGE : "rgba(255,255,255,0.35)";
  roundRect(g, x + lw / 2, y + lw / 2, w - lw, h - lw, r);
  g.stroke();
  g.restore();
}

/** Glass panel: translucent dark fill with a light edge. */
export function glass(g: Ctx, x: number, y: number, w: number, h: number, r: number, alpha = 0.92): void {
  roundRect(g, x, y, w, h, r);
  g.fillStyle = rgba(GLASS, alpha);
  g.fill();
  g.lineWidth = 1;
  g.strokeStyle = GLASS_EDGE;
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

/** 2 px white strokes with a soft white glow; innermost shape filled on mixes. */
export function drawSpectraGlyphs(g: Ctx, color: Color, cx: number, cy: number, size: number): void {
  const glyphs = GLYPHS[color];
  g.save();
  g.lineWidth = size * 0.033;
  g.lineJoin = "round";
  g.strokeStyle = "rgba(255,255,255,0.95)";
  g.shadowColor = "rgba(255,255,255,0.3)";
  g.shadowBlur = size * 0.1;
  const radii = glyphs.length === 1 ? [0.26] : glyphs.length === 2 ? [0.3, 0.17] : [0.31, 0.2, 0.1];
  glyphs.forEach((gl, i) => {
    glyphPath(g, gl, cx, cy, size * radii[i]);
    if (glyphs.length > 1 && i === glyphs.length - 1) {
      g.fillStyle = "rgba(255,255,255,0.3)";
      g.fill();
    }
    g.stroke();
  });
  g.restore();
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

/** Round glass button with a white icon; pressed is a little brighter and lower. */
export function glassButton(g: Ctx, w: number, h: number, pressed: boolean, icon: (g: Ctx, cx: number, cy: number, r: number) => void): void {
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * 0.4;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fillStyle = pressed ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.06)";
  g.fill();
  g.lineWidth = r * 0.035;
  g.strokeStyle = "rgba(255,255,255,0.18)";
  g.stroke();
  g.save();
  g.strokeStyle = TEXT;
  g.fillStyle = TEXT;
  g.lineWidth = r * 0.13;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.shadowColor = "rgba(255,255,255,0.35)";
  g.shadowBlur = r * 0.12;
  icon(g, cx, cy, r);
  g.restore();
}

// ---------------------------------------------------------------------------
// Backdrop
// ---------------------------------------------------------------------------

/**
 * Near-black field, a large soft glow behind the board, two very blurred
 * coloured blobs drifting on 30 s loops, a 1 px grid at 4% white over the
 * board, and the glass tray under the replenish line.
 */
export function drawSpectraBackdrop(g: Ctx, t: number, l?: Layout, flare = 0, fx: TitleFx | null = null): void {
  fillScreen(g, BG);
  const sr = screenRect();
  // the glows lean toward the cursor and jump toward a tap
  let ax = 0;
  let ay = 0;
  const pointer = fx?.pointer ?? null;
  for (const tap of fx?.taps ?? []) {
    const k = Math.max(0, 1 - (t - tap.t) / 1000);
    ax += (tap.x - sr.w / 2) * 0.35 * k;
    ay += (tap.y - sr.h / 2) * 0.35 * k;
  }
  const bx = l ? l.boardX + l.boardW / 2 : sr.w / 2;
  const by = l ? (cellY(l, l.cellNum) - l.cellSep) / 2 : sr.h / 2;
  const blob = (x: number, y: number, r: number, color: string, a: number) => {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, rgba(color, a));
    grad.addColorStop(1, rgba(color, 0));
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  };
  const p1 = (t / 30000) * Math.PI * 2;
  const p2 = (t / 30000) * Math.PI * 2 + 2.1;
  if (pointer) {
    ax += (pointer.x - bx) * 0.15;
    ay += (pointer.y - by) * 0.15;
  }
  blob(bx + Math.cos(p1) * 140 + ax, by + Math.sin(p1 * 0.7) * 90 + ay, 260, "#1B2F7A", 0.1 + flare * 0.2);
  blob(bx - Math.cos(p2 * 0.8) * 160 + ax, by + Math.sin(p2) * 80 + ay, 240, "#3B1B5E", 0.1 + flare * 0.2);
  blob(bx, by, Math.max(sr.w, sr.h) * 0.42, "#FFFFFF", 0.06 + flare * 0.12);
  if (l) {
    const n = l.cellNum;
    const gridBottom = cellY(l, n) - l.cellSep;
    g.strokeStyle = "rgba(255,255,255,0.04)";
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 1; i < n; i++) {
      const x = Math.floor(cellX(l, i) - l.cellSep / 2) + 0.5;
      g.moveTo(x, l.boardY);
      g.lineTo(x, gridBottom);
      const y = Math.floor(cellY(l, i) - l.cellSep / 2) + 0.5;
      g.moveTo(l.boardX, y);
      g.lineTo(l.boardX + l.boardW, y);
    }
    g.stroke();
    const ry = replenishY(l);
    roundRect(g, l.boardX - 6, ry - 6, l.boardW + 12, l.cellH + 12, 10);
    g.fillStyle = GLASS;
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.10)";
    g.fillRect(l.boardX - 6 + 10, ry - 6, l.boardW + 12 - 20, 1);
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
    gel(g, pad, pad, w - pad * 2, h - pad * 2, SPECTRA_COLORS[color]);
    drawSpectraGlyphs(g, color, w / 2, h / 2, w);
  });
}

function buildNoIcon(): Sprite {
  return sprite("brick_noicon_sprite", S, S, (g, i, w, h) => {
    const pad = w * PAD;
    gel(g, pad, pad, w - pad * 2, h - pad * 2, NOICON_COLORS[i]);
  });
}

/** Soft outer bloom per colour, drawn under each brick at 1.4x cell size. */
function buildGlow(): Sprite {
  return sprite("brick_glow_sprite", S, S, (g, i, w, h) => {
    const color = (i + 1) as Color;
    const pad = w * 0.26;
    g.shadowColor = SPECTRA_COLORS[color];
    g.shadowBlur = w * 0.16;
    g.shadowOffsetX = w * 4;
    g.fillStyle = SPECTRA_COLORS[color];
    roundRect(g, pad - w * 4, pad, w - pad * 2, h - pad * 2, w * 0.14);
    g.fill();
    g.fill();
  });
}

function buildShadow(): Sprite {
  return sprite("brick_shadow_sprite", 8, 8, () => undefined);
}

function buildBorder(): Sprite {
  return sprite("brick_border_sprite", S, S, (g, _i, w, h) => {
    const pad = w * 0.05;
    g.lineWidth = w * 0.05;
    g.strokeStyle = TEXT;
    roundRect(g, pad, pad, w - pad * 2, h - pad * 2, w * 0.22);
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

/** Glowing ring in the brick's colour with a soft bloom; frame 7 is white. */
function buildSelector(): Sprite {
  return sprite("replenish_selector_sprite", S, S, (g, i, w, h) => {
    const colour = i < 7 ? SPECTRA_COLORS[(i + 1) as Color] : TEXT;
    const pad = w * 0.035;
    const lw = w * 0.04;
    g.save();
    g.shadowColor = colour;
    g.shadowBlur = w * 0.08;
    g.lineWidth = lw;
    g.strokeStyle = colour;
    g.lineJoin = "round";
    roundRect(g, pad + lw / 2, pad + lw / 2, w - pad * 2 - lw, h - pad * 2 - lw, w * 0.22);
    g.stroke();
    g.stroke();
    g.restore();
    if (i < 7) {
      g.fillStyle = rgba(colour, 0.12);
      g.fill();
    }
  });
}

function buildReplenishFrame(): Sprite {
  return sprite("replenish_frame_sprite", S, S, (g, _i, w, h) => {
    const pad = w * 0.06;
    roundRect(g, pad, pad, w - pad * 2, h - pad * 2, w * 0.2);
    g.fillStyle = "rgba(255,255,255,0.04)";
    g.fill();
    g.lineWidth = w * 0.012;
    g.strokeStyle = "rgba(255,255,255,0.10)";
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
    glassButton(g, w, h, i % 2 === 1, (gg, cx, cy, r) => rotateIcon(gg, cx, cy, r, i >= 2));
  });
}

function buildPause(): Sprite {
  return sprite("pause_button_sprite", S, S, (g, _i, w, h) => {
    glassButton(g, w, h, false, (gg, cx, cy, r) => {
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
  return sprite("speedup_button_sprite", S, S, (g, i, w, h) => glassButton(g, w, h, i === 1, chevronUp));
}

function buildSound(): Sprite {
  return sprite("sound_button_sprite", S, S, (g, i, w, h) => {
    const muted = i >= 2;
    glassButton(g, w, h, i % 2 === 1, (gg, cx, cy, r) => {
      if (muted) {
        gg.fillStyle = "rgba(242,242,247,0.45)";
        gg.strokeStyle = gg.fillStyle;
      }
      speakerIcon(gg, cx, cy, r, muted);
      if (muted) {
        gg.strokeStyle = SPECTRA_COLORS[RED];
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
  return sprite("settings_button_sprite", S, S, (g, i, w, h) => glassButton(g, w, h, i === 1, gearIcon));
}

function buildBack(): Sprite {
  return sprite("back_button_sprite", S, S, (g, i, w, h) => {
    const right = i >= 2;
    glassButton(g, w, h, i % 2 === 1, (gg, cx, cy, r) => {
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
    glassButton(g, w, h, i === 1, (gg, cx, cy, r) => text(gg, "i", cx, cy + r * 0.04, r * 1.2, TEXT, 700, "center", DISPLAY));
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
      grad.addColorStop(0, SPECTRA_COLORS[BLUE]);
      grad.addColorStop(0.5, SPECTRA_COLORS[PURPLE]);
      grad.addColorStop(1, SPECTRA_COLORS[RED]);
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
    }
  });
}

function buildLevelComplete(): Sprite {
  return sprite("level_complete_sprite", 640, 160, (g, _i, w, h) => {
    glass(g, 4, 4, w - 8, h - 8, h * 0.2);
    text(g, "Level complete", w / 2, h / 2, h * 0.4, TEXT, 700, "center", DISPLAY);
  });
}

/** Spectrum gradient across the wordmark. */
function spectrum(g: Ctx, x0: number, x1: number): CanvasGradient {
  const grad = g.createLinearGradient(x0, 0, x1, 0);
  [RED, ORANGE, YELLOW, GREEN, BLUE, PURPLE].forEach((c, i, a) => grad.addColorStop(i / (a.length - 1), SPECTRA_COLORS[c as Color]));
  return grad;
}

/** "HueBricks" in Space Grotesk, white with a spectrum stroke and a soft bloom. */
function buildLogo(): Sprite {
  return sprite("logo_sprite", 768, 400, (g, i, w, h) => {
    const size = h * 0.4;
    g.font = `700 ${size}px ${DISPLAY}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    const tw = g.measureText("HueBricks").width;
    const x0 = w / 2 - tw / 2;
    g.save();
    g.shadowColor = "rgba(255,255,255,0.35)";
    g.shadowBlur = i === 1 ? 10 : 24;
    g.fillStyle = TEXT;
    g.fillText("HueBricks", w / 2, h / 2 - 6);
    g.restore();
    g.lineWidth = size * 0.045;
    g.lineJoin = "round";
    g.strokeStyle = spectrum(g, x0, x0 + tw);
    g.strokeText("HueBricks", w / 2, h / 2 - 6);
    // a thin spectrum line under the word
    g.fillStyle = spectrum(g, x0, x0 + tw);
    g.globalAlpha = i === 1 ? 0.5 : 0.9;
    roundRect(g, x0, h / 2 + size * 0.52, tw, 6, 3);
    g.fill();
    g.globalAlpha = 1;
  });
}

function buildMenuButton(): Sprite {
  return sprite("menu_button_sprite", S, S, (g, i, w, h) => {
    const pad = w * 0.08;
    glass(g, pad, pad, w - pad * 2, h - pad * 2, w * 0.2, i === 1 ? 0.7 : 0.92);
    const cx = w / 2;
    const cy = h / 2;
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

function buildMenuFrame(): Sprite {
  return sprite("menu_frame_sprite", 760, 127, (g, _i, w, h) => {
    g.fillStyle = rgba(GLASS, 0.85);
    g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(255,255,255,0.10)";
    g.fillRect(0, 0, w, 1);
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

/** Glass pill with a glowing glyph in the mode's colour. */
function buildModeButton(name: SpriteName, label: string, base: string, glyph: Glyph): Sprite {
  return sprite(name, 512, 256, (g, i, w, h) => {
    const pad = h * 0.1;
    const pressed = i === 1;
    roundRect(g, pad, pad, w - pad * 2, h - pad * 2, (h - pad * 2) / 2);
    g.fillStyle = pressed ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.07)";
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = pressed ? rgba(base, 0.7) : "rgba(255,255,255,0.18)";
    g.stroke();
    modeGlyph(g, glyph, w * 0.22, h / 2, h * 0.15, base);
    text(g, label, w * 0.62, h / 2 + 1, h * 0.3, TEXT, 700, "center", DISPLAY);
  });
}

function buildWorldButton(world: number): Sprite {
  const name = `world${world}_sprite` as SpriteName;
  const colorOf = [null, RED, YELLOW, BLUE, ORANGE, PURPLE, GREEN, BLACK] as const;
  const base = world === 0 ? NEUTRAL : SPECTRA_COLORS[colorOf[world] as Color];
  return sprite(name, S, S, (g, i, w, h) => {
    const pad = w * 0.07;
    gel(g, pad, pad, w - pad * 2, h - pad * 2, i === 1 ? shade(base, 0.15) : base);
    g.save();
    g.shadowColor = "rgba(255,255,255,0.4)";
    g.shadowBlur = 10;
    if (world === 0) {
      text(g, "Tutorial", w / 2, h / 2, w * 0.19, TEXT, 700, "center", DISPLAY);
    } else {
      text(g, "WORLD", w / 2, h * 0.37, w * 0.13, "rgba(255,255,255,0.8)", 700);
      text(g, String(world), w / 2, h * 0.62, w * 0.38, TEXT, 700, "center", DISPLAY);
    }
    g.restore();
  });
}

function buildLevelSelect(): Sprite {
  return sprite("level_select_sprite", 512, 256, (g, _i, w, h) => glass(g, 3, 3, w - 6, h - 6, h * 0.12));
}

function buildCredits(): Sprite {
  return sprite("credits_sprite", 1024, 512, (g, _i, w, h) => {
    glass(g, 4, 4, w - 8, h - 8, h * 0.1, 0.96);
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
export const SPECTRA_SLIDES: SlideStyle = {
  background(g, w, h) {
    g.fillStyle = BG;
    g.fillRect(0, 0, w, h);
    const glow = g.createRadialGradient(w / 2, h * 0.4, 0, w / 2, h * 0.4, w * 0.5);
    glow.addColorStop(0, "rgba(255,255,255,0.06)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = glow;
    g.fillRect(0, 0, w, h);
    g.fillStyle = rgba(GLASS, 0.85);
    g.fillRect(0, h * 0.78, w, h * 0.22);
    g.fillStyle = "rgba(255,255,255,0.10)";
    g.fillRect(0, h * 0.78, w, 1);
  },
  font: FONT,
  display: DISPLAY,
  text: TEXT,
  muted: MUTED,
  bgColor: BG,
  dotIdle: "rgba(255,255,255,0.25)",
  card: GLASS,
  cardEdge: GLASS_EDGE,
  cardShadow: "rgba(0,0,0,0.5)",
  gridLine: "rgba(255,255,255,0.05)",
  well: "rgba(255,255,255,0.04)",
  wellEdge: "rgba(255,255,255,0.10)",
  track: "rgba(255,255,255,0.14)",
  colors: SPECTRA_COLORS,
  inkOn: () => TEXT,
  tile: (g, x, y, w, h, base, opts) => gel(g, x, y, w, h, base, { radius: opts?.radius }),
  glyphs: drawSpectraGlyphs,
  button: glassButton,
};

/** Build the Spectra sprite set, falling back to the classic sprites where no art exists. */
export function buildSpectraSprites(classic: SpriteMap): SpriteMap {
  const skin: Partial<SpriteMap> = {
    brick_sprite: buildBricks(),
    brick_noicon_sprite: buildNoIcon(),
    brick_glow_sprite: buildGlow(),
    brick_shadow_sprite: buildShadow(),
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
    normal_button_sprite: buildModeButton("normal_button_sprite", "Normal", SPECTRA_COLORS[YELLOW], "diamond"),
    puzzle_button_sprite: buildModeButton("puzzle_button_sprite", "Puzzle", SPECTRA_COLORS[RED], "octagon"),
    zen_button_sprite: buildModeButton("zen_button_sprite", "Zen", SPECTRA_COLORS[BLUE], "circle"),
    arcade_button_sprite: buildModeButton("arcade_button_sprite", "Arcade", SPECTRA_COLORS[GREEN], "octagon"),
    back_button_sprite: buildBack(),
    info_button_sprite: buildInfo(),
    settings_button_sprite: buildSettings(),
    level_select_sprite: buildLevelSelect(),
    credits_sprite: buildCredits(),
  };
  for (let w = 0; w <= 7; w++) {
    skin[`world${w}_sprite` as SpriteName] = buildWorldButton(w);
  }
  const slides = buildTutorialSlides(skin.logo_sprite!, SPECTRA_SLIDES);
  skin.tutorial_intro_sprite = slides.intro;
  skin.tutorial_outro_sprite = slides.outro;
  return { ...classic, ...skin } as SpriteMap;
}
