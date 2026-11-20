import { describe, expect, it } from "vitest";
import { CHAIN_DECAY_FRAMES, COLD_CHAIN, coolChain, EMPTY_TALLY, GOAL_BONUS, heatChain, multiplier, REFINED_BONUS, scorePop, type GoalState } from "./scoring";

const noGoal: GoalState = { subtractGoal: 0, subtractDone: 0, goalAwarded: false };

describe("chain meter", () => {
  it("caps the multiplier at x5", () => {
    expect(multiplier(0)).toBe(1);
    expect(multiplier(1)).toBe(1);
    expect(multiplier(3)).toBe(3);
    expect(multiplier(9)).toBe(5);
  });

  it("heats on a pop and cools off over two and a half seconds, losing the chain when cold", () => {
    let s = heatChain(heatChain(COLD_CHAIN));
    expect(s).toEqual({ chain: 2, heat: 1 });
    for (let i = 0; i < CHAIN_DECAY_FRAMES - 1; i++) s = coolChain(s);
    expect(s.chain).toBe(2);
    expect(s.heat).toBeGreaterThan(0);
    s = coolChain(s);
    expect(s).toEqual(COLD_CHAIN);
    expect(coolChain(COLD_CHAIN)).toBe(COLD_CHAIN);
  });
});

describe("pop scoring", () => {
  it("multiplies the board's score by the chain and shows each group its value", () => {
    const r = scorePop(
      {
        score: 160,
        brickValue: 20,
        groups: [
          { size: 4, black: false, refined: false },
          { size: 4, black: false, refined: false },
        ],
      },
      { chain: 3, heat: 1 },
      noGoal,
      EMPTY_TALLY,
    );
    expect(r.mult).toBe(3);
    expect(r.gained).toBe(480);
    expect(r.groupValues).toEqual([240, 240]);
    expect(r.tally).toEqual({ pops: 160, chain: 320, subtract: 0 });
    expect(r.refinedGroups).toEqual([]);
    expect(r.goalJustDone).toBe(false);
  });

  it("a black-only pass scores nothing and leaves the multiplier alone", () => {
    const r = scorePop({ score: 0, brickValue: 20, groups: [{ size: 5, black: true, refined: true }] }, { chain: 4, heat: 1 }, noGoal, EMPTY_TALLY);
    expect(r.mult).toBe(1);
    expect(r.gained).toBe(0);
    expect(r.groupValues).toEqual([0]);
    expect(r.refinedGroups).toEqual([]);
  });

  it("refined groups earn a multiplied bonus and count toward the subtract goal, which pays once", () => {
    const goal: GoalState = { subtractGoal: 2, subtractDone: 1, goalAwarded: false };
    const r = scorePop({ score: 80, brickValue: 20, groups: [{ size: 4, black: false, refined: true }] }, { chain: 2, heat: 1 }, goal, EMPTY_TALLY);
    expect(r.refinedGroups).toEqual([0]);
    expect(r.refinedBonus).toBe(REFINED_BONUS * 2);
    expect(r.goal).toEqual({ subtractGoal: 2, subtractDone: 2, goalAwarded: true });
    expect(r.goalJustDone).toBe(true);
    expect(r.gained).toBe(160 + REFINED_BONUS * 2 + GOAL_BONUS);
    expect(r.tally.subtract).toBe(REFINED_BONUS * 2 + GOAL_BONUS);
    const again = scorePop({ score: 80, brickValue: 20, groups: [{ size: 4, black: false, refined: true }] }, { chain: 3, heat: 1 }, r.goal, r.tally);
    expect(again.goalJustDone).toBe(false);
    expect(again.gained).toBe(240 + REFINED_BONUS * 3);
    expect(again.goal.subtractDone).toBe(3);
  });

  it("a level without a goal never awards one", () => {
    const r = scorePop({ score: 80, brickValue: 20, groups: [{ size: 4, black: false, refined: true }] }, { chain: 1, heat: 1 }, noGoal, EMPTY_TALLY);
    expect(r.goal).toEqual({ ...noGoal, subtractDone: 1 });
    expect(r.goalJustDone).toBe(false);
  });
});
