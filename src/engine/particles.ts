/**
 * Pooled particle system for pops and dust. Fixed capacity, typed-array
 * storage, no allocation while running. Positions are in logical screen
 * units; velocities in units per second.
 */
export type ParticleShape = 0 | 1 | 2 | 3; // 0 = rounded square (fleck), 1 = dot, 2 = extruded cube, 3 = paint splat

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
}

export class Particles {
  readonly cap: number;
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
  private readonly color: string[];
  private readonly side: string[];

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
    this.color = new Array<string>(cap).fill("");
    this.side = new Array<string>(cap).fill("");
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
      this.x[i] = cx;
      this.y[i] = cy;
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
      const ci = Math.floor(Math.random() * colors.length);
      this.color[i] = colors[ci];
      this.side[i] = o.sides?.[ci] ?? colors[ci];
    }
  }

  /** Advance by `dt` game milliseconds. */
  update(dt: number): void {
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
      this.y[i] += this.vy[i] * s;
      this.rot[i] += this.vr[i] * s;
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
    this.color[i] = this.color[last];
    this.side[i] = this.side[last];
  }

  render(g: CanvasRenderingContext2D): void {
    if (this.n === 0) return;
    g.save();
    for (let i = 0; i < this.n; i++) {
      const k = this.life[i] / this.max[i]; // 1 -> 0
      const fade = k < 0.4 ? k / 0.4 : 1;
      const s = this.size[i] * (0.35 + 0.65 * k);
      g.globalAlpha = fade;
      g.fillStyle = this.color[i];
      if (this.shape[i] === 1) {
        g.beginPath();
        g.arc(this.x[i], this.y[i], s / 2, 0, Math.PI * 2);
        g.fill();
      } else if (this.shape[i] === 3) {
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
      } else {
        g.save();
        g.translate(this.x[i], this.y[i]);
        g.rotate(this.rot[i]);
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
