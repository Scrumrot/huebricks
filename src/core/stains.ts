import { BLUE, GREEN, ORANGE, PURPLE, RED, YELLOW, type Color } from "./color";
import { type Well } from "./well";

/**
 * Dr. Hue level layouts. There is no hand-authored puzzle file in this
 * project, so the "virus" layouts are generated from a seed per level: the
 * same level always gives the same stains, and the set grows and gains
 * colours as the levels go up.
 */
export const DRHUE_LEVELS = 40;

export interface StainLayout {
  /** Rows at the bottom that stains may occupy. */
  depth: number;
  count: number;
  colors: Color[];
}

/** `mulberry32`, a small seeded generator. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function stainLayout(level: number, cols: number, rows: number): StainLayout {
  const lv = Math.max(1, Math.min(DRHUE_LEVELS, level));
  const depth = Math.min(rows - 5, 4 + Math.floor((lv - 1) / 4));
  const count = Math.min(Math.floor(cols * depth * 0.62), 6 + Math.round((lv - 1) * 1.2));
  const colors: Color[] =
    lv < 3
      ? [RED, BLUE, YELLOW]
      : lv < 8
        ? [RED, BLUE, YELLOW, ORANGE]
        : lv < 15
          ? [RED, BLUE, YELLOW, ORANGE, GREEN]
          : [RED, BLUE, YELLOW, ORANGE, GREEN, PURPLE];
  return { depth, count, colors };
}

/**
 * Place the level's stains in the lower rows of an empty well. No three of
 * one colour line up to start with, so nothing clears on its own.
 */
export function placeStains(well: Well, level: number): void {
  const { depth, count, colors } = stainLayout(level, well.cols, well.rows);
  const rng = seededRng(level * 7919 + 13);
  const slots: Array<[number, number]> = [];
  for (let y = well.rows - depth; y < well.rows; y++) for (let x = 0; x < well.cols; x++) slots.push([x, y]);
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  let placed = 0;
  for (const [x, y] of slots) {
    if (placed >= count) break;
    const options = [...colors];
    while (options.length) {
      const k = Math.floor(rng() * options.length);
      const color = options.splice(k, 1)[0];
      if (runLength(well, x, y, 1, 0, color) + runLength(well, x, y, -1, 0, color) >= 2) continue;
      if (runLength(well, x, y, 0, 1, color) + runLength(well, x, y, 0, -1, color) >= 2) continue;
      well.add(x, y, color, true);
      placed++;
      break;
    }
  }
}

/** Same-colour cells in a row from (x, y) stepping by (dx, dy), not counting (x, y). */
function runLength(well: Well, x: number, y: number, dx: number, dy: number, color: Color): number {
  let n = 0;
  let cx = x + dx;
  let cy = y + dy;
  while (well.get(cx, cy)?.color === color) {
    n++;
    cx += dx;
    cy += dy;
  }
  return n;
}
