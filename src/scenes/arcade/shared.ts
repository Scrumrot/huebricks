import type { Color } from "../../core/color";
import { clamp01, easeInBack, easeOutBack } from "../../engine/easing";

/** Per-cell feel-layer state for the well modes. */
export interface CellFx {
  /** Draw offset in cells (negative while falling in from above). */
  dy: number;
  s: number;
  /** Vertical squash on landing. */
  sy: number;
  /** Old colour and when its wipe began, or -1. */
  wipeFrom: Color | -1;
  wipeT0: number;
}

/** A popping tile: grows, holds, then shrinks away with a little spin. */
export interface Dying {
  x: number;
  y: number;
  color: Color;
  t0: number;
  burst: boolean;
  spin: number;
  /** Drawn as a stain blob rather than a square. */
  blob?: boolean;
  /** Moment size 0..1 for the burst. */
  k?: number;
}

export const POP_GROW_MS = 70;
export const POP_HOLD_MS = 30;
export const POP_SHRINK_MS = 140;
export const POP_BURST_MS = POP_GROW_MS + POP_HOLD_MS;
export const DYING_MS = POP_GROW_MS + POP_HOLD_MS + POP_SHRINK_MS;
export const FALL_MS = 190;

export function dyingScale(e: number, spin: number): { s: number; rot: number; alpha: number } {
  if (e < POP_GROW_MS) return { s: 1 + 0.15 * easeOutBack(e / POP_GROW_MS), rot: 0, alpha: 1 };
  if (e < POP_BURST_MS) return { s: 1.15, rot: 0, alpha: 1 };
  const q = clamp01((e - POP_BURST_MS) / POP_SHRINK_MS);
  return { s: 1.15 * (1 - easeInBack(q)), rot: spin * q * 0.5, alpha: 1 - q * 0.5 };
}

/**
 * Delayed auto-shift for held inputs: the first press fires at once, holding
 * repeats after a short delay. Keys and on-screen buttons both use it.
 */
export class Repeater {
  private readonly held = new Map<string, number>();
  private readonly holdFrames = new Map<string, number>();
  readonly delay: number;
  readonly rate: number;

  constructor(delay = 8, rate = 3) {
    this.delay = delay;
    this.rate = rate;
  }

  /** Feed a key's held state each step; true when a move should happen. */
  step(id: string, down: boolean): boolean {
    if (!down) {
      this.held.delete(id);
      return false;
    }
    const n = this.held.get(id) ?? -1;
    this.held.set(id, n + 1);
    if (n < 0) return true;
    return n >= this.delay && (n - this.delay) % this.rate === 0;
  }

  /** For on-screen buttons reported every step while held: true when a repeat is due. */
  repeat(id: string): boolean {
    const n = (this.held.get(id) ?? 0) + 1;
    this.held.set(id, n);
    this.holdFrames.set(id, 2);
    return n >= this.delay && (n - this.delay) % this.rate === 0;
  }

  /** Mark a button as held this step (for continuous actions like soft drop). */
  hold(id: string): void {
    this.holdFrames.set(id, 2);
  }

  active(id: string): boolean {
    return (this.holdFrames.get(id) ?? 0) > 0;
  }

  /** Call once per step: buttons not reported this step stop repeating. */
  decay(): void {
    for (const [id, n] of this.holdFrames) {
      if (n <= 1) {
        this.holdFrames.delete(id);
        this.held.delete(id);
      } else this.holdFrames.set(id, n - 1);
    }
  }
}
