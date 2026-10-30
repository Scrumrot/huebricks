import { BLACK, BLUE, RED, YELLOW, type Color } from "../core/color";

/**
 * The colour theory as pitch. The three primaries are the notes of a major
 * triad, so any secondary is the interval of its two parents, the three
 * together are the whole chord, and black is that chord an octave down.
 * Mixing colours then sounds like what it is: notes joining or leaving.
 */
const C4 = 261.63;
const E4 = 329.63;
const G4 = 392.0;

/** The primaries in pitch order with their notes: red, yellow, blue as the root, third and fifth. */
export const PRIMARY_NOTES: readonly (readonly [Color, number])[] = [
  [RED, C4],
  [YELLOW, E4],
  [BLUE, G4],
];

/** Frequencies for a colour, lowest first. */
export function notesFor(color: Color): number[] {
  if (color === BLACK) return [C4 / 2, E4 / 2, G4 / 2];
  return PRIMARY_NOTES.filter(([p]) => (color & p) !== 0).map(([, f]) => f);
}

/** Semitones a chain of `n` lifts a pop by: up the major scale, an octave at the top. */
export const CHAIN_STEPS: readonly number[] = [0, 2, 4, 5, 7, 9, 11, 12];

export function chainLift(chain: number): number {
  return CHAIN_STEPS[Math.max(0, Math.min(CHAIN_STEPS.length - 1, Math.round(chain) - 1))];
}

export function transpose(freq: number, semitones: number): number {
  return freq * 2 ** (semitones / 12);
}

/** True when `to` is what is left after taking colour away from `from`. */
export function isSubtract(from: Color, to: Color): boolean {
  return to !== from && (to & from) === to;
}
