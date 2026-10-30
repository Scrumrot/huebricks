import { describe, expect, it } from "vitest";
import { Board } from "./Board";
import { BLUE, PURPLE, RED, YELLOW } from "./color";
import { groupIfPlaced } from "./preview";

describe("groupIfPlaced", () => {
  const board = () =>
    Board.fromString(`
      ....
      .33.
      .13.
      2..2
    `);

  it("previews the group a drop would complete without changing the board", () => {
    const b = board();
    const before = b.toString();
    const p = groupIfPlaced(b, BLUE, 1, 2);
    expect(p?.color).toBe(PURPLE);
    expect(p?.members).toHaveLength(4);
    expect(p?.members).toContain(b.get(1, 2));
    expect(b.toString()).toBe(before);
    expect(b.get(1, 2)!.color).toBe(RED);
  });

  it("follows the level's add and subtract rules", () => {
    const b = board();
    expect(groupIfPlaced(b, BLUE, 1, 2, false, true)).toBeNull();
    const sub = groupIfPlaced(b, RED, 1, 1, true, true);
    expect(sub?.color).toBe(BLUE);
    expect(sub?.members).toHaveLength(1);
    expect(groupIfPlaced(b, RED, 1, 1, true, false)).toBeNull();
  });

  it("is null on an empty cell or an identical colour", () => {
    const b = board();
    expect(groupIfPlaced(b, YELLOW, 0, 0)).toBeNull();
    expect(groupIfPlaced(b, RED, 1, 2)).toBeNull();
  });
});
