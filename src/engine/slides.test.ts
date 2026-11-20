import { describe, expect, it } from "vitest";
import { FakeInput } from "../test/harness";
import { slideNav, slideRect } from "./slides";

describe("slides", () => {
  it("fit the view at 3:2, centred", () => {
    expect(slideRect({ w: 900, h: 500 })).toEqual({ x: 75, y: 0, w: 750, h: 500 });
    expect(slideRect({ w: 300, h: 600 })).toEqual({ x: 0, y: 200, w: 300, h: 200 });
  });

  it("the keys and the bottom corners turn the pages", () => {
    const r = slideRect({ w: 900, h: 500 });
    const inp = new FakeInput();
    expect(slideNav(inp, r)).toBeNull();
    inp.tap("ArrowRight");
    expect(slideNav(inp, r)).toBe("next");
    inp.endStep();
    inp.tap("ArrowLeft");
    expect(slideNav(inp, r)).toBe("back");
    inp.endStep();
    inp.press(r.x + r.w - 10, r.y + r.h - 10);
    expect(slideNav(inp, r)).toBe("next");
    inp.endStep();
    inp.press(r.x + 10, r.y + r.h - 10);
    expect(slideNav(inp, r)).toBe("back");
    inp.endStep();
    inp.press(r.x + r.w / 2, r.y + r.h / 2);
    expect(slideNav(inp, r)).toBeNull();
  });
});
