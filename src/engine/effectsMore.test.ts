import { describe, expect, it } from "vitest";
import { makeHarness, type Harness } from "../test/harness";
import { Effects } from "./effects";
import { Fragments } from "./fragments";
import { resetTuning, setReducedMotion } from "./fxTuning";
import type { ThemeName } from "./theme";

const draw = () => {};

function setup(theme: ThemeName): { h: Harness; fx: Effects } {
  resetTuning();
  const h = makeHarness({ theme });
  return { h, fx: new Effects(h.ctx, 600) };
}

function advance(h: Harness, fx: Effects, ms: number, step = 50): void {
  for (let e = 0; e < ms; e += step) {
    h.clock.advance(h.clock.now + step);
    fx.update();
  }
}

describe("pop signatures per theme", () => {
  const popAt = (theme: ThemeName, k = 1) => {
    const { h, fx } = setup(theme);
    fx.pop({ x: 0, y: 0, w: 40, h: 40, color: 2, draw, k, debris: 4, floor: 100 });
    return { h, fx };
  };

  it("paint themes leave a stain under the tiles", () => {
    expect(popAt("pigment").fx.decalCount).toBe(1);
    expect(popAt("classic").fx.decalCount).toBe(0);
  });

  it("crystal themes flare and chime on big pops", () => {
    const { h, fx } = popAt("crystals", 1);
    expect(fx.flareCount).toBe(1);
    expect(h.audio.cues).toContain("sparkle");
    expect(popAt("crystals", 0).h.audio.cues).not.toContain("sparkle");
  });

  it("gel themes ripple", () => {
    expect(popAt("gooey").fx.rippleCount).toBe(1);
  });

  it("lantern floats the popped tile away and chimes on big pops", () => {
    const { h, fx } = popAt("lantern", 1);
    expect(fx.floaterCount).toBe(1);
    expect(fx.fragments.count).toBe(0);
    expect(h.audio.cues).toContain("sparkle");
    advance(h, fx, 1500);
    expect(fx.floaterCount).toBe(0);
  });

  it("stained glass throws a caustic patch onto the stone", () => {
    expect(popAt("stainedglass").fx.decalCount).toBe(1);
  });

  it("origami's fold mix still throws scraps, and a lantern clear releases embers", () => {
    const o = setup("origami");
    o.fx.mixSplash(0, 0, 40, ["#f00", "#00f"]);
    expect(o.fx.particles.count).toBe(8);
    const l = setup("lantern");
    l.fx.celebrate([10, 50], 100, 40, () => 1);
    expect(l.fx.particles.count).toBeGreaterThan(2 * 9);
  });

  it("the mix arc, impact frame and shaped rings are off for classic", () => {
    const { h, fx } = setup("classic");
    fx.mixArc(0, 0, 40, 1, 5);
    expect(fx.arcCount).toBe(0);
    fx.impactFrame("#f00");
    expect(fx.silhouette).toBeNull();
    fx.burstRing(0, 0, 40, "#fff", 1, 0, 300, 1);
    expect(fx.ringShapes).toEqual(["circle"]);
    advance(h, fx, 100);
    expect(fx.ringCount).toBe(1);
  });

  it("modern themes ring in the popped colour's glyph, nested for mixes", () => {
    const { fx } = setup("pigment");
    fx.burstRing(0, 0, 40, "#fff", 0, 0, 300, 1);
    expect(fx.ringShapes).toEqual(["octagon"]);
    fx.clear();
    fx.burstRing(0, 0, 40, "#fff", 0, 0, 300, 3);
    expect(fx.ringShapes).toEqual(["diamond", "octagon"]);
    fx.clear();
    fx.burstRing(0, 0, 40, "#fff", 1, 0, 300, 7);
    expect(fx.ringShapes).toEqual(["octagon", "diamond", "circle"]);
  });

  it("the mix arc lives for its duration and the impact frame for a few wall frames", () => {
    const { h, fx } = setup("pigment");
    fx.mixArc(0, 0, 40, 1, 5);
    expect(fx.arcCount).toBe(1);
    advance(h, fx, 600);
    expect(fx.arcCount).toBe(0);
    fx.impactFrame("#f00", 60);
    expect(fx.silhouette).toBe("#f00");
    h.clock.advance(h.clock.now + 100);
    expect(fx.silhouette).toBeNull();
    setReducedMotion(true);
    fx.impactFrame("#f00", 60);
    expect(fx.silhouette).toBeNull();
    setReducedMotion(false);
  });

  it("a scene can keep its own richer signature", () => {
    const { fx } = setup("pigment");
    fx.pop({ x: 0, y: 0, w: 40, h: 40, color: 2, draw, k: 1, signature: false });
    expect(fx.decalCount).toBe(0);
  });

  it("fragments crunch and the mix whooshes", () => {
    const { h } = popAt("blocky");
    expect(h.audio.cues).toContain("crunch");
    const m = setup("pigment");
    m.fx.mixSplash(0, 0, 40, ["#f00", "#00f"]);
    expect(m.h.audio.cues).toContain("whoosh");
    const c = setup("classic");
    c.fx.mixSplash(0, 0, 40, ["#f00", "#00f"]);
    expect(c.h.audio.cues).toHaveLength(0);
  });

  it("thumps under a big hit-stop on staged themes only", () => {
    const s = setup("spectra");
    s.fx.impact(1);
    expect(s.h.audio.cues).toContain("thump");
    const c = setup("classic");
    c.fx.impact(1);
    expect(c.h.audio.cues).toHaveLength(0);
  });
});

