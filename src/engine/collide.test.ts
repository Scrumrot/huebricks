import { describe, expect, it } from "vitest";
import { BOUNCE_KEEP, landOn, type SolidTop } from "./collide";
import { Fragments } from "./fragments";
import { Particles } from "./particles";

/** A shelf from y = 100 down, everywhere. */
const shelf: SolidTop = (_x, y) => (y >= 100 ? 100 : null);

describe("landing on solids", () => {
  it("puts a falling thing back on the surface it just crossed and reflects it", () => {
    expect(landOn(shelf, 0, 95, 105, 200)).toEqual({ y: 100, vy: -200 * BOUNCE_KEEP });
  });

  it("ignores things rising, in open air, or already inside the solid", () => {
    expect(landOn(shelf, 0, 105, 95, -200)).toBeNull();
    expect(landOn(shelf, 0, 50, 60, 100)).toBeNull();
    expect(landOn(shelf, 0, 120, 130, 100)).toBeNull();
    expect(landOn(null, 0, 95, 105, 200)).toBeNull();
  });

  it("fragments bounce on a brick top and keep less sideways speed", () => {
    const f = new Fragments();
    f.shatter(
      () => {},
      0,
      90,
      10,
      10,
      { grid: 1, speed: [0, 0], life: [2000, 2000], gravity: 0 },
      () => 0.5,
    );
    const chunk = (f as unknown as { list: { y: number; vy: number; vx: number }[] }).list[0];
    chunk.vy = 300;
    chunk.vx = 100;
    f.update(100, shelf);
    expect(chunk.y).toBe(100);
    expect(chunk.vy).toBeLessThan(0);
    expect(chunk.vx).toBeLessThan(100);
    f.update(100);
    expect(chunk.y).toBeLessThan(100);
    // falling back onto the shelf, the second touch brings it to rest instead of bouncing forever
    chunk.y = 95;
    chunk.vy = 300;
    f.update(100, shelf);
    expect(chunk.vy).toBe(0);
    expect(chunk.y).toBe(100);
  });

  it("particles bounce too, and fall straight through with no collider", () => {
    const mk = () => {
      const p = new Particles(10);
      p.spawn(0, 90, 1, ["#fff"], { speed: [0, 0], size: [2, 2], life: [2000, 2000], gravity: 3000 });
      return p;
    };
    const solidTop = () => {
      const p = mk();
      for (let i = 0; i < 10; i++) p.update(50, shelf);
      return (p as unknown as { y: Float32Array }).y[0];
    };
    const free = () => {
      const p = mk();
      for (let i = 0; i < 10; i++) p.update(50);
      return (p as unknown as { y: Float32Array }).y[0];
    };
    expect(solidTop()).toBeLessThanOrEqual(100.001);
    expect(free()).toBeGreaterThan(200);
  });
});
