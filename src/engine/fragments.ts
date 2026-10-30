/**
 * Chunks of a popped tile that keep the tile's own art. Each fragment is a
 * sub-rectangle of the whole tile: rendering clips to that rectangle and
 * asks the caller's `TileDraw` to paint the full tile underneath, so any
 * theme's bricks, bubbles or stains shatter without new art.
 */

/** Paints a whole tile centred on the origin at `w` by `h`. */
export type TileDraw = (g: CanvasRenderingContext2D, w: number, h: number) => void;

export interface ShatterOptions {
  /** Chunks per side. */
  grid: number;
  /** Outward speed range (units/s). */
  speed: [number, number];
  /** Lifetime range (ms). */
  life: [number, number];
  gravity?: number;
  /** Extra velocity bias direction (radians) and how much of the speed goes that way, 0..1. */
  dir?: number;
  bias?: number;
  /** Spin range (radians/s). */
  spin?: number;
  /** A surface the chunks bounce off once (screen y), if any. */
  floor?: number;
}

interface Fragment {
  draw: TileDraw;
  /** Sub-rectangle of the tile, as fractions. */
  u: number;
  v: number;
  uw: number;
  vh: number;
  w: number;
  h: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  grav: number;
  life: number;
  max: number;
  floor: number;
  bounced: boolean;
}

/** Position of a fragment `e` ms later under gravity, for tests and previews. */
export function fragmentAt(f: { x: number; y: number; vx: number; vy: number; grav: number }, e: number): { x: number; y: number } {
  const s = e / 1000;
  return { x: f.x + f.vx * s, y: f.y + f.vy * s + 0.5 * f.grav * s * s };
}

export class Fragments {
  private list: Fragment[] = [];
  readonly cap: number;

  constructor(cap = 160) {
    this.cap = cap;
  }

  get count(): number {
    return this.list.length;
  }

  clear(): void {
    this.list = [];
  }

  /** Break a tile whose box is centred at (cx, cy) into `grid` by `grid` flying chunks. */
  shatter(draw: TileDraw, cx: number, cy: number, w: number, h: number, o: ShatterOptions, rng: () => number = Math.random): void {
    const n = Math.max(1, Math.round(o.grid));
    const bias = o.bias ?? 0;
    const spin = o.spin ?? 7;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        if (this.list.length >= this.cap) return;
        const u = i / n;
        const v = j / n;
        const fx = (u + 0.5 / n - 0.5) * w;
        const fy = (v + 0.5 / n - 0.5) * h;
        const away = Math.atan2(fy, fx) + (rng() - 0.5) * 0.6;
        const speed = o.speed[0] + rng() * (o.speed[1] - o.speed[0]);
        const dir = o.dir ?? away;
        const vx = Math.cos(away) * speed * (1 - bias) + Math.cos(dir) * speed * bias;
        const vy = Math.sin(away) * speed * (1 - bias) + Math.sin(dir) * speed * bias;
        const max = o.life[0] + rng() * (o.life[1] - o.life[0]);
        this.list.push({
          draw,
          u,
          v,
          uw: 1 / n,
          vh: 1 / n,
          w,
          h,
          x: cx + fx,
          y: cy + fy,
          vx,
          vy: vy - speed * 0.35,
          rot: 0,
          vr: (rng() * 2 - 1) * spin,
          grav: o.gravity ?? 1400,
          life: max,
          max,
          floor: o.floor ?? Infinity,
          bounced: false,
        });
      }
    }
  }

  /** Advance by `dt` game milliseconds. */
  update(dt: number): void {
    if (dt <= 0 || this.list.length === 0) return;
    const s = dt / 1000;
    this.list = this.list.filter((f) => {
      f.life -= dt;
      if (f.life <= 0) return false;
      f.vy += f.grav * s;
      f.x += f.vx * s;
      f.y += f.vy * s;
      f.rot += f.vr * s;
      if (f.vy > 0 && f.y >= f.floor) {
        f.y = f.floor;
        if (f.bounced) {
          // second touch: come to rest on the shelf
          f.vy = 0;
          f.vx *= 0.85;
          f.vr *= 0.7;
        } else {
          f.bounced = true;
          f.vy = -f.vy * 0.42;
          f.vx *= 0.6;
          f.vr *= 0.5;
        }
      }
      return true;
    });
  }

  render(g: CanvasRenderingContext2D): void {
    if (this.list.length === 0) return;
    g.save();
    for (const f of this.list) {
      const k = f.life / f.max; // 1 -> 0
      const fade = k < 0.4 ? k / 0.4 : 1;
      const s = 0.55 + 0.45 * fade;
      const cw = f.uw * f.w;
      const ch = f.vh * f.h;
      g.save();
      g.translate(f.x, f.y);
      g.rotate(f.rot);
      g.scale(s, s);
      g.globalAlpha = fade;
      g.beginPath();
      g.rect(-cw / 2, -ch / 2, cw, ch);
      g.clip();
      // Slide the whole tile so this chunk's cell sits on the origin.
      g.translate(-(f.u + f.uw / 2 - 0.5) * f.w, -(f.v + f.vh / 2 - 0.5) * f.h);
      f.draw(g, f.w, f.h);
      g.restore();
    }
    g.restore();
  }
}