describe("bouncing fragments", () => {
  it("bounce once off the floor and keep flying", () => {
    const f = new Fragments();
    f.shatter(draw, 0, 0, 10, 10, { grid: 1, speed: [0, 0], life: [2000, 2000], gravity: 1000, floor: 50 }, () => 0.5);
    let maxY = -Infinity;
    const ys: number[] = [];
    for (let i = 0; i < 40; i++) {
      f.update(25);
      const y = (f as unknown as { list: Array<{ y: number }> }).list[0].y;
      ys.push(y);
      maxY = Math.max(maxY, y);
    }
    expect(maxY).toBeLessThanOrEqual(50.0001);
    // it came back up after touching the floor
    const touch = ys.findIndex((y) => y >= 50);
    expect(touch).toBeGreaterThan(0);
    expect(ys[touch + 2]).toBeLessThan(50);
  });
});

describe("scheduler, streaks and wash", () => {
  it("runs later callbacks on game time, not wall time", () => {
    const { h, fx } = setup("pigment");
    let ran = 0;
    fx.later(100, () => ran++);
    fx.later(0, () => ran++);
    expect(ran).toBe(1);
    h.clock.freeze(1000);
    advance(h, fx, 500);
    expect(ran).toBe(1);
    advance(h, fx, 1200);
    expect(ran).toBe(2);
  });

  it("staggers the level-clear columns", () => {
    const { h, fx } = setup("pigment");
    fx.celebrate([0, 10, 20, 30], 100, 20, () => 1, 40);
    expect(fx.pending).toBe(3);
    const first = fx.particles.count;
    expect(first).toBeGreaterThan(0);
    advance(h, fx, 200);
    expect(fx.pending).toBe(0);
    expect(fx.particles.count).toBeGreaterThan(first);
  });

  it("ignores streaks too short to read and retires the rest", () => {
    const { h, fx } = setup("blocky");
    fx.streak(10, 0, 5, 20, "#fff");
    expect(fx.streakCount).toBe(0);
    fx.streak(10, 0, 200, 20, "#fff");
    expect(fx.streakCount).toBe(1);
    advance(h, fx, 300);
    expect(fx.streakCount).toBe(0);
  });

  it("trails spawn one mote per call and nothing in low power", () => {
    const { fx } = setup("blocky");
    fx.trail(0, 0, 0, 300, "#fff", 20);
    expect(fx.particles.count).toBe(1);
    fx.lowPower = true;
    fx.trail(0, 0, 0, 300, "#fff", 20);
    expect(fx.particles.count).toBe(1);
  });
});

describe("frame-time governor", () => {
  it("drops to low power after sustained slow frames and recovers after fast ones", () => {
    const { h, fx } = setup("spectra");
    for (let i = 0; i < 80; i++) {
      h.clock.advance(h.clock.now + 40);
      fx.update();
    }
    expect(fx.lowPower).toBe(true);
    for (let i = 0; i < 400; i++) {
      h.clock.advance(h.clock.now + 16);
      fx.update();
    }
    expect(fx.lowPower).toBe(false);
  });

  it("skips fragments down to a 2x2 and halves debris while in low power", () => {
    const { fx } = setup("blocky");
    fx.lowPower = true;
    fx.pop({ x: 0, y: 0, w: 40, h: 40, color: 1, draw, k: 1, debris: 10 });
    expect(fx.fragments.count).toBe(4);
    expect(fx.particles.count).toBe(11);
  });
});
