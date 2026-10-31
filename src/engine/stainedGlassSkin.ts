import { BLUE, RED, YELLOW, type Color } from "../core/color";
import type { Layout } from "../core/layout";
import { cellX, cellY, replenishY } from "../core/layout";
import type { SpriteMap } from "./assets";
import type { TitleFx } from "./backdrops";
import { rgba, roundRect, shade, type Ctx } from "./modernSkin";
import type { SlideStyle } from "./modernSlides";
import { buildSkin, makeGlyphs, seeded, type ButtonFn, type SkinSpec, type TileFn } from "./skinKit";
import { fillScreen, screenRect } from "./view";

/**
 * "Stained Glass": leaded panes in a dark stone chapel. Every brick is a
 * bevelled pane of coloured glass set in lead came, with light pouring
 * through from the top-left; the board is a window frame in a stone wall
 * with a rose window above it, and a slow shaft of light sweeps across the
 * scene. Settled neighbours of one colour lose the lead between them (the
 * palette's `fuse` flag), so a growing group reads as one pane.
 */

export const FONT = 'Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
export const DISPLAY = 'Cinzel, "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';

export const STONE = "#2C2824";
export const STONE_DARK = "#221E1A";
export const LEAD = "#15110E";
export const GOLD = "#C9A24A";
export const GOLD_LIGHT = "#E8C978";
export const GOLD_DARK = "#9C7A2E";
export const TEXT = "#FFF3D0";
export const MUTED = "#B5A98E";
export const CARD = "#1A1613";

export const GLASS_COLORS: Record<Color, string> = {
  1: "#B8232F",
  2: "#1F4FA3",
  3: "#6B3A9E",
  4: "#E3B23C",
  5: "#D9682A",
  6: "#3B8A4E",
  7: "#4B4552",
};

// ---------------------------------------------------------------------------
// Pane, glyphs, gold button
// ---------------------------------------------------------------------------

/**
 * A leaded pane: a bevel of four facets around a central square, lit from
 * the top-left, with lead lines between them and a lead rim all round. Light
 * through the glass shows as a diagonal sheen and a few faint streaks.
 */
const pane: TileFn = (g, x, y, w, h, base, opts = {}) => {
  const m = Math.min(w, h);
  const r = opts.radius ?? m * 0.06;
  const fill = opts.lift ? shade(base, opts.lift) : base;
  const rim = m * 0.065;
  const bevel = m * 0.19;
  const rnd = seeded((opts.seed ?? 1) + 7);
  g.save();
  roundRect(g, x, y, w, h, r);
  g.clip();
  g.fillStyle = fill;
  g.fillRect(x, y, w, h);
  const ix = x + rim;
  const iy = y + rim;
  const iw = w - rim * 2;
  const ih = h - rim * 2;
  const facet = (pts: number[][], color: string) => {
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
    g.fillStyle = color;
    g.fill();
  };
  // top, left, right, bottom facets
  facet(
    [
      [ix, iy],
      [ix + iw, iy],
      [ix + iw - bevel, iy + bevel],
      [ix + bevel, iy + bevel],
    ],
    shade(fill, 0.22),
  );
  facet(
    [
      [ix, iy],
      [ix + bevel, iy + bevel],
      [ix + bevel, iy + ih - bevel],
      [ix, iy + ih],
    ],
    shade(fill, 0.1),
  );
  facet(
    [
      [ix + iw, iy],
      [ix + iw, iy + ih],
      [ix + iw - bevel, iy + ih - bevel],
      [ix + iw - bevel, iy + bevel],
    ],
    shade(fill, -0.14),
  );
  facet(
    [
      [ix, iy + ih],
      [ix + bevel, iy + ih - bevel],
      [ix + iw - bevel, iy + ih - bevel],
      [ix + iw, iy + ih],
    ],
    shade(fill, -0.26),
  );
  // light through the glass: a diagonal sheen and streaks
  const sheen = g.createLinearGradient(x, y, x + w, y + h);
  sheen.addColorStop(0, "rgba(255,243,208,0.22)");
  sheen.addColorStop(0.45, "rgba(255,243,208,0.04)");
  sheen.addColorStop(1, "rgba(0,0,0,0.12)");
  g.fillStyle = sheen;
  g.fillRect(x, y, w, h);
  if (!opts.plain) {
    g.strokeStyle = "rgba(255,255,255,0.1)";
    g.lineWidth = Math.max(0.6, m * 0.012);
    for (let k = 0; k < 3; k++) {
      const ox = x + w * (0.1 + rnd() * 0.8);
      g.beginPath();
      g.moveTo(ox, y);
      g.lineTo(ox - m * 0.3, y + h);
      g.stroke();
    }
  }
  // lead between facets and around the centre
  g.strokeStyle = LEAD;
  g.lineWidth = Math.max(1, m * 0.03);
  g.lineJoin = "round";
  g.beginPath();
  g.rect(ix + bevel, iy + bevel, iw - bevel * 2, ih - bevel * 2);
  g.moveTo(ix, iy);
  g.lineTo(ix + bevel, iy + bevel);
  g.moveTo(ix + iw, iy);
  g.lineTo(ix + iw - bevel, iy + bevel);
  g.moveTo(ix, iy + ih);
  g.lineTo(ix + bevel, iy + ih - bevel);
  g.moveTo(ix + iw, iy + ih);
  g.lineTo(ix + iw - bevel, iy + ih - bevel);
  g.stroke();
  g.restore();
  // the came all round
  g.lineWidth = rim * 2;
  g.strokeStyle = LEAD;
  roundRect(g, x, y, w, h, r);
  g.stroke();
  g.lineWidth = Math.max(0.6, m * 0.01);
  g.strokeStyle = "rgba(255,243,208,0.18)";
  roundRect(g, x + rim * 0.5, y + rim * 0.5, w - rim, h - rim, r * 0.5);
  g.stroke();
};

