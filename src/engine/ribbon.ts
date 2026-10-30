/**
 * The lift ribbon: a short trail behind a brick being carried across the
 * board. The scene feeds pointer samples in; the ribbon keeps the recent
 * ones and draws them as a tapered stroke, widest at the brick.
 */
export interface RibbonPoint {
  x: number;
  y: number;
  t: number;
}

export const RIBBON_MS = 420;
const RIBBON_CAP = 24;
/** Samples closer than this to the last one are not worth keeping. */
const MIN_STEP = 0.75;

/** The trail with a new sample added and stale ones dropped. Pure. */
export function pushRibbon(points: readonly RibbonPoint[], x: number, y: number, t: number, maxAge = RIBBON_MS): RibbonPoint[] {
  const fresh = points.filter((p) => t - p.t < maxAge);
  const last = fresh[fresh.length - 1];
  if (last && Math.hypot(last.x - x, last.y - y) < MIN_STEP) return fresh;
  fresh.push({ x, y, t });
  return fresh.length > RIBBON_CAP ? fresh.slice(fresh.length - RIBBON_CAP) : fresh;
}

/** The trail with only the samples still young enough to show. Pure. */
export function ageRibbon(points: readonly RibbonPoint[], t: number, maxAge = RIBBON_MS): RibbonPoint[] {
  return points.filter((p) => t - p.t < maxAge);
}

/**
 * Draw the ribbon as a chain of round-capped strokes that thin and fade
 * toward the tail. `width` is the stroke at the head.
 */
export function drawRibbon(g: CanvasRenderingContext2D, points: readonly RibbonPoint[], t: number, width: number, color: string, maxAge = RIBBON_MS): void {
  if (points.length < 2) return;
  g.save();
  g.lineCap = "round";
  g.lineJoin = "round";
  g.strokeStyle = color;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const age = 1 - Math.min(1, (t - b.t) / maxAge);
    const k = i / (points.length - 1);
    g.globalAlpha = 0.55 * age * (0.3 + 0.7 * k);
    g.lineWidth = Math.max(1, width * (0.15 + 0.85 * k) * age);
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke();
  }
  g.restore();
}
