import { BLACK, BLUE, GREEN, ORANGE, PURPLE, RED, YELLOW, type Color } from "../core/color";
import { SPRITE_FRAMES, type Sprite, type SpriteMap, type SpriteName } from "./assets";
import { buildTutorialSlides } from "./modernSlides";

/**
 * Procedurally generated "modern" sprite set.
 *
 * Every sprite the game draws is rebuilt here on offscreen canvases with a
 * flat, rounded, high-contrast look, under the same names and frame layouts
 * as the original GameMaker sprites so the scenes need no changes. Sprites
 * without a modern equivalent (tutorial slides, unused store buttons) fall
 * back to the classic art.
 */

export const FONT = '"Segoe UI", Inter, Roboto, "Helvetica Neue", Arial, sans-serif';

/** Modern brick colours, indexed by colour bits. */
export const MODERN_COLORS: Record<Color, string> = {
  1: "#ef3f4f", // red
  2: "#3b7cff", // blue
  3: "#9b5de5", // purple
  4: "#ffc12b", // yellow
  5: "#ff8a2a", // orange
  6: "#2fcc71", // green
  7: "#4b5563", // black / chromatic gray
};

/** `brick_noicon_sprite` frame -> colour (frames 0..5 colours, 6 black, 7 neutral). */
const NOICON_COLORS = ["#ef3f4f", "#3b7cff", "#9b5de5", "#ffc12b", "#ff8a2a", "#2fcc71", "#4b5563", "#2a3446"];

export const PANEL = "#151d2e";
export const PANEL_LIGHT = "#1f2a40";
export const PANEL_EDGE = "rgba(255,255,255,0.10)";
export const WHITE = "#f8fafc";

export type Ctx = CanvasRenderingContext2D;

export function canvas(w: number, h: number, draw: (g: Ctx, w: number, h: number) => void): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = true;
  draw(g, w, h);
  return c;
}

export function sprite(name: SpriteName, w: number, h: number, draw: (g: Ctx, frame: number, w: number, h: number) => void): Sprite {
  const n = SPRITE_FRAMES[name];
  const frames = Array.from({ length: n }, (_, i) => canvas(w, h, (g, cw, ch) => draw(g, i, cw, ch)));
  return { name, frames, width: w, height: h };
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mix `hex` toward white (t > 0) or black (t < 0). */
export function shade(hex: string, t: number): string {
  const [r, g, b] = hexToRgb(hex);
  const target = t > 0 ? 255 : 0;
  const a = Math.abs(t);
  const m = (c: number) => Math.round(c + (target - c) * a);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}

export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

export function roundRect(g: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.lineTo(x + w - rr, y);
  g.quadraticCurveTo(x + w, y, x + w, y + rr);
  g.lineTo(x + w, y + h - rr);
  g.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  g.lineTo(x + rr, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - rr);
  g.lineTo(x, y + rr);
  g.quadraticCurveTo(x, y, x + rr, y);
  g.closePath();
}

export function text(g: Ctx, s: string, x: number, y: number, size: number, color = WHITE, weight = 700, align: CanvasTextAlign = "center"): void {
  g.font = `${weight} ${size}px ${FONT}`;
  g.textAlign = align;
  g.textBaseline = "middle";
  g.fillStyle = color;
  g.fillText(s, x, y);
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export function polygon(g: Ctx, cx: number, cy: number, r: number, sides: number, rotation = 0): void {
  g.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i * Math.PI * 2) / sides;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
}

type Glyph = "octagon" | "diamond" | "circle";

/** The glyph language of the original art: each primary has a shape, mixes nest them. */
const GLYPHS: Record<Color, Glyph[]> = {
  1: ["octagon"], // red
  2: ["diamond"], // blue
  3: ["diamond", "octagon"], // purple
  4: ["circle"], // yellow
  5: ["octagon", "circle"], // orange
  6: ["circle", "diamond"], // green
  7: ["octagon", "diamond", "circle"], // black
};

function strokeGlyph(g: Ctx, glyph: Glyph, cx: number, cy: number, r: number): void {
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
  g.stroke();
}

export function drawGlyphs(g: Ctx, color: Color, cx: number, cy: number, size: number): void {
  const glyphs = GLYPHS[color];
  g.lineWidth = size * 0.045;
  g.lineJoin = "round";
  g.strokeStyle = "rgba(255,255,255,0.92)";
  const radii = glyphs.length === 1 ? [0.26] : glyphs.length === 2 ? [0.3, 0.17] : [0.31, 0.2, 0.1];
  glyphs.forEach((gl, i) => strokeGlyph(g, gl, cx, cy, size * radii[i]));
}

/** A rounded tile with a soft vertical gradient and top highlight. */
export function tile(g: Ctx, x: number, y: number, w: number, h: number, base: string, opts: { radius?: number; flat?: boolean } = {}): void {
  const r = opts.radius ?? Math.min(w, h) * 0.22;
  roundRect(g, x, y, w, h, r);
  if (opts.flat) {
    g.fillStyle = base;
    g.fill();
    return;
  }
  const grad = g.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, shade(base, 0.18));
  grad.addColorStop(0.55, base);
  grad.addColorStop(1, shade(base, -0.22));
  g.fillStyle = grad;
  g.fill();
  // top highlight
  g.save();
  g.clip();
  const hl = g.createLinearGradient(0, y, 0, y + h * 0.5);
  hl.addColorStop(0, "rgba(255,255,255,0.22)");
  hl.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = hl;
  g.fillRect(x, y, w, h * 0.5);
  g.restore();
  // edge
  g.lineWidth = Math.max(1, w * 0.012);
  g.strokeStyle = "rgba(0,0,0,0.35)";
  roundRect(g, x + g.lineWidth / 2, y + g.lineWidth / 2, w - g.lineWidth, h - g.lineWidth, r);
  g.stroke();
}

