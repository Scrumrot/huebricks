import { describe, expect, it } from "vitest";
import { BLACK, BLUE, GREEN, ORANGE, PURPLE, RED, YELLOW } from "../core/color";
import { chainLift, isSubtract, notesFor, transpose } from "./colorNotes";
import { combineNotes, popNotes } from "./synth";

describe("colour notes", () => {
  it("gives the primaries a triad and each secondary its parents' interval", () => {
    expect(notesFor(RED)).toHaveLength(1);
    expect(notesFor(ORANGE)).toEqual([...notesFor(RED), ...notesFor(YELLOW)]);
    expect(notesFor(PURPLE)).toEqual([...notesFor(RED), ...notesFor(BLUE)]);
    expect(notesFor(GREEN)).toEqual([...notesFor(YELLOW), ...notesFor(BLUE)]);
    expect(notesFor(BLACK)).toEqual([RED, YELLOW, BLUE].map((c) => notesFor(c)[0] / 2));
  });

  it("lifts pops up the scale with the chain and caps at the octave", () => {
    expect(chainLift(1)).toBe(0);
    expect(chainLift(3)).toBe(4);
    expect(chainLift(99)).toBe(12);
    expect(transpose(440, 12)).toBeCloseTo(880);
    expect(popNotes(RED, 8)[0]).toBeCloseTo(notesFor(RED)[0] * 2);
    expect(popNotes(undefined, 1)).toHaveLength(3);
  });

  it("hears a subtract as the lower figure", () => {
    expect(isSubtract(PURPLE, BLUE)).toBe(true);
    expect(isSubtract(RED, PURPLE)).toBe(false);
    expect(combineNotes(PURPLE, BLUE).subtract).toBe(true);
    expect(combineNotes(RED, ORANGE)).toEqual({ before: notesFor(RED), after: notesFor(ORANGE), subtract: false });
    expect(combineNotes(undefined, undefined).after.length).toBeGreaterThan(0);
  });
});
