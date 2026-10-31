import { describe, expect, it } from "vitest";
import { vuLit, vuPeak } from "./vuMeter";

describe("vu meter", () => {
  it("lights a rounded share of the segments and clamps the level", () => {
    expect(vuLit(0, 12)).toBe(0);
    expect(vuLit(0.5, 12)).toBe(6);
    expect(vuLit(1, 12)).toBe(12);
    expect(vuLit(1.7, 12)).toBe(12);
    expect(vuLit(-1, 12)).toBe(0);
  });

  it("the peak jumps up with the level and falls one segment per step", () => {
    let p = vuPeak({ seg: 0, t: 0 }, 9, 100);
    expect(p).toEqual({ seg: 9, t: 100 });
    // the level drops: the marker holds for a step, then falls segment by segment
    p = vuPeak(p, 3, 150);
    expect(p.seg).toBe(9);
    p = vuPeak(p, 3, 190);
    expect(p.seg).toBe(8);
    p = vuPeak(p, 3, 190 + 90 * 3);
    expect(p.seg).toBe(5);
    // never below the lit count
    p = vuPeak(p, 3, 5000);
    expect(p.seg).toBe(3);
  });
});
