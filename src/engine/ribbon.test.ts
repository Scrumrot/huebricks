import { describe, expect, it } from "vitest";
import { ageRibbon, pushRibbon, RIBBON_MS } from "./ribbon";

describe("lift ribbon", () => {
  it("keeps recent samples in order and drops stale ones", () => {
    let r = pushRibbon([], 0, 0, 0);
    r = pushRibbon(r, 10, 0, 100);
    r = pushRibbon(r, 20, 0, 200);
    expect(r.map((p) => p.x)).toEqual([0, 10, 20]);
    r = pushRibbon(r, 30, 0, RIBBON_MS + 50);
    expect(r.map((p) => p.x)).toEqual([10, 20, 30]);
    expect(ageRibbon(r, RIBBON_MS + 250).map((p) => p.x)).toEqual([30]);
  });

  it("ignores samples that barely moved and caps the trail", () => {
    let r = pushRibbon([], 0, 0, 0);
    r = pushRibbon(r, 0.2, 0.1, 10);
    expect(r).toHaveLength(1);
    for (let i = 1; i <= 40; i++) r = pushRibbon(r, i * 5, 0, i);
    expect(r.length).toBeLessThanOrEqual(24);
    expect(r[r.length - 1].x).toBe(200);
  });
});
