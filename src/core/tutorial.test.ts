import { describe, expect, it } from "vitest";
import { BLUE, combineColors, GREEN, RED, YELLOW } from "./color";
import { acceptsTarget, TUTORIAL_CELLS, TUTORIAL_LEVELS, tutorialBrick, tutorialSpec, tutorialText } from "./tutorial";

describe("tutorial exercises", () => {
  it("every exercise can be solved with the move it allows", () => {
    for (const spec of TUTORIAL_LEVELS) {
      expect(combineColors(spec.replenish, spec.target, spec.canAdd, spec.canSubtract)).not.toBeNull();
      expect(spec.canAdd).not.toBe(spec.canSubtract);
    }
  });

  it("lays out three plain bricks and the target last", () => {
    const spec = tutorialSpec(0);
    const cells = Array.from({ length: TUTORIAL_CELLS }, (_, i) => tutorialBrick(spec, i));
    expect(cells).toEqual([GREEN, GREEN, GREEN, YELLOW]);
  });

  it("only the last exercise is picky about its target", () => {
    expect(acceptsTarget(0, RED)).toBe(true);
    expect(acceptsTarget(5, RED)).toBe(false);
    expect(acceptsTarget(5, BLUE)).toBe(true);
    expect(acceptsTarget(5, null)).toBe(true);
  });

  it("captions name the colours and say add or subtract", () => {
    expect(tutorialText(tutorialSpec(0), "select")).toContain("Blue");
    expect(tutorialText(tutorialSpec(0), "combine")).toMatch(/^Now add .*\nYellow/);
    expect(tutorialText(tutorialSpec(3), "combine")).toMatch(/^Now subtract .*\nOrange/);
    expect(tutorialText(tutorialSpec(3), "done")).toBe("Congratulations!");
  });
});
