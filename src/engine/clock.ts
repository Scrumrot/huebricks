/**
 * Frame clock shared by the fixed-step simulation and the real-time feel
 * layer.
 *
 * `now` is wall time; `t` is game time, which stops during a hit-stop so
 * tweens, particles and the simulation all freeze together while audio keeps
 * playing. `alpha` is how far the renderer is between the last two
 * simulation steps, for interpolating sim-driven motion.
 */
export class Clock {
  /** Wall-clock ms at the start of this frame. */
  now = 0;
  /** Game-time ms; pauses while frozen. */
  t = 0;
  /** Game-time ms elapsed since the previous frame (0 while frozen). */
  dt = 0;
  /** Interpolation factor between the previous and current sim step, 0..1. */
  alpha = 0;
  private freezeUntil = 0;
  private slowUntil = 0;
  private slowScale = 1;

  get frozen(): boolean {
    return this.now < this.freezeUntil;
  }

  /** Stop game time for `ms` wall milliseconds (a hit-stop). */
  freeze(ms: number): void {
    this.freezeUntil = Math.max(this.freezeUntil, this.now + ms);
  }

  /** Run game time at `scale` for `ms` wall milliseconds (a slow-motion beat). */
  slow(scale: number, ms: number): void {
    this.slowScale = Math.max(0.05, Math.min(1, scale));
    this.slowUntil = Math.max(this.slowUntil, this.now + ms);
  }

  /** Game ms per wall ms right now: 0 frozen, under 1 in slow motion. */
  get timeScale(): number {
    if (this.frozen) return 0;
    return this.now < this.slowUntil ? this.slowScale : 1;
  }

  /** Called once per animation frame before anything else. */
  advance(now: number): void {
    const wallDt = this.now === 0 ? 0 : Math.min(100, now - this.now);
    this.now = now;
    this.dt = wallDt * this.timeScale;
    this.t += this.dt;
  }
}
