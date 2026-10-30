import { combineColors, type Color } from "./color";
import type { Cell, Well } from "./well";

/**
 * Dr. Hue rules as pure functions over a `Well`. Nothing here mutates the
 * well or the domino; the scene applies the results and owns the animation.
 */

export interface Domino {
  a: Color;
  b: Color;
  /** Pivot half `a` at (x, y); `b` sits at `rot` quarter turns around it. */
  x: number;
  y: number;
  /** 0 = right, 1 = up, 2 = left, 3 = down. */
  rot: number;
}

/** A domino half after landing: resting at (x, y), or mixed into the stain `into` giving `result`. */
export interface Placed {
  x: number;
  y: number;
  /** Row the half was at when the domino stopped. */
  fromY: number;
  color: Color;
  into: Cell | null;
  result: Color;
}

export const COLS = 8;
export const ROWS = 13;
export const SPAWN_X = 3;
const BASE_INTERVAL = 22;
const MIN_INTERVAL = 6;

const OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, -1],
  [-1, 0],
  [0, 1],
];

/** Wall kicks tried in order when a rotation does not fit in place. */
const KICKS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [-1, 0],
  [1, 0],
  [0, 1],
];

export function offsetOf(rot: number): readonly [number, number] {
  return OFFSETS[((rot % 4) + 4) % 4];
}

/** The two cells a domino occupies, pivot first. */
export function dominoCells(d: Domino, x = d.x, y = d.y, rot = d.rot): [[number, number], [number, number]] {
  const [ox, oy] = offsetOf(rot);
  return [
    [x, y],
    [x + ox, y + oy],
  ];
}

export function fits(well: Well, d: Domino, x = d.x, y = d.y, rot = d.rot): boolean {
  return dominoCells(d, x, y, rot).every(([cx, cy]) => well.isFree(cx, cy));
}

/** The domino moved sideways, or null if the wall or a brick is in the way. */
export function moved(well: Well, d: Domino, dir: number): Domino | null {
  return fits(well, d, d.x + dir, d.y) ? { ...d, x: d.x + dir } : null;
}

/** A quarter turn with wall kicks (vertical at the top row nudges down), or null if nothing fits. */
export function rotated(well: Well, d: Domino, dir: number): Domino | null {
  const rot = (d.rot + dir + 4) % 4;
  for (const [kx, ky] of KICKS) {
    if (fits(well, d, d.x + kx, d.y + ky, rot)) return { ...d, x: d.x + kx, y: d.y + ky, rot };
  }
  return null;
}

/** The row the domino stops at if it falls straight down from where it is. */
export function restingRow(well: Well, d: Domino): number {
  let y = d.y;
  while (fits(well, d, d.x, y + 1)) y++;
  return y;
}

/**
 * Where each half ends up once the domino stops at (x, y): the halves come
 * apart, each falls through any gap under it (the lower half first, so the
 * upper one can land on it) and a half that comes to rest on a stain it can
 * mix with soaks in. Landing and the ghost preview both use this, so the
 * preview always matches the result.
 */
export function settleDomino(well: Well, d: Domino, x = d.x, y = d.y): Placed[] {
  const halves = dominoCells(d, x, y).map(([hx, hy], i) => ({ x: hx, y: hy, color: i === 0 ? d.a : d.b }));
  halves.sort((u, v) => v.y - u.y);
  const taken = new Set<string>();
  const recolored = new Map<Cell, Color>();
  return halves.map((h) => {
    let ry = h.y;
    while (well.isFree(h.x, ry + 1) && !taken.has(`${h.x},${ry + 1}`)) ry++;
    const below = well.get(h.x, ry + 1);
    const result = below && below.locked ? combineColors(h.color, recolored.get(below) ?? below.color) : null;
    if (below && result !== null) {
      recolored.set(below, result);
      return { x: h.x, y: ry, fromY: h.y, color: h.color, into: below, result };
    }
    taken.add(`${h.x},${ry}`);
    return { x: h.x, y: ry, fromY: h.y, color: h.color, into: null, result: h.color };
  });
}

/** Sim steps per row at a level, quickening as pieces land. */
export function fallInterval(level: number, landed: number): number {
  return Math.max(MIN_INTERVAL, BASE_INTERVAL - (level - 1) - Math.floor(landed / 10));
}

/** Points for clearing `cells` of which `stains` were locked, on the `chain`th clear since landing. */
export function clearPoints(cells: number, stains: number, chain: number): number {
  const value = Math.min(60, 25 + (chain - 1) * 12);
  return value * cells + stains * 80;
}

export function levelBonus(level: number): number {
  return 500 + level * 100;
}

/** Whether a mix took colour away (the "refined" marker). */
export function isSubtractive(added: Color, into: Color, result: Color): boolean {
  return result !== (added | into);
}
