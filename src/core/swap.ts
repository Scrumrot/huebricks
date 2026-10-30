import { combineColors, randomSpawnColor, type Color } from "./color";
import { Well, type Cell } from "./well";

/**
 * Hue Swap rules as pure functions over a `Well`: what picking two
 * neighbours does, how the board refills, and what a level asks for.
 */

export const COLS = 7;
export const ROWS = 8;
export const MIN_GROUP = 4;
/** The clock at the start of a game, and the most it can hold. */
export const START_MS = 60_000;
export const MAX_MS = 90_000;
/** Popped tiles per level. */
export const POPS_PER_LEVEL = 40;
/** Under this the clock reads as urgent. */
export const HURRY_MS = 10_000;

/** Picking `into` with `from` selected: a mix when the colour rules allow one, otherwise the two trade places. */
export type Move = { kind: "mix"; from: Cell; into: Cell; result: Color; refined: boolean } | { kind: "swap"; a: Cell; b: Cell };

export function adjacent(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

export function moveFor(from: Cell, into: Cell): Move {
  const result = combineColors(from.color, into.color);
  if (result !== null) return { kind: "mix", from, into, result, refined: result !== (from.color | into.color) };
  return { kind: "swap", a: from, b: into };
}

/** Apply a move: a mix empties the picked cell and recolours its neighbour; a swap trades places. */
export function applyMove(well: Well, m: Move): void {
  if (m.kind === "mix") {
    well.remove(m.from);
    m.into.color = m.result;
    m.into.refined = m.refined;
  } else {
    well.swap(m.a, m.b);
  }
}

export interface Spawned {
  cell: Cell;
  /** Row the cell starts at, above the well (negative). */
  from: number;
}

/**
 * Fill the empty cells at the top of each column with random colours, as if
 * they fell in from above. A colour that would complete a group on arrival
 * is redrawn up to `rerolls` times, so chains stay a treat rather than the
 * norm; they can still happen.
 */
export function refill(well: Well, rng: () => number = Math.random, rerolls = 1): Spawned[] {
  const out: Spawned[] = [];
  for (let x = 0; x < well.cols; x++) {
    let k = 0;
    while (k < well.rows && well.get(x, k) === null) k++;
    for (let y = 0; y < k; y++) {
      const cell = well.add(x, y, randomSpawnColor(rng));
      for (let r = 0; r < rerolls && well.groupOf(cell).length >= MIN_GROUP; r++) cell.color = randomSpawnColor(rng);
      out.push({ cell, from: y - k });
    }
  }
  return out;
}

/** Recolour cells until no group of `MIN_GROUP` remains, so a fresh board never pops on its own. */
export function scrub(well: Well, rng: () => number = Math.random, passes = 40): boolean {
  for (let i = 0; i < passes; i++) {
    const groups = well.groups(MIN_GROUP);
    if (groups.length === 0) return true;
    for (const g of groups) for (const c of g) c.color = randomSpawnColor(rng);
  }
  return well.groups(MIN_GROUP).length === 0;
}

export function newBoard(rng: () => number = Math.random): Well {
  const well = new Well(COLS, ROWS);
  refill(well, rng);
  scrub(well, rng);
  return well;
}

export function levelFor(popped: number): number {
  return 1 + Math.floor(popped / POPS_PER_LEVEL);
}

/** Clock seconds lost per real second while the player is thinking. */
export function drainRate(level: number): number {
  return 1 + 0.12 * (level - 1);
}

/** Milliseconds a pop puts back on the clock: more for bigger groups and for chains. */
export function timeBonus(size: number, chain: number): number {
  return size * 600 + (chain - 1) * 500;
}

/** The clock after a bonus, never past `MAX_MS`. */
export function addTime(ms: number, bonus: number): number {
  return Math.min(MAX_MS, ms + bonus);
}

/** The clock after `dt` ms of thinking at a level. */
export function drain(ms: number, dt: number, level: number): number {
  return Math.max(0, ms - dt * drainRate(level));
}

/** Points for a popped group on the `chain`th pop since the move. */
export function popPoints(size: number, chain: number, refined: boolean): number {
  const value = Math.min(60, 25 + (chain - 1) * 15);
  return value * size + (refined ? 100 : 0);
}
