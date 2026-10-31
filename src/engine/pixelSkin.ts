import { RED, type Color } from "../core/color";
import type { Layout } from "../core/layout";
import { cellX, cellY, replenishY } from "../core/layout";
import type { SpriteMap } from "./assets";
import type { TitleFx } from "./backdrops";
import { canvas, shade, type Ctx } from "./modernSkin";
import type { SlideStyle } from "./modernSlides";
import { buildSkin, makeGlyphs, seeded, type ButtonFn, type SkinSpec, type TileFn } from "./skinKit";
import { fillScreen, screenRect } from "./view";

/**
 * "Pixel": sixteen-colour chunky bricks bevelled like an old console. The
 * sprites are drawn at 32 px and scaled up with smoothing off, so every
 * edge lands on a chunky pixel; the sky is a 4 px checker dither over a
 * blocky skyline with blinking 4 px stars and scanlines over everything;
 * the title city scrolls in parallax. Debris is square pixels on an 8 px
 * grid, pops run in four stepped frames, mixing is a dither wipe and big
 * chains flash the whole screen (the impact frame).
 */

export const FONT = 'Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
export const DISPLAY = '"Press Start 2P", "Courier New", monospace';

export const BG = "#1A1C3C";
export const BG_LIGHT = "#23264A";
export const INK = "#0B0C20";
export const TEXT = "#F6F3FF";
export const MUTED = "#9A98C2";
export const LAVENDER = "#8C8FD8";
export const CARD = "#14163A";
/** Sprite resolution: everything square is drawn this small and scaled up. */
export const PIXEL_SPRITE = 32;
/** Debris lands on this grid (logical units). */
export const PIXEL_GRID = 8;

export const PIXEL_COLORS: Record<Color, string> = {
  1: "#E8433F",
  2: "#2F62E6",
  3: "#9A4BE8",
  4: "#F7C62B",
  5: "#F08A26",
  6: "#3FB24B",
  7: "#4A4A5C",
};

let ditherCanvas: HTMLCanvasElement | null = null;

/** A 4 px checker of the two sky blues, as a repeating pattern. */
export function skyDither(g: Ctx): CanvasPattern | string {
  ditherCanvas ??= canvas(8, 8, (c) => {
    c.fillStyle = BG;
    c.fillRect(0, 0, 8, 8);
    c.fillStyle = BG_LIGHT;
    c.fillRect(0, 0, 4, 4);
    c.fillRect(4, 4, 4, 4);
  });
  return g.createPattern(ditherCanvas, "repeat") ?? BG;
}

// ---------------------------------------------------------------------------
// Bevelled tile, glyphs, console button
// ---------------------------------------------------------------------------

/** A bevelled square: light top-left bands, dark bottom-right bands, a flat face and a highlight pixel. */
const bevel: TileFn = (g, x, y, w, h, base, opts = {}) => {
  const fill = opts.lift ? shade(base, opts.lift) : base;
  const b = Math.max(1, Math.round(Math.min(w, h) / 8));
  const x0 = Math.round(x);
  const y0 = Math.round(y);
  const w0 = Math.round(w);
  const h0 = Math.round(h);
  g.fillStyle = shade(fill, -0.38);
  g.fillRect(x0, y0, w0, h0);
  g.fillStyle = shade(fill, 0.35);
  g.fillRect(x0, y0, w0 - b, b);
  g.fillRect(x0, y0, b, h0 - b);
  g.fillStyle = fill;
  g.fillRect(x0 + b, y0 + b, w0 - b * 2, h0 - b * 2);
  if (!opts.plain) {
    g.fillStyle = "rgba(255,255,255,0.55)";
    g.fillRect(x0 + b * 2, y0 + b * 2, b, b);
  }
};

const glyphs = makeGlyphs({ stroke: TEXT, fill: "rgba(246,243,255,0.9)", glow: null, width: 0.075 });

/** A bevelled navy button that sinks a pixel when pressed. */
const consoleButton: ButtonFn = (g, w, h, pressed, icon) => {
  const s = Math.round(Math.min(w, h) * 0.78);
  const x = Math.round(w / 2 - s / 2);
  const y = Math.round(h / 2 - s / 2) + (pressed ? 1 : 0);
  if (!pressed) {
    g.fillStyle = INK;
    g.fillRect(x + 1, y + 2, s, s);
  }
  bevel(g, x, y, s, s, pressed ? "#2E3270" : "#3A3F8C", { plain: true });
  g.save();
  g.strokeStyle = TEXT;
  g.fillStyle = TEXT;
  g.lineWidth = Math.max(1, s * 0.09);
  g.lineCap = "square";
  g.lineJoin = "miter";
  icon(g, w / 2, h / 2 + (pressed ? 1 : 0), s * 0.34);
  g.restore();
};

