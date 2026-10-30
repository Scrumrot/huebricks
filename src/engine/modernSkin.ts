import { BLACK, BLUE, GREEN, ORANGE, PURPLE, RED, YELLOW, type Color } from "../core/color";
import { SPRITE_FRAMES, type Sprite, type SpriteMap, type SpriteName } from "./assets";
import { buildTutorialSlides, type SlideStyle } from "./modernSlides";
import { fillScreen, screenRect } from "./view";

/**
 * "Pigment": the modern sprite set, generated on offscreen canvases.
 *
 * Paint chips on warm paper. Bricks are thick flat gouache chips with a
 * darker cut edge, a single inner highlight and hand-cut wobble baked into
 * the outline; glyphs are ink. Every sprite the game draws is rebuilt here
 * under the same names and frame layouts as the original GameMaker sprites.
 */

export const FONT = 'Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
export const DISPLAY = 'Fredoka, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const PAPER = "#F3EEE4";
export const PAPER_EDGE = "#E6DFD2";
export const PAPER_CELL = "#E9E3D7";
export const LEDGE = "#DCD4C6";
export const CARD = "#FBF8F2";
export const CARD_PRESSED = "#EDE7DB";
export const INK = "#1F1C18";
export const INK_MUTED = "#8A8378";
export const INK_SOFT = "rgba(20,16,12,0.78)";
export const INK_LIGHT = "rgba(255,255,255,0.85)";
export const SHADOW = "rgba(60,40,20,0.18)";
export const NEUTRAL = "#D9D2C5";
/** Kept for callers that want plain white. */
export const WHITE = "#FFFFFF";

/** Paint colours, indexed by colour bits. */
export const MODERN_COLORS: Record<Color, string> = {
  1: "#E04A3F", // red
  2: "#2E6FD8", // blue
  3: "#7D4FC2", // purple
  4: "#F2C230", // yellow
  5: "#F28B2B", // orange
  6: "#3FB26A", // green
  7: "#2B2B30", // black / chromatic gray
};

/** `brick_noicon_sprite` frame -> colour (frames 0..5 colours, 6 black, 7 neutral). */
const NOICON_COLORS = [MODERN_COLORS[1], MODERN_COLORS[2], MODERN_COLORS[3], MODERN_COLORS[4], MODERN_COLORS[5], MODERN_COLORS[6], MODERN_COLORS[7], NEUTRAL];

/** Colours dark enough that their ink is white. */
const LIGHT_INK = new Set<string>([MODERN_COLORS[2], MODERN_COLORS[3], MODERN_COLORS[7]]);

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

/** Ink colour that reads on a chip of `base`. */
export function inkOn(base: string): string {
  return LIGHT_INK.has(base) ? INK_LIGHT : INK_SOFT;
}

export function roundRect(g: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.roundRect(x, y, w, h, rr);
}

export function text(g: Ctx, s: string, x: number, y: number, size: number, color = INK, weight = 700, align: CanvasTextAlign = "center", font = FONT): void {
  g.font = `${weight} ${size}px ${font}`;
  g.textAlign = align;
  g.textBaseline = "middle";
  g.fillStyle = color;
  g.fillText(s, x, y);
}

/** Display (Fredoka) text. */
export function display(g: Ctx, s: string, x: number, y: number, size: number, color = INK, align: CanvasTextAlign = "center"): void {
  text(g, s, x, y, size, color, 600, align, DISPLAY);
}

// ---------------------------------------------------------------------------
// Paint chips
// ---------------------------------------------------------------------------