export function circleButton(g: Ctx, w: number, h: number, pressed: boolean, icon: (g: Ctx, cx: number, cy: number, r: number) => void): void {
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * 0.44;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  const grad = g.createLinearGradient(0, cy - r, 0, cy + r);
  grad.addColorStop(0, pressed ? PANEL : PANEL_LIGHT);
  grad.addColorStop(1, pressed ? "#0e1422" : PANEL);
  g.fillStyle = grad;
  g.fill();
  g.lineWidth = r * 0.06;
  g.strokeStyle = pressed ? "rgba(255,255,255,0.25)" : PANEL_EDGE;
  g.stroke();
  g.strokeStyle = WHITE;
  g.fillStyle = WHITE;
  g.lineWidth = r * 0.14;
  g.lineCap = "round";
  g.lineJoin = "round";
  icon(g, cx, cy, r);
}

export function rotateIcon(g: Ctx, cx: number, cy: number, r: number, clockwise: boolean): void {
  const rr = r * 0.5;
  const dir = clockwise ? 1 : -1;
  // A 300 degree arc whose gap sits at the top; the arrow head is at the
  // end of the arc and points along the direction of travel.
  const start = -Math.PI / 2 + dir * Math.PI * 0.25;
  const end = start + dir * Math.PI * 1.62;
  g.beginPath();
  g.arc(cx, cy, rr, start, end, !clockwise);
  g.stroke();
  const ax = cx + Math.cos(end) * rr;
  const ay = cy + Math.sin(end) * rr;
  const travel = end + (dir * Math.PI) / 2;
  const s = r * 0.3;
  // chevron head: two strokes meeting at the tip, open against the travel direction
  const tipX = ax + Math.cos(travel) * s * 0.45;
  const tipY = ay + Math.sin(travel) * s * 0.45;
  for (const side of [1, -1]) {
    const a = travel + Math.PI + side * (Math.PI / 4);
    g.beginPath();
    g.moveTo(tipX, tipY);
    g.lineTo(tipX + Math.cos(a) * s, tipY + Math.sin(a) * s);
    g.stroke();
  }
}

