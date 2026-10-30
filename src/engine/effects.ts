import type { Color } from "../core/color";
import type { Clock } from "./clock";
import { debrisFor } from "./debris";
import { clamp01, easeOutCubic, lerp } from "./easing";
import { Fragments, type TileDraw } from "./fragments";
import { Particles } from "./particles";
import { popScale, TUNING } from "./fxTuning";
import type { Palette } from "./theme";
import type { View } from "./view";

/**
 * The shared effects layer: debris, fragments, rings, screen shake, flash,
 * vignette, hit-stop and slow motion, with one `pop` choreography that every
 * scene fires at the moment a tile bursts. What it does for a given theme
 * comes from `palette.fx`; Classic's profile turns the new treatments off so
 * the original look stays as it was.
 */

/** What the layer needs from the game context, kept narrow so tests and the lab can supply it. */
export interface EffectsContext {
  readonly clock: Clock;
  readonly view: View;
  readonly palette: Palette;
}

export interface PopSpec {
  /** Tile box, top-left and size, in logical units. */
  x: number;
  y: number;
  w: number;
  h: number;
  color: Color;
  /** Paints the whole tile centred on the origin, for fragments; null skips them. */
  draw: TileDraw | null;
  /** 0..1 moment size from `intensityFor`. */
  k: number;
  /** Base debris count before intensity scaling. */
  debris?: number;
  /** Direction the burst should favour (radians), if any. */
  dir?: number;
}

interface Ring {
  x: number;
  y: number;
  t0: number;
  dur: number;
  r0: number;
  r1: number;
  color: string;
  width: number;
}

const SHAKE_MS = 180;
const KICK_MS = 55;

/** Screen offset and tilt for a shake `e` ms in: a directional kick first, then decaying noise. Pure. */
export function shakeOffset(e: number, amp: number, dirX: number, dirY: number, rot: boolean, noise: () => number): { dx: number; dy: number; rot: number } {
  if (e < 0 || e >= SHAKE_MS || amp <= 0) return { dx: 0, dy: 0, rot: 0 };
  const decay = (1 - e / SHAKE_MS) ** 2;
  const kick = e < KICK_MS ? amp * 1.1 * Math.sin((Math.PI * e) / KICK_MS) : 0;
  const n = amp * decay;
  return {
    dx: dirX * kick + (noise() * 2 - 1) * n,
    dy: dirY * kick + (noise() * 2 - 1) * n,
    rot: rot ? (noise() * 2 - 1) * n * 0.0025 : 0,
  };
}

export class Effects {
  readonly particles: Particles;
  readonly fragments = new Fragments();
  private rings: Ring[] = [];
  private shakeT0 = -1e9;
  private shakeAmp = 0;
  private shakeDir: [number, number] = [0, 1];
  private flashUntil = -1;
  private flashColor = "#ffffff";
  private flashAlpha = 1;
  private vigT0 = -1e9;
  private vigDur = 1;
  private vigStrength = 0;
  private vigColor = "#000000";
  private bloomCanvas: HTMLCanvasElement | null = null;
  private readonly ctx: EffectsContext;

  constructor(ctx: EffectsContext, particleCap = 500) {
    this.ctx = ctx;
    this.particles = new Particles(particleCap);
  }

  private get pal(): Palette {
    return this.ctx.palette;
  }

  get ringCount(): number {
    return this.rings.length;
  }

  /** Advance the real-time pieces; call once per frame before rendering. */
  update(): void {
    const { clock } = this.ctx;
    this.particles.update(clock.dt);
    this.fragments.update(clock.dt);
    const t = clock.t;
    this.rings = this.rings.filter((r) => t - r.t0 < r.dur);
  }

  clear(): void {
    this.particles.clear();
    this.fragments.clear();
    this.rings = [];
    this.shakeT0 = -1e9;
    this.flashUntil = -1;
    this.vigT0 = -1e9;
  }

  // ---------------------------------------------------------------------------
  // Primitives
  // ---------------------------------------------------------------------------

  ring(x: number, y: number, r0: number, r1: number, color: string, width = 3, dur = 260, delay = 0): void {
    this.rings.push({ x, y, t0: this.ctx.clock.t + delay, dur, r0, r1, color, width });
  }

  /** The pop ring, reaching further with intensity and doubled on big moments where the theme allows. */
  burstRing(x: number, y: number, cell: number, color: string, k: number, delay = 0, dur = 300): void {
    const sc = popScale(k);
    this.ring(x, y, cell * 0.5, cell * sc.ringCells, color, 4, dur, delay);
    if (this.pal.fx.doubleRing && sc.secondRingDelay > 0) {
      this.ring(x, y, cell * 0.4, cell * sc.ringCells * 0.7, color, 2.5, dur * 0.9, delay + sc.secondRingDelay);
    }
  }

