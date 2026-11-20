/**
 * Every duration the playing scene and its brick view share, in ms of game
 * time, plus the playback-rate helpers that turn them into sim steps.
 */
import { FPS } from "../../core/constants";
import { backOut } from "../../engine/easing";

/**
 * Playback rate of the feel layer relative to the durations below. 1 is the
 * tuned feel; higher is snappier.
 */
export const ANIM_SPEED = 1;
export const STEP_MS = 1000 / FPS;
/** Duration in ms after the playback rate. */
export const D = (ms: number): number => ms / ANIM_SPEED;
/** Sim steps that cover `ms` of real time. */
export const frames = (ms: number): number => Math.max(1, Math.round(D(ms) / STEP_MS));

/** Fall acceleration, px per sim step squared (the GML 1.7, sped up). */
export const GRAVITY = 2.7 * ANIM_SPEED;

export const PICK_MS = 90;
export const DIM_MS = 120;
export const WIPE_MS = 160;
export const RING_MS = 220;
export const NOADD_MS = 260;
export const POP_GROW_MS = 70;
export const POP_HOLD_MS = 30;
export const POP_SHRINK_MS = 140;
export const POP_STAGGER_MS = 20;
export const POP_TOTAL_MS = POP_GROW_MS + POP_HOLD_MS + POP_SHRINK_MS;
export const SHOCK_MS = 300;
export const SCORE_MS = 600;
export const LAND_SQUASH_MS = 60;
/** Tube brightness per 40 ms step after a landing: dark, hot, dark, bright, settle. */
export const LAND_FLICKER = [0.3, 1.3, 0.45, 1.15, 0.85, 1] as const;
export const LAND_SETTLE_MS = 160;
export const ROTATE_ANTICIPATE_MS = 60;
export const ROTATE_MS = 260;
export const PUSH_ANTICIPATE_MS = 110;
export const PUSH_MS = 220;
export const FADE_MS = 180;
/** The HUD slides in from its edge over this long when a level opens (generated themes). */
export const ARRIVE_MS = 420;
export const COUNT_MS = 500;
export const DESAT_MS = 400;
export const BREATHE_MS = 1400;
/** Period of the group preview's shared breath. */
export const PREVIEW_MS = 720;
/** Idle breathing of resting bricks: cycle length and amplitude (logical px). */
export const IDLE_MS = 2600;
export const IDLE_AMP = 0.9;
/** How long the backdrop and particles celebrate a level clear. */
export const FLARE_MS = 1800;
/** How long a toast chip stays at the top of the board. */
export const TOAST_MS = 2000;
/** Sim steps the level-complete card waits while the celebration plays. */
export const CARD_HOLD_FRAMES = 18;

export const ROTATE_FRAMES = frames(ROTATE_ANTICIPATE_MS + ROTATE_MS);
export const PUSH_FRAMES = frames(PUSH_ANTICIPATE_MS + PUSH_MS);
export const LEVEL_CARD_FRAMES = frames(2800);

/** `selected` value meaning "the brick in the hold slot". */
export const HOLD = -1;
/** Upcoming replenish colours shown as ghosts in the empty slots. */
export const PREVIEW_COUNT = 3;

export const DEG = Math.PI / 180;
export const ROTATE_EASE = backOut(0.95);
export const PUSH_EASE = backOut(0.6);