export function chevronUp(g: Ctx, cx: number, cy: number, r: number): void {
  const w = r * 0.5;
  const h = r * 0.28;
  for (const dy of [-h * 0.7, h * 0.7]) {
    g.beginPath();
    g.moveTo(cx - w, cy + dy + h / 2);
    g.lineTo(cx, cy + dy - h / 2);
    g.lineTo(cx + w, cy + dy + h / 2);
    g.stroke();
  }
}

function gearIcon(g: Ctx, cx: number, cy: number, r: number): void {
  const teeth = 8;
  const outer = r * 0.52;
  const inner = r * 0.38;
  g.beginPath();
  for (let i = 0; i < teeth * 2; i++) {
    const a = (i * Math.PI) / teeth;
    const rad = i % 2 === 0 ? outer : inner;
    const a2 = a + Math.PI / teeth / 2;
    const x1 = cx + Math.cos(a) * rad;
    const y1 = cy + Math.sin(a) * rad;
    const x2 = cx + Math.cos(a2) * rad;
    const y2 = cy + Math.sin(a2) * rad;
    if (i === 0) g.moveTo(x1, y1);
    else g.lineTo(x1, y1);
    g.lineTo(x2, y2);
  }
  g.closePath();
  g.fill();
  g.globalCompositeOperation = "destination-out";
  g.beginPath();
  g.arc(cx, cy, r * 0.16, 0, Math.PI * 2);
  g.fill();
  g.globalCompositeOperation = "source-over";
}

export function card(g: Ctx, x: number, y: number, w: number, h: number, r: number, alpha = 0.94): void {
  roundRect(g, x, y, w, h, r);
  g.fillStyle = rgba("#141c2c", alpha);
  g.fill();
  g.lineWidth = Math.max(1, Math.min(w, h) * 0.008);
  g.strokeStyle = PANEL_EDGE;
  g.stroke();
}

// ---------------------------------------------------------------------------
// Sprite builders
// ---------------------------------------------------------------------------

const S = 256; // base size for 128px originals (2x for crisp scaling)

function buildBricks(): Sprite {
  return sprite("brick_sprite", S, S, (g, i, w, h) => {
    const color = (i + 1) as Color;
    const pad = w * 0.04;
    tile(g, pad, pad, w - pad * 2, h - pad * 2, MODERN_COLORS[color]);
    drawGlyphs(g, color, w / 2, h / 2, w);
  });
}

function buildNoIcon(): Sprite {
  return sprite("brick_noicon_sprite", S, S, (g, i, w, h) => {
    const pad = w * 0.04;
    tile(g, pad, pad, w - pad * 2, h - pad * 2, NOICON_COLORS[i]);
  });
}

function buildBorder(): Sprite {
  return sprite("brick_border_sprite", S, S, (g, _i, w, h) => {
    const pad = w * 0.05;
    g.lineWidth = w * 0.05;
    g.strokeStyle = WHITE;
    roundRect(g, pad, pad, w - pad * 2, h - pad * 2, w * 0.2);
    g.stroke();
  });
}

function buildPop(): Sprite {
  const n = SPRITE_FRAMES.brick_pop_sprite;
  return sprite("brick_pop_sprite", S, S, (g, i, w, h) => {
    const t = i / (n - 1);
    const cx = w / 2;
    const cy = h / 2;
    const ease = 1 - Math.pow(1 - t, 2);
    const ring = w * (0.15 + ease * 0.42);
    g.lineWidth = w * 0.06 * (1 - t) + 1;
    g.strokeStyle = `rgba(255,255,255,${0.95 * (1 - t)})`;
    g.beginPath();
    g.arc(cx, cy, ring, 0, Math.PI * 2);
    g.stroke();
    // sparks
    g.fillStyle = `rgba(255,255,255,${0.9 * (1 - t)})`;
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4 + Math.PI / 8;
      const d = w * (0.1 + ease * 0.5);
      const rr = w * 0.035 * (1 - t * 0.7);
      g.beginPath();
      g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rr, 0, Math.PI * 2);
      g.fill();
    }
    // flash
    if (t < 0.35) {
      g.fillStyle = `rgba(255,255,255,${0.6 * (1 - t / 0.35)})`;
      roundRect(g, w * 0.04, h * 0.04, w * 0.92, h * 0.92, w * 0.2);
      g.fill();
    }
  });
}

