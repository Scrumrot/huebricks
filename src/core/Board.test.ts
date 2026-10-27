import { describe, expect, it } from "vitest";
import { Board } from "./Board";
import { Brick } from "./Brick";
import { BLUE, GREEN, PURPLE, RED, YELLOW } from "./color";

describe("Board groups and popping", () => {
  it("finds 4-connected groups of the same colour", () => {
    const b = Board.fromString(`
      ....
      .11.
      .11.
      2..2
    `);
    const top = b.get(1, 1)!;
    expect(top.group).toHaveLength(4);
    expect(b.get(0, 3)!.group).toHaveLength(1);
  });

  it("pops groups of four or more and scores them", () => {
    const b = Board.fromString(`
      ....
      .11.
      .11.
      2..2
    `);
    const res = b.popGroups();
    expect(res.groups).toHaveLength(1);
    expect(res.score).toBe(20 * 4);
    expect(b.countBricks()).toBe(2);
    expect(b.comboLength).toBe(1);
  });

  it("does not score black groups but still removes them", () => {
    const b = Board.fromString(`
      7777
      ....
      ....
      ....
    `);
    const res = b.popGroups();
    expect(res.groups).toHaveLength(1);
    expect(res.score).toBe(0);
    expect(b.isEmpty()).toBe(true);
  });

  it("raises the brick value during a chain", () => {
    const b = Board.fromString(`
      ....
      ....
      ....
      1111
    `);
    b.comboLength = 1; // pretend one pop already happened in this chain
    const res = b.popGroups();
    expect(res.brickValue).toBe(25);
    expect(res.score).toBe(100);
  });
});

describe("Board gravity and rotation", () => {
  it("drops bricks into empty cells below them", () => {
    const b = Board.fromString(`
      1...
      ....
      2...
      ....
    `);
    expect(b.resettle()).toBe(true);
    expect(b.get(0, 3)!.color).toBe(2);
    expect(b.get(0, 2)!.color).toBe(1);
    expect(b.get(0, 0)).toBeNull();
    expect(b.get(0, 2)!.fall).toBe(true);
  });

  it("rotates clockwise", () => {
    const b = Board.fromString(`
      12
      ..
    `);
    b.rotate(true);
    expect(b.toString()).toBe(".1\n.2");
  });

  it("rotates counter-clockwise", () => {
    const b = Board.fromString(`
      12
      ..
    `);
    b.rotate(false);
    expect(b.toString()).toBe("2.\n1.");
  });

  it("four rotations return to the start", () => {
    const start = `
      1234
      5671
      ..2.
      3..4
    `;
    const b = Board.fromString(start);
    const before = b.toString();
    for (let i = 0; i < 4; i++) b.rotate(true);
    expect(b.toString()).toBe(before);
  });
});

describe("Board push", () => {
  it("moves rows up and the replenish line into the bottom row", () => {
    const b = Board.fromString(`
      ...
      ...
      12.
    `);
    b.replenishList = [new Brick(RED), new Brick(BLUE), new Brick(GREEN)];
    const res = b.push();
    expect(res.overflow).toBe(false);
    expect(b.toString()).toBe("...\n12.\n126");
    expect(b.replenishList).toHaveLength(0);
    expect(b.get(0, 2)!.pushing).toBe(true);
  });

  it("reports overflow when the top row is occupied", () => {
    const b = Board.fromString(`
      1..
      ...
      ...
    `);
    const res = b.push();
    expect(res.overflow).toBe(true);
    expect(b.isEmpty()).toBe(true);
  });
});

describe("Board combine", () => {
  it("consumes the selected replenish brick and recolours the target", () => {
    const b = Board.fromString(`
      ..
      1.
    `);
    const sel = new Brick(BLUE);
    b.replenishList = [sel];
    expect(b.combine(sel, 0, 1)).toBe("combined");
    expect(b.get(0, 1)!.color).toBe(PURPLE);
    expect(b.replenishList).toHaveLength(0);
  });

  it("marks a brick as refined when colour is subtracted, and clears it when added", () => {
    const b = Board.fromString(`
      ..
      5.
    `);
    const red = new Brick(RED);
    b.replenishList = [red];
    expect(b.combine(red, 0, 1)).toBe("combined");
    const dest = b.get(0, 1)!;
    expect(dest.color).toBe(YELLOW);
    expect(dest.refined).toBe(true);
    const blue = new Brick(BLUE);
    b.replenishList = [blue];
    expect(b.combine(blue, 0, 1)).toBe("combined");
    expect(dest.color).toBe(GREEN);
    expect(dest.refined).toBe(false);
  });

  it("flags both bricks on an invalid combination", () => {
    const b = Board.fromString(`
      ..
      1.
    `);
    const sel = new Brick(RED);
    b.replenishList = [sel];
    expect(b.combine(sel, 0, 1)).toBe("noadd");
    expect(sel.noadd).toBe(true);
    expect(b.get(0, 1)!.noadd).toBe(true);
    expect(b.replenishList).toHaveLength(1);
  });

  it("ignores empty cells", () => {
    const b = Board.fromString(`
      ..
      1.
    `);
    const sel = new Brick(RED);
    expect(b.combine(sel, 1, 1)).toBe("none");
  });
});