function panel(g: Ctx, x: number, y: number, w: number, h: number, _r: number): void {
  const x0 = Math.round(x);
  const y0 = Math.round(y);
  const w0 = Math.round(w);
  const h0 = Math.round(h);
  g.fillStyle = INK;
  g.fillRect(x0 + 3, y0 + 3, w0, h0);
  g.fillStyle = CARD;
  g.fillRect(x0, y0, w0, h0);
  g.fillStyle = LAVENDER;
  g.fillRect(x0, y0, w0, 2);
  g.fillRect(x0, y0, 2, h0);
  g.fillRect(x0, y0 + h0 - 2, w0, 2);
  g.fillRect(x0 + w0 - 2, y0, 2, h0);
}

/** A blocky skyline: buildings of random width and height with lit windows, drawn from the bottom of the box. */
export function drawSkyline(g: Ctx, x: number, bottom: number, w: number, maxH: number, color: string, seed: number, windows: string | null, t = 0): void {
  const rnd = seeded(seed);
  let bx = x - 20;
  while (bx < x + w) {
    const bw = 16 + Math.floor(rnd() * 5) * 8;
    const bh = 16 + Math.floor(rnd() * (maxH / 8)) * 8;
    g.fillStyle = color;
    g.fillRect(bx, bottom - bh, bw, bh);
    if (windows) {
      g.fillStyle = windows;
      for (let wy = bottom - bh + 6; wy < bottom - 6; wy += 10) {
        for (let wx = bx + 4; wx < bx + bw - 4; wx += 8) {
          const lit = rnd() < 0.4 ? Math.sin(t / 900 + wx + wy) > -0.6 : rnd() < 0.08;
          if (lit) g.fillRect(wx, wy, 3, 4);
        }
      }
    }
    bx += bw + 4 + Math.floor(rnd() * 3) * 4;
  }
}

