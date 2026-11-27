import { RED, type Color } from "../core/color";
import type { Layout } from "../core/layout";
import { cellX, cellY, replenishY } from "../core/layout";
import type { SpriteMap } from "./assets";
import type { TitleFx } from "./backdrops";
import { canvas, rgba, roundRect, shade, type Ctx } from "./modernSkin";
import type { SlideStyle } from "./modernSlides";
import { buildSkin, makeGlyphs, type ButtonFn, type SkinSpec, type TileFn } from "./skinKit";
import { fillScreen, heroSpot, screenRect, view } from "./view";

/**
 * "Fractals": self-similar geometry glowing out of a deep void. Bricks are
 * lit tiles ruled into a Sierpinski lattice, buttons are Koch snowflakes,
 * the tray is a dark glass trough whose next well fills cell by cell as a
 * Sierpinski carpet, and behind everything a carpet zooms forever (it is
 * self-similar, so every step of x3 lands back on itself) while a fractal
 * canopy sways in the corner and leans toward the pointer. Pops split the
 * tile into its eight smaller copies.
 */

export const FONT = 'Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
export const DISPLAY = 'Orbitron, Audiowide, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const VOID = "#070A18";
export const VOID_HIGH = "#121A3A";
export const CARD = "#111833";
export const AQUA = "#5EE6D8";
export const VIOLET = "#B36BFF";
export const TEXT = "#EEF1FF";
export const MUTED = "#8E97BF";

export const FRACTAL_COLORS: Record<Color, string> = {
  1: "#FF4D6D",
  2: "#3D7BFF",
  3: "#A66BFF",
  4: "#FFD23F",
  5: "#FF8C42",
  6: "#3DE8A0",
  7: "#AEB8D9",
};

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** The eight outer cells of a 3 x 3 Sierpinski carpet, in the order the well fills: around from the top-left. */
export const RING: readonly (readonly [number, number])[] = [
  [0, 0],
  [1, 0],
  [2, 0],
  [2, 1],
  [2, 2],
  [1, 2],
  [0, 2],
  [0, 1],
];

/**
 * How much of the carpet a fill `level` (0..1) lights: `full` outer cells lit
 * whole, then `partial` of the next cell's own eight sub-cells. 64 steps.
 */
export function carpetFill(level: number): { full: number; partial: number } {
  const steps = Math.round(Math.min(1, Math.max(0, level)) * 64);
  return { full: Math.floor(steps / 8), partial: steps % 8 };
}

/** The outline of a Koch snowflake of `depth` around (`cx`, `cy`), point up, outer radius `r`. */
export function kochPoints(cx: number, cy: number, r: number, depth: number): [number, number][] {
  let pts: [number, number][] = [0, 1, 2].map((k) => {
    const a = -Math.PI / 2 + (k * 2 * Math.PI) / 3;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });
  const c = Math.cos(-Math.PI / 3);
  const s = Math.sin(-Math.PI / 3);
  for (let d = 0; d < depth; d++) {
    const next: [number, number][] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % pts.length];
      const dx = (x1 - x0) / 3;
      const dy = (y1 - y0) / 3;
      const ax = x0 + dx;
      const ay = y0 + dy;
      next.push([x0, y0], [ax, ay], [ax + dx * c - dy * s, ay + dx * s + dy * c], [x0 + dx * 2, y0 + dy * 2]);
    }
    pts = next;
  }
  return pts;
}

function kochPath(g: Ctx, cx: number, cy: number, r: number, depth: number): void {
  const pts = kochPoints(cx, cy, r, depth);
  g.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
  g.closePath();
}

/** Sierpinski triangle outlines, point up, from the apex (`x`, `y`) with side `side`. */
function sierpinski(g: Ctx, x: number, y: number, side: number, depth: number): void {
  const h = side * 0.866;
  g.moveTo(x, y);
  g.lineTo(x + side / 2, y + h);
  g.lineTo(x - side / 2, y + h);
  g.closePath();
  if (depth <= 0) return;
  sierpinski(g, x, y, side / 2, depth - 1);
  sierpinski(g, x - side / 4, y + h / 2, side / 2, depth - 1);
  sierpinski(g, x + side / 4, y + h / 2, side / 2, depth - 1);
}

