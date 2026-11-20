/**
 * The six hands-on tutorial exercises (`board_populate_tutorial.gml` and the
 * `TutorialText` object): what each one puts on the board, what the player
 * may do, and what it tells them.
 */
import { BLUE, COLOR_NAMES, GREEN, ORANGE, PURPLE, RED, YELLOW, type Color } from "./color";

export interface TutorialSpec {
  /** Colour of the three plain board bricks. */
  board: Color;
  /** Colour of the one brick the player is meant to change. */
  target: Color;
  /** The single brick on the replenish line. */
  replenish: Color;
  canAdd: boolean;
  canSubtract: boolean;
}

export const TUTORIAL_LEVELS: readonly TutorialSpec[] = [
  { board: GREEN, target: YELLOW, replenish: BLUE, canAdd: true, canSubtract: false },
  { board: ORANGE, target: YELLOW, replenish: RED, canAdd: true, canSubtract: false },
  { board: PURPLE, target: BLUE, replenish: RED, canAdd: true, canSubtract: false },
  { board: RED, target: ORANGE, replenish: YELLOW, canAdd: false, canSubtract: true },
  { board: YELLOW, target: GREEN, replenish: BLUE, canAdd: false, canSubtract: true },
  { board: RED, target: BLUE, replenish: PURPLE, canAdd: false, canSubtract: true },
];

/** The tutorial board: four cells, three of the board colour and the target last. */
export const TUTORIAL_CELLS = 4;

export function tutorialSpec(level: number): TutorialSpec {
  return TUTORIAL_LEVELS[level];
}

/** Colour of the brick at `index` on a fresh tutorial board. */
export function tutorialBrick(spec: TutorialSpec, index: number): Color {
  return index === TUTORIAL_CELLS - 1 ? spec.target : spec.board;
}

/** The last exercise only accepts the blue brick as a target; the others accept any. */
export function acceptsTarget(level: number, dest: Color | null): boolean {
  if (level !== TUTORIAL_LEVELS.length - 1) return true;
  return dest === null || dest === BLUE;
}

export type TutorialPrompt = "select" | "combine" | "done";

/** The caption for each stage of an exercise. */
export function tutorialText(spec: TutorialSpec, prompt: TutorialPrompt): string {
  switch (prompt) {
    case "select":
      return `To begin, please select the ${COLOR_NAMES[spec.replenish]}\nBlock from the Replenish Line.`;
    case "combine":
      return spec.canAdd
        ? `Now add the selected Block to the\n${COLOR_NAMES[spec.target]} Block on the Board.`
        : `Now subtract the selected Block from the\n${COLOR_NAMES[spec.target]} Block on the Board.`;
    case "done":
      return "Congratulations!";
  }
}
