/**
 * Easing vocabulary for the feel layer. Everything that moves on screen goes
 * through one of these; nothing in the UI moves linearly.
 */
export type Ease = (t: number) => number;

export const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const linear: Ease = (t) => t;

/** Generic settle. */
export const easeOutCubic: Ease = (t) => 1 - (1 - t) ** 3;
/** Slides and pushes. */
export const easeOutQuart: Ease = (t) => 1 - (1 - t) ** 4;
export const easeInCubic: Ease = (t) => t ** 3;
export const easeInOutSine: Ease = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

/** Overshoot (buttons, rotate, scale punch). */
export const easeOutBack: Ease = (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
/** Shrink-to-nothing (pop). */
export const easeInBack: Ease = (t) => 2.70158 * t ** 3 - 1.70158 * t ** 2;

/** `easeOutBack` with a configurable overshoot (1.70158 is the standard one). */
export function backOut(s: number): Ease {
  return (t) => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2;
}

/** Chain meter and multiplier badge only. */
export const easeOutElastic: Ease = (t) => {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
};

/** 0..1..0 bump (punches), using `easeOutBack` on the way up. */
export const punch: Ease = (t) => (t < 0.4 ? easeOutBack(t / 0.4) : 1 - easeOutCubic((t - 0.4) / 0.6));
