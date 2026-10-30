import { describe, expect, it } from "vitest";
import { BLUE, PURPLE, RED } from "./color";
import { fallInterval, landing, levelFor, popPoints, restingRow } from "./trist";
import { Well } from "./well";

describe("landing", () => {
  it("mixes into a brick it can combine with", () => {
    const well = Well.fromString(["...", "...", ".2."]);
    const l = landing(well, 1, 1, RED);
    expect(l.kind).toBe("mix");
    if (l.kind === "mix") {
      expect(l.result).toBe(PURPLE);
      expect(l.refined).toBe(false);
      expect(l.into.color).toBe(BLUE); // not applied: the scene does that
    }
  });

  it("marks a subtracting mix as refined", () => {
    const well = Well.fromString(["...", "...", ".3."]);
    const l = landing(well, 1, 1, RED);
    expect(l).toMatchObject({ kind: "mix", result: BLUE, refined: true });
  });

  it("stacks on a brick of the same colour and on the floor", () => {
    const well = Well.fromString(["...", "...", ".1."]);
    expect(landing(well, 1, 1, RED)).toEqual({ kind: "stack", x: 1, y: 1 });
    expect(landing(well, 0, 2, RED)).toEqual({ kind: "stack", x: 0, y: 2 });
  });

  it("finds the resting row", () => {
    const well = Well.fromString(["...", "...", ".1."]);
    expect(restingRow(well, 1, 0)).toBe(1);
    expect(restingRow(well, 0, 0)).toBe(2);
  });
});

describe("tuning", () => {
  it("levels up every twelve landings and speeds up to a floor", () => {
    expect(levelFor(0)).toBe(1);
    expect(levelFor(11)).toBe(1);
    expect(levelFor(12)).toBe(2);
    expect(fallInterval(1)).toBe(20);
    expect(fallInterval(5)).toBe(12);
    expect(fallInterval(50)).toBe(4);
  });

  it("scores pops by size, chain and refinement", () => {
    expect(popPoints(4, 1, false)).toBe(80);
    expect(popPoints(4, 2, false)).toBe(120);
    expect(popPoints(4, 9, false)).toBe(200);
    expect(popPoints(4, 1, true)).toBe(180);
  });
});