/** "HUEBRICKS" in the console face with red and blue offsets, like a misregistered scanline. */
function logo(g: Ctx, i: number, w: number, h: number): void {
  // Press Start 2P is wide: nine glyphs at this size just fit the sprite
  const size = Math.round(h * 0.2);
  g.font = `400 ${size}px ${DISPLAY}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const y = h * 0.46;
  const shift = i === 1 ? 6 : 4;
  g.fillStyle = PIXEL_COLORS[RED];
  g.fillText("HUEBRICKS", w / 2 - shift, y);
  g.fillStyle = PIXEL_COLORS[2];
  g.fillText("HUEBRICKS", w / 2 + shift, y);
  g.fillStyle = TEXT;
  g.fillText("HUEBRICKS", w / 2, y);
  g.font = `400 ${Math.round(size * 0.4)}px ${DISPLAY}`;
  g.fillStyle = i === 1 ? PIXEL_COLORS[4] : LAVENDER;
  g.fillText("PRESS START", w / 2, y + size * 1.1);
}

function menuFrame(g: Ctx, w: number, h: number): void {
  g.fillStyle = skyDither(g);
  g.fillRect(0, 8, w, h - 8);
  drawSkyline(g, 0, h, w, h * 0.32, INK, 11, LAVENDER);
  g.fillStyle = LAVENDER;
  g.fillRect(0, 8, w, 2);
}

// ---------------------------------------------------------------------------
// Backdrop and furniture
// ---------------------------------------------------------------------------

/** An empty socket: a dark square with a one-pixel rim. */
export function drawPixelWell(g: Ctx, x: number, y: number, w: number, h: number): void {
  const x0 = Math.round(x);
  const y0 = Math.round(y);
  const w0 = Math.round(w);
  const h0 = Math.round(h);
  g.fillStyle = "#2A2E5A";
  g.fillRect(x0, y0, w0, h0);
  g.fillStyle = "#12142E";
  g.fillRect(x0 + 1, y0 + 1, w0 - 2, h0 - 2);
}

/** The item bar: an ink strip with a light top edge and slot ticks. */
export function drawPixelTray(g: Ctx, x: number, y: number, w: number, h: number): void {
  const x0 = Math.round(x);
  const y0 = Math.round(y);
  const w0 = Math.round(w);
  const h0 = Math.round(h);
  g.fillStyle = INK;
  g.fillRect(x0, y0, w0, h0);
  g.fillStyle = LAVENDER;
  g.fillRect(x0, y0, w0, 2);
  g.fillStyle = "#2A2E5A";
  g.fillRect(x0, y0 + h0 - 2, w0, 2);
  for (let px = x0 + 8; px < x0 + w0 - 4; px += 16) g.fillRect(px, y0 + 4, 2, 2);
}

/** Dithered night sky, blinking 4 px stars, a two-layer skyline (parallax on the title), scanlines over all of it. */
export function drawPixelBackdrop(g: Ctx, t: number, l?: Layout, flare = 0, fx: TitleFx | null = null): void {
  const sr = screenRect();
  fillScreen(g, skyDither(g));
  const rnd = seeded(29);
  for (let i = 0; i < 50; i++) {
    const x = Math.round((rnd() * sr.w) / 4) * 4;
    const y = Math.round((rnd() * sr.h * 0.6) / 4) * 4;
    const on = Math.sin(t / 500 + rnd() * 9) > (flare > 0.1 ? -1 : 0.2);
    if (on) {
      g.fillStyle = TEXT;
      g.fillRect(x, y, 4, 4);
    }
  }
  const pointer = fx?.pointer ?? null;
  const dx = pointer ? (pointer.x - sr.w / 2) / sr.w : 0;
  const far = Math.round((-dx * 24) / 4) * 4;
  const near = Math.round((-dx * 60) / 4) * 4;
  drawSkyline(g, far - 40, sr.h * 0.92, sr.w + 80, sr.h * 0.3, BG_LIGHT, 3, "#3A3F8C", t);
  drawSkyline(g, near - 60, sr.h + 4, sr.w + 120, sr.h * 0.24, INK, 7, "#C9C4FF", t);
  if (l) {
    const n = l.cellNum;
    const gridBottom = cellY(l, n) - l.cellSep;
    const px = Math.round(l.boardX - 10);
    const py = Math.round(l.boardY - 10);
    const pw = Math.round(l.boardW + 20);
    const ph = Math.round(gridBottom - l.boardY + 16);
    g.fillStyle = "#2A2E5A";
    g.fillRect(px, py, pw, ph);
    g.fillStyle = INK;
    g.fillRect(px + 2, py + 2, pw - 4, ph - 4);
    const pad = l.cellW * 0.04;
    for (let x = 0; x < n; x++) {
      for (let y = 0; y < n; y++) drawPixelWell(g, cellX(l, x) + pad, cellY(l, y) + pad, l.cellW - pad * 2, l.cellH - pad * 2);
    }
    drawPixelTray(g, l.boardX - 8, replenishY(l) - 8, l.boardW + 16, l.cellH + 16);
  }
  // scanlines
  g.fillStyle = "rgba(0,0,0,0.16)";
  for (let y = 0; y < sr.h; y += 3) g.fillRect(0, y, sr.w, 1);
}

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------

const slides: SlideStyle = {
  background(g, w, h) {
    g.fillStyle = skyDither(g);
    g.fillRect(0, 0, w, h);
    drawSkyline(g, -20, h, w + 40, h * 0.22, INK, 5, LAVENDER);
  },
  font: FONT,
  display: DISPLAY,
  text: TEXT,
  muted: MUTED,
  bgColor: BG,
  dotIdle: "rgba(246,243,255,0.3)",
  card: CARD,
  cardEdge: LAVENDER,
  cardShadow: INK,
  gridLine: "rgba(246,243,255,0.06)",
  well: "#12142E",
  wellEdge: "#2A2E5A",
  track: "rgba(246,243,255,0.14)",
  colors: PIXEL_COLORS,
  inkOn: () => TEXT,
  tile: (g, x, y, w, h, base) => bevel(g, x, y, w, h, base, { plain: true }),
  glyphs,
  button: consoleButton,
};

const SPEC: SkinSpec = {
  colors: PIXEL_COLORS,
  neutral: "#5A5E7A",
  bg: BG,
  text: TEXT,
  muted: MUTED,
  font: FONT,
  display: DISPLAY,
  size: PIXEL_SPRITE,
  tile: bevel,
  glyphs,
  button: consoleButton,
  panel,
  logo,
  menuFrame,
  worldText: TEXT,
  worldTextShadow: INK,
  shadow: null,
  glow: false,
  selector: "ink",
  selectorNeutral: TEXT,
  progress: [PIXEL_COLORS[6], PIXEL_COLORS[4]],
  pop(g, t, w, h) {
    // four stepped frames: an expanding square outline
    const step = Math.floor(t * 4) / 4;
    const inset = Math.round(w * (0.1 + step * 0.35));
    g.fillStyle = TEXT;
    g.fillRect(inset, inset, w - inset * 2, 2);
    g.fillRect(inset, h - inset - 2, w - inset * 2, 2);
    g.fillRect(inset, inset, 2, h - inset * 2);
    g.fillRect(w - inset - 2, inset, 2, h - inset * 2);
  },
  mute: PIXEL_COLORS[RED],
  well: drawPixelWell,
  slides,
};

export function buildPixelSprites(classic: SpriteMap): SpriteMap {
  return buildSkin(classic, SPEC);
}
