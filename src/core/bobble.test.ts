import { describe, expect, it } from "vitest";
import { BubbleGrid, ROW_PITCH } from "./bobble";
import { BLUE, RED } from "./color";

describe("BubbleGrid", () => {
  it("alternates row widths and hex neighbours", () => {
    const g = new BubbleGrid(8, 10);
    expect(g.width(0)).toBe(8);
    expect(g.width(1)).toBe(7);
    // row 1 col 0 sits between row 0 cols 0 and 1
    expect(g.neighbors(1, 0).slice(0, 2)).toEqual([
      [0, 0],
      [0, 1],
    ]);
    expect(g.neighbors(2, 1).slice(0, 2)).toEqual([
      [1, 0],
      [1, 1],
    ]);
  });

  it("places centres on a hex lattice and maps points back", () => {
    const g = new BubbleGrid(8, 10);
    const r = 10;
    expect(g.center(0, 0, r)).toEqual({ x: 10, y: 10 });
    expect(g.center(1, 0, r)).toEqual({ x: 20, y: 10 + 20 * ROW_PITCH });
    expect(g.cellAt(20, 10 + 20 * ROW_PITCH, r)).toEqual({ row: 1, col: 0 });
    g.drop = 1;
    expect(g.center(0, 0, r).y).toBeCloseTo(10 + 20 * ROW_PITCH);
    expect(g.cellAt(10, 10 + 20 * ROW_PITCH, r)).toEqual({ row: 0, col: 0 });
  });

  it("snaps a shot to a free cell touching the cluster", () => {
    const g = new BubbleGrid(8, 10);
    g.populate(1, [RED]);
    const r = 10;
    // just under row 0, col 3: between cols 2 and 3 of row 1
    const c = g.center(0, 3, r);
    const snap = g.snapCell(c.x + 2, c.y + 2 * r * 0.9, r)!;
    expect(snap.row).toBe(1);
    expect([2, 3]).toContain(snap.col);
  });

  it("finds colour groups and floating bubbles", () => {
    const g = new BubbleGrid(8, 10);
    g.add(0, 0, RED);
    g.add(1, 0, RED);
    g.add(2, 0, RED);
    g.add(2, 1, BLUE);
    g.add(4, 4, BLUE);
    expect(g.group(0, 0)).toHaveLength(3);
    for (const b of g.group(0, 0)) g.remove(b);
    const loose = g.floating();
    expect(loose.map((b) => [b.row, b.col])).toEqual(
      expect.arrayContaining([
        [2, 1],
        [4, 4],
      ]),
    );
    expect(loose).toHaveLength(2);
  });
});
