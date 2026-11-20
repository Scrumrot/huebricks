/**
 * The replenish line's timer, ported from the STATE_REST block of the
 * `Board` step event: bricks arrive on a fixed period until the line is
 * full, then a shorter countdown runs before the line is pushed onto the
 * board. Pure state and steps; the scene owns the bricks themselves.
 */

export interface LineState {
  /** Sim steps between fills, from the level's difficulty curve. */
  timer: number;
  /** Progress through the current period, in sim steps. */
  line: number;
  /** Bricks on the line (kept in step with the board's replenish list). */
  num: number;
  /** The line is full and the push is counting down. */
  readyToPush: boolean;
}

/**
 * Once the line is full the push counts down for this fraction of a period.
 * The original waited a full period to arm the push and another to fire it;
 * this arms it at once and fires sooner.
 */
export const PUSH_COUNTDOWN = 0.6;

export function lineState(timer: number): LineState {
  return { timer, line: 0, num: 0, readyToPush: false };
}

/** Sim steps the push countdown lasts once the line is full. */
export function pushCountdown(s: LineState): number {
  return s.timer * PUSH_COUNTDOWN;
}

/** The period the line is currently running down: the push countdown or a fill. */
export function period(s: LineState): number {
  return s.readyToPush ? pushCountdown(s) : s.timer;
}

export type LineEvent = "spawn" | "fill" | "push";

export interface LineStep {
  state: LineState;
  /**
   * What the board must do this step, in order: "spawn" adds a brick quietly
   * (the first of a line), "fill" adds one with the fill sound, "push" sends
   * the line onto the board.
   */
  events: LineEvent[];
}

/**
 * One rest step. `lineLength` is the board's replenish list length going in
 * (the hold slot can take a brick out of it between steps); `accel` is the
 * hurry multiplier, 1 when the player is not holding the speed button.
 */
export function stepLine(s: LineState, cellNum: number, lineLength: number, accel: number): LineStep {
  const events: LineEvent[] = [];
  let line = s.line;
  let num = lineLength;
  let readyToPush = s.readyToPush;
  if (num === 0) {
    events.push("spawn");
    num += 1;
  }
  if (readyToPush) {
    if (line > pushCountdown(s)) {
      events.push("push");
      return { state: { ...s, line: 0, num: 0, readyToPush: false }, events };
    }
  } else if (line > s.timer) {
    if (num < cellNum) {
      events.push("fill");
      num += 1;
    }
    line = 0;
  }
  if (num >= cellNum && !readyToPush) {
    // The line is full: arm the push straight away.
    readyToPush = true;
    line = 0;
  }
  line += accel;
  return { state: { ...s, line, num, readyToPush }, events };
}

/**
 * The timer keeps running through board animations (the original froze it
 * behind a fast player's own moves), but never past the point where the
 * rest step would act, so spawning and pushing still wait for rest.
 */
export function tickThroughAnimation(s: LineState): LineState {
  return s.line < period(s) ? { ...s, line: s.line + 1 } : s;
}

/** The line after a scoring pop: the current fill rewinds unless a push is already counting down. */
export function rewindLine(s: LineState): LineState {
  return s.readyToPush ? s : { ...s, line: 0 };
}

/** The line after a brick left it for the board or the hold slot: a line that is no longer full stops counting down. */
export function lineShortened(s: LineState, lineLength: number, cellNum: number): LineState {
  return { ...s, num: lineLength, readyToPush: s.readyToPush && lineLength >= cellNum };
}

/** The line after a push: empty, with a fresh period. */
export function linePushed(s: LineState): LineState {
  return { ...s, line: 0, num: 0, readyToPush: false };
}

/** Overall progress toward the next push, 0..1, for the classic progress bar. */
export function lineProgress(s: LineState, cellNum: number): number {
  if (s.line === 0) return 0;
  return (s.num - 1 + (s.readyToPush ? 1 : 0)) / cellNum + s.line / period(s) / cellNum;
}

/** What the progress bar shows: the fill rising, or the countdown draining once the line is full. */
export function barFill(s: LineState, cellNum: number): number {
  return Math.max(0, s.readyToPush ? 1 - s.line / pushCountdown(s) : lineProgress(s, cellNum));
}

/** Fill of the next well, 0..1: nothing while a push is pending, eight steps when `stepped`. */
export function wellLevel(s: LineState, stepped = false): number {
  if (s.readyToPush) return 0;
  const smooth = Math.min(1, Math.max(0, s.line / s.timer));
  return stepped ? Math.floor(smooth * 8) / 8 : smooth;
}
