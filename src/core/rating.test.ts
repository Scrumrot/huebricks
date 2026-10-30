import { describe, expect, it } from "vitest";
import { levelStars, thirdStarHint } from "./rating";

describe("level stars", () => {
  it("always gives one for clearing, one for a x3 chain and one for the subtract goal", () => {
    expect(levelStars({ bestChain: 1, subtractGoal: 1, goalDone: false })).toBe(1);
    expect(levelStars({ bestChain: 3, subtractGoal: 1, goalDone: false })).toBe(2);
    expect(levelStars({ bestChain: 2, subtractGoal: 2, goalDone: true })).toBe(2);
    expect(levelStars({ bestChain: 4, subtractGoal: 2, goalDone: true })).toBe(3);
  });

  it("asks for a x5 chain instead on levels without a subtract goal", () => {
    expect(levelStars({ bestChain: 3, subtractGoal: 0, goalDone: false })).toBe(2);
    expect(levelStars({ bestChain: 5, subtractGoal: 0, goalDone: false })).toBe(3);
    expect(thirdStarHint({ bestChain: 3, subtractGoal: 0, goalDone: false })).toMatch(/x5/);
    expect(thirdStarHint({ bestChain: 3, subtractGoal: 1, goalDone: true })).toBe("Subtract goal done");
  });
});
