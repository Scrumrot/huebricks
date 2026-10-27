import type { Color } from "./color";

let nextId = 1;

/**
 * A single brick, either on the board grid or waiting in the replenish line.
 * Ported from the `Brick` object. Logical position (`x`, `y`) is the target
 * screen position; `spriteX`/`spriteY` is where it is currently drawn while
 * animating toward the target.
 */
export class Brick {
  readonly id = nextId++;

  color: Color;
  /** Colour currently drawn; lags `color` during the combine animation. */
  spriteColor: Color;
  /** Counts down from `TWEEN_FRAMES` during the combine animation. */
  colorTween = Brick.TWEEN_FRAMES;

  gridX = -1;
  gridY = -1;

  x = 0;
  y = 0;
  spriteX = 0;
  spriteY = 0;

  /** Bricks of the same colour connected to this one (including itself). */
  group: Brick[] = [this];

  // --- animation flags, each owned by one animation state ---
  pushDelay = 0;
  pushing = false;
  enterDelay = 0;
  enter = false;
  fall = false;
  rotate = false;
  noadd = false;
  noaddTimer = 0;
  grav = 0;

  /**
   * True when the last combine took colour away from this brick (its colour
   * was reached by subtracting). Popping a group with a refined brick counts
   * toward the level's subtract goal. Cleared again when colour is added.
   */
  refined = false;

  /** Replenish bricks scale in over one replenish period. */
  inactiveTimer = 0;
  inactiveDuration = 0;

  /** Number of frames in the colour "expand" sprites. */
  static readonly TWEEN_FRAMES = 5;
  static readonly NOADD_DURATION = 25;

  constructor(color: Color, x = 0, y = 0) {
    this.color = color;
    this.spriteColor = color;
    this.x = x;
    this.y = y;
    this.spriteX = x;
    this.spriteY = y;
  }

  /** Snap the drawn position/colour to the logical state. */
  settle(): void {
    this.spriteX = this.x;
    this.spriteY = this.y;
    this.spriteColor = this.color;
    this.colorTween = Brick.TWEEN_FRAMES;
    this.grav = 0;
  }
}
