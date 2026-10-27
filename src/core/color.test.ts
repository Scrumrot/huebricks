import { describe, expect, it } from "vitest";
import { BLACK, BLUE, combineColors, GREEN, ORANGE, PURPLE, RED, YELLOW, colorAdd, colorSubtract } from "./color";

describe("colour arithmetic", () => {
  it("adds primaries into secondaries", () => {
    expect(colorAdd(RED, BLUE)).toBe(PURPLE);
    expect(colorAdd(RED, YELLOW)).toBe(ORANGE);
    expect(colorAdd(BLUE, YELLOW)).toBe(GREEN);
    expect(colorAdd(RED, GREEN)).toBe(BLACK);
  });

  it("subtracts a contained colour", () => {
    expect(colorSubtract(RED, PURPLE)).toBe(BLUE);
    expect(colorSubtract(YELLOW, BLACK)).toBe(PURPLE);
  });
});

describe("combineColors (board_combine rules)", () => {
  it("refuses identical colours", () => {
    expect(combineColors(RED, RED)).toBeNull();
    expect(combineColors(GREEN, GREEN)).toBeNull();
  });

  it("adds when no primaries are shared", () => {
    expect(combineColors(RED, BLUE)).toBe(PURPLE);
    expect(combineColors(RED, GREEN)).toBe(BLACK);
  });

  it("subtracts the selected colour when it is contained in the destination", () => {
    expect(combineColors(RED, PURPLE)).toBe(BLUE);
    expect(combineColors(BLUE, BLACK)).toBe(ORANGE);
  });

  it("subtracts the destination when it is contained in the selected colour", () => {
    expect(combineColors(PURPLE, RED)).toBe(BLUE);
    expect(combineColors(ORANGE, YELLOW)).toBe(RED);
  });

  it("respects the tutorial add/subtract restrictions", () => {
    expect(combineColors(RED, BLUE, true, false)).toBe(PURPLE);
    expect(combineColors(RED, PURPLE, true, false)).toBeNull();
    expect(combineColors(RED, PURPLE, false, true)).toBe(BLUE);
    expect(combineColors(RED, BLUE, false, true)).toBeNull();
  });
});
