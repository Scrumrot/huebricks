import { describe, expect, it } from "vitest";
import { clearWave, WAVE_MS_PER_CELL } from "./clearWave";

describe("level-clear wave", () => {
  const cells = [
    { x: 0, y: 0 },
    { x: 40, y: 0 },
    { x: 120, y: 0 },
    { x: 0, y: 40 },
  ];

  it("orders bricks by distance from the origin with delays in cell units", () => {
    const steps = clearWave(cells, (c) => c, { x: 0, y: 0 }, 40);
    expect(steps.map((s) => s.item)).toEqual([cells[0], cells[1], cells[3], cells[2]]);
    expect(steps.map((s) => Math.round(s.delay))).toEqual([0, WAVE_MS_PER_CELL, WAVE_MS_PER_CELL, 3 * WAVE_MS_PER_CELL]);
  });

  it("raises the chime across the wave", () => {
    const steps = clearWave(cells, (c) => c, { x: 120, y: 0 }, 40);
    expect(steps[0].item).toBe(cells[2]);
    expect(steps[0].rate).toBeLessThan(steps[steps.length - 1].rate);
    expect(clearWave([cells[0]], (c) => c, { x: 0, y: 0 }, 40)[0].rate).toBeCloseTo(0.85);
  });
});
