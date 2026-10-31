import type { Color } from "../core/color";
import { arcPlan, wheelColorAt } from "./colorWheel";
import type { AudioPort } from "./audio";
import type { CueName } from "./synth";
import type { Clock } from "./clock";
import { debrisFor } from "./debris";
import { clamp01, easeOutCubic, lerp } from "./easing";
import { Fragments, type TileDraw } from "./fragments";
import { Particles } from "./particles";
import { popScale, TUNING } from "./fxTuning";
import type { Palette } from "./theme";
import type { View } from "./view";
import { rgba } from "./modernSkin";
import { GLYPHS, glyphPath, type Glyph } from "./skinKit";
import type { SolidTop } from "./collide";
import { crane } from "./origamiSkin";
import { mixColors } from "./colorUtil";

/**
 * The shared effects layer: debris, fragments, rings, screen shake, flash,
 * vignette, hit-stop and slow motion, with one `pop` choreography that every
 * scene fires at the moment a tile bursts. What it does for a given theme
 * comes from `palette.fx`; Classic's profile turns the new treatments off so
 * the original look stays as it was.
 *
 * Rendering is in three passes the scene calls in order: `renderUnder`
 * (stains on the surface, before tiles), `renderWorld` (everything that
 * flies, after tiles) and `renderWash` / `renderVignette` (over the board
 * and over the HUD).
 */

/** What the layer needs from the game context, kept narrow so tests and the lab can supply it. */
export interface EffectsContext {
  readonly clock: Clock;
  readonly view: View;
  readonly palette: Palette;
  readonly audio: AudioPort;
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
  /** Surface the fragments bounce off (screen y), for the "bounce" signature. */
  floor?: number;
  /** Skip the theme's pop signature (a scene drawing its own richer version). */
  signature?: boolean;
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
  /** Outline shape; a circle when absent. */
  shape?: Glyph;
  /** Radians the shape turns over its life. */
  spin: number;
}

/** The colour-theory arc drawn around a brick while it mixes. */
interface MixArc {
  x: number;
  y: number;
  r: number;
  t0: number;
  dur: number;
  from: number;
  sweep: number;
  subtract: boolean;
  black: boolean;
  blackColor: string;
  dots: { color: string; from: number; to: number }[];
}

/** A soft stain left on the surface where something popped. */
interface Decal {
  x: number;
  y: number;
  r: number;
  color: string;
  t0: number;
  dur: number;
  seed: number;
}

/** A quick light flare: four-point star and a radial glow. */
interface Flare {
  x: number;
  y: number;
  r: number;
  color: string;
  t0: number;
  dur: number;
}

/** A soft gel ripple spreading across the surface. */
interface Ripple {
  x: number;
  y: number;
  r0: number;
  r1: number;
  color: string;
  t0: number;
  dur: number;
}

/** A whole tile drifting up and away, for the "float" signature. */
interface Floater {
  draw: TileDraw;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  t0: number;
  dur: number;
  sway: number;
  phase: number;
}

/** A paper crane flying off a popped tile, for the "crane" signature. */
interface Flyer {
  x: number;
  y: number;
  s: number;
  color: string;
  t0: number;
  dur: number;
  /** +1 flies right, -1 left. */
  dir: number;
}

/** Vertical afterimage of a fast drop. */
interface Streak {
  x: number;
  y0: number;
  y1: number;
  w: number;
  color: string;
  t0: number;
  dur: number;
}

interface Scheduled {
  at: number;
  fn: () => void;
}

