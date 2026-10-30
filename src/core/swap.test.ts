import { describe, expect, it } from "vitest";
import { BLUE, ORANGE, PURPLE, RED } from "./color";
import { addTime, adjacent, applyMove, drain, levelFor, MAX_MS, moveFor, newBoard, popPoints, refill, scrub, timeBonus } from "./swap";
import { Well } from "./well";

/** A deterministic rng cycling through the given values in 0..1. */
const seq = (...vals: number[]) => {
  let i = 0;
  return () => vals[i++ % vals.length];
};

describe("picking two neighbours", () => {
  it("mixes when the colour rules allow it, the first pouring into the second", () => {
    const w = Well.fromString(["12", "..", ".."]);
    const a = w.get(0, 0)!;
    const b = w.get(1, 0)!;
    const m = moveFor(a, b);
    expect(m.kind).toBe("mix");
    applyMove(w, m);
    expect(w.get(0, 0)).toBeNull();
    expect(w.get(1, 0)!.color).toBe(PURPLE);
    expect(w.get(1, 0)!.refined).toBe(false);
  });

  it("marks a subtractive mix as refined, whichever side is picked first", () => {
    const w = Well.fromString(["31"]);
    expect(moveFor(w.get(0, 0)!, w.get(1, 0)!)).toMatchObject({ kind: "mix", result: BLUE, refined: true });
    expect(moveFor(w.get(1, 0)!, w.get(0, 0)!)).toMatchObject({ kind: "mix", result: BLUE, refined: true });
  });

  it("swaps when they cannot mix: same colour, or overlapping without containment", () => {
    const w = Well.fromString(["11", "35"]);
    expect(moveFor(w.get(0, 0)!, w.get(1, 0)!).kind).toBe("swap");
    const a = w.get(0, 1)!;
    const b = w.get(1, 1)!;
    expect(moveFor(a, b).kind).toBe("swap");
    applyMove(w, moveFor(a, b));
    expect(w.get(0, 1)).toBe(b);
    expect(w.get(1, 1)).toBe(a);
    expect(a.x).toBe(1);
    expect(b.x).toBe(0);
    expect(w.get(0, 1)!.color).toBe(ORANGE);
    expect(w.get(1, 1)!.color).toBe(PURPLE);
  });

  it("black mixes with everything but black", () => {
    const w = Well.fromString(["74", "77"]);
    expect(moveFor(w.get(0, 0)!, w.get(1, 0)!)).toMatchObject({ kind: "mix", result: PURPLE, refined: true });
    expect(moveFor(w.get(0, 1)!, w.get(1, 1)!).kind).toBe("swap");
  });

  it("only orthogonal neighbours count", () => {
    expect(adjacent({ x: 1, y: 1 }, { x: 2, y: 1 })).toBe(true);
    expect(adjacent({ x: 1, y: 1 }, { x: 2, y: 2 })).toBe(false);
    expect(adjacent({ x: 1, y: 1 }, { x: 1, y: 1 })).toBe(false);
  });
});

describe("refilling the board", () => {
  it("drops new tiles into the empty top of each column, numbered from above the well", () => {
    const w = Well.fromString(["..1", ".21", "321"]);
    const spawned = refill(w, seq(0));
    expect(spawned.map((s) => [s.cell.x, s.cell.y, s.from])).toEqual([
      [0, 0, -2],
      [0, 1, -1],
      [1, 0, -1],
    ]);
    expect(w.count()).toBe(9);
    expect(spawned.every((s) => s.cell.color === RED)).toBe(true);
  });

  it("redraws a new tile once when it would complete a group on arrival", () => {
    const lucky = Well.fromString(["1.1", "213"]);
    refill(lucky, seq(0), 0);
    expect(lucky.get(1, 0)!.color).toBe(RED);
    const damped = Well.fromString(["1.1", "213"]);
    refill(damped, seq(0, 0.2));
    expect(damped.get(1, 0)!.color).toBe(BLUE);
    expect(damped.groups(4)).toHaveLength(0);
  });

  it("a fresh board is full and never pops on its own", () => {
    const w = newBoard(seq(0.1, 0.1, 0.1, 0.9, 0.5));
    expect(w.count()).toBe(w.cols * w.rows);
    expect(w.groups(4)).toHaveLength(0);
  });

  it("scrub recolours any group of four", () => {
    const w = Well.fromString(["1111", "2222"]);
    expect(scrub(w, seq(0.05, 0.25, 0.45, 0.65, 0.85))).toBe(true);
    expect(w.groups(4)).toHaveLength(0);
  });
});

describe("scoring", () => {
  it("values chains more and refined pops extra", () => {
    expect(popPoints(4, 1, false)).toBe(100);
    expect(popPoints(4, 2, false)).toBe(160);
    expect(popPoints(4, 9, true)).toBe(340);
  });

  it("pops put time back, capped, and chains add more", () => {
    expect(timeBonus(4, 1)).toBe(2400);
    expect(timeBonus(4, 3)).toBe(3400);
    expect(addTime(MAX_MS - 1000, 5000)).toBe(MAX_MS);
  });

  it("the clock drains faster each level and stops at zero", () => {
    expect(drain(10_000, 1000, 1)).toBe(9000);
    expect(drain(10_000, 1000, 6)).toBe(8400);
    expect(drain(500, 1000, 1)).toBe(0);
    expect(levelFor(0)).toBe(1);
    expect(levelFor(39)).toBe(1);
    expect(levelFor(40)).toBe(2);
  });
});
