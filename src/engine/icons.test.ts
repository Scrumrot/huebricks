import { describe, expect, it } from "vitest";
import { ICON_NAMES, ICONS, iconStroke } from "./icons";

/** A 2D context that accepts anything and counts the path operations it is asked for. */
function stubContext(): { g: CanvasRenderingContext2D; calls: Record<string, number> } {
  const calls: Record<string, number> = {};
  const g = new Proxy({} as Record<string, unknown>, {
    get: (target, prop: string) => {
      if (prop in target) return target[prop];
      return (...args: unknown[]) => {
        calls[prop] = (calls[prop] ?? 0) + args.length * 0 + 1;
      };
    },
    set: (target, prop: string, value) => {
      target[prop] = value;
      return true;
    },
  });
  return { g: g as unknown as CanvasRenderingContext2D, calls };
}

describe("icon family", () => {
  it("has the whole sheet", () => {
    expect(ICON_NAMES).toHaveLength(25);
    expect(ICON_NAMES).toContain("rotateCcw");
    expect(ICON_NAMES).toContain("swapRails");
  });

  it("every icon draws something and leaves the context as it found it", () => {
    for (const name of ICON_NAMES) {
      const { g, calls } = stubContext();
      ICONS[name](g, 50, 50, 16);
      expect((calls.stroke ?? 0) + (calls.fill ?? 0), name).toBeGreaterThan(0);
      expect(calls.save, name).toBe(calls.restore);
    }
  });

  it("scales its stroke with the grid", () => {
    expect(iconStroke(12)).toBeCloseTo(2.2);
    expect(iconStroke(24)).toBeCloseTo(4.4);
    expect(iconStroke(2)).toBe(1);
  });
});