const glyphs = makeGlyphs({ stroke: LEAD, fill: "rgba(21,17,14,0.92)", shadow: "rgba(255,243,208,0.28)", width: 0.045 });

/** A gold boss: domed disc with a lead ring and a dark icon. */
const goldButton: ButtonFn = (g, w, h, pressed, icon) => {
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * 0.4;
  g.save();
  g.shadowColor = "rgba(0,0,0,0.55)";
  g.shadowBlur = r * 0.3;
  g.shadowOffsetY = r * 0.12;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fillStyle = LEAD;
  g.fill();
  g.restore();
  g.beginPath();
  g.arc(cx, cy, r * 0.88, 0, Math.PI * 2);
  const grad = g.createRadialGradient(cx - r * 0.25, cy - r * 0.3, r * 0.05, cx, cy, r * 0.95);
  grad.addColorStop(0, pressed ? "#F5DC9A" : GOLD_LIGHT);
  grad.addColorStop(0.55, GOLD);
  grad.addColorStop(1, GOLD_DARK);
  g.fillStyle = grad;
  g.fill();
  g.strokeStyle = "rgba(255,243,208,0.35)";
  g.lineWidth = r * 0.04;
  g.beginPath();
  g.arc(cx, cy, r * 0.74, Math.PI * 1.05, Math.PI * 1.75);
  g.stroke();
  g.save();
  g.strokeStyle = LEAD;
  g.fillStyle = LEAD;
  g.lineWidth = r * 0.13;
  g.lineCap = "round";
  g.lineJoin = "round";
  icon(g, cx, cy, r);
  g.restore();
};

function panel(g: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  g.save();
  g.shadowColor = "rgba(0,0,0,0.55)";
  g.shadowBlur = r;
  g.shadowOffsetY = r * 0.3;
  roundRect(g, x, y, w, h, r);
  g.fillStyle = CARD;
  g.fill();
  g.restore();
  g.lineWidth = 2;
  g.strokeStyle = GOLD;
  roundRect(g, x, y, w, h, r);
  g.stroke();
  g.lineWidth = 1;
  g.strokeStyle = rgba(GOLD, 0.35);
  roundRect(g, x + 5, y + 5, w - 10, h - 10, Math.max(2, r - 4));
  g.stroke();
}

/** The rose window: a gold ring with spokes and petal panes in the brick colours. */
export function roseWindow(g: Ctx, cx: number, cy: number, r: number, glow: number): void {
  const halo = g.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 2.4);
  halo.addColorStop(0, `rgba(232,201,120,${0.16 + glow * 0.3})`);
  halo.addColorStop(1, "rgba(232,201,120,0)");
  g.fillStyle = halo;
  g.fillRect(cx - r * 2.4, cy - r * 2.4, r * 4.8, r * 4.8);
  const petals = [GLASS_COLORS[1], GLASS_COLORS[4], GLASS_COLORS[2], GLASS_COLORS[6], GLASS_COLORS[3], GLASS_COLORS[5]];
  for (let k = 0; k < 12; k++) {
    const a0 = (k / 12) * Math.PI * 2;
    const a1 = ((k + 1) / 12) * Math.PI * 2;
    g.beginPath();
    g.moveTo(cx, cy);
    g.arc(cx, cy, r, a0, a1);
    g.closePath();
    g.fillStyle = rgba(petals[k % petals.length], 0.35 + glow * 0.4);
    g.fill();
  }
  g.strokeStyle = rgba(GOLD, 0.8);
  g.lineWidth = Math.max(1, r * 0.03);
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.moveTo(cx + r * 0.45, cy);
  g.arc(cx, cy, r * 0.45, 0, Math.PI * 2);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    g.moveTo(cx + Math.cos(a) * r * 0.45, cy + Math.sin(a) * r * 0.45);
    g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  g.stroke();
  g.fillStyle = rgba(TEXT, 0.5 + glow * 0.5);
  g.beginPath();
  g.arc(cx, cy, r * 0.12, 0, Math.PI * 2);
  g.fill();
}

