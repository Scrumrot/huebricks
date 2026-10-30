/**
 * What flying debris can land on. A scene supplies `solidTop`, which answers
 * for a point: the screen y of the top of whatever solid contains it (a
 * resting brick, the tray ledge), or null in open air. Particles and
 * fragments only ever test the point they are about to occupy, so the
 * callback stays cheap at the counts the effects layer runs.
 */
export type SolidTop = (x: number, y: number) => number | null;

/** Velocity kept after a bounce, and how much sideways motion survives it. */
export const BOUNCE_KEEP = 0.42;
export const BOUNCE_SLIDE = 0.7;

/**
 * Resolve one step of a falling thing against the solids: when it has just
 * crossed into a solid from above, it is put back on that surface and its
 * velocity reflected. Returns the new vertical position and velocity, or
 * null when nothing was hit. Pure.
 */
export function landOn(solid: SolidTop | null, x: number, yPrev: number, y: number, vy: number): { y: number; vy: number } | null {
  if (!solid || vy <= 0) return null;
  const top = solid(x, y);
  if (top === null || yPrev > top) return null;
  return { y: top, vy: -vy * BOUNCE_KEEP };
}
