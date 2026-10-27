/**
 * HueBricks colour model.
 *
 * Colours are bit flags over the three primaries, exactly as in the GML:
 *   RED = 1, BLUE = 2, YELLOW = 4
 * Secondary colours are the OR of two primaries and BLACK ("chromatic gray")
 * is all three. Adding a colour ORs the bits; subtracting masks them out.
 */

export type Color = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const RED: Color = 1;
export const BLUE: Color = 2;
export const YELLOW: Color = 4;
export const PURPLE: Color = 3; // RED | BLUE
export const ORANGE: Color = 5; // RED | YELLOW
export const GREEN: Color = 6; // BLUE | YELLOW
export const BLACK: Color = 7; // RED | BLUE | YELLOW

/** Colours a brick can spawn with. Black only ever arises from combining. */
export const SPAWN_COLORS: readonly Color[] = [RED, BLUE, YELLOW, GREEN, PURPLE, ORANGE];

export const COLOR_NAMES: Record<Color, string> = {
  1: "Red",
  2: "Blue",
  3: "Purple",
  4: "Yellow",
  5: "Orange",
  6: "Green",
  7: "Black",
};

/** `color_add.gml` */
export function colorAdd(a: Color, b: Color): Color {
  return (a | b) as Color;
}

/** `color_subtract.gml`: remove the bits of `a` from `b`. */
export function colorSubtract(a: Color, b: Color): Color {
  return (~a & b) as Color;
}

export function isPrimary(c: Color): boolean {
  return c === RED || c === BLUE || c === YELLOW;
}

/** Sprite frame index for a colour in `brick_sprite` and friends (`image_index = color - 1`). */
export function colorFrame(c: Color): number {
  return c - 1;
}

/**
 * Result of applying a replenish brick (`sel`) to a board brick (`dest`),
 * ported from `board_combine.gml`.
 *
 * - identical colours never combine ("noadd")
 * - if `sel` is contained in `dest`, it is subtracted from `dest`
 * - if they share no primaries, they are added
 * - if `dest` is contained in `sel`, `dest` is subtracted from `sel`
 */
export function combineColors(
  sel: Color,
  dest: Color,
  canAdd = true,
  canSubtract = true,
): Color | null {
  if (sel === dest) return null;
  if ((sel & dest) === sel && canSubtract) return colorSubtract(sel, dest);
  if ((sel & dest) === 0 && canAdd) return colorAdd(sel, dest);
  if ((sel & dest) === dest && canSubtract) return colorSubtract(dest, sel);
  return null;
}

export function randomSpawnColor(rng: () => number = Math.random): Color {
  return SPAWN_COLORS[Math.floor(rng() * SPAWN_COLORS.length)];
}