/** "HueBricks" in a serif, gold over lead, with three small panes beneath. */
function logo(g: Ctx, i: number, w: number, h: number): void {
  const size = h * 0.36;
  g.font = `700 ${size}px ${DISPLAY}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const y = h / 2 - 10;
  g.save();
  g.shadowColor = rgba(GOLD, i === 1 ? 0.9 : 0.6);
  g.shadowBlur = i === 1 ? 26 : 16;
  g.lineJoin = "round";
  g.lineWidth = size * 0.11;
  g.strokeStyle = LEAD;
  g.strokeText("HueBricks", w / 2, y);
  g.restore();
  const grad = g.createLinearGradient(0, y - size / 2, 0, y + size / 2);
  grad.addColorStop(0, "#F5DC9A");
  grad.addColorStop(0.5, GOLD);
  grad.addColorStop(1, GOLD_DARK);
  g.fillStyle = grad;
  g.fillText("HueBricks", w / 2, y);
  g.lineWidth = size * 0.02;
  g.strokeStyle = LEAD;
  g.strokeText("HueBricks", w / 2, y);
  const mini = size * 0.22;
  [GLASS_COLORS[RED], GLASS_COLORS[BLUE], GLASS_COLORS[YELLOW]].forEach((c, k) => {
    pane(g, w / 2 - mini * 1.9 + k * mini * 1.3, y + size * 0.66, mini, mini, c, { plain: true, seed: k });
  });
}

/** A band of stone with a lead rule along the top. */
function menuFrame(g: Ctx, w: number, h: number): void {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, STONE);
  grad.addColorStop(1, STONE_DARK);
  g.fillStyle = grad;
  g.fillRect(0, 8, w, h - 8);
  g.fillStyle = LEAD;
  g.fillRect(0, 8, w, 3);
  g.fillStyle = rgba(GOLD, 0.5);
  g.fillRect(0, 11, w, 1);
}

// ---------------------------------------------------------------------------
// Backdrop and furniture
// ---------------------------------------------------------------------------

/** An empty opening in the window: dark glass behind lead. */
export function drawStainedGlassWell(g: Ctx, x: number, y: number, w: number, h: number): void {
  const r = Math.min(w, h) * 0.06;
  roundRect(g, x, y, w, h, r);
  g.fillStyle = "rgba(0,0,0,0.42)";
  g.fill();
  g.lineWidth = Math.max(1, Math.min(w, h) * 0.05);
  g.strokeStyle = LEAD;
  roundRect(g, x, y, w, h, r);
  g.stroke();
  g.lineWidth = 1;
  g.strokeStyle = "rgba(255,243,208,0.08)";
  roundRect(g, x + 2.5, y + 2.5, w - 5, h - 5, r);
  g.stroke();
}

/** The came channel: a lead strip with solder beads along its edge. */
export function drawStainedGlassTray(g: Ctx, x: number, y: number, w: number, h: number): void {
  g.save();
  g.shadowColor = "rgba(0,0,0,0.6)";
  g.shadowBlur = 12;
  g.shadowOffsetY = 5;
  roundRect(g, x, y, w, h, 8);
  g.fillStyle = LEAD;
  g.fill();
  g.restore();
  roundRect(g, x + 4, y + 4, w - 8, h - 8, 5);
  const grad = g.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, "#1C1815");
  grad.addColorStop(1, "#100D0B");
  g.fillStyle = grad;
  g.fill();
  g.fillStyle = rgba(GOLD, 0.55);
  for (let bx = x + 12; bx < x + w - 6; bx += 22) {
    g.beginPath();
    g.arc(bx, y + 4, 2, 0, Math.PI * 2);
    g.arc(bx + 11, y + h - 4, 2, 0, Math.PI * 2);
    g.fill();
  }
}

/** Where a solder run `k` (0..1) of the way round a rectangle, clockwise from the top-left corner, has reached. */
function alongRect(x: number, y: number, w: number, h: number, k: number): { x: number; y: number } {
  const d = k * 2 * (w + h);
  if (d < w) return { x: x + d, y };
  if (d < w + h) return { x: x + w, y: y + d - w };
  if (d < 2 * w + h) return { x: x + w - (d - w - h), y: y + h };
  return { x, y: y + h - (d - 2 * w - h) };
}

/** The next pane soldered into its came: the glass fades in while a gold solder run traces the frame, a hot bead at its head. */
export function drawStainedGlassFill(g: Ctx, x: number, y: number, w: number, h: number, level: number, colour: string, t: number): void {
  if (level <= 0) return;
  const r = Math.min(w, h) * 0.06;
  roundRect(g, x + 3, y + 3, w - 6, h - 6, r);
  g.fillStyle = rgba(colour, 0.1 + 0.5 * level);
  g.fill();
  const lw = Math.max(2, Math.min(w, h) * 0.07);
  const ix = x + 1.5;
  const iy = y + 1.5;
  const iw = w - 3;
  const ih = h - 3;
  g.save();
  g.setLineDash([2 * (iw + ih) * level, 2 * (iw + ih)]);
  g.lineWidth = lw;
  g.lineJoin = "round";
  g.strokeStyle = level >= 1 ? GOLD_LIGHT : GOLD;
  g.beginPath();
  g.moveTo(ix, iy);
  g.lineTo(ix + iw, iy);
  g.lineTo(ix + iw, iy + ih);
  g.lineTo(ix, iy + ih);
  g.closePath();
  g.stroke();
  g.restore();
  if (level < 1) {
    // the bead of molten solder at the head of the run
    const p = alongRect(ix, iy, iw, ih, level);
    g.save();
    g.shadowColor = GOLD_LIGHT;
    g.shadowBlur = 10;
    g.fillStyle = "#FFF6DC";
    g.beginPath();
    g.arc(p.x, p.y, lw * 0.9 + Math.sin(t / 60) * 0.4, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
}

/** Stone wall, rose window and a slow shaft of light; with a layout, the window frame, its empty panes and the came channel. */
export function drawStainedGlassBackdrop(g: Ctx, t: number, l?: Layout, flare = 0, fx: TitleFx | null = null): void {
  const sr = screenRect();
  const wall = g.createLinearGradient(0, 0, 0, sr.h);
  wall.addColorStop(0, "#332E29");
  wall.addColorStop(1, STONE_DARK);
  fillScreen(g, wall);
  // stone courses: offset rows of blocks, drawn as faint light and dark edges
  const bh = 34;
  const bw = 62;
  const rnd = seeded(17);
  for (let row = 0, y = -10; y < sr.h; row++, y += bh) {
    const off = row % 2 ? bw / 2 : 0;
    for (let x = -bw + off; x < sr.w; x += bw) {
      const tone = rnd();
      g.fillStyle = tone < 0.3 ? "rgba(255,243,208,0.025)" : tone > 0.85 ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0)";
      g.fillRect(x + 1, y + 1, bw - 2, bh - 2);
      g.fillStyle = "rgba(0,0,0,0.22)";
      g.fillRect(x, y + bh - 1, bw, 1.5);
      g.fillRect(x + bw - 1, y, 1.5, bh);
      g.fillStyle = "rgba(255,243,208,0.05)";
      g.fillRect(x + 1, y + 1, bw - 3, 1);
    }
  }
  // rose window, top right, glowing brighter when the pointer is near and after a clear
  const rx = sr.w * 0.84;
  const ry = sr.h * 0.17;
  const rr = Math.min(sr.w, sr.h) * 0.09;
  let near = 0;
  if (fx?.pointer) near = Math.max(0, 1 - Math.hypot(fx.pointer.x - rx, fx.pointer.y - ry) / (rr * 4));
  for (const tap of fx?.taps ?? []) {
    const age = t - tap.t;
    if (age < 900 && Math.hypot(tap.x - rx, tap.y - ry) < rr * 3) near = Math.max(near, 1 - age / 900);
  }
  roseWindow(g, rx, ry, rr, Math.min(1, flare + near * 0.6));
  // the light shaft: a translucent band that drifts across over a minute
  const ph = ((t / 60000) % 1) * 1.6 - 0.3;
  const sx = sr.w * ph;
  const bandW = sr.w * 0.22;
  g.save();
  g.globalCompositeOperation = "lighter";
  const shaft = g.createLinearGradient(sx - bandW, 0, sx + bandW, 0);
  shaft.addColorStop(0, "rgba(255,236,190,0)");
  shaft.addColorStop(0.5, `rgba(255,236,190,${0.06 + flare * 0.1})`);
  shaft.addColorStop(1, "rgba(255,236,190,0)");
  g.fillStyle = shaft;
  g.beginPath();
  g.moveTo(sx - bandW + sr.h * 0.6, 0);
  g.lineTo(sx + bandW + sr.h * 0.6, 0);
  g.lineTo(sx + bandW - sr.h * 0.1, sr.h);
  g.lineTo(sx - bandW - sr.h * 0.1, sr.h);
  g.closePath();
  g.fill();
  g.restore();
  if (!l) return;
  const n = l.cellNum;
  const gridBottom = cellY(l, n) - l.cellSep;
  // the window frame: a lead surround sunk into the stone
  g.save();
  g.shadowColor = "rgba(0,0,0,0.6)";
  g.shadowBlur = 24;
  g.shadowOffsetY = 6;
  roundRect(g, l.boardX - 12, l.boardY - 12, l.boardW + 24, gridBottom - l.boardY + 18, 10);
  g.fillStyle = LEAD;
  g.fill();
  g.restore();
  roundRect(g, l.boardX - 8, l.boardY - 8, l.boardW + 16, gridBottom - l.boardY + 10, 6);
  g.fillStyle = "#1E1A17";
  g.fill();
  g.lineWidth = 1;
  g.strokeStyle = rgba(GOLD, 0.35);
  roundRect(g, l.boardX - 10.5, l.boardY - 10.5, l.boardW + 21, gridBottom - l.boardY + 15, 8);
  g.stroke();
  const pad = l.cellW * 0.04;
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) drawStainedGlassWell(g, cellX(l, x) + pad, cellY(l, y) + pad, l.cellW - pad * 2, l.cellH - pad * 2);
  }
  const ry2 = replenishY(l);
  drawStainedGlassTray(g, l.boardX - 8, ry2 - 8, l.boardW + 16, l.cellH + 16);
}

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------

const slides: SlideStyle = {
  background(g, w, h) {
    const wall = g.createLinearGradient(0, 0, 0, h);
    wall.addColorStop(0, "#332E29");
    wall.addColorStop(1, STONE_DARK);
    g.fillStyle = wall;
    g.fillRect(0, 0, w, h);
    g.fillStyle = rgba(LEAD, 0.9);
    g.fillRect(0, h * 0.78, w, h * 0.22);
    g.fillStyle = rgba(GOLD, 0.6);
    g.fillRect(0, h * 0.78, w, 2);
  },
  font: FONT,
  display: DISPLAY,
  text: TEXT,
  muted: MUTED,
  bgColor: STONE,
  dotIdle: "rgba(255,243,208,0.25)",
  card: CARD,
  cardEdge: GOLD,
  cardShadow: "rgba(0,0,0,0.5)",
  gridLine: "rgba(255,243,208,0.06)",
  well: "rgba(0,0,0,0.42)",
  wellEdge: LEAD,
  track: "rgba(255,243,208,0.14)",
  colors: GLASS_COLORS,
  inkOn: () => LEAD,
  tile: (g, x, y, w, h, base, opts) => pane(g, x, y, w, h, base, { radius: opts?.radius, plain: true, seed: 2 }),
  glyphs,
  button: goldButton,
};

const SPEC: SkinSpec = {
  colors: GLASS_COLORS,
  neutral: "#6E6459",
  bg: STONE,
  text: TEXT,
  muted: MUTED,
  font: FONT,
  display: DISPLAY,
  tile: pane,
  glyphs,
  button: goldButton,
  panel,
  logo,
  menuFrame,
  worldText: TEXT,
  worldTextShadow: "rgba(0,0,0,0.7)",
  shadow: null,
  glow: false,
  selector: "glow",
  selectorNeutral: GOLD_LIGHT,
  progress: [GOLD_DARK, GOLD_LIGHT],
  pop(g, t, w, h) {
    g.globalAlpha = 1 - t;
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + 0.4;
      const d = w * (0.08 + t * 0.4);
      const px = w / 2 + Math.cos(a) * d;
      const py = h / 2 + Math.sin(a) * d;
      const s = 3 + 3 * (1 - t);
      g.fillStyle = k % 2 ? GOLD_LIGHT : "#FFFFFF";
      g.beginPath();
      g.moveTo(px, py - s);
      g.lineTo(px + s * 0.7, py + s * 0.6);
      g.lineTo(px - s * 0.7, py + s * 0.3);
      g.closePath();
      g.fill();
    }
  },
  mute: GLASS_COLORS[RED],
  well: drawStainedGlassWell,
  slides,
};

export function buildStainedGlassSprites(classic: SpriteMap): SpriteMap {
  return buildSkin(classic, SPEC);
}
