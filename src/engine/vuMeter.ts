/**
 * A segmented VU meter for the chain: how many segments a level lights, and
 * a peak marker that holds the highest segment reached and falls back one
 * segment at a time once the level drops below it.
 */

export interface VuPeak {
  /** Segment the marker sits on (0 = none). */
  seg: number;
  /** Game time the marker last moved. */
  t: number;
}

export const VU_FALL_MS = 90;

/** Segments lit for a level 0..1 out of `segments`. */
export function vuLit(level: number, segments: number): number {
  const q = Math.min(1, Math.max(0, level));
  return Math.round(q * segments);
}

/** The peak after this frame: jumps up with the lit count, falls one segment per `fallMs` otherwise. */
export function vuPeak(prev: VuPeak, lit: number, t: number, fallMs = VU_FALL_MS): VuPeak {
  if (lit >= prev.seg) return { seg: lit, t };
  const drop = Math.floor((t - prev.t) / fallMs);
  if (drop <= 0) return prev;
  return { seg: Math.max(lit, prev.seg - drop), t: prev.t + drop * fallMs };
}