  /** Shake the screen; `dir` is where the kick goes first (defaults to a downward thump). */
  shake(amp: number, dir: [number, number] = [0, 1]): void {
    const len = Math.hypot(dir[0], dir[1]) || 1;
    const t = this.ctx.clock.t;
    const e = t - this.shakeT0;
    const remaining = e < SHAKE_MS ? this.shakeAmp * (1 - e / SHAKE_MS) : 0;
    this.shakeT0 = t;
    this.shakeAmp = Math.max(amp, remaining);
    this.shakeDir = [dir[0] / len, dir[1] / len];
  }

  flash(color: string, ms = 90, alphaScale = 1): void {
    this.flashColor = color;
    this.flashUntil = this.ctx.clock.t + ms;
    this.flashAlpha = alphaScale;
  }

  /** Darken the edges by `strength` and let it fade over `ms`; no-op for themes without a vignette colour. */
  vignette(strength: number, ms: number, color?: string): void {
    const c = color ?? this.pal.fx.vignette;
    if (!c) return;
    this.vigT0 = this.ctx.clock.t;
    this.vigDur = ms;
    this.vigStrength = strength;
    this.vigColor = c;
  }

  /** Hit-stop sized to the moment, plus slow motion on the biggest ones where the theme allows. */
  impact(k: number, baseFreezeMs?: number): void {
    const sc = popScale(k);
    this.ctx.clock.freeze(baseFreezeMs ?? sc.freezeMs);
    if (sc.slowmo && this.pal.fx.slowmo) this.ctx.clock.slow(TUNING.slowmo, TUNING.slowmoMs);
  }

  // ---------------------------------------------------------------------------
  // Choreography
  // ---------------------------------------------------------------------------

  /** The theme's debris from a point, as every scene used to spawn it. */
  debris(cx: number, cy: number, color: Color, cell: number, count: number, extra: Partial<Parameters<Particles["spawn"]>[4]> = {}): void {
    const { colors, o } = debrisFor(this.pal, color, cell);
    this.particles.spawn(cx, cy, count, colors, { ...o, jitter: 0.3, ...extra });
  }

  /**
   * Everything that flies when a tile bursts: fragments of its own art, hot
   * sparks and the theme's debris, all scaled by intensity. Classic's
   * profile reduces this to the plain debris burst.
   */
  pop(spec: PopSpec): void {
    const fx = this.pal.fx;
    const sc = popScale(spec.k);
    const cx = spec.x + spec.w / 2;
    const cy = spec.y + spec.h / 2;
    const cell = spec.w;
    const base = spec.debris ?? 10 + Math.floor(Math.random() * 5);
    const dirOpts = spec.dir === undefined ? {} : { dir: spec.dir, spread: 2.2 };
    this.debris(cx, cy, spec.color, cell, Math.round(base * sc.debris), {
      area: fx.fragments ? [cell * 0.5, cell * 0.5] : undefined,
      ...dirOpts,
    });
    if (fx.fragments && spec.draw) {
      this.fragments.shatter(spec.draw, cx, cy, spec.w, spec.h, {
        grid: sc.grid,
        speed: [120 + 120 * spec.k, 260 + 200 * spec.k],
        life: [380, 560],
        gravity: 1500,
        dir: spec.dir,
        bias: spec.dir === undefined ? 0 : 0.5,
      });
    }
    if (fx.sparks) {
      const hot = fx.sparks;
      this.particles.spawn(cx, cy, sc.sparks, [this.pal.brickColors[spec.color], hot], {
        speed: [320 + 200 * spec.k, 620 + 300 * spec.k],
        size: [cell * 0.04, cell * 0.075],
        life: [160, 300],
        gravity: 500,
        drag: 0.08,
        shape: 9,
        stretch: 1.4,
        hot,
        jitter: 0.4,
        ...dirOpts,
      });
    }
  }

  /** A splash of both paints where a brick lands on another and they mix. */
  mixSplash(cx: number, cy: number, cell: number, colors: readonly string[], dir?: number): void {
    const fx = this.pal.fx;
    if (fx.mix !== "swirl") return;
    this.particles.spawn(cx, cy, 8, colors, {
      speed: [90, 200],
      size: [cell * 0.07, cell * 0.13],
      life: [260, 420],
      gravity: 700,
      drag: 0.2,
      shape: 1,
      stretch: 0.6,
      area: [cell * 0.5, cell * 0.5],
      ...(dir === undefined ? {} : { dir, spread: 1.4 }),
    });
  }

