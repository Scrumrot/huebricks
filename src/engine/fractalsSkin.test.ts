import { describe, expect, it } from "vitest";
import { carpetFill, kochPoints, RING } from "./fractalsSkin";

describe("fractals geometry", () => {
  it("fills the carpet in 64 steps, outer cells first and each cell's sub-cells within it", () => {
    expect(carpetFill(0)).toEqual({ full: 0, partial: 0 });
    expect(carpetFill(1)).toEqual({ full: 8, partial: 0 });
    expect(carpetFill(0.5)).toEqual({ full: 4, partial: 0 });
    expect(carpetFill(4.5 / 8)).toEqual({ full: 4, partial: 4 });
    expect(carpetFill(-1)).toEqual({ full: 0, partial: 0 });
    expect(carpetFill(2)).toEqual({ full: 8, partial: 0 });
    // never goes backwards as the level rises
    let last = 0;
    for (let k = 0; k <= 100; k++) {
      const { full, partial } = carpetFill(k / 100);
      const steps = full * 8 + partial;
      expect(steps).toBeGreaterThanOrEqual(last);
      last = steps;
    }
  });

  it("walks the carpet's ring once around, skipping the centre", () => {
    expect(RING).toHaveLength(8);
    expect(new Set(RING.map(([i, j]) => `${i},${j}`)).size).toBe(8);
    expect(RING.some(([i, j]) => i === 1 && j === 1)).toBe(false);
  });

  it("builds a Koch snowflake with 3 x 4^depth sides, centred where asked", () => {
    for (const depth of [0, 1, 2, 3]) {
      const pts = kochPoints(10, 20, 50, depth);
      expect(pts).toHaveLength(3 * 4 ** depth);
      const cx = pts.reduce((a, [x]) => a + x, 0) / pts.length;
      const cy = pts.reduce((a, [, y]) => a + y, 0) / pts.length;
      expect(cx).toBeCloseTo(10, 6);
      expect(cy).toBeCloseTo(20, 6);
      // the peaks grow outward: nothing lands inside the triangle's inscribed circle
      for (const [x, y] of pts) expect(Math.hypot(x - 10, y - 20)).toBeGreaterThanOrEqual(25 - 1e-9);
    }
  });
});
