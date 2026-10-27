/**
 * Global constants ported from `global_initialize.gml`.
 *
 * The original game ran at a fixed 30 steps per second in a 760 x 506.67
 * room (3:2). All timings below are expressed in steps (frames).
 */

export const FPS = 30;
export const SCREEN_RATIO = 1.5;
export const SCREEN_W = 760;
export const SCREEN_H = SCREEN_W / SCREEN_RATIO;

/** Default board size (cells per side). The tutorial uses 4. */
export const DEFAULT_CELL_NUM = 7;

export type GameType = "normal" | "puzzle" | "zen";

/** Minimum bricks on a fresh board, before world/level bonuses. */
export const BOARD_BLOCK_BASE = 13;
/** Steps between replenish-line fills, before world/level reductions. */
export const REPLENISH_TIMER_BASE = 180;
/** Groups to pop to clear a level, before world/level additions. */
export const COMBO_REMAINING_BASE = 10;

export const MAX_WORLD = 7;
export const LEVELS_PER_WORLD = 6;

/** Title-screen button metrics from the original (BTN_W / BTN_H). */
export const BTN_W = SCREEN_W / 3;
export const BTN_H = BTN_W / 2;

/** How long "Level Complete!" is shown before the next level starts. */
export const LEVEL_COMPLETE_DELAY = 150;
