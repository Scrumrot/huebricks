import { BOUNCE_SLIDE, landOn, type SolidTop } from "./collide";
/**
 * Pooled particle system for pops and dust. Fixed capacity, typed-array
 * storage, no allocation while running. Positions are in logical screen
 * units; velocities in units per second.
 */
import { colorRamp } from "./colorUtil";

/** 0 fleck, 1 dot, 2 extruded cube, 3 paint splat, 4 sprinkle, 5 bat, 6 shard, 7 snowflake, 8 leaf, 9 spark. */
export type ParticleShape = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/** Ramp steps; the index for a particle at `k` of its life remaining (1 -> 0). */
export const RAMP_STEPS = 8;
export const rampIndex = (k: number): number => Math.min(RAMP_STEPS - 1, Math.max(0, Math.floor((1 - k) * RAMP_STEPS)));

/** How long a stretched particle is drawn for its speed: 1 at rest, growing with `stretch`. */
export const stretchFor = (speed: number, stretch: number): number => 1 + (stretch * speed) / 300;

export interface SpawnOptions {
  /** Outward speed range (units/s). */
  speed: [number, number];
  /** Side length / diameter range. */
  size: [number, number];
  /** Lifetime range (ms). */
  life: [number, number];
  /** Downward acceleration (units/s^2). */
  gravity?: number;
  /** Fraction of velocity kept per second (1 = none). */
  drag?: number;
  /** Centre direction in radians; omit for a full circle. */
  dir?: number;
  /** Half-angle around `dir`. */
  spread?: number;
  shape?: ParticleShape;
  /** Randomness applied to speed, 0..1. */
  jitter?: number;
  /** Side-face colours for cubes, parallel to `colors`. */
  sides?: readonly string[];
  /** Start colour: particles spawn this hot and cool to their own colour, then darken as they die. */
  hot?: string;
  /** Elongate flecks, dots and sparks along their velocity (0 = none; 1 doubles the length at 300 units/s). */
  stretch?: number;
  /** Spawn anywhere in a box this wide and tall around the centre instead of at a point. */
  area?: [number, number];
}

export class Particles {
  readonly cap: number;
  /** When set, square particles draw on this grid in two sizes, for pixel themes. */
  snap = 0;
  private n = 0;
  private readonly x: Float32Array;
  private readonly y: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly life: Float32Array;
  private readonly max: Float32Array;
  private readonly size: Float32Array;
  private readonly rot: Float32Array;
  private readonly vr: Float32Array;
  private readonly grav: Float32Array;
  private readonly drag: Float32Array;
  private readonly shape: Uint8Array;
  private readonly stretch: Float32Array;
  private readonly color: string[];
  private readonly side: string[];
  private readonly ramp: Array<readonly string[] | null>;

  constructor(cap = 400) {
    this.cap = cap;
    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.vy = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.max = new Float32Array(cap);
    this.size = new Float32Array(cap);
    this.rot = new Float32Array(cap);
    this.vr = new Float32Array(cap);
    this.grav = new Float32Array(cap);
    this.drag = new Float32Array(cap);
    this.shape = new Uint8Array(cap);
    this.stretch = new Float32Array(cap);
    this.color = new Array<string>(cap).fill("");
    this.side = new Array<string>(cap).fill("");
    this.ramp = new Array<readonly string[] | null>(cap).fill(null);
  }

  get count(): number {
    return this.n;
  }

  clear(): void {
    this.n = 0;
  }