function buildExpand(name: SpriteName, color: Color): Sprite {
  const n = SPRITE_FRAMES[name];
  return sprite(name, S, S, (g, i, w, h) => {
    const t = (i + 1) / n;
    const pad = w * 0.04;
    g.save();
    roundRect(g, pad, pad, w - pad * 2, h - pad * 2, w * 0.22);
    g.clip();
    g.fillStyle = MODERN_COLORS[color];
    g.beginPath();
    g.arc(w / 2, h / 2, w * 0.75 * t, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = `rgba(255,255,255,${0.35 * (1 - t)})`;
    g.fill();
    g.restore();
    if (t >= 0.99) drawGlyphs(g, color, w / 2, h / 2, w);
  });
}

function buildSelector(): Sprite {
  return sprite("replenish_selector_sprite", S, S, (g, i, w, h) => {
    const color = i < 7 ? MODERN_COLORS[(i + 1) as Color] : WHITE;
    const pad = w * 0.035;
    g.shadowColor = color;
    g.shadowBlur = w * 0.08;
    g.lineWidth = w * 0.05;
    g.strokeStyle = color;
    roundRect(g, pad + g.lineWidth / 2, pad + g.lineWidth / 2, w - pad * 2 - g.lineWidth, h - pad * 2 - g.lineWidth, w * 0.22);
    g.stroke();
    g.shadowBlur = 0;
    if (i < 7) {
      g.fillStyle = rgba(color, 0.18);
      g.fill();
    }
  });
}

function buildReplenishFrame(): Sprite {
  return sprite("replenish_frame_sprite", S, S, (g, _i, w, h) => {
    const pad = w * 0.06;
    roundRect(g, pad, pad, w - pad * 2, h - pad * 2, w * 0.18);
    g.fillStyle = "rgba(255,255,255,0.05)";
    g.fill();
    g.lineWidth = w * 0.015;
    g.strokeStyle = "rgba(255,255,255,0.12)";
    g.stroke();
  });
}

function buildWorldBg(): Sprite {
  const colors = ["#64748b", ...[RED, YELLOW, BLUE, ORANGE, PURPLE, GREEN, BLACK].map((c) => MODERN_COLORS[c as Color])];
  return sprite("worldbg_sprite", 512, 512, (g, i, w, h) => {
    g.fillStyle = "#0e1526";
    g.fillRect(0, 0, w, h);
    const glow = g.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, w * 0.7);
    glow.addColorStop(0, rgba(colors[i], i === 0 ? 0.25 : 0.38));
    glow.addColorStop(0.6, rgba(colors[i], 0.08));
    glow.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = glow;
    g.fillRect(0, 0, w, h);
    const vignette = g.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.8);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.45)");
    g.fillStyle = vignette;
    g.fillRect(0, 0, w, h);
  });
}

function buildSidebar(): Sprite {
  return sprite("sidebar_sprite", 128, 512, (g, i, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#182236");
    grad.addColorStop(1, "#0f1626");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    // edge toward the board
    g.fillStyle = "rgba(255,255,255,0.08)";
    if (i === 0) g.fillRect(w - 2, 0, 2, h);
    else g.fillRect(0, 0, 2, h);
  });
}

function buildRotate(): Sprite {
  return sprite("rotate_button_sprite", S, S, (g, i, w, h) => {
    const clockwise = i >= 2;
    const pressed = i % 2 === 1;
    circleButton(g, w, h, pressed, (gg, cx, cy, r) => rotateIcon(gg, cx, cy, r, clockwise));
  });
}

