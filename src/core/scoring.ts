/**
 * What a pop is worth on top of the GML scoring: the chain meter, its
 * multiplier, the refined-brick bonus and the level's subtract goal. Pure
 * functions over small records; the scene turns the result into callouts,
 * toasts and sound.
 */
import { FPS } from "./constants";

// ---------------------------------------------------------------------------
// Chain meter
// ---------------------------------------------------------------------------

export interface ChainState {
  /** Scoring pops since the meter last cooled off. */
  chain: number;
  /** 1 right after a pop, cooling to 0 at rest. */
  heat: number;
}

/** Frames at rest before a chain cools off completely. */
export const CHAIN_DECAY_FRAMES = FPS * 2.5;
export const MAX_MULTIPLIER = 5;

export const COLD_CHAIN: ChainState = { chain: 0, heat: 0 };

export function multiplier(chain: number): number {
  return Math.max(1, Math.min(MAX_MULTIPLIER, chain));
}

/** The meter after a scoring pop: one link longer and fully hot. */
export function heatChain(s: ChainState): ChainState {
  return { chain: s.chain + 1, heat: 1 };
}

/** The meter after one rest step: cools a little, and the chain is lost once it is cold. */
export function coolChain(s: ChainState): ChainState {
  if (s.heat <= 0) return s;
  const heat = s.heat - 1 / CHAIN_DECAY_FRAMES;
  // a hair above zero: 75 steps of 1/75 land a rounding error short of it
  return heat <= 1e-9 ? COLD_CHAIN : { chain: s.chain, heat };
}

// ---------------------------------------------------------------------------
// Pop scoring
// ---------------------------------------------------------------------------

/** Bonus for popping a group that contains a refined (subtracted) brick. */
export const REFINED_BONUS = 150;
/** One-time bonus for completing the level's subtract goal. */
export const GOAL_BONUS = 500;

/** A popped group as the scoring sees it. */
export interface PoppedGroup {
  size: number;
  /** Black groups score nothing and earn no bonus. */
  black: boolean;
  /** Some brick in the group reached its colour by subtracting. */
  refined: boolean;
}

export interface GoalState {
  /** Subtract pops the level asks for; 0 when it has no goal. */
  subtractGoal: number;
  subtractDone: number;
  goalAwarded: boolean;
}

/** Where a level's points came from, for the level-complete breakdown. */
export interface Tally {
  pops: number;
  chain: number;
  subtract: number;
}

export const EMPTY_TALLY: Tally = { pops: 0, chain: 0, subtract: 0 };

export interface PopScore {
  /** The multiplier the pass was scored at. */
  mult: number;
  /** Points added to the session score. */
  gained: number;
  /** The level tally after this pop. */
  tally: Tally;
  /** Value shown over each group (0 for black groups). */
  groupValues: number[];
  /** Indexes of the groups that earned the refined bonus, each worth `refinedBonus`. */
  refinedGroups: number[];
  refinedBonus: number;
  goal: GoalState;
  /** The subtract goal was completed by this pop. */
  goalJustDone: boolean;
}

/**
 * Score one pass of pops. `score` and `brickValue` come from the board's own
 * GML scoring; `chain` is the meter after `heatChain` when the pass scores
 * (a non-scoring pass, all black, keeps the multiplier at 1).
 */
export function scorePop(pass: { score: number; brickValue: number; groups: PoppedGroup[] }, chain: ChainState, goal: GoalState, tally: Tally): PopScore {
  const scoring = pass.score !== 0;
  const mult = scoring ? multiplier(chain.chain) : 1;
  const groupValues = pass.groups.map((g) => (g.black ? 0 : pass.brickValue * mult * g.size));
  let gained = pass.score * mult;
  const next: Tally = { pops: tally.pops + pass.score, chain: tally.chain + pass.score * (mult - 1), subtract: tally.subtract };
  const refinedGroups: number[] = [];
  const refinedBonus = REFINED_BONUS * mult;
  let g = goal;
  let goalJustDone = false;
  if (scoring) {
    pass.groups.forEach((grp, i) => {
      if (grp.black || !grp.refined) return;
      refinedGroups.push(i);
      gained += refinedBonus;
      next.subtract += refinedBonus;
    });
    if (refinedGroups.length > 0) g = { ...g, subtractDone: g.subtractDone + refinedGroups.length };
    if (g.subtractGoal > 0 && !g.goalAwarded && g.subtractDone >= g.subtractGoal) {
      g = { ...g, goalAwarded: true };
      goalJustDone = true;
      gained += GOAL_BONUS;
      next.subtract += GOAL_BONUS;
    }
  }
  return { mult, gained, tally: next, groupValues, refinedGroups, refinedBonus, goal: g, goalJustDone };
}
