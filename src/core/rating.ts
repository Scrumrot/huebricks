/**
 * The star rating on the level-complete card. One star for clearing the
 * level, one for reaching a x3 chain, and one for the level's subtract goal
 * (or, on levels without one, for a full x5 chain).
 */
export interface LevelRun {
  /** Highest multiplier reached during the level. */
  bestChain: number;
  /** Subtract pops the level asked for (0 when it had no goal). */
  subtractGoal: number;
  goalDone: boolean;
}

export const MAX_STARS = 3;

export function levelStars(run: LevelRun): number {
  const chain = run.bestChain >= 3 ? 1 : 0;
  const third = run.subtractGoal > 0 ? (run.goalDone ? 1 : 0) : run.bestChain >= 5 ? 1 : 0;
  return 1 + chain + third;
}

/** Why the third star was or was not earned, for the card's caption. */
export function thirdStarHint(run: LevelRun): string {
  if (run.subtractGoal > 0) return run.goalDone ? "Subtract goal done" : "Subtract goal missed";
  return run.bestChain >= 5 ? "Chain x5 reached" : "Chain x5 for the last star";
}
