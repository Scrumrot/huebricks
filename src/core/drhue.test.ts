import { describe, expect, it } from "vitest";
import { BLUE, ORANGE, PURPLE, RED, YELLOW } from "./color";
import { clearPoints, fallInterval, fits, isSubtractive, moved, restingRow, rotated, settleDomino, type Domino } from "./drhue";
import { Well } from "./well";

const domino = (over: Partial<Domino> = {}): Domino => ({ a: RED, b: RED, x: 2, y: 0, rot: 0, ...over });

describe("domino movement", () => {
  it("fits inside the well and not over bricks or walls", () => {
    const well = Well.fromString(["....", "....", "..A."]);
    expect(fits(well, domino({ x: 0, y: 0 }))).toBe(true);
    expect(fits(well, domino({ x: 3, y: 0 }))).toBe(false); // b would be at x = 4
    expect(fits(well, domino({ x: 1, y: 2 }))).toBe(false); // b over the stain
  });

  it("moves sideways only when the target fits", () => {
    const well = new Well(4, 3);
    const d = domino({ x: 2 });
    expect(moved(well, d, 1)).toBeNull();
    expect(moved(well, d, -1)).toEqual({ ...d, x: 1 });
    expect(d.x).toBe(2); // the input is untouched
  });

  it("rotates with a wall kick and nudges down at the top row", () => {
    const well = new Well(4, 4);
    // rot 0 -> 1 puts b above the pivot at y = -1: the only kick that fits moves the piece down
    expect(rotated(well, domino({ x: 1, y: 0 }), 1)).toEqual(domino({ x: 1, y: 1, rot: 1 }));
    // rot 1 -> 2 puts b to the left; at x = 0 it kicks right
    expect(rotated(well, domino({ x: 0, y: 1, rot: 1 }), 1)).toEqual(domino({ x: 1, y: 1, rot: 2 }));
  });

  it("returns null when no rotation fits", () => {
    const well = Well.fromString(["A.A", "A.A", "AAA"]);
    expect(rotated(well, domino({ x: 1, y: 1, rot: 1 }), 1)).toBeNull();
  });

  it("finds the resting row for both halves", () => {
    const well = Well.fromString(["....", "....", "...A", "AAAA"]);
    expect(restingRow(well, domino({ x: 0, y: 0 }))).toBe(2);
    expect(restingRow(well, domino({ x: 2, y: 0 }))).toBe(1); // b at x = 3 stops on the stain in row 2
  });
});

describe("settleDomino", () => {
  it("mixes a half resting on a stain it can combine with and stacks the other", () => {
    const well = Well.fromString(["....", "....", "B.A."]);
    const placed = settleDomino(well, domino({ a: RED, b: YELLOW, x: 0, y: 1 }));
    const a = placed.find((p) => p.x === 0)!;
    const b = placed.find((p) => p.x === 1)!;
    expect(a.into?.color).toBe(BLUE);
    expect(a.result).toBe(PURPLE);
    expect(b.into).toBeNull();
    expect(b.y).toBe(2); // fell through the gap under it
    expect(b.fromY).toBe(1);
    expect(well.cells()).toHaveLength(2); // nothing was mutated
  });

  it("drops a hovering half to its resting row before deciding", () => {
    // the half over the empty column lands on the red stain below and cannot mix (same colour)
    const well = Well.fromString(["....", "....", "B...", ".A.."]);
    const placed = settleDomino(well, domino({ a: RED, b: RED, x: 0, y: 1 }));
    const b = placed.find((p) => p.fromY === 1 && p.x === 1)!;
    expect(b.y).toBe(2);
    expect(b.into).toBeNull();
  });

  it("settles the lower half of a vertical piece first so the upper one lands on it", () => {
    const well = Well.fromString(["...", "...", "...", "A.."]);
    // rot 3: b below a; a at (0,1), b at (0,2); b rests on the stain and mixes, a then falls onto the stain too
    const placed = settleDomino(well, domino({ a: YELLOW, b: BLUE, x: 0, y: 1, rot: 3 }));
    const b = placed[0];
    const a = placed[1];
    expect(b.result).toBe(PURPLE); // blue into red
    expect(a.into).toBe(b.into);
    expect(a.result).toBe(ORANGE | BLUE); // yellow into the now-purple stain -> black
  });

  it("stacks the upper half on the lower when neither mixes", () => {
    const well = Well.fromString(["...", "...", "...", "A.."]);
    const placed = settleDomino(well, domino({ a: RED, b: RED, x: 0, y: 1, rot: 3 }));
    expect(placed.map((p) => [p.x, p.y, p.into === null])).toEqual([
      [0, 2, true],
      [0, 1, true],
    ]);
  });
});

describe("tuning", () => {
  it("quickens with level and landings but never below the floor", () => {
    expect(fallInterval(1, 0)).toBe(22);
    expect(fallInterval(3, 25)).toBe(18);
    expect(fallInterval(40, 999)).toBe(6);
  });

  it("scores clears with a chain bonus and a stain bonus", () => {
    expect(clearPoints(4, 0, 1)).toBe(100);
    expect(clearPoints(4, 2, 1)).toBe(260);
    expect(clearPoints(4, 0, 2)).toBe(148);
    expect(clearPoints(4, 0, 9)).toBe(240);
  });

  it("marks subtractive mixes as refined", () => {
    expect(isSubtractive(RED, PURPLE, BLUE)).toBe(true);
    expect(isSubtractive(RED, BLUE, PURPLE)).toBe(false);
  });
});