function buildPause(): Sprite {
  return sprite("pause_button_sprite", S, S, (g, _i, w, h) => {
    circleButton(g, w, h, false, (gg, cx, cy, r) => {
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
  return sprite("speedup_button_sprite", S, S, (g, i, w, h) => {
    circleButton(g, w, h, i === 1, chevronUp);
  });
}

function buildProgress(): Sprite {
  return sprite("progressbar_sprite", 256, 8, (g, i, w, h) => {
    if (i === 2) {
      g.fillStyle = "rgba(255,255,255,0.10)";
      g.fillRect(0, 0, w, h);
    } else if (i === 1) {
      g.fillStyle = "rgba(255,255,255,0.28)";
      g.fillRect(0, 0, w, h);
    } else {
      const grad = g.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, MODERN_COLORS[BLUE]);
      grad.addColorStop(0.5, MODERN_COLORS[PURPLE]);
      grad.addColorStop(1, MODERN_COLORS[RED]);
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
    }
  });
}

function buildLevelComplete(): Sprite {
  return sprite("level_complete_sprite", 640, 160, (g, _i, w, h) => {
    card(g, 4, 4, w - 8, h - 8, h * 0.3, 0.92);
    g.shadowColor = "rgba(255,255,255,0.35)";
    g.shadowBlur = 12;
    text(g, "Level Complete!", w / 2, h / 2, h * 0.42, WHITE, 800);
    g.shadowBlur = 0;
  });
}

function buildLogo(): Sprite {
  return sprite("logo_sprite", 512, 512, (g, i, w, h) => {
    const pad = w * 0.04;
    const r = w * 0.2;
    // hue ring border
    const hues = [RED, ORANGE, YELLOW, GREEN, BLUE, PURPLE, RED].map((c) => MODERN_COLORS[c as Color]);
    const ring = g.createConicGradient ? g.createConicGradient(-Math.PI / 2, w / 2, h / 2) : null;
    if (ring) {
      hues.forEach((c, k) => ring.addColorStop(k / (hues.length - 1), c));
      roundRect(g, pad, pad, w - pad * 2, h - pad * 2, r);
      g.fillStyle = ring;
      g.fill();
    }
    const inner = pad + w * 0.03;
    tile(g, inner, inner, w - inner * 2, h - inner * 2, i === 1 ? "#1b2538" : "#111827", { radius: r * 0.85 });
    g.shadowColor = "rgba(255,255,255,0.25)";
    g.shadowBlur = 18;
    text(g, "H", w * 0.46, h * 0.5, w * 0.56, WHITE, 800);
    g.shadowBlur = 0;
    text(g, "UE", w * 0.76, h * 0.26, w * 0.15, WHITE, 800);
    g.font = `800 ${w * 0.12}px ${FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    const label = "BR";
    const label2 = "CKS";
    const wBR = g.measureText(label).width;
    const wI = g.measureText("i").width;
    const wCKS = g.measureText(label2).width;
    const total = wBR + wI + wCKS;
    let x = w / 2 - total / 2;
    g.textAlign = "left";
    g.fillStyle = WHITE;
    g.fillText(label, x, h * 0.82);
    x += wBR;
    g.fillStyle = MODERN_COLORS[RED];
    g.fillText("i", x, h * 0.82);
    x += wI;
    g.fillStyle = WHITE;
    g.fillText(label2, x, h * 0.82);
  });
}

function buildMenuButton(): Sprite {
  return sprite("menu_button_sprite", S, S, (g, i, w, h) => {
    const pad = w * 0.06;
    tile(g, pad, pad, w - pad * 2, h - pad * 2, i === 1 ? "#2a3650" : PANEL_LIGHT, { radius: w * 0.2 });
    // home icon
    const cx = w / 2;
    const cy = h / 2;
    g.fillStyle = WHITE;
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
    g.fillStyle = "rgba(11,17,32,0.85)";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(255,255,255,0.1)";
    g.fillRect(0, 0, w, 2);
  });
}

function buildModeButton(name: SpriteName, label: string, base: string, dark: boolean): Sprite {
  return sprite(name, 512, 256, (g, i, w, h) => {
    const pad = h * 0.08;
    tile(g, pad, pad, w - pad * 2, h - pad * 2, i === 1 ? shade(base, -0.25) : base, { radius: h * 0.3 });
    text(g, label, w / 2, h / 2 + 2, h * 0.36, dark ? "#111827" : WHITE, 800);
  });
}

function buildWorldButton(world: number): Sprite {
  const name = `world${world}_sprite` as SpriteName;
  const colorOf = [null, RED, YELLOW, BLUE, ORANGE, PURPLE, GREEN, BLACK] as const;
  const base = world === 0 ? "#cbd5e1" : MODERN_COLORS[colorOf[world] as Color];
  const dark = world === 0 || world === 2;
  return sprite(name, S, S, (g, i, w, h) => {
    const pad = w * 0.06;
    tile(g, pad, pad, w - pad * 2, h - pad * 2, i === 1 ? shade(base, -0.25) : base, { radius: w * 0.22 });
    const fg = dark ? "#111827" : WHITE;
    if (world === 0) {
      text(g, "Tutorial", w / 2, h / 2, w * 0.2, fg, 800);
    } else {
      text(g, "WORLD", w / 2, h * 0.38, w * 0.15, dark ? "rgba(17,24,39,0.75)" : "rgba(255,255,255,0.8)", 700);
      text(g, String(world), w / 2, h * 0.63, w * 0.34, fg, 800);
    }
  });
}

function buildBack(): Sprite {
  return sprite("back_button_sprite", S, S, (g, i, w, h) => {
    const right = i >= 2;
    const pressed = i % 2 === 1;
    circleButton(g, w, h, pressed, (gg, cx, cy, r) => {
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
    circleButton(g, w, h, i === 1, (gg, cx, cy, r) => {
      text(gg, "i", cx, cy + r * 0.04, r * 1.2, WHITE, 800);
    });
  });
}

/**
 * Speaker glyph; `muted` drops the sound waves. Uses the current fill/stroke
 * style so both themes can share it.
 */
export function speakerIcon(g: Ctx, cx: number, cy: number, r: number, muted: boolean): void {
  const bx = cx - r * 0.52;
  const bw = r * 0.26;
  const bh = r * 0.44;
  g.beginPath();
  g.moveTo(bx, cy - bh / 2);
  g.lineTo(bx + bw, cy - bh / 2);
  g.lineTo(bx + bw + r * 0.34, cy - r * 0.5);
  g.lineTo(bx + bw + r * 0.34, cy + r * 0.5);
  g.lineTo(bx + bw, cy + bh / 2);
  g.lineTo(bx, cy + bh / 2);
  g.closePath();
  g.fill();
  if (muted) return;
  const ox = bx + bw + r * 0.3;
  for (const k of [0.32, 0.56]) {
    g.beginPath();
    g.arc(ox, cy, r * k, -Math.PI * 0.24, Math.PI * 0.24);
    g.stroke();
  }
}

function buildSound(): Sprite {
  return sprite("sound_button_sprite", S, S, (g, i, w, h) => {
    const muted = i >= 2;
    circleButton(g, w, h, i % 2 === 1, (gg, cx, cy, r) => {
      if (muted) {
        gg.fillStyle = "rgba(248,250,252,0.45)";
        gg.strokeStyle = gg.fillStyle;
      }
      speakerIcon(gg, cx, cy, r, muted);
      if (muted) {
        gg.strokeStyle = MODERN_COLORS[RED];
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
  return sprite("settings_button_sprite", S, S, (g, i, w, h) => {
    circleButton(g, w, h, i === 1, gearIcon);
  });
}

function buildLevelSelect(): Sprite {
  return sprite("level_select_sprite", 512, 256, (g, _i, w, h) => {
    card(g, 3, 3, w - 6, h - 6, h * 0.12, 0.92);
  });
}

function buildCredits(): Sprite {
  return sprite("credits_sprite", 1024, 512, (g, _i, w, h) => {
    card(g, 4, 4, w - 8, h - 8, h * 0.1, 0.96);
    text(g, "CREDITS", w / 2, h * 0.14, h * 0.12, WHITE, 800);
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
      text(g, `${k}:`, w * 0.47, y, size, "#94a3b8", 600, "right");
      text(g, v, w * 0.49, y, size, WHITE, 700, "left");
    });
    const y = h * 0.28 + rows.length * size * 1.35 + size * 0.6;
    text(g, "Special Thanks:", w * 0.47, y, size, "#94a3b8", 600, "right");
    text(g, "Connor McCarthy, Ajani Thomas,", w * 0.49, y, size, WHITE, 700, "left");
    text(g, "Chris Dodson, Pat Frank, Kris Klink", w * 0.49, y + size * 1.3, size, WHITE, 700, "left");
    text(g, "Browser remake in TypeScript", w / 2, h * 0.93, size * 0.85, "#64748b", 500);
  });
}

/** Build the modern sprite set, falling back to the classic sprites where no modern art exists. */
export function buildModernSprites(classic: SpriteMap): SpriteMap {
  const modern: Partial<SpriteMap> = {
    brick_sprite: buildBricks(),
    brick_noicon_sprite: buildNoIcon(),
    brick_border_sprite: buildBorder(),
    brick_pop_sprite: buildPop(),
    red_expand_sprite: buildExpand("red_expand_sprite", RED),
    blue_expand_sprite: buildExpand("blue_expand_sprite", BLUE),
    yellow_expand_sprite: buildExpand("yellow_expand_sprite", YELLOW),
    purple_expand_sprite: buildExpand("purple_expand_sprite", PURPLE),
    orange_expand_sprite: buildExpand("orange_expand_sprite", ORANGE),
    green_expand_sprite: buildExpand("green_expand_sprite", GREEN),
    black_expand_sprite: buildExpand("black_expand_sprite", BLACK),
    replenish_selector_sprite: buildSelector(),
    replenish_frame_sprite: buildReplenishFrame(),
    worldbg_sprite: buildWorldBg(),
    sidebar_sprite: buildSidebar(),
    rotate_button_sprite: buildRotate(),
    pause_button_sprite: buildPause(),
    speedup_button_sprite: buildSpeed(),
    sound_button_sprite: buildSound(),
    progressbar_sprite: buildProgress(),
    level_complete_sprite: buildLevelComplete(),
    logo_sprite: buildLogo(),
    menu_button_sprite: buildMenuButton(),
    menu_frame_sprite: buildMenuFrame(),
    normal_button_sprite: buildModeButton("normal_button_sprite", "Normal", MODERN_COLORS[YELLOW], true),
    puzzle_button_sprite: buildModeButton("puzzle_button_sprite", "Puzzle", MODERN_COLORS[RED], false),
    zen_button_sprite: buildModeButton("zen_button_sprite", "Zen", MODERN_COLORS[BLUE], false),
    back_button_sprite: buildBack(),
    info_button_sprite: buildInfo(),
    settings_button_sprite: buildSettings(),
    level_select_sprite: buildLevelSelect(),
    credits_sprite: buildCredits(),
  };
  for (let w = 0; w <= 7; w++) {
    modern[`world${w}_sprite` as SpriteName] = buildWorldButton(w);
  }
  const slides = buildTutorialSlides(modern.logo_sprite!);
  modern.tutorial_intro_sprite = slides.intro;
  modern.tutorial_outro_sprite = slides.outro;
  return { ...classic, ...modern } as SpriteMap;
}
