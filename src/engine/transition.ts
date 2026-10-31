/**
 * Scene changes on the generated themes cross-dissolve: the outgoing frame
 * is kept as a snapshot that fades while drifting slightly larger, and the
 * incoming scene settles up from a touch smaller. Classic keeps its plain
 * colour fades, so this module never runs for it.
 */
import { easeOutCubic } from "./easing";

export interface Dissolve {
  /** Alpha of the outgoing snapshot. */
  outAlpha: number;
  /** Scale of the outgoing snapshot about the view centre. */
  outScale: number;
  /** Scale of the incoming scene about the view centre. */
  inScale: number;
}

/** The dissolve at progress `p` (0..1); `motion` 0..1 scales the drift (reduce motion halves it). */
export function dissolve(p: number, motion = 1): Dissolve {
  const q = easeOutCubic(Math.min(1, Math.max(0, p)));
  return {
    outAlpha: 1 - q,
    outScale: 1 + 0.035 * q * motion,
    inScale: 1 - 0.025 * (1 - q) * motion,
  };
}
