import { RED, type Color } from "../core/color";
import type { Layout } from "../core/layout";
import { cellX, cellY, replenishY } from "../core/layout";
import type { SpriteMap } from "./assets";
import type { TitleFx } from "./backdrops";
import { rgba, roundRect, shade, type Ctx } from "./modernSkin";
import type { SlideStyle } from "./modernSlides";
import { buildSkin, makeGlyphs, seeded, type ButtonFn, type SkinSpec, type TileFn } from "./skinKit";
import { fillScreen, screenRect } from "./view";

/**
 * "Circuit": LEDs soldered to a green board. Every brick is a square LED
 * dome lit from inside on a black package with four legs; copper traces
 * and vias run across the PCB and a pulse of light travels along the trace
 * nearest the pointer; buttons are chips with silkscreen labels; the tray
 * is a DIP socket row. Same-colour neighbours fuse (the lit trace between
 * them), pops throw hot white sparks that cool to the LED colour plus dome
 * shards, and a big pop flares.
 */

export const FONT = 'Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
export const DISPLAY = '"Share Tech Mono", "Consolas", "Courier New", monospace';

export const PCB = "#0E3B2A";
export const PCB_DARK = "#0A2E21";
export const PCB_LIGHT = "#145038";
export const COPPER = "#C98A4B";
export const COPPER_LIGHT = "#E8B071";
export const COPPER_DARK = "#8E5F2E";
export const INK = "#0B1A14";
export const TEXT = "#E8F0E6";
export const MUTED = "#8FB59F";
export const SILK = "#F2F7F0";
export const CARD = "#0B2A1E";

export const CIRCUIT_COLORS: Record<Color, string> = {
  1: "#FF4B4B",
  2: "#4D7CFF",
  3: "#A65BFF",
  4: "#FFE14D",
  5: "#FF9B2E",
  6: "#4DFF8A",
  7: "#9AA3AD",
};

// ---------------------------------------------------------------------------
// LED tile, glyphs, chip button
// ---------------------------------------------------------------------------

