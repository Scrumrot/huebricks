import { describe, expect, it } from "vitest";
import { BLACK, BLUE, GREEN, ORANGE, PURPLE, RED, YELLOW } from "../core/color";
import { arcPlan, shortestSweep, wheelAngle, wheelColorAt } from "./colorWheel";

const COLORS = { 1: "#ff0000", 2: "#0000ff", 3: "#800080", 4: "#ffff00", 5: "#ff8000", 6: "#00ff00", 7: "#000000" } as const;
const deg = (r: number) => Math.round((r * 180) / Math.PI);

describe("colour wheel", () => {
  it("places the primaries at thirds with each secondary between its parents", () => {
    expect(deg(wheelAngle(RED)!)).toBe(-90);
    expect(deg(wheelAngle(ORANGE)!)).toBe(-30);
    expect(deg(wheelAngle(YELLOW)!)).toBe(30);
    expect(deg(wheelAngle(GREEN)!)).toBe(90);
    expect(deg(wheelAngle(BLUE)!)).toBe(150);
    expect(deg(wheelAngle(PURPLE)!)).toBe(210);
    expect(wheelAngle(BLACK)).toBeNull();
  });

  it("reads the theme's own paint at each angle and blends between neighbours", () => {
    expect(wheelColorAt(wheelAngle(RED)!, COLORS)).toBe("rgb(255,0,0)");
    expect(wheelColorAt(wheelAngle(BLUE)! + Math.PI * 2, COLORS)).toBe("rgb(0,0,255)");
    expect(wheelColorAt(wheelAngle(ORANGE)!, COLORS)).toBe("rgb(255,128,0)");
    expect(wheelColorAt(0, COLORS)).toBe("rgb(255,192,0)");
  });

  it("takes the short way round", () => {
    expect(deg(shortestSweep(wheelAngle(RED)!, wheelAngle(PURPLE)!))).toBe(-60);
    expect(deg(shortestSweep(wheelAngle(PURPLE)!, wheelAngle(GREEN)!))).toBe(-120);
  });

  it("an add sweeps forward to the result with the new primary sliding in", () => {
    const p = arcPlan(RED, ORANGE);
    expect(p.subtract).toBe(false);
    expect(p.black).toBe(false);
    expect(deg(p.from)).toBe(-90);
    expect(deg(p.sweep)).toBe(60);
    expect(p.dots).toEqual([{ color: YELLOW, from: wheelAngle(YELLOW), to: wheelAngle(ORANGE) }]);
    // Blue joining red to make purple travels the short way, past the top of the wheel.
    expect(deg(arcPlan(RED, PURPLE).dots[0].to - arcPlan(RED, PURPLE).dots[0].from)).toBe(60);
  });

  it("a subtract runs the wheel backwards with the removed primary sliding out", () => {
    const p = arcPlan(PURPLE, BLUE);
    expect(p.subtract).toBe(true);
    expect(deg(p.from)).toBe(210);
    expect(deg(p.sweep)).toBe(-60);
    expect(p.dots.map((d) => d.color)).toEqual([RED]);
  });

  it("mixes through black sweep a full turn", () => {
    const toBlack = arcPlan(GREEN, BLACK);
    expect(toBlack.black).toBe(true);
    expect(deg(toBlack.sweep)).toBe(360);
    expect(deg(toBlack.from)).toBe(90);
    const fromBlack = arcPlan(BLACK, YELLOW);
    expect(fromBlack.subtract).toBe(true);
    expect(deg(fromBlack.sweep)).toBe(-360);
    expect(fromBlack.dots.map((d) => d.color).sort()).toEqual([RED, BLUE]);
  });
});
