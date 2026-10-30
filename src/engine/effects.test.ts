import { describe, expect, it } from "vitest";
import { makeHarness } from "../test/harness";
import { Effects } from "./effects";
import { resetTuning } from "./fxTuning";
import type { ThemeName } from "./theme";

const draw = () => {};

function pop(theme: ThemeName, k: number) {
  resetTuning();
  const h = makeHarness({ theme });
  const fx = new Effects(h.ctx, 600);
  fx.pop({ x: 0, y: 0, w: 40, h: 40, color: 1, draw, k, debris: 10 });
  return { h, fx };
}

describe("Effects.pop per theme profile", () => {
  it("classic gets only the plain debris burst", () => {
    const { fx } = pop("classic", 1);
    expect(fx.fragments.count).toBe(0);
    expect(fx.particles.count).toBe(22);
  });

  it("themes with fragments shatter the tile into a 3x3 at full intensity and 2x2 at low", () => {
    expect(pop("blocky", 1).fx.fragments.count).toBe(9);
    expect(pop("blocky", 0).fx.fragments.count).toBe(4);
    expect(pop("pigment", 1).fx.fragments.count).toBe(0);
  });

  it("themes with sparks add them on top of the debris", () => {
    const plain = pop("blocky", 1).fx.particles.count;
    const sparked = pop("spectra", 1).fx.particles.count;
    expect(sparked).toBeGreaterThan(plain);
  });
});

describe("Effects rings, impact and lifetime", () => {
  it("doubles the ring on big pops only where the theme allows", () => {
    const h = makeHarness({ theme: "pigment" });
    const fx = new Effects(h.ctx);
    fx.burstRing(0, 0, 40, "#fff", 1);
    expect(fx.ringCount).toBe(2);
    fx.burstRing(0, 0, 40, "#fff", 0);
    expect(fx.ringCount).toBe(3);
    const classic = new Effects(makeHarness({ theme: "classic" }).ctx);
    classic.burstRing(0, 0, 40, "#fff", 1);
    expect(classic.ringCount).toBe(1);
  });

  it("slows the clock on a big moment for slow-mo themes and never for classic", () => {
    const h = makeHarness({ theme: "spectra" });
    new Effects(h.ctx).impact(1);
    expect(h.clock.timeScale).toBe(0);
    h.clock.advance(h.clock.now + 130);
    expect(h.clock.timeScale).toBeLessThan(1);
    const c = makeHarness({ theme: "classic" });
    new Effects(c.ctx).impact(1);
    c.clock.advance(c.clock.now + 130);
    expect(c.clock.timeScale).toBe(1);
  });

  it("retires rings, particles and fragments as game time passes", () => {
    const { h, fx } = pop("blocky", 1);
    fx.burstRing(0, 0, 40, "#fff", 0);
    expect(fx.ringCount).toBe(1);
    for (let i = 0; i < 40; i++) {
      h.clock.advance(h.clock.now + 50);
      fx.update();
    }
    expect(fx.ringCount).toBe(0);
    expect(fx.particles.count).toBe(0);
    expect(fx.fragments.count).toBe(0);
  });

  it("clear drops everything at once", () => {
    const { fx } = pop("spectra", 1);
    fx.clear();
    expect(fx.particles.count + fx.fragments.count + fx.ringCount).toBe(0);
  });
});
