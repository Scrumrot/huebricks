/**
 * The level-clear wave: every brick left on the board pops in turn, the
 * delay set by its distance from where the last pop happened, so the shape
 * of the board shapes the finale.
 */
export const WAVE_MS_PER_CELL = 40;

export interface WaveStep<T> {
  item: T;
  /** ms after the wave starts. */
  delay: number;
  /** Playback rate for this step's chime, rising across the wave. */
  rate: number;
}

/** Schedule `items` outward from `origin`; pure, sorted by delay. */
export function clearWave<T>(
  items: readonly T[],
  centre: (item: T) => { x: number; y: number },
  origin: { x: number; y: number },
  cell: number,
  msPerCell = WAVE_MS_PER_CELL,
): WaveStep<T>[] {
  const steps = items
    .map((item) => {
      const c = centre(item);
      return { item, delay: (Math.hypot(c.x - origin.x, c.y - origin.y) / cell) * msPerCell, rate: 1 };
    })
    .sort((a, b) => a.delay - b.delay);
  const n = Math.max(1, steps.length - 1);
  return steps.map((s, i) => ({ ...s, rate: 0.85 + 0.75 * (i / n) }));
}
