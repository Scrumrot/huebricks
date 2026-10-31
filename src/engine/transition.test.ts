import { describe, expect, it } from "vitest";
import { dissolve } from "./transition";

describe("scene dissolve", () => {
  it("starts with the old frame solid at rest and the new scene slightly small", () => {
    const d = dissolve(0);
    expect(d.outAlpha).toBe(1);
    expect(d.outScale).toBe(1);
    expect(d.inScale).toBeLessThan(1);
  });

  it("ends with the old frame gone and the new scene at full size", () => {
    const d = dissolve(1);
    expect(d.outAlpha).toBe(0);
    expect(d.outScale).toBeGreaterThan(1);
    expect(d.inScale).toBe(1);
    expect(dissolve(3)).toEqual(d);
  });

  it("reduce motion removes the drift but keeps the fade", () => {
    const d = dissolve(0.5, 0);
    expect(d.outScale).toBe(1);
    expect(d.inScale).toBe(1);
    expect(d.outAlpha).toBeGreaterThan(0);
    expect(d.outAlpha).toBeLessThan(1);
  });
});
