import { combineColors, type Color } from "./color";
import type { Cell, Well } from "./well";

/**
 * Hue Trist rules as pure functions over a `Well`: where a brick comes to
 * rest, what landing does, how fast the game runs and what pops are worth.
 */

export const COLS = 7;
export const ROWS = 11;
export const SPAWN_X = 3;
export const PREVIEW = 3;
const BASE_INTERVAL = 20;
const MIN_INTERVAL = 4;
const LANDS_PER_LEVEL = 12;

/** What happens when a brick of `color` stops at (x, y). */
export type Landing = { kind: "mix"; into: Cell; result: Color; refined: boolean } | { kind: "stack"; x: number; y: number };

/** The row a brick at column `x`, row `y` stops at. */
export function restingRow(well: Well, x: number, y: number): number {
  let ry = y;
  while (well.isFree(x, ry + 1)) ry++;
  return ry;
}

export function landing(well: Well, x: number, y: number, color: Color): Landing {
  const below = well.get(x, y + 1);
  const result = below ? combineColors(color, below.color) : null;
  if (below && result !== null) return { kind: "mix", into: below, result, refined: result !== (color | below.color) };
  return { kind: "stack", x, y };
}

export function levelFor(landed: number): number {
  return 1 + Math.floor(landed / LANDS_PER_LEVEL);
}

/** Sim steps per row at a level. */
export function fallInterval(level: number): number {
  return Math.max(MIN_INTERVAL, BASE_INTERVAL - (level - 1) * 2);
}

/** Points for a popped group on the `chain`th pop since landing. */
export function popPoints(size: number, chain: number, refined: boolean): number {
  const value = Math.min(50, 20 + (chain - 1) * 10);
  return value * size + (refined ? 100 : 0);
}
