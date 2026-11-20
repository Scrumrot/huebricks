import { describe, expect, it } from "vitest";
import { levelButtons, levelCardLayout } from "./levelCard";

describe("level-complete card", () => {
  it("grows a row for the subtract bonus and never runs off a short screen", () => {
    const view = { w: 900, h: 506 };
    const plain = levelCardLayout(view, false);
    const withSub = levelCardLayout(view, true);
    expect(withSub.rows).toBe(3);
    expect(withSub.h - plain.h).toBe(24);
    expect(plain.x + plain.w / 2).toBe(450);
    const tiny = levelCardLayout({ w: 360, h: 300 }, true);
    expect(tiny.y).toBe(8);
    expect(tiny.w).toBe(336);
  });

  it("puts Next, Replay and Title along the bottom and rides the slide-in", () => {
    const L = levelCardLayout({ w: 900, h: 506 }, false);
    const [next, replay, title] = levelButtons(L, 0);
    expect(next.id).toBe("next");
    expect(next.primary).toBe(true);
    expect(next.cx).toBeLessThan(replay.cx);
    expect(replay.cx).toBeLessThan(title.cx);
    expect(replay.cx).toBe(L.x + L.w / 2);
    expect(replay.cy).toBeLessThan(L.y + L.h);
    expect(levelButtons(L, 50)[0].cy).toBe(next.cy + 50);
  });
});
