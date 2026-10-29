import { describe, expect, it } from "vitest";
import { BLUE, PURPLE, RED } from "./color";
import { placeStains, stainLayout } from "./stains";
import { Well } from "./well";

describe("Well", () => {
  it("finds straight runs of four, rows and columns, stains included", () => {
    const w = Well.fromString(`
      .....
      1....
      1....
      A..22
      1.222
    `);
    const lines = w.lines(4);
    expect(lines).toHaveLength(1);
    expect(lines[0].map((c) => c.locked)).toEqual([false, false, true, false]);
    expect(w.lines(3)).toHaveLength(2);
  });

  it("finds 4-connected groups", () => {
    const w = Well.fromString(`
      ....
      .11.
      .11.
      2..2
    `);
    expect(w.groups(4)).toHaveLength(1);
    expect(w.groups(1)).toHaveLength(3);
  });

  it("drops loose bricks but not stains, and stacks on stains", () => {
    const w = Well.fromString(`
      1.2
      ...
      .A3
      ...
    `);
    const moved = w.applyGravity();
    expect(w.toString()).toBe(["...", "...", ".A2", "1.3"].join("\n"));
    expect(moved.map((m) => [m.cell.color, m.from, m.cell.y])).toEqual([
      [RED, 0, 3],
      [PURPLE, 2, 3],
      [BLUE, 0, 2],
    ]);
  });

  it("reports the top occupied row", () => {
    const w = Well.fromString(`
      ...
      ...
      .1.
    `);
    expect(w.top()).toBe(2);
    expect(new Well(3, 3).top()).toBe(3);
  });
});

describe("Dr. Hue stain layouts", () => {
  it("are deterministic per level and grow with the level", () => {
    const a = new Well(8, 13);
    const b = new Well(8, 13);
    placeStains(a, 5);
    placeStains(b, 5);
    expect(a.toString()).toBe(b.toString());
    expect(a.count()).toBe(stainLayout(5, 8, 13).count);
    expect(stainLayout(20, 8, 13).count).toBeGreaterThan(stainLayout(1, 8, 13).count);
    expect(a.cells().every((c) => c.locked)).toBe(true);
  });

  it("never start with a line of three", () => {
    for (let level = 1; level <= 40; level++) {
      const w = new Well(8, 13);
      placeStains(w, level);
      expect(w.lines(3)).toHaveLength(0);
    }
  });
});
