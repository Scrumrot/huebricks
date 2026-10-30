import { describe, expect, it } from "vitest";
import { advanceShot, aimToward, BubbleGrid, dropBonus, fillRows, LEVEL_COLORS, popPoints, ROW_PITCH, shotPool, shotsPerDrop } from "./bobble";
import { BLUE, GREEN, ORANGE, PURPLE, RED, YELLOW } from "./color";

const R = 10;
const COLS = 8;
const W = COLS * 2 * R;

describe("advanceShot", () => {
  it("flies straight up and stops at the bare ceiling", () => {
    const grid = new BubbleGrid(COLS, 11);
    let shot = { x: W / 2, y: 200, vx: 0, vy: -40 };
    let landed = null;
    for (let i = 0; i < 20 && !landed; i++) {
      const step = advanceShot(grid, shot, R, W);
      shot = step.shot;
      landed = step.landed;
    }
    expect(landed).toEqual({ hit: null });
    expect(shot.y - R).toBeLessThanOrEqual(0);
  });

  it("bounces off the side walls and keeps its speed", () => {
    const grid = new BubbleGrid(COLS, 11);
    const step = advanceShot(grid, { x: W - R - 2, y: 300, vx: 20, vy: -5 }, R, W);
    expect(step.bounces).toBe(1);
    expect(step.shot.vx).toBe(-20);
    expect(step.shot.x + R).toBeLessThanOrEqual(W);
  });

  it("stops when it touches a bubble and reports which one", () => {
    const grid = new BubbleGrid(COLS, 11);
    const target = grid.add(0, 3, RED);
    const c = grid.center(0, 3, R);
    let shot = { x: c.x, y: c.y + 2 * R * 1.5, vx: 0, vy: -8 };
    let landed = null;
    for (let i = 0; i < 10 && !landed; i++) {
      const step = advanceShot(grid, shot, R, W);
      shot = step.shot;
      landed = step.landed;
    }
    expect(landed?.hit).toBe(target);
    // it stopped before overlapping the bubble it hit
    expect(Math.hypot(shot.x - c.x, shot.y - c.y)).toBeGreaterThan(R * 1.5);
  });

  it("respects the ceiling drop", () => {
    const grid = new BubbleGrid(COLS, 11);
    grid.drop = 2;
    const ceiling = 2 * 2 * R * ROW_PITCH;
    const step = advanceShot(grid, { x: W / 2, y: ceiling + R + 1, vx: 0, vy: -8 }, R, W);
    expect(step.landed).toEqual({ hit: null });
  });

  it("does not mutate the shot it is given", () => {
    const grid = new BubbleGrid(COLS, 11);
    const shot = { x: 50, y: 300, vx: 3, vy: -8 };
    advanceShot(grid, shot, R, W);
    expect(shot).toEqual({ x: 50, y: 300, vx: 3, vy: -8 });
  });
});

describe("aim and tuning", () => {
  it("aims toward a point and clamps to the limit", () => {
    expect(aimToward(0, -100, 1)).toBe(0);
    expect(aimToward(100, -100, 1)).toBeCloseTo(Math.PI / 4);
    expect(aimToward(100, 0, 1)).toBe(1);
    expect(aimToward(-100, 10, 1)).toBe(-1);
  });

  it("adds colours as levels climb", () => {
    expect(LEVEL_COLORS(1)).toEqual([RED, BLUE, YELLOW]);
    expect(LEVEL_COLORS(2)).toEqual([RED, BLUE, YELLOW, GREEN]);
    expect(LEVEL_COLORS(5)).toEqual([RED, BLUE, YELLOW, GREEN, ORANGE, PURPLE]);
  });

  it("fills more rows and drops the ceiling sooner at higher levels", () => {
    expect(fillRows(1)).toBe(3);
    expect(fillRows(9)).toBe(7);
    expect(fillRows(30)).toBe(7);
    expect(shotsPerDrop(1)).toBe(9);
    expect(shotsPerDrop(12)).toBe(5);
    expect(shotsPerDrop(40)).toBe(5);
  });

  it("weights the shot pool toward colours in play and keeps the primaries", () => {
    expect(shotPool([GREEN])).toEqual([GREEN, GREEN, RED, BLUE, YELLOW]);
  });

  it("scores pops and drops", () => {
    expect(popPoints(3, 3)).toBe(90);
    expect(popPoints(5, 3)).toBe(210);
    expect(dropBonus(0)).toBe(0);
    expect(dropBonus(3)).toBe(240);
  });
});