/** Lines at the thirds of a rectangle, then at the ninths more faintly: the carpet's first two rulings. */
function lattice(g: Ctx, x: number, y: number, w: number, h: number, ink: string, alpha: number): void {
  g.save();
  g.strokeStyle = ink;
  g.lineWidth = 1;
  for (const [n, a] of [
    [3, alpha],
    [9, alpha * 0.45],
  ] as const) {
    g.globalAlpha = a;
    g.beginPath();
    for (let k = 1; k < n; k++) {
      if (n === 9 && k % 3 === 0) continue;
      const lx = x + (w * k) / n;
      const ly = y + (h * k) / n;
      g.moveTo(lx, y);
      g.lineTo(lx, y + h);
      g.moveTo(x, ly);
      g.lineTo(x + w, ly);
    }
    g.stroke();
  }
  g.restore();
}

// ---------------------------------------------------------------------------
// Tile, glyphs, snowflake button
// ---------------------------------------------------------------------------

/** A lit glass tile ruled into the carpet's lattice, brightest at its heart. */
const fractalTile: TileFn = (g, x, y, w, h, base, opts = {}) => {
  const m = Math.min(w, h);
  const fill = opts.lift ? shade(base, opts.lift) : base;
  const r = opts.radius ?? m * 0.22;
  roundRect(g, x, y, w, h, r);
  const grad = g.createRadialGradient(x + w / 2, y + h / 2, m * 0.08, x + w / 2, y + h / 2, m * 0.78);
  grad.addColorStop(0, shade(fill, 0.22));
  grad.addColorStop(0.55, fill);
  grad.addColorStop(1, shade(fill, -0.3));
  g.fillStyle = grad;
  g.fill();
  if (!opts.plain) {
    g.save();
    roundRect(g, x, y, w, h, r);
    g.clip();
    lattice(g, x, y, w, h, "#FFFFFF", 0.16);
    g.restore();
  }
  g.lineWidth = Math.max(1, m * 0.025);
  g.strokeStyle = rgba(shade(fill, 0.5), 0.75);
  roundRect(g, x + 0.5, y + 0.5, w - 1, h - 1, r);
  g.stroke();
};

const glyphs = makeGlyphs({ stroke: "rgba(255,255,255,0.95)", fill: "rgba(255,255,255,0.95)", glow: "rgba(255,255,255,0.55)", width: 0.045 });

/** A Koch snowflake of aqua glass, lit from the top left, the icon inked dark on it. */
const snowflakeButton: ButtonFn = (g, w, h, pressed, icon) => {
  const cx = w / 2;
  const cy = h / 2 + (pressed ? 2 : 0);
  const r = Math.min(w, h) * 0.44;
  if (!pressed) {
    g.save();
    g.fillStyle = "rgba(0,0,0,0.45)";
    kochPath(g, cx, cy + 4, r, 2);
    g.fill();
    g.restore();
  }
  g.save();
  g.shadowColor = rgba(AQUA, 0.6);
  g.shadowBlur = r * 0.25;
  kochPath(g, cx, cy, r, 2);
  const grad = g.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
  grad.addColorStop(0, pressed ? AQUA : "#C9FFF8");
  grad.addColorStop(0.55, pressed ? shade(AQUA, -0.25) : AQUA);
  grad.addColorStop(1, shade(AQUA, -0.45));
  g.fillStyle = grad;
  g.fill();
  g.restore();
  g.lineWidth = Math.max(1, r * 0.04);
  g.strokeStyle = "rgba(255,255,255,0.7)";
  kochPath(g, cx, cy, r * 0.96, 2);
  g.stroke();
  g.save();
  g.strokeStyle = VOID;
  g.fillStyle = VOID;
  g.lineWidth = r * 0.13;
  g.lineCap = "round";
  g.lineJoin = "round";
  icon(g, cx, cy, r * 0.42);
  g.restore();
};

function panel(g: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  g.save();
  g.shadowColor = rgba(AQUA, 0.35);
  g.shadowBlur = 16;
  roundRect(g, x, y, w, h, r);
  g.fillStyle = CARD;
  g.fill();
  g.restore();
  g.save();
  roundRect(g, x, y, w, h, r);
  g.clip();
  lattice(g, x, y, w, h, AQUA, 0.06);
  g.restore();
  g.lineWidth = 1.5;
  g.strokeStyle = rgba(AQUA, 0.55);
  roundRect(g, x, y, w, h, r);
  g.stroke();
}

