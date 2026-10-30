import { clamp01 } from "./easing";

/**
 * The numbers behind pop intensity. `TUNING` is a live copy the effects lab
 * edits at runtime; the scenes read it every time they fire an effect, so a
 * change in the lab shows up in the real game without a reload.
 */
export interface FxTuning {
  /** Chain length that reaches full intensity. */
  chainForMax: number;
  /** Bricks in one pop worth one chain step. */
  sizeWeight: number;
  /** Debris count multiplier at full intensity (1 = the base count). */
  debris: number;
  /** Sparks at full intensity. */
  sparks: number;
  /** Chunks per side when a brick shatters at full intensity (2 or 3). */
  fragmentGrid: number;
  /** Shake amplitude in logical pixels at full intensity. */
  shake: number;
  /** Ring reach in cells added at full intensity. */
  ring: number;
  /** Hit-stop in wall ms added at full intensity. */
  freeze: number;
  /** Time scale during slow motion. */
  slowmo: number;
  /** Slow-motion length in wall ms. */
  slowmoMs: number;
  /** Intensity at or above which slow motion fires. */
  slowmoAt: number;
  /** Bloom strength 0..1. */
  bloom: number;
}

export const DEFAULT_TUNING: Readonly<FxTuning> = {
  chainForMax: 5,
  sizeWeight: 4,
  debris: 2.2,
  sparks: 10,
  fragmentGrid: 3,
  shake: 9,
  ring: 1,
  freeze: 70,
  slowmo: 0.35,
  slowmoMs: 160,
  slowmoAt: 0.7,
  bloom: 0.55,
};

export const TUNING: FxTuning = { ...DEFAULT_TUNING };

export function resetTuning(): void {
  Object.assign(TUNING, DEFAULT_TUNING);
}

/** 0..1 for how big a moment a pop is: chain length plus how many bricks went at once. */
export function intensityFor(chain: number, size: number, t: Readonly<FxTuning> = TUNING): number {
  const byChain = Math.max(0, chain - 1) / Math.max(1, t.chainForMax - 1);
  const bySize = Math.max(0, size - 3) / Math.max(1, t.sizeWeight) / Math.max(1, t.chainForMax - 1);
  return clamp01(byChain + bySize);
}

/** Everything a pop choreography scales by intensity `k`, resolved to concrete numbers. */
export interface PopScale {
  /** Multiplier on the theme's base debris count. */
  debris: number;
  sparks: number;
  /** Chunks per side when shattering; 0 means no fragments at this intensity. */
  grid: number;
  shake: number;
  /** Ring reach in cells. */
  ringCells: number;
  /** Second ring when > 0, in ms after the first. */
  secondRingDelay: number;
  freezeMs: number;
  slowmo: boolean;
  /** Multiplier on the theme's flash alpha. */
  flash: number;
}

export function popScale(k: number, t: Readonly<FxTuning> = TUNING): PopScale {
  const q = clamp01(k);
  return {
    debris: 1 + (t.debris - 1) * q,
    sparks: Math.round(t.sparks * (0.35 + 0.65 * q)),
    grid: q < 0.45 ? 2 : Math.max(2, Math.round(t.fragmentGrid)),
    shake: 1.5 + (t.shake - 1.5) * q,
    ringCells: 2.5 + t.ring * q,
    secondRingDelay: q >= 0.3 ? 70 : 0,
    freezeMs: 50 + t.freeze * q,
    slowmo: q >= t.slowmoAt,
    flash: 0.6 + 0.8 * q,
  };
}
