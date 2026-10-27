import { describe, expect, it } from "vitest";
import { levelParams } from "./level";

describe("levelParams", () => {
  it("matches the GML values for world 1", () => {
    expect(levelParams(1, 0)).toEqual({ brickCount: 13, replenishTimer: 150, comboRemaining: 10, subtractGoal: 0 });
    expect(levelParams(1, 1)).toEqual({ brickCount: 13, replenishTimer: 150, comboRemaining: 11, subtractGoal: 0 });
    expect(levelParams(1, 3)).toEqual({ brickCount: 14, replenishTimer: 150, comboRemaining: 12, subtractGoal: 1 });
    expect(levelParams(1, 4)).toEqual({ brickCount: 15, replenishTimer: 135, comboRemaining: 12, subtractGoal: 1 });
    expect(levelParams(1, 5)).toEqual({ brickCount: 15, replenishTimer: 135, comboRemaining: 13, subtractGoal: 1 });
  });

  it("uses the faster curve from world 4 onward", () => {
    expect(levelParams(3, 0).replenishTimer).toBe(90);
    expect(levelParams(4, 0).replenishTimer).toBe(75);
    expect(levelParams(4, 4).replenishTimer).toBe(67.5);
    expect(levelParams(7, 0).replenishTimer).toBe(30);
    expect(levelParams(7, 0).brickCount).toBe(31);
    expect(levelParams(7, 5).comboRemaining).toBe(49);
  });

  it("grows the subtract bonus goal with the world", () => {
    expect(levelParams(2, 0).subtractGoal).toBe(1);
    expect(levelParams(3, 3).subtractGoal).toBe(2);
    expect(levelParams(4, 0).subtractGoal).toBe(2);
    expect(levelParams(6, 0).subtractGoal).toBe(3);
    expect(levelParams(7, 5).subtractGoal).toBe(4);
  });
});