  spawn(cx: number, cy: number, count: number, colors: readonly string[], o: SpawnOptions): void {
    const jitter = o.jitter ?? 0.3;
    for (let k = 0; k < count; k++) {
      if (this.n >= this.cap) return;
      const i = this.n++;
      const a = o.dir === undefined ? Math.random() * Math.PI * 2 : o.dir + (Math.random() * 2 - 1) * (o.spread ?? Math.PI);
      const speed = (o.speed[0] + Math.random() * (o.speed[1] - o.speed[0])) * (1 + (Math.random() * 2 - 1) * jitter);
      this.x[i] = cx + (o.area ? (Math.random() - 0.5) * o.area[0] : 0);
      this.y[i] = cy + (o.area ? (Math.random() - 0.5) * o.area[1] : 0);
      this.vx[i] = Math.cos(a) * speed;
      this.vy[i] = Math.sin(a) * speed;
      this.max[i] = o.life[0] + Math.random() * (o.life[1] - o.life[0]);
      this.life[i] = this.max[i];
      this.size[i] = o.size[0] + Math.random() * (o.size[1] - o.size[0]);
      this.rot[i] = Math.random() * Math.PI;
      this.vr[i] = (Math.random() * 2 - 1) * 8;
      this.grav[i] = o.gravity ?? 900;
      this.drag[i] = o.drag ?? 0.15;
      this.shape[i] = o.shape ?? 0;
      this.stretch[i] = o.stretch ?? 0;
      const ci = Math.floor(Math.random() * colors.length);
      this.color[i] = colors[ci];
      this.side[i] = o.sides?.[ci] ?? colors[ci];
      this.ramp[i] = o.hot ? colorRamp(o.hot, colors[ci], RAMP_STEPS) : null;
    }
  }