  /** Level clear: a fountain of debris from each column, plus sparks and a vignette pulse where the theme allows. */
  celebrate(columnsX: readonly number[], y: number, cell: number, colorAt: (i: number) => Color): void {
    const fx = this.pal.fx;
    columnsX.forEach((x, i) => {
      const color = colorAt(i);
      const { colors, o } = debrisFor(this.pal, color, cell);
      this.particles.spawn(x, y, 9, colors, {
        ...o,
        dir: -Math.PI / 2,
        spread: 0.45,
        speed: [o.speed[0] * 1.6, o.speed[1] * 1.9],
        life: [o.life[0] * 1.6, o.life[1] * 1.8],
        jitter: 0.35,
      });
      if (fx.sparks) {
        this.particles.spawn(x, y, 5, [this.pal.brickColors[color], fx.sparks], {
          speed: [500, 820],
          size: [cell * 0.05, cell * 0.08],
          life: [400, 650],
          gravity: 900,
          drag: 0.15,
          shape: 9,
          stretch: 1.2,
          hot: fx.sparks,
          dir: -Math.PI / 2,
          spread: 0.5,
        });
      }
    });
    this.vignette(0.45, 1100);
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  /** Apply the current shake to `g`, tilting about (cx, cy). */
  applyShake(g: CanvasRenderingContext2D, cx: number, cy: number): void {
    const e = this.ctx.clock.t - this.shakeT0;
    if (e >= SHAKE_MS) return;
    const o = shakeOffset(e, this.shakeAmp, this.shakeDir[0], this.shakeDir[1], this.pal.fx.shakeRot, Math.random);
    g.translate(o.dx, o.dy);
    if (o.rot !== 0) {
      g.translate(cx, cy);
      g.rotate(o.rot);
      g.translate(-cx, -cy);
    }
  }

  /** Fragments, particles and rings, with the theme's blend mode and bloom. */
  renderWorld(g: CanvasRenderingContext2D): void {
    const busy = this.particles.count > 0 || this.fragments.count > 0 || this.rings.length > 0;
    if (!busy) return;
    if (this.pal.fx.bloom && TUNING.bloom > 0) this.renderBloom(g);
    this.fragments.render(g);
    if (this.pal.particlesAdditive) {
      g.save();
      g.globalCompositeOperation = "lighter";
      this.particles.render(g);
      g.restore();
    } else {
      this.particles.render(g);
    }
    this.renderRings(g);
  }

  renderFlash(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    if (this.ctx.clock.t >= this.flashUntil) return;
    g.fillStyle = this.flashColor;
    g.globalAlpha = Math.min(1, this.pal.flashAlpha * this.flashAlpha);
    g.fillRect(x, y, w, h);
    g.globalAlpha = 1;
  }

  /** Edge darkening that fades out; cheap when idle since nothing is drawn. */
  renderVignette(g: CanvasRenderingContext2D): void {
    const p = (this.ctx.clock.t - this.vigT0) / this.vigDur;
    if (p < 0 || p >= 1) return;
    const { w, h } = this.ctx.view;
    const a = this.vigStrength * (1 - easeOutCubic(p));
    const grad = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.55);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, this.vigColor);
    g.save();
    g.globalAlpha = a;
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.restore();
  }

  private renderRings(g: CanvasRenderingContext2D): void {
    if (this.rings.length === 0) return;
    const t = this.ctx.clock.t;
    g.save();
    if (this.pal.glow) {
      g.shadowColor = "rgba(255,255,255,0.8)";
      g.shadowBlur = 14;
    }
    for (const r of this.rings) {
      const p = (t - r.t0) / r.dur;
      if (p < 0) continue;
      const q = easeOutCubic(clamp01(p));
      g.globalAlpha = 0.9 * (1 - q);
      g.lineWidth = r.width * (1 - q * 0.6);
      g.strokeStyle = r.color;
      g.beginPath();
      g.arc(r.x, r.y, lerp(r.r0, r.r1, q), 0, Math.PI * 2);
      g.stroke();
    }
    g.restore();
  }

  /** A quarter-size copy of the effects, blurred and added back for a soft glow. */
  private renderBloom(g: CanvasRenderingContext2D): void {
    if (typeof document === "undefined" || !("filter" in g)) return;
    const { w, h } = this.ctx.view;
    const bw = Math.max(1, Math.round(w / 4));
    const bh = Math.max(1, Math.round(h / 4));
    const c = (this.bloomCanvas ??= document.createElement("canvas"));
    if (c.width !== bw || c.height !== bh) {
      c.width = bw;
      c.height = bh;
    }
    const sg = c.getContext("2d");
    if (!sg) return;
    sg.setTransform(1, 0, 0, 1, 0, 0);
    sg.clearRect(0, 0, bw, bh);
    sg.scale(0.25, 0.25);
    sg.globalCompositeOperation = "lighter";
    this.fragments.render(sg);
    this.particles.render(sg);
    this.renderRings(sg);
    g.save();
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = TUNING.bloom;
    g.filter = "blur(5px)";
    g.drawImage(c, 0, 0, w, h);
    g.restore();
  }
}
