import { BOARD_BLOCK_BASE, COMBO_REMAINING_BASE, REPLENISH_TIMER_BASE } from "./constants";

/**
 * Difficulty curve, ported from `board_populate.gml`.
 * `world` is 1..7 (world 0 is the tutorial) and `level` is 0..5.
 */
export interface LevelParams {
  /** Bricks placed on the board at the start of the level. */
  brickCount: number;
  /** Steps between replenish-line events. */
  replenishTimer: number;
  /** Number of group pops required to clear the level. */
  comboRemaining: number;
  /**
   * Bonus goal (not required to finish): pops of a group containing a brick
   * whose colour was reached by subtracting. Zero means no goal is shown.
   */
  subtractGoal: number;
}

export function levelParams(world: number, level: number): LevelParams {
  const brickCount = Math.floor(level / 2) + (world - 1) * 3 + BOARD_BLOCK_BASE;

  let replenishTimer: number;
  if (world >= 4) {
    replenishTimer = REPLENISH_TIMER_BASE - (world - 3) * 15 - 90;
  } else {
    replenishTimer = REPLENISH_TIMER_BASE - world * 30;
  }

  let comboRemaining = (world - 1) * 6 + COMBO_REMAINING_BASE;

  // The original used a fall-through switch: every case at or below the
  // current level applies.
  if (level >= 5) comboRemaining += 1;
  if (level >= 4) replenishTimer -= 15 / (2 - (world < 4 ? 1 : 0));
  if (level >= 3) comboRemaining += 1;
  if (level >= 1) comboRemaining += 1;

  // Bonus goal, not part of the GML curve: eases in during world 1 and grows
  // with the world, with one extra in the second half of each world.
  const subtractGoal = (world === 1 ? (level >= 3 ? 1 : 0) : Math.min(3, Math.ceil((world - 1) / 2))) + (world > 1 && level >= 3 ? 1 : 0);

  return { brickCount, replenishTimer, comboRemaining, subtractGoal };
}