  /** Advance by `dt` game milliseconds; particles land on whatever `solid` reports under them. */
  update(dt: number, solid: SolidTop | null = null): void {
    if (dt <= 0 || this.n === 0) return;
    const s = dt / 1000;
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.swapRemove(i);
        i--;
        continue;
      }
      const keep = Math.pow(this.drag[i], s);
      this.vx[i] *= keep;
      this.vy[i] = this.vy[i] * keep + this.grav[i] * s;
      this.x[i] += this.vx[i] * s;
      const yPrev = this.y[i];
      this.y[i] += this.vy[i] * s;
      this.rot[i] += this.vr[i] * s;
      const hit = solid && landOn(solid, this.x[i], yPrev, this.y[i], this.vy[i]);
      if (hit) {
        this.y[i] = hit.y;
        this.vy[i] = hit.vy;
        this.vx[i] *= BOUNCE_SLIDE;
        this.vr[i] *= 0.6;
      }
    }
  }

  private swapRemove(i: number): void {
    const last = --this.n;
    if (i === last) return;
    this.x[i] = this.x[last];
    this.y[i] = this.y[last];
    this.vx[i] = this.vx[last];
    this.vy[i] = this.vy[last];
    this.life[i] = this.life[last];
    this.max[i] = this.max[last];
    this.size[i] = this.size[last];
    this.rot[i] = this.rot[last];
    this.vr[i] = this.vr[last];
    this.grav[i] = this.grav[last];
    this.drag[i] = this.drag[last];
    this.shape[i] = this.shape[last];
    this.stretch[i] = this.stretch[last];
    this.color[i] = this.color[last];
    this.side[i] = this.side[last];
    this.ramp[i] = this.ramp[last];
  }

  render(g: CanvasRenderingContext2D): void {
    if (this.n === 0) return;
    g.save();
    for (let i = 0; i < this.n; i++) {
      const k = this.life[i] / this.max[i]; // 1 -> 0
      const fade = k < 0.4 ? k / 0.4 : 1;
      const s = this.size[i] * (0.35 + 0.65 * k);
      g.globalAlpha = fade;
      const ramp = this.ramp[i];
      g.fillStyle = ramp ? ramp[rampIndex(k)] : this.color[i];
      const shape = this.shape[i];
      const stretched = this.stretch[i] > 0 && (shape === 0 || shape === 1 || shape === 9);
      if (this.snap > 0 && shape === 0) {
        const q = this.snap;
        const px = Math.round(this.x[i] / q) * q;
        const py = Math.round(this.y[i] / q) * q;
        const ss = s > q * 0.75 ? q : q / 2;
        g.fillRect(px - ss / 2, py - ss / 2, ss, ss);
        continue;
      }
      if (shape === 9 || stretched) {
        // Along the velocity: a capsule whose length grows with speed.
        const speed = Math.hypot(this.vx[i], this.vy[i]);
        const len = s * stretchFor(speed, this.stretch[i] || 1) * (shape === 9 ? 1.6 : 1);
        const thick = shape === 9 ? s * 0.38 : shape === 1 ? s : s * 0.8;
        g.save();
        g.translate(this.x[i], this.y[i]);
        g.rotate(Math.atan2(this.vy[i], this.vx[i]));
        g.beginPath();
        g.roundRect(-len / 2, -thick / 2, len, thick, thick / 2);
        g.fill();
        g.restore();
      } else if (shape === 1) {
        g.beginPath();
        g.arc(this.x[i], this.y[i], s / 2, 0, Math.PI * 2);
        g.fill();
      } else if (shape === 3) {
        // three overlapping blobs, stretched along the direction of travel
        const a = Math.atan2(this.vy[i], this.vx[i]);
        g.save();
        g.translate(this.x[i], this.y[i]);
        g.rotate(a);
        g.beginPath();
        g.arc(0, 0, s * 0.5, 0, Math.PI * 2);
        g.arc(s * 0.45, s * 0.1, s * 0.3, 0, Math.PI * 2);
        g.arc(-s * 0.35, -s * 0.15, s * 0.28, 0, Math.PI * 2);
        g.fill();
        g.restore();
      } else if (this.shape[i] === 5) {
        // bat: two wing humps, flapping as it goes
        const flap = 0.4 + 0.6 * Math.abs(Math.sin(k * Math.PI * 6));
        g.save();
        g.translate(this.x[i], this.y[i]);
        g.beginPath();
        g.moveTo(0, 0);
        g.quadraticCurveTo(-s * 0.5, -s * (0.6 + flap * 0.4), -s, -s * 0.2 * flap);
        g.quadraticCurveTo(-s * 0.7, s * 0.1, -s * 0.45, s * 0.05);
        g.quadraticCurveTo(-s * 0.2, s * 0.25, 0, s * 0.15);
        g.quadraticCurveTo(s * 0.2, s * 0.25, s * 0.45, s * 0.05);
        g.quadraticCurveTo(s * 0.7, s * 0.1, s, -s * 0.2 * flap);
        g.quadraticCurveTo(s * 0.5, -s * (0.6 + flap * 0.4), 0, 0);
        g.closePath();
        g.fill();
        g.restore();
      } else if (this.shape[i] === 7) {
        // snowflake: three strokes through the centre
        g.save();
        g.translate(this.x[i], this.y[i]);
        g.rotate(this.rot[i]);
        g.strokeStyle = this.color[i];
        g.lineWidth = Math.max(1, s * 0.14);
        g.lineCap = "round";
        g.beginPath();
        for (let a = 0; a < 3; a++) {
          const ang = (a * Math.PI) / 3;
          g.moveTo(Math.cos(ang) * s * 0.5, Math.sin(ang) * s * 0.5);
          g.lineTo(-Math.cos(ang) * s * 0.5, -Math.sin(ang) * s * 0.5);
        }
        g.stroke();
        g.restore();
      } else {
        g.save();
        g.translate(this.x[i], this.y[i]);
        g.rotate(this.rot[i]);
        if (this.shape[i] === 4) {
          // sprinkle: a short rounded dash
          g.beginPath();
          g.roundRect(-s * 0.7, -s * 0.2, s * 1.4, s * 0.4, s * 0.2);
          g.fill();
          g.restore();
          continue;
        }
        if (this.shape[i] === 8) {
          // leaf: pointed ellipse with a vein, tumbling
          g.beginPath();
          g.moveTo(-s * 0.7, 0);
          g.quadraticCurveTo(0, -s * 0.55, s * 0.7, 0);
          g.quadraticCurveTo(0, s * 0.55, -s * 0.7, 0);
          g.closePath();
          g.fill();
          g.strokeStyle = "rgba(0,0,0,0.25)";
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(-s * 0.5, 0);
          g.lineTo(s * 0.5, 0);
          g.stroke();
          g.restore();
          continue;
        }
        if (this.shape[i] === 6) {
          // shard: a slim triangle
          g.beginPath();
          g.moveTo(0, -s * 0.65);
          g.lineTo(s * 0.4, s * 0.4);
          g.lineTo(-s * 0.4, s * 0.4);
          g.closePath();
          g.fill();
          g.restore();
          continue;
        }
        if (this.shape[i] === 2) {
          g.fillStyle = this.side[i];
          g.beginPath();
          g.roundRect(-s / 2, -s / 2 + s * 0.22, s, s, s * 0.2);
          g.fill();
          g.fillStyle = this.color[i];
        }
        g.beginPath();
        g.roundRect(-s / 2, -s / 2, s, s, s * 0.2);
        g.fill();
        g.restore();
      }
    }
    g.restore();
  }
}
