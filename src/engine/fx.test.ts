import { describe, expect, it } from "vitest";
import { colorRamp, mixColors, parseColor, shade } from "./colorUtil";
import { DEFAULT_TUNING, intensityFor, popScale, resetTuning, TUNING } from "./fxTuning";
import { fragmentAt, Fragments } from "./fragments";
import { sweepAt } from "./mixFx";
import { rampIndex, stretchFor } from "./particles";
import { shakeOffset } from "./effects";
import { Clock } from "./clock";

describe("colour utilities", () => {
  it("parses hex and rgb forms", () => {
    expect(parseColor("#ff8000")).toEqual([255, 128, 0]);
    expect(parseColor("#f80")).toEqual([255, 136, 0]);
    expect(parseColor("rgb(1, 2, 3)")).toEqual([1, 2, 3]);
    expect(parseColor("rgba(1,2,3,0.5)")).toEqual([1, 2, 3]);
    expect(parseColor("tomato")).toBeNull();
  });

  it("mixes linearly and falls back on unparseable input", () => {
    expect(mixColors("#000000", "#ffffff", 0.5)).toBe("rgb(128,128,128)");
    expect(mixColors("tomato", "#ffffff", 0.2)).toBe("tomato");
    expect(mixColors("tomato", "#ffffff", 0.8)).toBe("#ffffff");
  });

  it("shades toward black and white", () => {
    expect(shade("#808080", 0.5)).toBe("rgb(64,64,64)");
    expect(shade("#808080", 1.5)).toBe("rgb(192,192,192)");
  });

  it("builds a hot-to-base-to-dark ramp once per pair", () => {
    const a = colorRamp("#ffffff", "#ff0000", 8);
    const b = colorRamp("#ffffff", "#ff0000", 8);
    expect(a).toBe(b);
    expect(a).toHaveLength(8);
    expect(a[0]).toBe("rgb(255,255,255)");
    expect(a[4]).toBe("#ff0000");
    expect(a[7]).toBe("rgb(153,0,0)");
  });
});

describe("particle helpers", () => {
  it("indexes the ramp from hot at full life to dark at death", () => {
    expect(rampIndex(1)).toBe(0);
    expect(rampIndex(0.5)).toBe(4);
    expect(rampIndex(0)).toBe(7);
    expect(rampIndex(-1)).toBe(7);
  });

  it("stretches with speed", () => {
    expect(stretchFor(0, 1)).toBe(1);
    expect(stretchFor(300, 1)).toBe(2);
    expect(stretchFor(300, 0.5)).toBe(1.5);
  });
});

describe("intensity and pop scale", () => {
  it("is zero for a plain first pop and climbs with chain and size", () => {
    expect(intensityFor(1, 3)).toBe(0);
    expect(intensityFor(2, 3)).toBeGreaterThan(0);
    expect(intensityFor(3, 3)).toBeGreaterThan(intensityFor(2, 3));
    expect(intensityFor(1, 11)).toBeGreaterThan(intensityFor(1, 3));
    expect(intensityFor(DEFAULT_TUNING.chainForMax, 3)).toBe(1);
    expect(intensityFor(50, 50)).toBe(1);
  });

  it("resolves to the untouched baseline at zero and the tuned maximum at one", () => {
    const low = popScale(0);
    expect(low.debris).toBe(1);
    expect(low.ringCells).toBe(2.5);
    expect(low.freezeMs).toBe(50);
    expect(low.grid).toBe(2);
    expect(low.secondRingDelay).toBe(0);
    expect(low.slowmo).toBe(false);
    const high = popScale(1);
    expect(high.debris).toBe(DEFAULT_TUNING.debris);
    expect(high.shake).toBe(DEFAULT_TUNING.shake);
    expect(high.grid).toBe(DEFAULT_TUNING.fragmentGrid);
    expect(high.secondRingDelay).toBeGreaterThan(0);
    expect(high.slowmo).toBe(true);
  });

  it("reads the live tuning and can be reset", () => {
    TUNING.shake = 20;
    expect(popScale(1).shake).toBe(20);
    resetTuning();
    expect(popScale(1).shake).toBe(DEFAULT_TUNING.shake);
  });
});

describe("fragments", () => {
  const draw = () => {};
  const rng = () => 0.5;

  it("shatters into grid by grid chunks that cover the tile", () => {
    const f = new Fragments();
    f.shatter(draw, 50, 50, 40, 40, { grid: 3, speed: [100, 100], life: [500, 500] }, rng);
    expect(f.count).toBe(9);
  });

  it("respects its capacity", () => {
    const f = new Fragments(5);
    f.shatter(draw, 0, 0, 10, 10, { grid: 3, speed: [1, 1], life: [10, 10] }, rng);
    expect(f.count).toBe(5);
  });

  it("flies under gravity and expires", () => {
    const f = new Fragments();
    f.shatter(draw, 0, 0, 10, 10, { grid: 1, speed: [0, 0], life: [300, 300], gravity: 1000 }, rng);
    f.update(100);
    expect(f.count).toBe(1);
    f.update(250);
    expect(f.count).toBe(0);
  });

  it("predicts a ballistic position", () => {
    expect(fragmentAt({ x: 0, y: 0, vx: 100, vy: -100, grav: 1000 }, 1000)).toEqual({ x: 100, y: 400 });
  });
});

describe("mix sweep", () => {
  it("starts half way through and crosses the tile", () => {
    expect(sweepAt(0.3)).toBeNull();
    expect(sweepAt(0.5)!.x).toBe(-1);
    expect(sweepAt(0.75)!.x).toBeCloseTo(0);
    expect(sweepAt(1)!.x).toBe(1);
    expect(sweepAt(0.5)!.alpha).toBeCloseTo(0);
  });
});

describe("shake", () => {
  const still = () => 0.5;

  it("is nothing before, after, or without amplitude", () => {
    expect(shakeOffset(-1, 5, 0, 1, true, still)).toEqual({ dx: 0, dy: 0, rot: 0 });
    expect(shakeOffset(500, 5, 0, 1, true, still)).toEqual({ dx: 0, dy: 0, rot: 0 });
    expect(shakeOffset(10, 0, 0, 1, true, still)).toEqual({ dx: 0, dy: 0, rot: 0 });
  });

  it("kicks along the direction first and never rotates when told not to", () => {
    const o = shakeOffset(27, 6, 0, 1, false, still);
    expect(o.dx).toBeCloseTo(0);
    expect(o.dy).toBeGreaterThan(5);
    expect(o.rot).toBe(0);
    const noDir = shakeOffset(27, 6, 0, 0, false, still);
    expect(noDir.dy).toBeCloseTo(0);
  });
});

describe("clock slow motion", () => {
  it("scales game time for the window and then returns to normal", () => {
    const c = new Clock();
    c.advance(1000);
    c.advance(1016);
    expect(c.dt).toBe(16);
    c.slow(0.25, 100);
    expect(c.timeScale).toBe(0.25);
    c.advance(1032);
    expect(c.dt).toBe(4);
    c.advance(1200);
    expect(c.timeScale).toBe(1);
    c.freeze(50);
    expect(c.timeScale).toBe(0);
  });
});
