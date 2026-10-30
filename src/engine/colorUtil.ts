/** Small colour helpers for the effects layer. Pure; no canvas. */

export type Rgb = readonly [number, number, number];

/** Parse `#rrggbb`, `#rgb` or `rgb(r,g,b)` / `rgba(r,g,b,a)`; null for anything else. */
export function parseColor(s: string): Rgb | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s.trim());
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const fn = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(s.trim());
  if (fn) return [Number(fn[1]), Number(fn[2]), Number(fn[3])];
  return null;
}

export function rgbString([r, g, b]: Rgb, a = 1): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return a >= 1 ? `rgb(${c(r)},${c(g)},${c(b)})` : `rgba(${c(r)},${c(g)},${c(b)},${a})`;
}

/** Linear blend of two colours; unparseable inputs fall back to `b` past the midpoint and `a` before. */
export function mixColors(a: string, b: string, t: number): string {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return t < 0.5 ? a : b;
  return rgbString([ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t]);
}

/** Scale a colour toward black (`k < 1`) or white (`k > 1`). */
export function shade(c: string, k: number): string {
  const p = parseColor(c);
  if (!p) return c;
  if (k <= 1) return rgbString([p[0] * k, p[1] * k, p[2] * k]);
  const t = Math.min(1, k - 1);
  return rgbString([p[0] + (255 - p[0]) * t, p[1] + (255 - p[1]) * t, p[2] + (255 - p[2]) * t]);
}

/**
 * Colour-over-life ramp for a particle: `steps` entries that start hot,
 * cool to the base colour by the first third, hold it, then darken as the
 * particle dies. Memoised per (hot, base) pair so rendering never allocates.
 */
const ramps = new Map<string, readonly string[]>();
export function colorRamp(hot: string, base: string, steps = 8): readonly string[] {
  const key = `${hot}|${base}|${steps}`;
  const cached = ramps.get(key);
  if (cached) return cached;
  const dark = shade(base, 0.6);
  const ramp = Array.from({ length: steps }, (_, i) => {
    const p = i / (steps - 1);
    if (p < 0.34) return mixColors(hot, base, p / 0.34);
    if (p < 0.7) return base;
    return mixColors(base, dark, (p - 0.7) / 0.3);
  });
  ramps.set(key, ramp);
  return ramp;
}