/** "HueBricks" in the geometric face over a Sierpinski triangle, glowing aqua. */
function logo(g: Ctx, i: number, w: number, h: number): void {
  g.save();
  g.strokeStyle = rgba(AQUA, i === 1 ? 0.5 : 0.28);
  g.lineWidth = 1.5;
  g.beginPath();
  sierpinski(g, w / 2, h * 0.04, h * 1.05, 3);
  g.stroke();
  g.restore();
  g.save();
  g.font = `700 ${h * 0.3}px ${DISPLAY}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.shadowColor = rgba(AQUA, 0.9);
  g.shadowBlur = i === 1 ? 26 : 16;
  g.fillStyle = TEXT;
  g.fillText("HueBricks", w / 2, h * 0.56);
  g.fillText("HueBricks", w / 2, h * 0.56);
  g.restore();
}

function menuFrame(g: Ctx, w: number, h: number): void {
  g.fillStyle = VOID_HIGH;
  g.fillRect(0, 6, w, h - 6);
  g.save();
  g.strokeStyle = rgba(AQUA, 0.2);
  g.lineWidth = 1;
  g.beginPath();
  const side = (h - 6) * 0.9;
  for (let x = side * 0.3; x < w + side; x += side * 0.5) sierpinski(g, x, h - 2 - side * 0.866, side, 2);
  g.stroke();
  g.restore();
  g.save();
  g.shadowColor = AQUA;
  g.shadowBlur = 10;
  g.fillStyle = AQUA;
  g.fillRect(0, 6, w, 2);
  g.restore();
}

// ---------------------------------------------------------------------------
// Backdrop and furniture
// ---------------------------------------------------------------------------

/** An empty cell: nested squares receding into the glass. */
export function drawFractalsWell(g: Ctx, x: number, y: number, w: number, h: number): void {
  const r = Math.min(w, h) * 0.2;
  roundRect(g, x, y, w, h, r);
  g.fillStyle = rgba(CARD, 0.85);
  g.fill();
  g.lineWidth = 1;
  for (let k = 0; k < 3; k++) {
    const inset = (Math.min(w, h) * k) / 6;
    g.strokeStyle = rgba(AQUA, 0.22 - k * 0.06);
    roundRect(g, x + inset + 0.5, y + inset + 0.5, w - inset * 2 - 1, h - inset * 2 - 1, r * (1 - k * 0.3));
    g.stroke();
  }
}

/** The tray: a trough of dark glass with a glowing aqua lip. */
export function drawFractalsTray(g: Ctx, x: number, y: number, w: number, h: number): void {
  g.save();
  g.shadowColor = rgba(AQUA, 0.45);
  g.shadowBlur = 14;
  roundRect(g, x, y, w, h, 14);
  g.fillStyle = rgba(VOID_HIGH, 0.95);
  g.fill();
  g.restore();
  g.save();
  roundRect(g, x, y, w, h, 14);
  g.clip();
  lattice(g, x, y, w, h, AQUA, 0.08);
  g.restore();
  g.lineWidth = 1.5;
  g.strokeStyle = rgba(AQUA, 0.6);
  roundRect(g, x, y, w, h, 14);
  g.stroke();
}

/** The next well fills as a Sierpinski carpet: eight cells light in turn, each cell's own eight sub-cells first. */
export function drawFractalsFill(g: Ctx, x: number, y: number, w: number, h: number, level: number, colour: string, t: number): void {
  const { full, partial } = carpetFill(level);
  if (full === 0 && partial === 0) return;
  const m = Math.min(w, h);
  const inset = m * 0.12;
  const side = m - inset * 2;
  const sx = x + (w - side) / 2;
  const sy = y + (h - side) / 2;
  const cell = side / 3;
  const pulse = 0.85 + 0.15 * Math.sin(t / 180);
  g.save();
  g.shadowColor = colour;
  g.shadowBlur = m * 0.12;
  g.fillStyle = rgba(colour, 0.8 * pulse);
  for (let k = 0; k < full; k++) {
    const [i, j] = RING[k];
    g.fillRect(sx + i * cell + 1, sy + j * cell + 1, cell - 2, cell - 2);
  }
  if (full < 8 && partial > 0) {
    const [i, j] = RING[full];
    const sub = cell / 3;
    g.fillStyle = rgba(colour, 0.65 * pulse);
    for (let q = 0; q < partial; q++) {
      const [a, b] = RING[q];
      g.fillRect(sx + i * cell + a * sub + 0.5, sy + j * cell + b * sub + 0.5, sub - 1, sub - 1);
    }
  }
  if (full === 8) {
    g.fillStyle = rgba("#FFFFFF", 0.5 * pulse);
    g.fillRect(sx + cell + 1, sy + cell + 1, cell - 2, cell - 2);
  }
  g.restore();
}

/** The carpet, baked once per screen size: lit squares at every hole, corner at the origin. */
let carpet: { side: number; img: HTMLCanvasElement } | null = null;
const CARPET_DEPTH = 5;
/** One x3 step of the endless zoom. */
const ZOOM_MS = 14000;

function carpetImage(side: number): HTMLCanvasElement {
  if (carpet && carpet.side === side) return carpet.img;
  const px = Math.ceil(side * 3);
  const img = canvas(px, px, (g, w) => {
    g.fillStyle = AQUA;
    const holes = (x: number, y: number, s: number, depth: number): void => {
      const c = s / 3;
      g.fillRect(x + c, y + c, c, c);
      if (depth <= 0) return;
      for (const [i, j] of RING) holes(x + i * c, y + j * c, c, depth - 1);
    };
    holes(0, 0, w, CARPET_DEPTH);
  });
  carpet = { side, img };
  return img;
}

/** Four carpets meet at the screen's centre and zoom out of it forever, turning slowly. */
function drawCarpet(g: Ctx, t: number, alpha: number): void {
  const sr = screenRect();
  const half = Math.ceil(Math.hypot(sr.w, sr.h) / 2);
  const img = carpetImage(half);
  const s = Math.pow(3, (t % ZOOM_MS) / ZOOM_MS);
  g.save();
  g.globalAlpha = alpha;
  g.translate(sr.w / 2, sr.h / 2);
  g.rotate(t / 90000);
  for (const [fx, fy] of [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ]) {
    g.save();
    g.scale(fx, fy);
    g.drawImage(img, 0, 0, img.width, img.height, 0, 0, half * s, half * s);
    g.restore();
  }
  g.restore();
}

/**
 * A fractal canopy: each branch forks into two shorter ones, `depth` times.
 * Tips are dots in the brick colours. `lean` tilts the whole tree.
 */
export function canopy(g: Ctx, x: number, y: number, len: number, depth: number, sway: number, lean: number, tipAlpha: number): void {
  g.lineCap = "round";
  const tips: [number, number, number][] = [];
  const branch = (bx: number, by: number, l: number, a: number, d: number): void => {
    const ex = bx + Math.cos(a) * l;
    const ey = by + Math.sin(a) * l;
    g.lineWidth = Math.max(0.6, d * 0.45);
    g.globalAlpha = 0.25 + d * 0.07;
    g.beginPath();
    g.moveTo(bx, by);
    g.lineTo(ex, ey);
    g.stroke();
    if (d <= 0) {
      tips.push([ex, ey, depth]);
      return;
    }
    const spread = 0.42 + sway;
    branch(ex, ey, l * 0.68, a - spread + lean * 0.3, d - 1);
    branch(ex, ey, l * 0.68, a + spread + lean * 0.3, d - 1);
  };
  g.strokeStyle = AQUA;
  branch(x, y, len, -Math.PI / 2 + lean, depth);
  g.globalAlpha = tipAlpha;
  const colours = [FRACTAL_COLORS[1], FRACTAL_COLORS[4], FRACTAL_COLORS[2], FRACTAL_COLORS[6], FRACTAL_COLORS[3], FRACTAL_COLORS[5]];
  tips.forEach(([tx, ty], i) => {
    g.fillStyle = colours[i % colours.length];
    g.beginPath();
    g.arc(tx, ty, 1.6, 0, Math.PI * 2);
    g.fill();
  });
  g.globalAlpha = 1;
}

/** A ring that spawns four smaller rings at its compass points, which spawn their own: the title's tap mark. */
function burst(g: Ctx, x: number, y: number, r: number, depth: number): void {
  g.moveTo(x + r, y);
  g.arc(x, y, r, 0, Math.PI * 2);
  if (depth <= 0) return;
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ])
    burst(g, x + dx * r, y + dy * r, r / 2, depth - 1);
}

/** The void with the endless carpet, the canopy in its corner; with a layout, the board's glass and the tray. */
export function drawFractalsBackdrop(g: Ctx, t: number, l?: Layout, flare = 0, fx: TitleFx | null = null): void {
  const sr = screenRect();
  const sky = g.createRadialGradient(sr.w / 2, sr.h / 2, sr.h * 0.1, sr.w / 2, sr.h / 2, Math.hypot(sr.w, sr.h) * 0.6);
  sky.addColorStop(0, VOID_HIGH);
  sky.addColorStop(1, VOID);
  fillScreen(g, sky);
  drawCarpet(g, t, 0.07 + 0.14 * flare);
  // the canopy: sways on its own, leans toward the title's pointer, and its tips flare on a clear
  const r = view.portrait ? (l ? 40 : 54) : 68;
  const { x: hx, y: hy } = heroSpot(r, l !== undefined);
  const pointer = fx?.pointer ?? null;
  const lean = pointer ? Math.max(-0.3, Math.min(0.3, ((pointer.x - hx) / view.w) * 0.6)) : 0;
  g.save();
  canopy(g, hx, hy + r, r * 0.62, 7, 0.05 * Math.sin(t / 1900), lean, 0.75 + 0.25 * flare);
  g.restore();
  // taps ripple out as rings within rings
  for (const tap of fx?.taps ?? []) {
    const age = t - tap.t;
    if (age < 0 || age > 1100) continue;
    const p = age / 1100;
    g.save();
    g.globalAlpha = (1 - p) * 0.7;
    g.strokeStyle = AQUA;
    g.lineWidth = 1.5;
    g.beginPath();
    burst(g, tap.x, tap.y, 12 + p * 110, 2);
    g.stroke();
    g.restore();
  }
  if (!l) return;
  const n = l.cellNum;
  const gridBottom = cellY(l, n) - l.cellSep;
  const bx = l.boardX - 12;
  const by = l.boardY - 12;
  const bw = l.boardW + 24;
  const bh = gridBottom - l.boardY + 18;
  roundRect(g, bx, by, bw, bh, 16);
  g.fillStyle = rgba(VOID, 0.88);
  g.fill();
  g.lineWidth = 1.5;
  g.strokeStyle = rgba(AQUA, 0.3 + 0.4 * flare);
  roundRect(g, bx, by, bw, bh, 16);
  g.stroke();
  const pad = l.cellW * 0.04;
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) drawFractalsWell(g, cellX(l, x) + pad, cellY(l, y) + pad, l.cellW - pad * 2, l.cellH - pad * 2);
  }
  drawFractalsTray(g, l.boardX - 8, replenishY(l) - 8, l.boardW + 16, l.cellH + 16);
}

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------

const slides: SlideStyle = {
  background(g, w, h) {
    const sky = g.createRadialGradient(w / 2, h / 2, h * 0.1, w / 2, h / 2, w * 0.7);
    sky.addColorStop(0, VOID_HIGH);
    sky.addColorStop(1, VOID);
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    lattice(g, 0, 0, w, h, AQUA, 0.1);
  },
  font: FONT,
  display: DISPLAY,
  text: TEXT,
  muted: MUTED,
  bgColor: VOID,
  dotIdle: "rgba(238,241,255,0.25)",
  card: CARD,
  cardEdge: rgba(AQUA, 0.55),
  cardShadow: "rgba(0,0,0,0.5)",
  gridLine: rgba(AQUA, 0.12),
  well: rgba(CARD, 0.85),
  wellEdge: rgba(AQUA, 0.22),
  track: "rgba(238,241,255,0.12)",
  colors: FRACTAL_COLORS,
  inkOn: () => "#FFFFFF",
  tile: (g, x, y, w, h, base, opts) => fractalTile(g, x, y, w, h, base, { radius: opts?.radius, plain: opts?.flat }),
  glyphs,
  button: snowflakeButton,
};

const SPEC: SkinSpec = {
  colors: FRACTAL_COLORS,
  neutral: "#3A4470",
  bg: VOID,
  text: TEXT,
  muted: MUTED,
  font: FONT,
  display: DISPLAY,
  tile: fractalTile,
  glyphs,
  button: snowflakeButton,
  panel,
  logo,
  menuFrame,
  worldText: TEXT,
  worldTextShadow: "rgba(0,0,0,0.7)",
  shadow: null,
  glow: true,
  selector: "glow",
  selectorNeutral: AQUA,
  progress: [AQUA, VIOLET],
  pop(g, t, w, h) {
    // the tile splits into its eight smaller selves, which fly outward and fade
    const cell = w / 3;
    g.globalAlpha = 1 - t;
    g.fillStyle = "#FFFFFF";
    for (const [i, j] of RING) {
      const cx = w / 2 + (i - 1) * cell * (1 + t * 1.8);
      const cy = h / 2 + (j - 1) * cell * (1 + t * 1.8);
      const side = cell * (0.9 - t * 0.5);
      roundRect(g, cx - side / 2, cy - side / 2, side, side, side * 0.2);
      g.fill();
    }
  },
  mute: FRACTAL_COLORS[RED],
  well: drawFractalsWell,
  slides,
};

export function buildFractalsSprites(classic: SpriteMap): SpriteMap {
  return buildSkin(classic, SPEC);
}
