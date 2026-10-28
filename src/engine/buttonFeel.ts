import { easeOutBack, easeOutCubic } from "./easing";
import type { Tweens } from "./tween";

interface ButtonState {
  s: number;
  hover: boolean;
  down: boolean;
}

/**
 * Press / release / hover scale for any button, keyed by id. Press squeezes
 * to 0.94 in 60 ms, release springs back with an overshoot in 160 ms, and
 * hovering on desktop rests at 1.03.
 */
export class ButtonFeel {
  private readonly states = new Map<string, ButtonState>();

  constructor(private readonly tweens: Tweens) {}

  /** Feed this frame's hover / pressed flags and get the scale to draw at. */
  scale(id: string, hover: boolean, down: boolean): number {
    let st = this.states.get(id);
    if (!st) {
      st = { s: 1, hover: false, down: false };
      this.states.set(id, st);
    }
    const restScale = hover ? 1.03 : 1;
    if (down && !st.down) {
      this.tweens.to(st, { s: 0.94 }, 60, easeOutCubic);
    } else if (!down && st.down) {
      this.tweens.to(st, { s: restScale }, 160, easeOutBack);
    } else if (!down && hover !== st.hover) {
      this.tweens.to(st, { s: restScale }, 120, easeOutCubic);
    }
    st.hover = hover;
    st.down = down;
    return st.s;
  }
}