/** A square LED: a black package with legs at the corners and a glowing dome. */
const led: TileFn = (g, x, y, w, h, base, opts = {}) => {
  const m = Math.min(w, h);
  const fill = opts.lift ? shade(base, opts.lift) : base;
  const r = opts.radius ?? m * 0.18;
  // legs
  g.strokeStyle = COPPER;
  g.lineWidth = Math.max(1, m * 0.035);
  g.lineCap = "round";
  for (const [lx, ly] of [
    [0.22, 0],
    [0.78, 0],
    [0.22, 1],
    [0.78, 1],
    [0, 0.22],
    [0, 0.78],
    [1, 0.22],
    [1, 0.78],
  ]) {
    const px = x + w * lx;
    const py = y + h * ly;
    g.beginPath();
    g.moveTo(px, py);
    g.lineTo(px + (lx === 0 ? m * 0.09 : lx === 1 ? -m * 0.09 : 0), py + (ly === 0 ? m * 0.09 : ly === 1 ? -m * 0.09 : 0));
    g.stroke();
  }
  // package
  const inset = m * 0.07;
  roundRect(g, x + inset, y + inset, w - inset * 2, h - inset * 2, r);
  g.fillStyle = INK;
  g.fill();
  // dome
  const d = m * 0.13;
  roundRect(g, x + d, y + d, w - d * 2, h - d * 2, r * 0.8);
  const lit = g.createRadialGradient(x + w * 0.42, y + h * 0.4, m * 0.04, x + w / 2, y + h / 2, m * 0.55);
  lit.addColorStop(0, shade(fill, 0.45));
  lit.addColorStop(0.55, fill);
  lit.addColorStop(1, shade(fill, -0.3));
  g.fillStyle = lit;
  g.fill();
  if (!opts.plain) {
    g.save();
    roundRect(g, x + d, y + d, w - d * 2, h - d * 2, r * 0.8);
    g.clip();
    // specular
    g.fillStyle = "rgba(255,255,255,0.22)";
    g.beginPath();
    g.ellipse(x + w * 0.36, y + h * 0.3, m * 0.2, m * 0.1, -0.5, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  g.lineWidth = 1;
  g.strokeStyle = "rgba(255,255,255,0.18)";
  roundRect(g, x + d + 0.5, y + d + 0.5, w - d * 2 - 1, h - d * 2 - 1, r * 0.8);
  g.stroke();
};

const glyphs = makeGlyphs({ stroke: "#FFFFFF", fill: "rgba(255,255,255,0.95)", glow: "#FFFFFF", width: 0.045 });

/** A black chip with copper pins and a silkscreen icon. */
const chipButton: ButtonFn = (g, w, h, pressed, icon) => {
  const cx = w / 2;
  const cy = h / 2;
  const s = Math.min(w, h) * 0.72;
  const x = cx - s / 2;
  const y = cy - s / 2 + (pressed ? 2 : 0);
  // pins
  g.strokeStyle = COPPER;
  g.lineWidth = Math.max(1, s * 0.05);
  g.lineCap = "round";
  for (let k = 0; k < 4; k++) {
    const u = x + s * (0.2 + k * 0.2);
    g.beginPath();
    g.moveTo(u, y - s * 0.08);
    g.lineTo(u, y);
    g.moveTo(u, y + s);
    g.lineTo(u, y + s + s * 0.08);
    g.stroke();
  }
  if (!pressed) {
    roundRect(g, x, y + 3, s, s, s * 0.12);
    g.fillStyle = "rgba(0,0,0,0.45)";
    g.fill();
  }
  roundRect(g, x, y, s, s, s * 0.12);
  g.fillStyle = pressed ? "#1A1A1A" : INK;
  g.fill();
  g.lineWidth = 1.5;
  g.strokeStyle = rgba(COPPER, 0.7);
  roundRect(g, x + 0.75, y + 0.75, s - 1.5, s - 1.5, s * 0.12);
  g.stroke();
  // notch
  g.fillStyle = rgba(SILK, 0.3);
  g.beginPath();
  g.arc(x + s * 0.5, y + s * 0.08, s * 0.05, 0, Math.PI * 2);
  g.fill();
  g.save();
  g.strokeStyle = CIRCUIT_COLORS[6];
  g.fillStyle = CIRCUIT_COLORS[6];
  g.lineWidth = s * 0.07;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.shadowColor = CIRCUIT_COLORS[6];
  g.shadowBlur = s * 0.12;
  icon(g, cx, cy + (pressed ? 2 : 0), s * 0.36);
  g.restore();
};

function panel(g: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  roundRect(g, x, y, w, h, r);
  g.fillStyle = rgba(CARD, 0.96);
  g.fill();
  g.lineWidth = 1.5;
  g.strokeStyle = rgba(COPPER, 0.7);
  roundRect(g, x, y, w, h, r);
  g.stroke();
  // corner vias
  for (const [vx, vy] of [
    [x + 12, y + 12],
    [x + w - 12, y + 12],
    [x + 12, y + h - 12],
    [x + w - 12, y + h - 12],
  ])
    via(g, vx, vy, 3);
}

/** A copper ring with a dark hole. */
export function via(g: Ctx, cx: number, cy: number, r: number): void {
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fillStyle = COPPER;
  g.fill();
  g.beginPath();
  g.arc(cx, cy, r * 0.45, 0, Math.PI * 2);
  g.fillStyle = PCB_DARK;
  g.fill();
}

/** "HueBricks" in the mono display face on a silkscreen box, a trace running under it. */
function logo(g: Ctx, i: number, w: number, h: number): void {
  const size = h * 0.34;
  g.strokeStyle = COPPER;
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(0, h * 0.82);
  g.lineTo(w * 0.2, h * 0.82);
  g.lineTo(w * 0.26, h * 0.9);
  g.lineTo(w * 0.78, h * 0.9);
  g.lineTo(w * 0.84, h * 0.82);
  g.lineTo(w, h * 0.82);
  g.stroke();
  via(g, w * 0.2, h * 0.82, 5);
  via(g, w * 0.84, h * 0.82, 5);
  g.font = `700 ${size}px ${DISPLAY}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const y = h * 0.46;
  g.save();
  g.shadowColor = rgba(CIRCUIT_COLORS[6], i === 1 ? 0.9 : 0.55);
  g.shadowBlur = i === 1 ? 26 : 14;
  g.fillStyle = TEXT;
  g.fillText("HUEBRICKS", w / 2, y);
  g.fillText("HUEBRICKS", w / 2, y);
  g.restore();
  g.font = `400 ${size * 0.3}px ${DISPLAY}`;
  g.fillStyle = MUTED;
  g.fillText("REV C  ·  J4", w / 2, y + size * 0.72);
}

function menuFrame(g: Ctx, w: number, h: number): void {
  g.fillStyle = PCB_DARK;
  g.fillRect(0, 8, w, h - 8);
  g.strokeStyle = rgba(COPPER, 0.7);
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, 12);
  g.lineTo(w, 12);
  g.stroke();
  for (let x = 24; x < w; x += 48) via(g, x, 12, 3);
}

// ---------------------------------------------------------------------------
// Backdrop and furniture
// ---------------------------------------------------------------------------

/** An empty socket on the board: a dark square pad with a copper rim. */
export function drawCircuitWell(g: Ctx, x: number, y: number, w: number, h: number): void {
  const r = Math.min(w, h) * 0.16;
  roundRect(g, x + w * 0.07, y + h * 0.07, w * 0.86, h * 0.86, r);
  g.fillStyle = "rgba(0,0,0,0.3)";
  g.fill();
  g.lineWidth = 1;
  g.strokeStyle = rgba(COPPER, 0.3);
  roundRect(g, x + w * 0.07 + 0.5, y + h * 0.07 + 0.5, w * 0.86 - 1, h * 0.86 - 1, r);
  g.stroke();
}

/** A DIP socket row: a long black package with copper pins along both edges. */
export function drawCircuitTray(g: Ctx, x: number, y: number, w: number, h: number): void {
  roundRect(g, x, y + 3, w, h, 8);
  g.fillStyle = "rgba(0,0,0,0.4)";
  g.fill();
  roundRect(g, x, y, w, h, 8);
  g.fillStyle = INK;
  g.fill();
  g.strokeStyle = COPPER;
  g.lineWidth = 2;
  for (let px = x + 10; px < x + w - 6; px += 14) {
    g.beginPath();
    g.moveTo(px, y - 5);
    g.lineTo(px, y + 2);
    g.moveTo(px, y + h - 2);
    g.lineTo(px, y + h + 5);
    g.stroke();
  }
  g.lineWidth = 1;
  g.strokeStyle = rgba(COPPER, 0.5);
  roundRect(g, x + 0.5, y + 0.5, w - 1, h - 1, 8);
  g.stroke();
}

/** Green PCB with traces and vias; a light pulse runs along the trace nearest the pointer; with a layout, the board area and socket row. */
export function drawCircuitBackdrop(g: Ctx, t: number, l?: Layout, flare = 0, fx: TitleFx | null = null): void {
  const sr = screenRect();
  const bg = g.createLinearGradient(0, 0, sr.w, sr.h);
  bg.addColorStop(0, PCB_LIGHT);
  bg.addColorStop(1, PCB_DARK);
  fillScreen(g, bg);
  // fine grid like a ground plane
  g.strokeStyle = "rgba(255,255,255,0.03)";
  g.lineWidth = 1;
  for (let x = 0; x < sr.w; x += 24) {
    g.beginPath();
    g.moveTo(x + 0.5, 0);
    g.lineTo(x + 0.5, sr.h);
    g.stroke();
  }
  for (let y = 0; y < sr.h; y += 24) {
    g.beginPath();
    g.moveTo(0, y + 0.5);
    g.lineTo(sr.w, y + 0.5);
    g.stroke();
  }
  // traces: orthogonal runs with 45-degree bends, each ending in a via
  const rnd = seeded(77);
  const pointer = fx?.pointer ?? null;
  const traces: { pts: [number, number][]; len: number }[] = [];
  for (let i = 0; i < 14; i++) {
    const pts: [number, number][] = [];
    let x = rnd() * sr.w;
    let y = rnd() * sr.h;
    pts.push([x, y]);
    const steps = 3 + Math.floor(rnd() * 3);
    let len = 0;
    for (let s = 0; s < steps; s++) {
      const horizontal = s % 2 === 0;
      const d = 40 + rnd() * 140;
      const nx = horizontal ? x + (rnd() < 0.5 ? -d : d) : x + (rnd() < 0.5 ? -d * 0.35 : d * 0.35);
      const ny = horizontal ? y + (rnd() < 0.5 ? -d * 0.35 : d * 0.35) : y + (rnd() < 0.5 ? -d : d);
      len += Math.hypot(nx - x, ny - y);
      x = nx;
      y = ny;
      pts.push([x, y]);
    }
    traces.push({ pts, len });
  }
  g.lineJoin = "round";
  g.lineCap = "round";
  let nearest = -1;
  let nearestD = Infinity;
  traces.forEach((tr, i) => {
    g.strokeStyle = rgba(COPPER, 0.55);
    g.lineWidth = 3;
    g.beginPath();
    tr.pts.forEach(([px, py], k) => (k === 0 ? g.moveTo(px, py) : g.lineTo(px, py)));
    g.stroke();
    via(g, tr.pts[0][0], tr.pts[0][1], 4);
    via(g, tr.pts[tr.pts.length - 1][0], tr.pts[tr.pts.length - 1][1], 4);
    if (pointer) {
      for (const [px, py] of tr.pts) {
        const d = Math.hypot(px - pointer.x, py - pointer.y);
        if (d < nearestD) {
          nearestD = d;
          nearest = i;
        }
      }
    }
  });
  // the pulse: a bright dot sliding along the nearest trace (every trace after a clear)
  traces.forEach((tr, i) => {
    if (i !== nearest && flare < 0.05) return;
    const u = (t / 1400 + i * 0.17) % 1;
    let dist = u * tr.len;
    for (let k = 1; k < tr.pts.length; k++) {
      const [ax, ay] = tr.pts[k - 1];
      const [bx, by] = tr.pts[k];
      const seg = Math.hypot(bx - ax, by - ay);
      if (dist <= seg) {
        const px = ax + ((bx - ax) * dist) / seg;
        const py = ay + ((by - ay) * dist) / seg;
        const halo = g.createRadialGradient(px, py, 0, px, py, 14);
        halo.addColorStop(0, rgba(CIRCUIT_COLORS[6], 0.8));
        halo.addColorStop(1, rgba(CIRCUIT_COLORS[6], 0));
        g.fillStyle = halo;
        g.fillRect(px - 14, py - 14, 28, 28);
        g.fillStyle = "#FFFFFF";
        g.beginPath();
        g.arc(px, py, 2, 0, Math.PI * 2);
        g.fill();
        break;
      }
      dist -= seg;
    }
  });
  // silkscreen labels
  g.font = `400 10px ${DISPLAY}`;
  g.fillStyle = rgba(SILK, 0.35);
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  const labels = ["C12", "R7", "U3", "J4", "HUE-7", "REV C", "GND", "VCC"];
  const rnd2 = seeded(5);
  for (let i = 0; i < labels.length; i++) g.fillText(labels[i], rnd2() * sr.w, rnd2() * sr.h);
  if (!l) return;
  const n = l.cellNum;
  const gridBottom = cellY(l, n) - l.cellSep;
  roundRect(g, l.boardX - 12, l.boardY - 12, l.boardW + 24, gridBottom - l.boardY + 18, 10);
  g.fillStyle = rgba(PCB_DARK, 0.85);
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = rgba(COPPER, 0.6);
  roundRect(g, l.boardX - 12, l.boardY - 12, l.boardW + 24, gridBottom - l.boardY + 18, 10);
  g.stroke();
  const pad = l.cellW * 0.04;
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) drawCircuitWell(g, cellX(l, x) + pad, cellY(l, y) + pad, l.cellW - pad * 2, l.cellH - pad * 2);
  }
  drawCircuitTray(g, l.boardX - 8, replenishY(l) - 8, l.boardW + 16, l.cellH + 16);
}

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------

const slides: SlideStyle = {
  background(g, w, h) {
    g.fillStyle = PCB;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = rgba(COPPER, 0.4);
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, h * 0.85);
    g.lineTo(w * 0.3, h * 0.85);
    g.lineTo(w * 0.36, h * 0.92);
    g.lineTo(w, h * 0.92);
    g.stroke();
  },
  font: FONT,
  display: DISPLAY,
  text: TEXT,
  muted: MUTED,
  bgColor: PCB,
  dotIdle: "rgba(232,240,230,0.25)",
  card: CARD,
  cardEdge: rgba(COPPER, 0.6),
  cardShadow: "rgba(0,0,0,0.5)",
  gridLine: "rgba(232,240,230,0.06)",
  well: "rgba(0,0,0,0.25)",
  wellEdge: rgba(COPPER, 0.3),
  track: "rgba(232,240,230,0.14)",
  colors: CIRCUIT_COLORS,
  inkOn: () => "#FFFFFF",
  tile: (g, x, y, w, h, base, opts) => led(g, x, y, w, h, base, { radius: opts?.radius, plain: true }),
  glyphs,
  button: chipButton,
};

const SPEC: SkinSpec = {
  colors: CIRCUIT_COLORS,
  neutral: "#4C5A55",
  bg: PCB,
  text: TEXT,
  muted: MUTED,
  font: FONT,
  display: DISPLAY,
  tile: led,
  glyphs,
  button: chipButton,
  panel,
  logo,
  menuFrame,
  worldText: TEXT,
  worldTextShadow: "rgba(0,0,0,0.6)",
  shadow: null,
  glow: true,
  selector: "glow",
  selectorNeutral: COPPER_LIGHT,
  progress: [CIRCUIT_COLORS[6], COPPER_LIGHT],
  pop(g, t, w, h) {
    g.globalAlpha = 1 - t;
    g.strokeStyle = "#FFFFFF";
    g.lineCap = "round";
    g.lineWidth = 2;
    const rnd = seeded(Math.floor(t * 6) + 3);
    for (let k = 0; k < 7; k++) {
      const a = rnd() * Math.PI * 2;
      const d0 = w * (0.06 + t * 0.25);
      const d1 = d0 + w * (0.08 + rnd() * 0.15);
      g.beginPath();
      g.moveTo(w / 2 + Math.cos(a) * d0, h / 2 + Math.sin(a) * d0);
      g.lineTo(w / 2 + Math.cos(a) * d1, h / 2 + Math.sin(a) * d1);
      g.stroke();
    }
  },
  mute: CIRCUIT_COLORS[RED],
  well: drawCircuitWell,
  slides,
};

export function buildCircuitSprites(classic: SpriteMap): SpriteMap {
  return buildSkin(classic, SPEC);
}
