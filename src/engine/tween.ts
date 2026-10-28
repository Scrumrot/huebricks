import { clamp01, easeOutCubic, type Ease } from "./easing";

/** Any object with numeric fields that tweens may drive. */
export type TweenTarget = object;
/** The numeric fields of `T`. */
type NumericProps<T> = { [K in keyof T]?: T[K] extends number ? number : never };
type Fields = Record<string, number>;

interface Tween {
  obj: Fields;
  key: string;
  from: number;
  to: number;
  t0: number;
  dur: number;
  ease: Ease;
  onDone: (() => void) | null;
  started: boolean;
}

export interface TweenOptions {
  delay?: number;
  onDone?: () => void;
}

/**
 * Minimal real-time tween manager. Tweens run on game time (see `Clock`) in
 * the render loop, so the fixed-step simulation only ever sets targets and
 * the feel layer decides how things get there.
 *
 * Starting a tween on a field cancels any tween already driving that field.
 */
export class Tweens {
  private list: Tween[] = [];
  private time = 0;

  get count(): number {
    return this.list.length;
  }

  /** Tween every field in `props` from its current value to the given one. */
  to<T extends TweenTarget>(obj: T, props: NumericProps<T>, dur: number, ease: Ease = easeOutCubic, opts: TweenOptions = {}): void {
    const o = obj as unknown as Fields;
    const t0 = this.time + (opts.delay ?? 0);
    let first = true;
    for (const key in props) {
      const to = (props as Fields)[key];
      if (to === undefined) continue;
      this.cancel(obj, key);
      this.list.push({ obj: o, key, from: o[key], to, t0, dur, ease, onDone: first ? (opts.onDone ?? null) : null, started: false });
      first = false;
    }
  }

  /** Set a field now, cancelling any tween on it. */
  set<T extends TweenTarget>(obj: T, props: NumericProps<T>): void {
    const o = obj as unknown as Fields;
    for (const key in props) {
      const v = (props as Fields)[key];
      if (v === undefined) continue;
      this.cancel(obj, key);
      o[key] = v;
    }
  }

  cancel(obj: TweenTarget, key?: string): void {
    const o = obj as unknown as Fields;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const tw = this.list[i];
      if (tw.obj === o && (key === undefined || tw.key === key)) this.list.splice(i, 1);
    }
  }

  clear(): void {
    this.list.length = 0;
  }

  /** Advance to game time `t` (ms). */
  update(t: number): void {
    this.time = t;
    for (let i = 0; i < this.list.length; i++) {
      const tw = this.list[i];
      if (t < tw.t0) continue;
      if (!tw.started) {
        // Re-read the start value when a delayed tween actually begins.
        tw.started = true;
        tw.from = tw.obj[tw.key];
      }
      const p = tw.dur <= 0 ? 1 : clamp01((t - tw.t0) / tw.dur);
      tw.obj[tw.key] = tw.from + (tw.to - tw.from) * tw.ease(p);
      if (p >= 1) {
        this.list.splice(i, 1);
        i--;
        tw.onDone?.();
      }
    }
  }
}
