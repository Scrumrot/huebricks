import { describe, expect, it } from "vitest";
import { FakeInput } from "../test/harness";
import { CARD_MS, cardButtonAt, cardOffset } from "./overlayCard";

describe("overlay card slide", () => {
  it("waits below the screen before it opens, rises with an overshoot and settles at rest", () => {
    expect(cardOffset(-10, 500)).toBe(500);
    expect(cardOffset(0, 500)).toBeCloseTo(300);
    let minOff = Infinity;
    for (let e = 0; e <= CARD_MS; e += 10) minOff = Math.min(minOff, cardOffset(e, 500));
    expect(minOff).toBeLessThan(0);
    expect(cardOffset(CARD_MS, 500)).toBeCloseTo(0);
    expect(cardOffset(CARD_MS * 3, 500)).toBe(0);
  });

  it("a slowed slide takes proportionally longer", () => {
    expect(cardOffset(CARD_MS / 2, 500, CARD_MS * 2)).toBeGreaterThan(cardOffset(CARD_MS / 2, 500));
    expect(cardOffset(CARD_MS * 2, 500, CARD_MS * 2)).toBeCloseTo(0);
  });

  it("buttons are hit where the slide has put them", () => {
    const inp = new FakeInput();
    const buttons = [{ id: "a", label: "A", cx: 100, cy: 100, w: 40, h: 20 }];
    inp.moveTo(100, 100);
    expect(cardButtonAt(inp, buttons, 0)?.id).toBe("a");
    expect(cardButtonAt(inp, buttons, 60)).toBeUndefined();
    inp.moveTo(100, 160);
    expect(cardButtonAt(inp, buttons, 60)?.id).toBe("a");
  });
});
