import { BLACK, BLUE, GREEN, ORANGE, PURPLE, RED, YELLOW, type Color } from "../core/color";
import { isSubtract } from "./colorNotes";
import { mixColors } from "./colorUtil";

/**
 * The painter's colour wheel the game's mixing rules describe: the three
 * primaries at thirds, each secondary between the two primaries it is made
 * of. Angles are radians clockwise from the top of the wheel, the way the
 * canvas rotates. Black (all three primaries) is the wheel's centre and has
 * no angle.
 */
export const WHEEL: readonly Color[] = [RED, ORANGE, YELLOW, GREEN, BLUE, PURPLE];

const TAU = Math.PI * 2;
const STEP = TAU / WHEEL.length;

export function wheelAngle(c: Color): number | null {
  const i = WHEEL.indexOf(c);
  return i < 0 ? null : -Math.PI / 2 + i * STEP;
}

/** The paint at angle `a` on the wheel: the theme's own six colours, blended between neighbours. */
export function wheelColorAt(a: number, colors: Readonly<Record<Color, string>>): string {
  const u = ((((a + Math.PI / 2) / STEP) % WHEEL.length) + WHEEL.length) % WHEEL.length;
  const i = Math.floor(u);
  const j = (i + 1) % WHEEL.length;
  return mixColors(colors[WHEEL[i]], colors[WHEEL[j]], u - i);
}

/** Smallest signed sweep that takes angle `from` to angle `to`. */
export function shortestSweep(from: number, to: number): number {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** A primary joining or leaving the mix, and where its marker travels on the wheel. */
export interface ArcDot {
  color: Color;
  /** Marker start angle: the primary's own place on the wheel. */
  from: number;
  /** Marker end angle: where the result sits. */
  to: number;
}

/** How to draw the colour-theory arc for one combine. */
export interface ArcPlan {
  /** Arc start angle. */
  from: number;
  /** Signed sweep; negative runs the wheel backwards (a subtract). */
  sweep: number;
  /** True when colour was taken away rather than added. */
  subtract: boolean;
  /** True when the arc passes through black (the result or the source is all three primaries). */
  black: boolean;
  dots: ArcDot[];
}

const primariesOf = (bits: number): Color[] => [RED, BLUE, YELLOW].filter((p) => (bits & p) !== 0);

/**
 * Plan the arc from the brick's old colour to its new one. An add sweeps
 * forward from the old colour to the result with the added primary sliding
 * in; a subtract runs the same path backwards with the removed primary
 * sliding out. Mixes that make or unmake black have no wheel position for
 * one end, so they sweep a full turn and darken (or brighten) along it.
 */
export function arcPlan(oldColor: Color, newColor: Color): ArcPlan {
  const subtract = isSubtract(oldColor, newColor);
  const changed = subtract ? oldColor & ~newColor : newColor & ~oldColor;
  const a0 = wheelAngle(oldColor);
  const a1 = wheelAngle(newColor);
  const black = oldColor === BLACK || newColor === BLACK;
  const anchor = a0 ?? a1 ?? -Math.PI / 2;
  const target = a1 ?? a0 ?? -Math.PI / 2;
  const sweep = a0 !== null && a1 !== null ? shortestSweep(a0, a1) : subtract ? -TAU : TAU;
  // Markers travel the short way round, so `to` may sit outside [-pi, pi).
  const dots = primariesOf(changed).map((p) => {
    const from = wheelAngle(p) ?? anchor;
    return { color: p, from, to: from + shortestSweep(from, target) };
  });
  return { from: anchor, sweep, subtract, black, dots };
}
