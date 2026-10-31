import { describe, expect, it } from "vitest";
import { heroSpot, TOP_CHROME, view } from "./view";

describe("hero ornament spot", () => {
  it("keeps the ornament clear of the corner chrome on a short screen", () => {
    view.w = 1020;
    view.h = 507;
    const r = 56;
    const spot = heroSpot(r);
    expect(spot.y - r).toBeGreaterThanOrEqual(TOP_CHROME);
    expect(spot.x + r).toBeLessThanOrEqual(view.w);
  });

  it("drops to a fifth of the height when a wide screen is tall enough for that to clear the chrome", () => {
    view.w = 1400;
    view.h = 1100;
    view.portrait = false;
    const spot = heroSpot(40);
    expect(spot.y).toBe(220);
  });

  it("moves to the top centre when held upright, clear of both HUD corners", () => {
    view.w = 520;
    view.h = 920;
    view.portrait = true;
    const r = 57;
    const spot = heroSpot(r, true);
    expect(spot.x).toBe(260);
    expect(spot.y - r).toBeGreaterThan(0);
    expect(spot.y + r).toBeLessThan(160);
    // the title's theme pill sits in that gap, so there the ornament drops under the chrome
    expect(heroSpot(r).y - r).toBeGreaterThanOrEqual(TOP_CHROME);
    view.portrait = false;
  });
});
