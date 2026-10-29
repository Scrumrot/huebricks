import { BLUE, GREEN, ORANGE, type Color } from "./color";

/**
 * The arcade cabinet: self-contained score-attack modes that borrow the
 * HueBricks colour rules (see `color.ts`) but play on their own boards.
 */
export type ArcadeMode = "bobble" | "drhue" | "trist";

export interface ArcadeInfo {
  id: ArcadeMode;
  name: string;
  /** One line under the name on the arcade grid. */
  tagline: string;
  /** How to play, shown on the mode's first-run card and the pause card. */
  rules: string[];
  /** Brick colour that stands for the mode on its tile. */
  color: Color;
  /** Keyboard hints on the pause card. */
  keys: string;
}

export const ARCADE_MODES: readonly ArcadeInfo[] = [
  {
    id: "bobble",
    name: "Hue Bobble",
    tagline: "Aim, shoot, mix, pop",
    rules: [
      "Shoot bubbles up into the cluster.",
      "A shot that can mix with the bubble it hits mixes in and changes its colour.",
      "A shot that cannot mix sticks beside it.",
      "Three or more of one colour pop, and anything left hanging falls for a bonus.",
      "Lose when the cluster reaches the line.",
    ],
    color: BLUE,
    keys: "Move the mouse to aim  ·  Click / Space to shoot  ·  ← → nudge",
  },
  {
    id: "drhue",
    name: "Dr. Hue",
    tagline: "Clear every stain",
    rules: [
      "Dominoes fall from the top; move and rotate them.",
      "A half that lands on a stain mixes into it, which is how you recolour one you cannot reach.",
      "Four in a line of one colour, stains included, clears.",
      "Clear every stain to finish the level.",
      "Lose when the well fills to the top.",
    ],
    color: ORANGE,
    keys: "← → move  ·  ↑ / Z / X rotate  ·  ↓ soft drop  ·  Space hard drop",
  },
  {
    id: "trist",
    name: "Hue Trist",
    tagline: "Stack, mix, cascade",
    rules: [
      "One brick falls at a time down a narrow well; steer it.",
      "Land on a brick it can mix with and the two become one new colour.",
      "Land anywhere else and it stacks.",
      "Four or more touching of one colour pop; the stack falls and can chain.",
      "Bricks fall faster as you go. Lose when the well fills to the top.",
    ],
    color: GREEN,
    keys: "← → move  ·  ↓ soft drop  ·  Space hard drop",
  },
];

export function arcadeInfo(id: ArcadeMode): ArcadeInfo {
  return ARCADE_MODES.find((m) => m.id === id) ?? ARCADE_MODES[0];
}