/** Small deterministic RNG so each colour's wobble is baked the same way every time. */
function seeded(seed: number): () => number {
  let s = (seed * 9301 + 49297) % 233280;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/**
 * Path of a rounded rectangle whose outline wobbles by up to `amp` so the
 * chip looks hand-cut. Six slow waves around the perimeter, phased by seed.
 */
export function chipPath(g: Ctx, x: number, y: number, w: number, h: number, r: number, amp: number, seed: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  const rnd = seeded(seed);
  const phases = Array.from({ length: 3 }, () => rnd() * Math.PI * 2);
  const straightW = w - 2 * rr;
  const straightH = h - 2 * rr;
  const arc = (Math.PI / 2) * rr;
  const perim = 2 * straightW + 2 * straightH + 4 * arc;
  const steps = 72;
  // the perimeter as straight runs and quarter arcs, clockwise from the end of the top-left corner
  type Pt = { px: number; py: number; nx: number; ny: number };
  const corner =
    (cx: number, cy: number, a0: number) =>
    (s: number): Pt => {
      const a = a0 + (s / arc) * (Math.PI / 2);
      return { px: cx + Math.cos(a) * rr, py: cy + Math.sin(a) * rr, nx: Math.cos(a), ny: Math.sin(a) };
    };
  const segments: Array<[number, (s: number) => Pt]> = [
    [straightW, (s) => ({ px: x + rr + s, py: y, nx: 0, ny: -1 })],
    [arc, corner(x + w - rr, y + rr, -Math.PI / 2)],
    [straightH, (s) => ({ px: x + w, py: y + rr + s, nx: 1, ny: 0 })],
    [arc, corner(x + w - rr, y + h - rr, 0)],
    [straightW, (s) => ({ px: x + w - rr - s, py: y + h, nx: 0, ny: 1 })],
    [arc, corner(x + rr, y + h - rr, Math.PI / 2)],
    [straightH, (s) => ({ px: x, py: y + h - rr - s, nx: -1, ny: 0 })],
    [arc, corner(x + rr, y + rr, Math.PI)],
  ];
  const pointAt = (d: number): Pt => {
    let s = d;
    for (const [len, at] of segments) {
      if (s < len) return at(s);
      s -= len;
    }
    return segments[segments.length - 1][1](arc);
  };
  g.beginPath();
  for (let i = 0; i <= steps; i++) {
    const d = (i / steps) * perim;
    const { px, py, nx, ny } = pointAt(d);
    const u = (d / perim) * Math.PI * 2;
    const wob = (Math.sin(u * 6 + phases[0]) * 0.5 + Math.sin(u * 3 + phases[1]) * 0.35 + Math.sin(u * 11 + phases[2]) * 0.15) * amp;
    if (i === 0) g.moveTo(px + nx * wob, py + ny * wob);
    else g.lineTo(px + nx * wob, py + ny * wob);
  }
  g.closePath();
}

export interface ChipOptions {
  radius?: number;
  /** Hand-cut wobble amplitude (px); 0 for a clean rounded rect. */
  wobble?: number;
  seed?: number;
  /** Draw a hard offset shadow under the chip. */
  shadow?: number;
  /** Skip the inner highlight. */
  flat?: boolean;
}

/** A thick flat paint chip: flat fill, darker cut edge, one inner highlight. */
export function chip(g: Ctx, x: number, y: number, w: number, h: number, base: string, opts: ChipOptions = {}): void {
  const r = opts.radius ?? Math.min(w, h) * 0.18;
  const wobble = opts.wobble ?? Math.min(w, h) * 0.01;
  const seed = opts.seed ?? 1;
  const edge = Math.max(1, Math.min(w, h) * 0.016);
  if (opts.shadow) {
    chipPath(g, x, y + opts.shadow, w, h, r, wobble, seed);
    g.fillStyle = SHADOW;
    g.fill();
  }
  chipPath(g, x, y, w, h, r, wobble, seed);
  g.fillStyle = base;
  g.fill();
  g.lineWidth = edge * 2;
  g.strokeStyle = shade(base, -0.18);
  g.save();
  g.clip();
  g.stroke();
  if (!opts.flat) {
    // single top-left inner highlight stroke
    const inset = edge * 2.2;
    g.lineWidth = edge * 1.6;
    g.strokeStyle = "rgba(255,255,255,0.25)";
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(x + inset, y + h - r - inset * 0.5);
    g.lineTo(x + inset, y + r + inset);
    g.quadraticCurveTo(x + inset, y + inset, x + r + inset, y + inset);
    g.lineTo(x + w - r - inset * 0.5, y + inset);
    g.stroke();
  }
  g.restore();
}

/** Backwards-compatible name used by the slide builder. */
export function tile(g: Ctx, x: number, y: number, w: number, h: number, base: string, opts: { radius?: number; flat?: boolean } = {}): void {
  chip(g, x, y, w, h, base, { radius: opts.radius, flat: opts.flat });
}

// ---------------------------------------------------------------------------
// Glyphs
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

/** Glyph ink: white on every chip. */
export const GLYPH_INK = "rgba(255,255,255,0.92)";

/** White glyphs: a 2.5 px stroke at cell scale; the innermost shape is filled on mixed colours. */
export function drawGlyphs(g: Ctx, color: Color, cx: number, cy: number, size: number, ink = GLYPH_INK): void {
  const glyphs = GLYPHS[color];
  g.lineWidth = size * 0.04;
  g.lineJoin = "round";
  g.strokeStyle = ink;
  const radii = glyphs.length === 1 ? [0.26] : glyphs.length === 2 ? [0.3, 0.17] : [0.31, 0.2, 0.1];
  glyphs.forEach((gl, i) => {
    glyphPath(g, gl, cx, cy, size * radii[i]);
    if (glyphs.length > 1 && i === glyphs.length - 1) {
      g.save();
      g.globalAlpha = 0.35;
      g.fillStyle = ink;
      g.fill();
      g.restore();
    }
    g.stroke();
  });
}

// ---------------------------------------------------------------------------
// Buttons and icons
// ---------------------------------------------------------------------------

/** Round paper chip button with an ink icon; pressed chips sit down on their shadow. */
export function chipButton(g: Ctx, w: number, h: number, pressed: boolean, icon: (g: Ctx, cx: number, cy: number, r: number) => void): void {
  const cx = w / 2;
  const r = Math.min(w, h) * 0.4;
  const drop = Math.min(w, h) * 0.035;
  const cy = h / 2 - drop / 2 + (pressed ? drop * 0.7 : 0);
  if (!pressed) {
    g.beginPath();
    g.arc(cx, cy + drop, r, 0, Math.PI * 2);
    g.fillStyle = SHADOW;
    g.fill();
  }
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fillStyle = pressed ? CARD_PRESSED : CARD;
  g.fill();
  g.lineWidth = r * 0.04;
  g.strokeStyle = "rgba(31,28,24,0.28)";
  g.stroke();
  g.strokeStyle = INK;
  g.fillStyle = INK;
  g.lineWidth = r * 0.13;
  g.lineCap = "round";
  g.lineJoin = "round";
  icon(g, cx, cy, r);
}

/** Kept for the slide builder. */
export const circleButton = chipButton;

/**
 * Rotate-the-board icon: a three-quarter arc with an arrowhead, wrapped
 * around a small filled square that stands for the board. The two
 * directions are mirror images, so the pair reads as left / right rather
 * than two refresh buttons.
 */
export function rotateIcon(g: Ctx, cx: number, cy: number, r: number, clockwise: boolean): void {
  const rr = r * 0.56;
  const dir = clockwise ? 1 : -1;
  // The gap in the arc sits at the top, and the arrowhead points into it.
  const start = -Math.PI / 2 + dir * Math.PI * 0.3;
  const end = start + dir * Math.PI * 1.45;
  g.beginPath();
  g.arc(cx, cy, rr, start, end, !clockwise);
  g.stroke();
  const ax = cx + Math.cos(end) * rr;
  const ay = cy + Math.sin(end) * rr;
  const travel = end + (dir * Math.PI) / 2;
  const s = r * 0.3;
  const tipX = ax + Math.cos(travel) * s * 0.4;
  const tipY = ay + Math.sin(travel) * s * 0.4;
  for (const side of [1, -1]) {
    const a = travel + Math.PI + side * (Math.PI / 4);
    g.beginPath();
    g.moveTo(tipX, tipY);
    g.lineTo(tipX + Math.cos(a) * s, tipY + Math.sin(a) * s);
    g.stroke();
  }
  // The board: a filled square in the stroke colour.
  const sq = r * 0.36;
  g.save();
  g.fillStyle = g.strokeStyle;
  roundRect(g, cx - sq / 2, cy - sq / 2, sq, sq, sq * 0.2);
  g.fill();
  g.restore();
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

export function gearIcon(g: Ctx, cx: number, cy: number, r: number): void {
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

/** Paper card with a hard shadow. */
export function card(g: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  roundRect(g, x, y + Math.min(8, h * 0.03), w, h, r);
  g.fillStyle = SHADOW;
  g.fill();
  roundRect(g, x, y, w, h, r);
  g.fillStyle = CARD;
  g.fill();
  g.lineWidth = Math.max(1, Math.min(w, h) * 0.006);
  g.strokeStyle = "rgba(60,40,20,0.16)";
  g.stroke();
}

// ---------------------------------------------------------------------------
// Paper backdrop
// ---------------------------------------------------------------------------

let noiseCanvas: HTMLCanvasElement | null = null;
const patterns = new WeakMap<CanvasRenderingContext2D, CanvasPattern>();

function paperNoise(): HTMLCanvasElement {
  if (noiseCanvas) return noiseCanvas;
  noiseCanvas = canvas(256, 256, (g, w, h) => {
    const img = g.createImageData(w, h);
    const d = img.data;
    const rnd = seeded(7);
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.floor(rnd() * 255);
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
      d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
  return noiseCanvas;
}

/**
 * Warm paper with faint grain and a soft vignette whose centre wanders a
 * little over twenty seconds. Fills the whole logical screen.
 */
export function drawPaper(g: Ctx, t: number): void {
  fillScreen(g, PAPER);
  let pat = patterns.get(g);
  if (!pat) {
    const p = g.createPattern(paperNoise(), "repeat");
    if (p) {
      patterns.set(g, p);
      pat = p;
    }
  }
  if (pat) {
    g.globalAlpha = 0.04;
    fillScreen(g, pat);
    g.globalAlpha = 1;
  }
  const sr = screenRect();
  const cx = sr.w / 2 + 20 * Math.sin((t / 20000) * Math.PI * 2);
  const cy = sr.h / 2 + 20 * Math.sin((t / 20000) * Math.PI * 1.6 + 1.3);
  const vig = g.createRadialGradient(cx, cy, Math.min(sr.w, sr.h) * 0.3, cx, cy, Math.max(sr.w, sr.h) * 0.72);
  vig.addColorStop(0, "rgba(230,223,210,0)");
  vig.addColorStop(1, "rgba(230,223,210,1)");
  fillScreen(g, vig);
}

// ---------------------------------------------------------------------------
// Board furniture
// ---------------------------------------------------------------------------

let wellCanvas: HTMLCanvasElement | null = null;

/** A cell pressed into the paper: darker top-left inner shadow, light bottom-right lip. */
function cellWell(): HTMLCanvasElement {
  if (wellCanvas) return wellCanvas;
  wellCanvas = canvas(128, 128, (g, w, h) => {
    const r = w * 0.18;
    roundRect(g, 0, 0, w, h, r);
    g.fillStyle = PAPER_CELL;
    g.fill();
    g.save();
    g.clip();
    g.lineWidth = w * 0.06;
    g.strokeStyle = "rgba(60,40,20,0.12)";
    roundRect(g, -w * 0.02, -h * 0.02, w, h, r);
    g.stroke();
    g.lineWidth = w * 0.03;
    g.strokeStyle = "rgba(255,255,255,0.55)";
    roundRect(g, w * 0.025, h * 0.025, w, h, r);
    g.stroke();
    g.restore();
  });
  return wellCanvas;
}

export function drawCellWell(g: Ctx, x: number, y: number, w: number, h: number): void {
  g.drawImage(cellWell(), x, y, w, h);
}

/** Shallow paper tray that holds the replenish line. */
export function drawTray(g: Ctx, x: number, y: number, w: number, h: number): void {
  roundRect(g, x, y + 4, w, h, 12);
  g.fillStyle = "rgba(60,40,20,0.16)";
  g.fill();
  roundRect(g, x, y, w, h, 12);
  g.fillStyle = "#EDE7DB";
  g.fill();
  g.lineWidth = 1;
  g.strokeStyle = "rgba(60,40,20,0.14)";
  g.stroke();
}

/**
 * A paint stain: a few overlapping blobs, seeded so each stain keeps its
 * shape while it fades. Drawn with multiply so it soaks into the paper.
 */
export function drawStain(g: Ctx, cx: number, cy: number, r: number, color: string, alpha: number, seed: number): void {
  const rnd = seeded(seed);
  g.save();
  g.globalCompositeOperation = "multiply";
  g.globalAlpha = alpha;
  for (let i = 0; i < 5; i++) {
    const a = rnd() * Math.PI * 2;
    const d = rnd() * r * 0.4;
    const rr = r * (0.5 + rnd() * 0.4);
    const bx = cx + Math.cos(a) * d;
    const by = cy + Math.sin(a) * d;
    const grad = g.createRadialGradient(bx, by, 0, bx, by, rr);
    grad.addColorStop(0, color);
    grad.addColorStop(0.55, rgba(color, 0.7));
    grad.addColorStop(1, rgba(color, 0));
    g.fillStyle = grad;
    g.beginPath();
    g.arc(bx, by, rr, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

// ---------------------------------------------------------------------------
// Sprite builders
// ---------------------------------------------------------------------------

const S = 256; // base size for 128px originals (2x for crisp scaling)
const PAD = 0.04;

function buildBricks(): Sprite {
  return sprite("brick_sprite", S, S, (g, i, w, h) => {
    const color = (i + 1) as Color;
    const pad = w * PAD;
    chip(g, pad, pad, w - pad * 2, h - pad * 2, MODERN_COLORS[color], { seed: 11 + i, wobble: w * 0.01 });
    drawGlyphs(g, color, w / 2, h / 2, w);
  });
}

function buildNoIcon(): Sprite {
  return sprite("brick_noicon_sprite", S, S, (g, i, w, h) => {
    const pad = w * PAD;
    chip(g, pad, pad, w - pad * 2, h - pad * 2, NOICON_COLORS[i], { seed: 31 + i, wobble: w * 0.01 });
  });
}

function buildBorder(): Sprite {
  return sprite("brick_border_sprite", S, S, (g, _i, w, h) => {
    const pad = w * 0.05;
    g.lineWidth = w * 0.05;
    g.strokeStyle = INK;
    roundRect(g, pad, pad, w - pad * 2, h - pad * 2, w * 0.18);
    g.stroke();
  });
}

/** Soft warm shadow drawn under the hard one; wider and darker when a brick is lifted. */
function buildSoftShadow(): Sprite {
  return sprite("brick_shadow_sprite", S, S, (g, _i, w, h) => {
    const pad = w * 0.14;
    g.shadowColor = "rgba(60,40,20,0.55)";
    g.shadowBlur = w * 0.12;
    g.shadowOffsetX = w * 4;
    g.fillStyle = "#000";
    roundRect(g, pad - w * 4, pad, w - pad * 2, h - pad * 2, w * 0.18);
    g.fill();
  });
}

/** Unused by the new pop (particles and scale do the work); a faint ink ring keeps the sprite valid. */
function buildPop(): Sprite {
  const n = SPRITE_FRAMES.brick_pop_sprite;
  return sprite("brick_pop_sprite", 64, 64, (g, i, w, h) => {
    const t = i / (n - 1);
    g.lineWidth = 3 * (1 - t) + 1;
    g.strokeStyle = `rgba(31,28,24,${0.8 * (1 - t)})`;
    g.beginPath();
    g.arc(w / 2, h / 2, w * (0.15 + t * 0.33), 0, Math.PI * 2);
    g.stroke();
  });
}

/** Unused by the new combine (a real-time wipe replaces it); tiny blank frames keep the map complete. */
function buildExpand(name: SpriteName): Sprite {
  return sprite(name, 8, 8, () => undefined);
}

/** Ink selector ring with a faint tint of the brick's colour. */
function buildSelector(): Sprite {
  return sprite("replenish_selector_sprite", S, S, (g, i, w, h) => {
    const colour = i < 7 ? MODERN_COLORS[(i + 1) as Color] : null;
    const pad = w * 0.035;
    const lw = w * 0.045;
    roundRect(g, pad + lw / 2, pad + lw / 2, w - pad * 2 - lw, h - pad * 2 - lw, w * 0.2);
    if (colour) {
      g.fillStyle = rgba(colour, 0.14);
      g.fill();
    }
    g.lineWidth = lw;
    g.strokeStyle = INK;
    g.lineJoin = "round";
    g.stroke();
  });
}

function buildReplenishFrame(): Sprite {
  return sprite("replenish_frame_sprite", S, S, (g, _i, w, h) => {
    const pad = w * 0.06;
    roundRect(g, pad, pad, w - pad * 2, h - pad * 2, w * 0.18);
    g.fillStyle = PAPER_CELL;
    g.fill();
    g.lineWidth = w * 0.012;
    g.strokeStyle = "rgba(31,28,24,0.12)";
    g.stroke();
  });
}

/** The board backdrop is painted live (`drawPaper`); these frames are plain paper. */
function buildWorldBg(): Sprite {
  return sprite("worldbg_sprite", 16, 16, (g, _i, w, h) => {
    g.fillStyle = PAPER;
    g.fillRect(0, 0, w, h);
  });
}

function buildSidebar(): Sprite {
  return sprite("sidebar_sprite", 16, 16, (g, _i, w, h) => {
    g.fillStyle = PAPER;
    g.fillRect(0, 0, w, h);
  });
}

function buildRotate(): Sprite {
  return sprite("rotate_button_sprite", S, S, (g, i, w, h) => {
    const clockwise = i >= 2;
    const pressed = i % 2 === 1;
    chipButton(g, w, h, pressed, (gg, cx, cy, r) => rotateIcon(gg, cx, cy, r, clockwise));
  });
}

function buildPause(): Sprite {
  return sprite("pause_button_sprite", S, S, (g, _i, w, h) => {
    chipButton(g, w, h, false, (gg, cx, cy, r) => {
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
    chipButton(g, w, h, i === 1, chevronUp);
  });
}

function buildSound(): Sprite {
  return sprite("sound_button_sprite", S, S, (g, i, w, h) => {
    const muted = i >= 2;
    chipButton(g, w, h, i % 2 === 1, (gg, cx, cy, r) => {
      if (muted) {
        gg.fillStyle = "rgba(31,28,24,0.4)";
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
    chipButton(g, w, h, i === 1, gearIcon);
  });
}

function buildBack(): Sprite {
  return sprite("back_button_sprite", S, S, (g, i, w, h) => {
    const right = i >= 2;
    const pressed = i % 2 === 1;
    chipButton(g, w, h, pressed, (gg, cx, cy, r) => {
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
    chipButton(g, w, h, i === 1, (gg, cx, cy, r) => {
      display(gg, "i", cx, cy + r * 0.04, r * 1.2, INK);
    });
  });
}

function buildProgress(): Sprite {
  return sprite("progressbar_sprite", 256, 8, (g, i, w, h) => {
    if (i === 2) {
      g.fillStyle = "rgba(31,28,24,0.10)";
      g.fillRect(0, 0, w, h);
    } else if (i === 1) {
      g.fillStyle = "rgba(31,28,24,0.22)";
      g.fillRect(0, 0, w, h);
    } else {
      const grad = g.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, MODERN_COLORS[YELLOW]);
      grad.addColorStop(0.5, MODERN_COLORS[ORANGE]);
      grad.addColorStop(1, MODERN_COLORS[RED]);
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
    }
  });
}

function buildLevelComplete(): Sprite {
  return sprite("level_complete_sprite", 640, 160, (g, _i, w, h) => {
    card(g, 4, 4, w - 8, h - 14, h * 0.2);
    display(g, "Level complete", w / 2, h / 2 - 4, h * 0.4, INK);
  });
}

/** "HueBricks" wordmark on a paper chip; the "Hue" letters are each a primary. */
function buildLogo(): Sprite {
  return sprite("logo_sprite", 768, 400, (g, i, w, h) => {
    const pad = 24;
    chip(g, pad, pad, w - pad * 2, h - pad * 2 - 12, i === 1 ? CARD_PRESSED : CARD, { radius: 56, wobble: 3, seed: 99, shadow: i === 1 ? 0 : 12, flat: true });
    const size = h * 0.42;
    g.font = `600 ${size}px ${DISPLAY}`;
    g.textBaseline = "middle";
    g.textAlign = "left";
    const parts: Array<[string, string]> = [
      ["H", MODERN_COLORS[RED]],
      ["u", MODERN_COLORS[BLUE]],
      ["e", MODERN_COLORS[YELLOW]],
      ["Bricks", INK],
    ];
    const widths = parts.map(([s]) => g.measureText(s).width);
    const total = widths.reduce((a, b) => a + b, 0) - size * 0.02;
    let x = w / 2 - total / 2;
    const y = h / 2 - 4;
    parts.forEach(([s, c], k) => {
      g.fillStyle = c;
      g.fillText(s, x, y);
      x += widths[k];
    });
    // three little chips under the word
    const cw = 22;
    [RED, BLUE, YELLOW].forEach((c, k) => {
      chip(g, w / 2 - cw * 2 + k * cw * 1.6, h * 0.73, cw, cw, MODERN_COLORS[c as Color], { radius: 6, wobble: 1, seed: 50 + k, flat: true });
    });
  });
}

function buildMenuButton(): Sprite {
  return sprite("menu_button_sprite", S, S, (g, i, w, h) => {
    const pad = w * 0.08;
    chip(g, pad, pad, w - pad * 2, h - pad * 2 - 8, i === 1 ? CARD_PRESSED : CARD, { radius: w * 0.2, shadow: i === 1 ? 0 : 8, flat: true });
    const cx = w / 2;
    const cy = h / 2 - 4;
    g.fillStyle = INK;
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

/** Title bottom bar: a paper ledge. */
function buildMenuFrame(): Sprite {
  return sprite("menu_frame_sprite", 760, 127, (g, _i, w, h) => {
    g.fillStyle = "rgba(60,40,20,0.08)";
    g.fillRect(0, 0, w, 3);
    g.fillStyle = PAPER_CELL;
    g.fillRect(0, 2, w, h - 2);
  });
}

function modeGlyph(g: Ctx, glyph: Glyph, cx: number, cy: number, r: number, ink: string): void {
  g.lineWidth = r * 0.18;
  g.lineJoin = "round";
  g.strokeStyle = ink;
  glyphPath(g, glyph, cx, cy, r);
  g.stroke();
}

function buildModeButton(name: SpriteName, label: string, base: string, glyph: Glyph): Sprite {
  return sprite(name, 512, 256, (g, i, w, h) => {
    const pad = h * 0.1;
    const pressed = i === 1;
    chip(g, pad, pad + (pressed ? 6 : 0), w - pad * 2, h - pad * 2 - 10, pressed ? shade(base, -0.12) : base, {
      radius: h * 0.22,
      wobble: 2.5,
      seed: 70 + label.length,
      shadow: pressed ? 0 : 10,
    });
    const ink = inkOn(base);
    modeGlyph(g, glyph, w * 0.2, h / 2 - 4 + (pressed ? 6 : 0), h * 0.15, GLYPH_INK);
    display(g, label, w * 0.61, h / 2 - 2 + (pressed ? 6 : 0), h * 0.29, ink);
  });
}

function buildWorldButton(world: number): Sprite {
  const name = `world${world}_sprite` as SpriteName;
  const colorOf = [null, RED, YELLOW, BLUE, ORANGE, PURPLE, GREEN, BLACK] as const;
  const base = world === 0 ? NEUTRAL : MODERN_COLORS[colorOf[world] as Color];
  return sprite(name, S, S, (g, i, w, h) => {
    const pad = w * 0.07;
    const pressed = i === 1;
    chip(g, pad, pad + (pressed ? 5 : 0), w - pad * 2, h - pad * 2 - 8, pressed ? shade(base, -0.12) : base, {
      radius: w * 0.2,
      wobble: 2,
      seed: 120 + world,
      shadow: pressed ? 0 : 8,
    });
    const ink = inkOn(base);
    const dy = pressed ? 5 : 0;
    if (world === 0) {
      display(g, "Tutorial", w / 2, h / 2 - 4 + dy, w * 0.19, ink);
    } else {
      text(g, "WORLD", w / 2, h * 0.36 + dy, w * 0.13, ink === INK_LIGHT ? "rgba(255,255,255,0.75)" : "rgba(20,16,12,0.6)", 700);
      display(g, String(world), w / 2, h * 0.62 + dy, w * 0.38, ink);
    }
  });
}

function buildLevelSelect(): Sprite {
  return sprite("level_select_sprite", 512, 256, (g, _i, w, h) => {
    card(g, 3, 3, w - 6, h - 12, h * 0.12);
  });
}

function buildCredits(): Sprite {
  return sprite("credits_sprite", 1024, 512, (g, _i, w, h) => {
    card(g, 4, 4, w - 8, h - 14, h * 0.1);
    display(g, "Credits", w / 2, h * 0.14, h * 0.12, INK);
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
      text(g, `${k}:`, w * 0.47, y, size, INK_MUTED, 500, "right");
      text(g, v, w * 0.49, y, size, INK, 700, "left");
    });
    const y = h * 0.28 + rows.length * size * 1.35 + size * 0.6;
    text(g, "Special Thanks:", w * 0.47, y, size, INK_MUTED, 500, "right");
    text(g, "Connor McCarthy, Ajani Thomas,", w * 0.49, y, size, INK, 700, "left");
    text(g, "Chris Dodson, Pat Frank, Kris Klink", w * 0.49, y + size * 1.3, size, INK, 700, "left");
    text(g, "Browser remake in TypeScript", w / 2, h * 0.92, size * 0.85, INK_MUTED, 500);
  });
}

/** How the tutorial slides look in this theme. */
export const PIGMENT_SLIDES: SlideStyle = {
  background(g, w, h) {
    g.fillStyle = PAPER;
    g.fillRect(0, 0, w, h);
    const vig = g.createRadialGradient(w / 2, h * 0.45, w * 0.25, w / 2, h * 0.45, w * 0.75);
    vig.addColorStop(0, "rgba(230,223,210,0)");
    vig.addColorStop(1, "rgba(230,223,210,1)");
    g.fillStyle = vig;
    g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(60,40,20,0.07)";
    g.fillRect(0, h * 0.78, w, h * 0.22);
  },
  font: FONT,
  display: DISPLAY,
  text: INK,
  muted: INK_MUTED,
  bgColor: PAPER,
  dotIdle: "rgba(31,28,24,0.2)",
  card: CARD,
  cardEdge: "rgba(31,28,24,0.18)",
  cardShadow: "rgba(60,40,20,0.14)",
  gridLine: "rgba(31,28,24,0.07)",
  well: PAPER_CELL,
  wellEdge: "rgba(31,28,24,0.14)",
  track: "rgba(31,28,24,0.12)",
  colors: MODERN_COLORS,
  inkOn,
  tile,
  glyphs: (g, c, cx, cy, size) => drawGlyphs(g, c, cx, cy, size),
  button: chipButton,
};

/** Build the Pigment sprite set, falling back to the classic sprites where no modern art exists. */
export function buildModernSprites(classic: SpriteMap): SpriteMap {
  const modern: Partial<SpriteMap> = {
    brick_sprite: buildBricks(),
    brick_noicon_sprite: buildNoIcon(),
    brick_border_sprite: buildBorder(),
    brick_pop_sprite: buildPop(),
    brick_shadow_sprite: buildSoftShadow(),
    brick_glow_sprite: sprite("brick_glow_sprite", 8, 8, () => undefined),
    red_expand_sprite: buildExpand("red_expand_sprite"),
    blue_expand_sprite: buildExpand("blue_expand_sprite"),
    yellow_expand_sprite: buildExpand("yellow_expand_sprite"),
    purple_expand_sprite: buildExpand("purple_expand_sprite"),
    orange_expand_sprite: buildExpand("orange_expand_sprite"),
    green_expand_sprite: buildExpand("green_expand_sprite"),
    black_expand_sprite: buildExpand("black_expand_sprite"),
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
    normal_button_sprite: buildModeButton("normal_button_sprite", "Normal", MODERN_COLORS[YELLOW], "diamond"),
    puzzle_button_sprite: buildModeButton("puzzle_button_sprite", "Puzzle", MODERN_COLORS[RED], "octagon"),
    zen_button_sprite: buildModeButton("zen_button_sprite", "Zen", MODERN_COLORS[BLUE], "circle"),
    arcade_button_sprite: buildModeButton("arcade_button_sprite", "Arcade", MODERN_COLORS[GREEN], "octagon"),
    back_button_sprite: buildBack(),
    info_button_sprite: buildInfo(),
    settings_button_sprite: buildSettings(),
    level_select_sprite: buildLevelSelect(),
    credits_sprite: buildCredits(),
  };
  for (let w = 0; w <= 7; w++) {
    modern[`world${w}_sprite` as SpriteName] = buildWorldButton(w);
  }
  const slides = buildTutorialSlides(modern.logo_sprite!, PIGMENT_SLIDES);
  modern.tutorial_intro_sprite = slides.intro;
  modern.tutorial_outro_sprite = slides.outro;
  return { ...classic, ...modern } as SpriteMap;
}