const SHAKE_MS = 180;
const KICK_MS = 55;
/** Wall frame time the governor treats as too slow, and how long it must persist. */
const SLOW_FRAME_MS = 22;
const GOVERNOR_MS = 1500;

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
  private arcs: MixArc[] = [];
  private silhouetteUntil = -1;
  private silhouetteColor = "#ffffff";
  private decals: Decal[] = [];
  private flares: Flare[] = [];
  private ripples: Ripple[] = [];
  private streaks: Streak[] = [];
  private floaters: Floater[] = [];
  private flyers: Flyer[] = [];
  private queue: Scheduled[] = [];
  /** What debris can land on; the scene supplies it. Used when the theme's profile collides debris. */
  collider: SolidTop | null = null;
  private bleedColor: string | null = null;
  private bleedTarget = 0;
  private bleedShown = 0;
  private shakeT0 = -1e9;
  private shakeAmp = 0;
  private shakeDir: [number, number] = [0, 1];
  private flashUntil = -1;
  private flashColor = "#ffffff";
  private flashAlpha = 1;
  private washColor = "#ffffff";
  private washT0 = -1e9;
  private washDur = 1;
  private vigT0 = -1e9;
  private vigDur = 1;
  private vigStrength = 0;
  private vigColor = "#000000";
  private bloomCanvas: HTMLCanvasElement | null = null;
  private lastNow = -1;
  private slowSince = -1;
  private fastSince = -1;
  /** Set by the frame-time governor when the device cannot keep up: no bloom, fewer fragments and debris. */
  lowPower = false;
  /** Smoothed wall milliseconds per frame, for the lab readout. */
  frameMs = 16;
  private readonly ctx: EffectsContext;
  private lastCue = new Map<string, number>();

  constructor(ctx: EffectsContext, particleCap = 500) {
    this.ctx = ctx;
    this.particles = new Particles(particleCap);
  }

  private get pal(): Palette {
    return this.ctx.palette;
  }

  /** A synth cue, played once even when every brick of a group asks for it on the same frame. */
  private cue(name: CueName, volume: number, rate: number): void {
    const now = this.ctx.clock.now;
    const last = this.lastCue.get(name);
    if (last !== undefined && now - last < 28) return;
    this.lastCue.set(name, now);
    this.ctx.audio.cue(name, volume, rate);
  }

  get ringCount(): number {
    return this.rings.length;
  }

  get arcCount(): number {
    return this.arcs.length;
  }

  get flyerCount(): number {
    return this.flyers.length;
  }

  /** How strongly the chain bleed is showing right now, 0..1 (eases toward what the scene last set). */
  get bleed(): number {
    return this.bleedShown;
  }

  /** Shapes of the live rings, oldest first, for tests and the lab. */
  get ringShapes(): (Glyph | "circle")[] {
    return this.rings.map((r) => r.shape ?? "circle");
  }

  /** The flat colour the scene should paint the impact frame in, or null when no impact frame is showing. */
  get silhouette(): string | null {
    return this.ctx.clock.now < this.silhouetteUntil ? this.silhouetteColor : null;
  }

  get decalCount(): number {
    return this.decals.length;
  }

  get flareCount(): number {
    return this.flares.length;
  }

  get rippleCount(): number {
    return this.ripples.length;
  }

  get streakCount(): number {
    return this.streaks.length;
  }

  get floaterCount(): number {
    return this.floaters.length;
  }

  get pending(): number {
    return this.queue.length;
  }

  /** Advance the real-time pieces; call once per frame before rendering. */
  update(): void {
    const { clock } = this.ctx;
    this.governor(clock.now);
    const solid = this.pal.fx.debrisCollide ? this.collider : null;
    this.particles.update(clock.dt, solid);
    this.fragments.update(clock.dt, solid);
    const t = clock.t;
    this.bleedShown += (this.bleedTarget - this.bleedShown) * (this.bleedTarget > this.bleedShown ? 0.18 : 0.08);
    if (this.bleedShown < 0.01) this.bleedShown = 0;
    this.rings = this.rings.filter((r) => t - r.t0 < r.dur);
    this.arcs = this.arcs.filter((a) => t - a.t0 < a.dur);
    this.decals = this.decals.filter((d) => t - d.t0 < d.dur);
    this.flares = this.flares.filter((f) => t - f.t0 < f.dur);
    this.ripples = this.ripples.filter((r) => t - r.t0 < r.dur);
    this.streaks = this.streaks.filter((s) => t - s.t0 < s.dur);
    this.floaters = this.floaters.filter((f) => t - f.t0 < f.dur);
    this.flyers = this.flyers.filter((f) => t - f.t0 < f.dur);
    if (this.queue.length) {
      const due = this.queue.filter((q) => q.at <= t);
      this.queue = this.queue.filter((q) => q.at > t);
      for (const q of due) q.fn();
    }
  }

  /** Watch wall frame times: drop to low power after sustained slow frames, recover after sustained fast ones. */
  private governor(now: number): void {
    if (this.lastNow >= 0) {
      const dt = Math.min(100, now - this.lastNow);
      this.frameMs += (dt - this.frameMs) * 0.1;
      if (this.frameMs > SLOW_FRAME_MS) {
        this.fastSince = -1;
        if (this.slowSince < 0) this.slowSince = now;
        else if (now - this.slowSince > GOVERNOR_MS) this.lowPower = true;
      } else {
        this.slowSince = -1;
        if (this.fastSince < 0) this.fastSince = now;
        else if (now - this.fastSince > GOVERNOR_MS * 3) this.lowPower = false;
      }
    }
    this.lastNow = now;
  }

  clear(): void {
    this.particles.clear();
    this.fragments.clear();
    this.rings = [];
    this.arcs = [];
    this.flyers = [];
    this.bleedTarget = 0;
    this.bleedShown = 0;
    this.silhouetteUntil = -1;
    this.decals = [];
    this.flares = [];
    this.ripples = [];
    this.streaks = [];
    this.floaters = [];
    this.queue = [];
    this.shakeT0 = -1e9;
    this.flashUntil = -1;
    this.washT0 = -1e9;
    this.vigT0 = -1e9;
  }

  /** Run `fn` after `ms` of game time. */
  later(ms: number, fn: () => void): void {
    if (ms <= 0) {
      fn();
      return;
    }
    this.queue.push({ at: this.ctx.clock.t + ms, fn });
  }

  // ---------------------------------------------------------------------------
  // Primitives
  // ---------------------------------------------------------------------------

  ring(x: number, y: number, r0: number, r1: number, color: string, width = 3, dur = 260, delay = 0, shape?: Glyph, spin = 0): void {
    this.rings.push({ x, y, t0: this.ctx.clock.t + delay, dur, r0, r1, color, width, shape, spin });
  }

  /**
   * The pop ring, reaching further with intensity and doubled on big moments
   * where the theme allows. With the glyph ring shape and a popped colour,
   * the outline takes that colour's glyph: octagon for red, diamond for
   * blue, circle for yellow, and a mix nests its parts as the inner rings.
   */
  burstRing(x: number, y: number, cell: number, color: string, k: number, delay = 0, dur = 300, popColor?: Color): void {
    const sc = popScale(k);
    const glyphs = this.pal.fx.ringShape === "glyph" && popColor !== undefined ? GLYPHS[popColor] : [];
    const outer = glyphs[0];
    const spin = outer === "octagon" ? 0.25 : outer === "diamond" ? -0.35 : 0;
    this.ring(x, y, cell * 0.5, cell * sc.ringCells, color, 4, dur, delay, outer, spin);
    if (!this.pal.fx.doubleRing) return;
    const inner = glyphs.slice(1);
    if (sc.secondRingDelay > 0 || inner.length > 0) {
      this.ring(x, y, cell * 0.4, cell * sc.ringCells * 0.7, color, 2.5, dur * 0.9, delay + Math.max(sc.secondRingDelay, 50), inner[0] ?? outer, -spin);
    }
    if (inner.length > 1) {
      this.ring(x, y, cell * 0.3, cell * sc.ringCells * 0.45, color, 2, dur * 0.8, delay + 100, inner[1], spin);
    }
  }

  /**
   * The colour-theory arc for a combine: a band of the wheel around the
   * brick sweeping from the old colour to the new, with the primary that
   * joined (or left) sliding along it. Off unless the theme asks for it.
   */
  mixArc(cx: number, cy: number, cell: number, oldColor: Color, newColor: Color, dur = 520): void {
    if (!this.pal.fx.mixArc) return;
    const plan = arcPlan(oldColor, newColor);
    this.arcs.push({
      x: cx,
      y: cy,
      r: cell * 0.66,
      t0: this.ctx.clock.t,
      dur,
      from: plan.from,
      sweep: plan.sweep,
      subtract: plan.subtract,
      black: plan.black,
      blackColor: this.pal.brickColors[7],
      dots: plan.dots.map((d) => ({ color: this.pal.brickColors[d.color], from: d.from, to: d.to })),
    });
  }

  /**
   * The comic-book impact frame: for `ms` of wall time the scene paints
   * everything as flat ink on `color`. Off for the theme's profile and under
   * reduced motion, where a full-screen flash is unwelcome.
   */
  impactFrame(color: string, ms = 40): void {
    if (!this.pal.fx.impactFrame || TUNING.motion < 1) return;
    this.silhouetteColor = color;
    this.silhouetteUntil = this.ctx.clock.now + ms;
  }

  /** Shake the screen; `dir` is where the kick goes first (defaults to a downward thump). */
  shake(amp: number, dir: [number, number] = [0, 1]): void {
    const len = Math.hypot(dir[0], dir[1]) || 1;
    const t = this.ctx.clock.t;
    const e = t - this.shakeT0;
    const remaining = e < SHAKE_MS ? this.shakeAmp * (1 - e / SHAKE_MS) : 0;
    this.shakeT0 = t;
    this.shakeAmp = Math.max(amp * TUNING.motion, remaining);
    this.shakeDir = [dir[0] / len, dir[1] / len];
  }

  flash(color: string, ms = 90, alphaScale = 1): void {
    this.flashColor = color;
    this.flashUntil = this.ctx.clock.t + ms;
    this.flashAlpha = alphaScale;
  }

  /** A soft tint over the board in `color` that fades over `ms`: the popped colour washing across on a big chain. */
  wash(color: string, ms = 500): void {
    this.washColor = color;
    this.washT0 = this.ctx.clock.t;
    this.washDur = ms;
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

  /** Hit-stop sized to the moment, plus slow motion on the biggest ones where the theme allows, and a thump under it. */
  impact(k: number, baseFreezeMs?: number): void {
    const sc = popScale(k);
    this.ctx.clock.freeze(baseFreezeMs ?? sc.freezeMs);
    if (sc.slowmo && this.pal.fx.slowmo) this.ctx.clock.slow(TUNING.slowmo, TUNING.slowmoMs);
    if (this.pal.fx.stagedPop && k >= 0.3) this.cue("thump", 0.5 + 0.5 * k, 1 - 0.2 * k);
  }

  /** A stain on the surface, drawn under the tiles. */
  decal(x: number, y: number, r: number, color: string, dur = 4000): void {
    this.decals.push({ x, y, r, color, t0: this.ctx.clock.t, dur, seed: Math.floor(Math.random() * 1e6) });
  }

  flare(x: number, y: number, r: number, color = "#ffffff", dur = 220): void {
    this.flares.push({ x, y, r, color, t0: this.ctx.clock.t, dur });
  }

  ripple(x: number, y: number, r0: number, r1: number, color: string, dur = 420): void {
    this.ripples.push({ x, y, r0, r1, color, t0: this.ctx.clock.t, dur });
  }

  /** Afterimage of a drop from `y0` to `y1` in a column `w` wide. */
  streak(x: number, y0: number, y1: number, w: number, color: string, dur = 170): void {
    if (Math.abs(y1 - y0) < w * 0.5) return;
    this.streaks.push({ x, y0, y1, w, color, t0: this.ctx.clock.t, dur });
  }

  /** The tile itself drifting up and away, swaying as it goes, like a lantern let go. */
  float(draw: TileDraw, x: number, y: number, w: number, h: number, color: string, dur = 1000): void {
    this.floaters.push({ draw, x, y, w, h, color, t0: this.ctx.clock.t, dur, sway: w * 0.3, phase: Math.random() * Math.PI * 2 });
  }

  /** One trail mote behind something moving at (vx, vy); call each step while it moves. */
  trail(x: number, y: number, vx: number, vy: number, color: string, cell: number): void {
    if (this.lowPower) return;
    const speed = Math.hypot(vx, vy) || 1;
    this.particles.spawn(x, y, 1, [color], {
      speed: [speed * 0.12, speed * 0.2],
      size: [cell * 0.16, cell * 0.24],
      life: [140, 220],
      gravity: 0,
      drag: 0.02,
      shape: 1,
      stretch: 0.6,
      dir: Math.atan2(-vy, -vx),
      spread: 0.25,
      jitter: 0.2,
    });
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
   * sparks, the theme's debris and its pop signature, all scaled by
   * intensity. Classic's profile reduces this to the plain debris burst.
   */
  pop(spec: PopSpec): void {
    const fx = this.pal.fx;
    const sc = popScale(spec.k);
    const low = this.lowPower;
    const cx = spec.x + spec.w / 2;
    const cy = spec.y + spec.h / 2;
    const cell = spec.w;
    const base = spec.debris ?? 10 + Math.floor(Math.random() * 5);
    const dirOpts = spec.dir === undefined ? {} : { dir: spec.dir, spread: 2.2 };
    this.debris(cx, cy, spec.color, cell, Math.round(base * sc.debris * (low ? 0.5 : 1)), {
      area: fx.fragments ? [cell * 0.5, cell * 0.5] : undefined,
      ...dirOpts,
    });
    if (fx.fragments && spec.draw) {
      const bounce = fx.signature === "bounce" && spec.signature !== false;
      this.fragments.shatter(spec.draw, cx, cy, spec.w, spec.h, {
        grid: low ? 2 : sc.grid,
        speed: [120 + 120 * spec.k, 260 + 200 * spec.k],
        life: bounce ? [520, 760] : [380, 560],
        gravity: 1500,
        dir: spec.dir,
        bias: spec.dir === undefined ? 0 : 0.5,
        floor: bounce ? spec.floor : undefined,
      });
      this.cue("crunch", 0.35 + 0.4 * spec.k, 0.9 + Math.random() * 0.2);
    }
    if (fx.sparks && !low) {
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
    if (spec.signature !== false) this.signature(cx, cy, cell, spec.color, spec.k, spec.draw);
  }

  /** A paper crane that takes off from a popped tile and flies away, flapping. */
  fly(x: number, y: number, s: number, color: string, dur = 1200): void {
    this.flyers.push({ x, y, s, color, t0: this.ctx.clock.t, dur, dir: Math.random() < 0.5 ? -1 : 1 });
  }

  /**
   * The chain bleed: `level` (0..1, the chain meter) of `color` glowing in
   * at the screen edges. Null colour lets it drain away. Ignored unless the
   * theme's profile asks for it.
   */
  setBleed(color: string | null, level: number): void {
    if (!this.pal.fx.chainBleed) return;
    if (color) this.bleedColor = color;
    this.bleedTarget = color ? clamp01(level) : 0;
  }

  /** The theme's own mark on a pop. */
  private signature(cx: number, cy: number, cell: number, color: Color, k: number, draw: TileDraw | null): void {
    const fx = this.pal.fx;
    const paint = this.pal.brickColors[color];
    switch (fx.signature) {
      case "float":
        if (draw) this.float(draw, cx, cy, cell, cell, paint, 900 + 400 * k);
        if (k >= 0.3) this.cue("sparkle", 0.3 + 0.3 * k, 0.8 + 0.2 * k);
        break;
      case "crane":
        this.fly(cx, cy, cell * 0.9, paint, 1100 + 300 * k);
        break;
      case "splat":
        this.decal(cx, cy, cell * (0.55 + 0.25 * k), paint, 3200 + 1500 * k);
        break;
      case "flare":
        this.flare(cx, cy, cell * (0.9 + 0.8 * k), "#ffffff", 200 + 120 * k);
        if (k >= 0.3) this.cue("sparkle", 0.4 + 0.4 * k, 1 + 0.3 * k);
        break;
      case "ripple":
        this.ripple(cx, cy, cell * 0.35, cell * (1.05 + 0.6 * k), paint, 360 + 140 * k);
        break;
      case "bounce":
      case "none":
        break;
    }
  }

  /** A splash of both paints where a brick lands on another and they mix. */
  mixSplash(cx: number, cy: number, cell: number, colors: readonly string[], dir?: number): void {
    const fx = this.pal.fx;
    if (fx.mix === "wipe") return;
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
    this.cue("whoosh", 0.45, 0.9 + Math.random() * 0.25);
  }

  /** Level clear: a fountain of debris from each column, rolling across them when `stagger` is set, plus sparks and a vignette pulse where the theme allows. */
  celebrate(columnsX: readonly number[], y: number, cell: number, colorAt: (i: number) => Color, stagger = 0): void {
    const fx = this.pal.fx;
    columnsX.forEach((x, i) => {
      const fire = () => {
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
        if (fx.signature === "float") {
          // the lantern release: embers drifting up out of every column
          this.particles.spawn(x, y, 6, [fx.sparks ?? "#ffffff", this.pal.brickColors[color]], {
            speed: [120, 260],
            size: [cell * 0.05, cell * 0.09],
            life: [900, 1500],
            gravity: -220,
            drag: 0.3,
            shape: 1,
            dir: -Math.PI / 2,
            spread: 0.35,
            jitter: 0.4,
          });
        }
        if (fx.sparks && !this.lowPower) {
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
      };
      this.later(stagger * i, fire);
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

  /** Stains on the surface; draw after the background and before the tiles. */
  renderUnder(g: CanvasRenderingContext2D): void {
    if (this.decals.length === 0) return;
    const t = this.ctx.clock.t;
    g.save();
    // on additive themes the stain is light thrown onto the surface, not paint soaking in
    if (this.pal.particlesAdditive) g.globalCompositeOperation = "lighter";
    for (const d of this.decals) {
      const p = clamp01((t - d.t0) / d.dur);
      const grow = easeOutCubic(clamp01((t - d.t0) / 120));
      g.globalAlpha = 0.28 * (1 - p * p);
      g.fillStyle = d.color;
      g.beginPath();
      // a few overlapping blobs, placed by the seed so each stain is its own shape
      for (let i = 0; i < 5; i++) {
        const a = ((d.seed >> (i * 3)) % 17) * 0.37;
        const dist = i === 0 ? 0 : d.r * (0.25 + (((d.seed >> (i * 5)) % 7) / 7) * 0.4);
        const r = d.r * (i === 0 ? 0.7 : 0.3 + (((d.seed >> (i * 2)) % 5) / 5) * 0.25) * grow;
        g.moveTo(d.x + Math.cos(a) * dist + r, d.y + Math.sin(a) * dist);
        g.arc(d.x + Math.cos(a) * dist, d.y + Math.sin(a) * dist, r, 0, Math.PI * 2);
      }
      g.fill();
    }
    g.restore();
  }

  /** Fragments, particles, rings, ripples, flares and streaks, with the theme's blend mode and bloom. */
  renderWorld(g: CanvasRenderingContext2D): void {
    const busy =
      this.particles.count > 0 ||
      this.fragments.count > 0 ||
      this.rings.length > 0 ||
      this.arcs.length > 0 ||
      this.flares.length > 0 ||
      this.ripples.length > 0 ||
      this.streaks.length > 0 ||
      this.floaters.length > 0 ||
      this.flyers.length > 0;
    if (!busy) return;
    if (this.pal.fx.bloom && TUNING.bloom > 0 && !this.lowPower) this.renderBloom(g);
    this.renderStreaks(g);
    this.renderRipples(g);
    this.renderFloaters(g);
    this.renderFlyers(g);
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
    this.renderArcs(g);
    this.renderFlares(g);
  }

  renderFlash(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    if (this.ctx.clock.t >= this.flashUntil) return;
    g.fillStyle = this.flashColor;
    g.globalAlpha = Math.min(1, this.pal.flashAlpha * this.flashAlpha);
    g.fillRect(x, y, w, h);
    g.globalAlpha = 1;
  }

  /** The colour wash over the board, if one is running. */
  renderWash(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    const p = (this.ctx.clock.t - this.washT0) / this.washDur;
    if (p < 0 || p >= 1) return;
    g.save();
    g.globalAlpha = 0.16 * (1 - easeOutCubic(p));
    g.fillStyle = this.washColor;
    g.fillRect(x, y, w, h);
    g.restore();
  }

  /** Edge darkening that fades out; cheap when idle since nothing is drawn. */
  renderVignette(g: CanvasRenderingContext2D): void {
    this.renderBleed(g);
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

  /** The chain bleed: the multiplier colour glowing in from the screen edges, breathing slowly. */
  private renderBleed(g: CanvasRenderingContext2D): void {
    if (this.bleedShown <= 0 || !this.bleedColor) return;
    const { w, h } = this.ctx.view;
    const breathe = 0.82 + 0.18 * Math.sin(this.ctx.clock.now / 240);
    const grad = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.hypot(w, h) * 0.56);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, this.bleedColor);
    g.save();
    if (this.pal.particlesAdditive) g.globalCompositeOperation = "lighter";
    g.globalAlpha = 0.5 * this.bleedShown * breathe;
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.restore();
  }

  /** Cranes climbing away from their tiles on a wavering path, flapping as they go. */
  private renderFlyers(g: CanvasRenderingContext2D): void {
    if (this.flyers.length === 0) return;
    const t = this.ctx.clock.t;
    g.save();
    for (const f of this.flyers) {
      const p = clamp01((t - f.t0) / f.dur);
      const rise = easeOutCubic(p);
      const x = f.x + f.dir * f.s * 2.4 * p;
      const y = f.y - f.s * 3 * rise + Math.sin(p * Math.PI * 6) * f.s * 0.08;
      const flap = Math.sin(p * Math.PI * 9);
      const scale = 0.95 - 0.45 * p;
      g.globalAlpha = p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4;
      g.save();
      g.translate(x, y);
      g.scale(f.dir, 1);
      g.rotate(-0.35 + 0.15 * flap);
      crane(g, 0, 0, f.s * scale, flap, f.color);
      g.restore();
    }
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
    g.lineJoin = "round";
    for (const r of this.rings) {
      const p = (t - r.t0) / r.dur;
      if (p < 0) continue;
      const q = easeOutCubic(clamp01(p));
      g.globalAlpha = 0.9 * (1 - q);
      g.lineWidth = r.width * (1 - q * 0.6);
      g.strokeStyle = r.color;
      const radius = lerp(r.r0, r.r1, q);
      if (r.shape && r.shape !== "circle") {
        // Polygons are measured to the corner; pad them so they read as big as the circle.
        g.save();
        g.translate(r.x, r.y);
        g.rotate(r.spin * q);
        glyphPath(g, r.shape, 0, 0, radius * (r.shape === "diamond" ? 1.2 : 1.06));
        g.stroke();
        g.restore();
      } else {
        g.beginPath();
        g.arc(r.x, r.y, radius, 0, Math.PI * 2);
        g.stroke();
      }
    }
    g.restore();
  }

  /** The colour-wheel arcs: a band of blended paints growing round the brick, the changed primary riding its tip. */
  private renderArcs(g: CanvasRenderingContext2D): void {
    if (this.arcs.length === 0) return;
    const t = this.ctx.clock.t;
    const colors = this.pal.brickColors;
    g.save();
    g.lineCap = "butt";
    for (const a of this.arcs) {
      const p = clamp01((t - a.t0) / a.dur);
      const grow = easeOutCubic(clamp01(p / 0.6));
      const fade = p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4;
      const span = a.sweep * grow;
      const segs = Math.max(2, Math.ceil(Math.abs(span) / 0.18));
      const r = a.r * (1 + 0.08 * (1 - fade));
      const band = Math.max(2, a.r * 0.13);
      const paintAt = (u: number): string => {
        const wheel = wheelColorAt(a.from + span * u, colors);
        // Through black the band darkens toward (or lightens away from) the centre colour.
        const dark = a.black ? (a.subtract ? 1 - u : u) : 0;
        return dark > 0 ? mixColors(wheel, a.blackColor, dark * 0.85) : wheel;
      };
      g.globalAlpha = 0.85 * fade;
      g.lineWidth = band;
      // Butt-capped segments that overlap by a hair, so the band is one smooth gradient rather than a string of beads.
      const lap = (span < 0 ? -1 : 1) * Math.min(0.02, Math.abs(span) / segs / 2);
      for (let i = 0; i < segs; i++) {
        const u0 = i / segs;
        const u1 = (i + 1) / segs;
        g.strokeStyle = paintAt((u0 + u1) * 0.5);
        g.beginPath();
        g.arc(a.x, a.y, r, a.from + span * u0, a.from + span * u1 + (i < segs - 1 ? lap : 0), span < 0);
        g.stroke();
      }
      // Round ends.
      for (const [u, c] of [
        [0, paintAt(0)],
        [1, paintAt(1)],
      ] as const) {
        const ang = a.from + span * u;
        g.fillStyle = c;
        g.beginPath();
        g.arc(a.x + Math.cos(ang) * r, a.y + Math.sin(ang) * r, band / 2, 0, Math.PI * 2);
        g.fill();
      }
      // The primary that joined slides in along the wheel to the result; one that left slides out and away.
      for (const d of a.dots) {
        const k = easeOutCubic(clamp01(p / 0.7));
        const ang = a.subtract ? lerp(d.to, d.from, k) : lerp(d.from, d.to, k);
        const rr = a.subtract ? r * (1 + 0.55 * k) : r * (1.45 - 0.45 * k);
        const dotAlpha = a.subtract ? fade * (1 - 0.7 * k) : fade;
        g.globalAlpha = dotAlpha;
        g.fillStyle = d.color;
        g.beginPath();
        g.arc(a.x + Math.cos(ang) * rr, a.y + Math.sin(ang) * rr, Math.max(2, a.r * 0.11), 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = dotAlpha * 0.9;
        g.lineWidth = Math.max(1, a.r * 0.03);
        g.strokeStyle = "rgba(255,255,255,0.9)";
        g.stroke();
      }
    }
    g.restore();
  }

  private renderRipples(g: CanvasRenderingContext2D): void {
    if (this.ripples.length === 0) return;
    const t = this.ctx.clock.t;
    g.save();
    for (const r of this.ripples) {
      const q = easeOutCubic(clamp01((t - r.t0) / r.dur));
      const rad = lerp(r.r0, r.r1, q);
      g.globalAlpha = 0.5 * (1 - q);
      g.lineWidth = Math.max(2, (r.r1 - r.r0) * 0.16 * (1 - q * 0.5));
      g.strokeStyle = r.color;
      g.beginPath();
      g.ellipse(r.x, r.y, rad, rad * 0.82, 0, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 0.35 * (1 - q);
      g.strokeStyle = "#ffffff";
      g.lineWidth = Math.max(1, (r.r1 - r.r0) * 0.06);
      g.beginPath();
      g.ellipse(r.x, r.y - rad * 0.08, rad * 0.96, rad * 0.78, 0, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
    }
    g.restore();
  }

  private renderFlares(g: CanvasRenderingContext2D): void {
    if (this.flares.length === 0) return;
    const t = this.ctx.clock.t;
    g.save();
    g.globalCompositeOperation = "lighter";
    for (const f of this.flares) {
      const p = clamp01((t - f.t0) / f.dur);
      const grow = p < 0.25 ? easeOutCubic(p / 0.25) : 1;
      const fade = p < 0.25 ? 1 : 1 - (p - 0.25) / 0.75;
      const r = f.r * grow;
      const glow = g.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
      glow.addColorStop(0, rgba(f.color, 0.55 * fade));
      glow.addColorStop(1, rgba(f.color, 0));
      g.fillStyle = glow;
      g.fillRect(f.x - r, f.y - r, r * 2, r * 2);
      // four-point star, thin and long
      const L = r * 1.6 * (1 - p * 0.3);
      const k = r * 0.08;
      g.globalAlpha = 0.85 * fade;
      g.fillStyle = f.color;
      g.beginPath();
      g.moveTo(f.x, f.y - L);
      g.lineTo(f.x + k, f.y - k);
      g.lineTo(f.x + L, f.y);
      g.lineTo(f.x + k, f.y + k);
      g.lineTo(f.x, f.y + L);
      g.lineTo(f.x - k, f.y + k);
      g.lineTo(f.x - L, f.y);
      g.lineTo(f.x - k, f.y - k);
      g.closePath();
      g.fill();
      g.globalAlpha = 1;
    }
    g.restore();
  }

  /** Tiles drifting up: a halo in their colour, a sway, a slow shrink and a late fade. */
  private renderFloaters(g: CanvasRenderingContext2D): void {
    if (this.floaters.length === 0) return;
    const t = this.ctx.clock.t;
    g.save();
    for (const f of this.floaters) {
      const p = clamp01((t - f.t0) / f.dur);
      const rise = easeOutCubic(p) * f.h * 2.6;
      const x = f.x + Math.sin(p * 5 + f.phase) * f.sway * p;
      const y = f.y - rise;
      const s = 1 - 0.3 * p;
      const alpha = p < 0.55 ? 1 : 1 - (p - 0.55) / 0.45;
      const r = f.w * 0.9;
      const halo = g.createRadialGradient(x, y, 0, x, y, r);
      halo.addColorStop(0, rgba(f.color, 0.4 * alpha));
      halo.addColorStop(1, rgba(f.color, 0));
      g.globalAlpha = 1;
      g.fillStyle = halo;
      g.fillRect(x - r, y - r, r * 2, r * 2);
      g.globalAlpha = alpha;
      g.save();
      g.translate(x, y);
      g.scale(s, s);
      f.draw(g, f.w, f.h);
      g.restore();
    }
    g.restore();
  }

  private renderStreaks(g: CanvasRenderingContext2D): void {
    if (this.streaks.length === 0) return;
    const t = this.ctx.clock.t;
    g.save();
    for (const s of this.streaks) {
      const p = clamp01((t - s.t0) / s.dur);
      const top = Math.min(s.y0, s.y1);
      const bottom = Math.max(s.y0, s.y1);
      const grad = g.createLinearGradient(0, top, 0, bottom);
      grad.addColorStop(0, rgba(s.color, 0));
      grad.addColorStop(1, rgba(s.color, 0.45 * (1 - p)));
      g.fillStyle = grad;
      const w = s.w * (0.7 - 0.4 * p);
      g.fillRect(s.x - w / 2, top, w, bottom - top);
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
    this.renderFlares(sg);
    g.save();
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = TUNING.bloom;
    g.filter = "blur(5px)";
    g.drawImage(c, 0, 0, w, h);
    g.restore();
  }
}
