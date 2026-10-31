import type { ArcadeInfo } from "../../core/arcade";
import type { Color } from "../../core/color";
import { FPS } from "../../core/constants";
import type { MusicName, SpriteName } from "../../engine/assets";
import { BACKDROPS } from "../../engine/backdrops";
import { ButtonFeel } from "../../engine/buttonFeel";
import { Effects } from "../../engine/effects";
import { drawCard, drawPillButton, drawSprite, drawText, fillRoundRect, measureText, type PillButton, type TextStyle, pillRadius } from "../../engine/draw";
import { backOut, clamp01, easeOutBack, easeOutCubic } from "../../engine/easing";
import { rgba } from "../../engine/modernSkin";
import { popScale, TUNING } from "../../engine/fxTuning";
import { drawTile, type TileOptions, type TileShape } from "../../engine/tiles";
import { nextTheme, THEME_LABELS } from "../../engine/theme";
import { Tweens } from "../../engine/tween";
import { fillScreen } from "../../engine/view";
import type { GameContext, Scene } from "../Scene";
import { TitleScene } from "../TitleScene";

/**
 * Shared scaffolding for the arcade modes: a well laid out for the screen,
 * themed tiles, the score HUD, pause / game-over / level-clear cards, touch
 * controls and the feel layer (particles, callouts, shake, flash).
 *
 * A mode subclasses this and supplies its well size, its step function and
 * how to draw the inside of the well.
 */

export const STEP_MS = 1000 / FPS;

export interface WellLayout {
  cols: number;
  rows: number;
  /** Cell size in logical units. */
  cell: number;
  /** The well's playfield rectangle. */
  x: number;
  y: number;
  w: number;
  h: number;
  portrait: boolean;
  vw: number;
  vh: number;
  /** Side columns (landscape) or bands (portrait) the HUD lives in. */
  left: { x: number; y: number; w: number; h: number };
  right: { x: number; y: number; w: number; h: number };
}

/** Floating label that pops in, rises and fades. */
interface Callout {
  text: string;
  x: number;
  y: number;
  t0: number;
  dur: number;
  color: string;
  size: number;
  tilt: number;
  rise: number;
  display: boolean;
}

/** On-screen control drawn by the base: a round pill with an icon. */
export interface Control {
  id: string;
  icon: "left" | "right" | "down" | "rotate" | "drop";
  cx: number;
  cy: number;
  d: number;
  hilite: boolean;
  pressed: boolean;
}

interface SpriteButton {
  kind: "pause" | "sound";
  sprite: SpriteName;
  cx: number;
  cy: number;
  d: number;
  hilite: boolean;
  pressed: boolean;
}

export type ArcadeState = "play" | "menu" | "lost" | "won" | "intro";

const FADE_MS = 180;
/** The HUD settles in over this long as a mode opens (generated themes). */
const ARRIVE_MS = 420;
const CARD_MS = 420;
const CARD_EASE = backOut(1.2);
const COUNT_MS = 500;
const WIPE_MS = 160;

/** Break `text` into lines no wider than `maxW` in the given style. */
export function wrapText(g: CanvasRenderingContext2D, text: string, maxW: number, style: TextStyle): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const probe = line ? `${line} ${word}` : word;
    if (line && measureText(g, probe, style) > maxW) {
      lines.push(line);
      line = word;
    } else {
      line = probe;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export abstract class ArcadeScene implements Scene {
  protected readonly ctx: GameContext;
  abstract readonly info: ArcadeInfo;
  abstract readonly cols: number;
  abstract readonly rows: number;
  /** Extra cell-heights of playfield below the grid (the Bobble launcher). */
  protected extraRows = 0;
  /** Draw faint square cells in the well (off for the hex grid). */
  protected wellCells = true;

  protected L!: WellLayout;
  private layoutKey = "";
  protected state: ArcadeState = "intro";
  protected score = 0;
  protected level = 1;

  protected readonly tweens = new Tweens();
  protected readonly effects: Effects;
  protected readonly feel: ButtonFeel;
  private callouts: Callout[] = [];
  private fadeT0 = 0;
  private cardT0 = -1;
  private readonly scoreFx = { v: 0 };
  private scoreShown = 0;
  private readonly lostFx = { desat: 0 };
  private lostTimer = 0;
  /** The saved best before this run's score was recorded, so "New best!" means beaten, not tied. */
  private prevBest = 0;
  /** Height of the wrapped rule lines on the intro card, measured when drawn. */
  private introRulesHeight = 0;
  private spriteButtons: SpriteButton[] = [];
  protected controls: Control[] = [];
  /** Pointer press that began inside the well: where and when, for drags and taps. */
  protected press: { x: number; y: number; t: number; moved: boolean } | null = null;

  constructor(ctx: GameContext) {
    this.ctx = ctx;
    this.feel = new ButtonFeel(this.tweens);
    this.effects = new Effects(ctx, 500);
  }

  // ---------------------------------------------------------------------------
  // Hooks for subclasses
  // ---------------------------------------------------------------------------

  /** Advance one sim step while playing. */
  protected abstract stepPlay(): void;
  /** Draw the inside of the well (bricks, pieces) in screen space. */
  protected abstract renderWell(g: CanvasRenderingContext2D): void;
  /** Start (or restart) a game. */
  protected abstract start(): void;
  /** Small stats beside the score. */
  protected abstract stats(): Array<{ label: string; value: string }>;
  /** The "next" preview, drawn in a slot `size` wide. */
  protected renderNext(_g: CanvasRenderingContext2D, _x: number, _y: number, _size: number): void {}
  /** Label over the preview slot in the landscape HUD, or null for none. */
  protected nextLabel(): string | null {
    return "NEXT";
  }
  /** Which touch controls to show (ids are passed back to `onControl`). */
  protected controlSpec(): Array<{ id: string; icon: Control["icon"] }> {
    return [];
  }
  /** A control was tapped (or, for `held`, is being held this step). */
  protected onControl(_id: string, _held: boolean): void {}
  /** Called when the window size or theme changes. */
  protected onLayout(): void {}
  /** Pointer gestures inside the well: a tap, a horizontal drag to a column, a quick swipe down. */
  protected onWellTap(_x: number, _y: number): void {}
  protected onWellDrag(_x: number, _y: number): void {}
  protected onWellSwipeDown(): void {}
  /** Any release of a press that began in the well, after the tap / drag hooks. */
  protected onWellRelease(_x: number, _y: number): void {}
  /** Music for the mode. */
  protected abstract music(): MusicName;
  /** Lines for the level-clear card, or null if the mode has no levels. */
  protected wonLines(): string[] {
    return [];
  }

  // ---------------------------------------------------------------------------
  // Scene
  // ---------------------------------------------------------------------------

  enter(): void {
    this.ctx.audio.playMusic(this.music());
    this.fadeT0 = this.ctx.clock.t;
    this.relayout();
    this.state = "intro";
    this.cardT0 = this.ctx.clock.t + 150;
    this.start();
  }

  cursor(): string {
    const inp = this.ctx.input;
    if (this.state !== "play") {
      const off = this.cardOffset();
      return this.overlayButtons().some((b) => inp.inCentered(b.cx, b.cy + off, b.w, b.h)) ? "pointer" : "default";
    }
    if (this.spriteButtons.some((b) => b.hilite) || this.controls.some((c) => c.hilite)) return "pointer";
    return this.inWell(inp.x, inp.y) ? "crosshair" : "default";
  }

  protected inWell(x: number, y: number): boolean {
    const L = this.L;
    return x >= L.x && x <= L.x + L.w && y >= L.y && y <= L.y + L.h;
  }

  private key(): string {
    const v = this.ctx.view;
    return `${this.ctx.palette.name}:${Math.round(v.w)}x${Math.round(v.h)}:${v.portrait}`;
  }

  /** Measure the well and HUD for the current viewport. */
  protected relayout(): void {
    this.layoutKey = this.key();
    const v = this.ctx.view;
    const cols = this.cols;
    const rows = this.rows + this.extraRows;
    let cell: number;
    let L: WellLayout;
    if (v.portrait) {
      const top = 92;
      const bottom = 104;
      cell = Math.floor(Math.min((v.w - 36) / cols, (v.h - top - bottom - 24) / rows));
      const w = cell * cols;
      const h = cell * rows;
      const x = Math.round((v.w - w) / 2);
      const free = v.h - top - bottom - h;
      const y = Math.round(top + free / 2);
      L = {
        cols,
        rows,
        cell,
        x,
        y,
        w,
        h,
        portrait: true,
        vw: v.w,
        vh: v.h,
        left: { x: 0, y: 0, w: v.w, h: y - 8 },
        right: { x: 0, y: y + h + 8, w: v.w, h: v.h - (y + h + 8) },
      };
    } else {
      const margin = 16;
      cell = Math.floor(Math.min((v.h - margin * 2) / rows, (v.w - 2 * 128) / cols));
      const w = cell * cols;
      const h = cell * rows;
      const x = Math.round((v.w - w) / 2);
      const y = Math.round((v.h - h) / 2);
      L = {
        cols,
        rows,
        cell,
        x,
        y,
        w,
        h,
        portrait: false,
        vw: v.w,
        vh: v.h,
        left: { x: 0, y, w: x - 10, h },
        right: { x: x + w + 10, y, w: v.w - (x + w + 10), h },
      };
    }
    this.L = L;
    this.layoutButtons();
    this.onLayout();
  }

  private layoutButtons(): void {
    const L = this.L;
    const spec = this.controlSpec();
    const mk = (kind: SpriteButton["kind"], sprite: SpriteName, cx: number, cy: number, d: number): SpriteButton => ({
      kind,
      sprite,
      cx,
      cy,
      d,
      hilite: false,
      pressed: false,
    });
    if (L.portrait) {
      const d = Math.min(48, L.left.h * 0.6);
      this.spriteButtons = [
        mk("pause", "pause_button_sprite", L.vw - 16 - d / 2, L.left.h / 2, d),
        mk("sound", "sound_button_sprite", 16 + d * 0.3, L.left.h / 2, d * 0.6),
      ];
      const cd = Math.min(56, (L.vw - 32) / Math.max(1, spec.length) - 10, L.right.h - 16);
      const gap = Math.min(18, (L.vw - 32 - cd * spec.length) / Math.max(1, spec.length));
      const total = cd * spec.length + gap * (spec.length - 1);
      const x0 = L.vw / 2 - total / 2 + cd / 2;
      const cy = L.right.y + L.right.h / 2;
      this.controls = spec.map((s, i) => ({ id: s.id, icon: s.icon, cx: x0 + i * (cd + gap), cy, d: cd, hilite: false, pressed: false }));
      return;
    }
    const d = Math.min(L.right.w * 0.5, L.vh / 6);
    const cx = L.right.x + L.right.w / 2;
    // pause in the top-right corner with the sound toggle beside it, the same corner band the game board uses,
    // so the backdrop's hero ornament (placed under that band) stays clear of both
    const pauseCx = L.right.x + L.right.w - 16 - d / 2;
    this.spriteButtons = [
      mk("pause", "pause_button_sprite", pauseCx, L.y + d / 2, d),
      mk("sound", "sound_button_sprite", pauseCx - d * 0.5 - 12 - d * 0.3, L.y + d / 2, d * 0.6),
    ];
    const cd = Math.min(58, L.right.w * 0.42);
    const cols = Math.max(1, Math.floor((L.right.w - 12) / (cd + 10)));
    const rowsN = Math.ceil(spec.length / cols);
    const gap = 10;
    const bottom = L.y + L.h;
    this.controls = spec.map((s, i) => {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const rowCount = Math.min(cols, spec.length - r * cols);
      const rowW = rowCount * cd + (rowCount - 1) * gap;
      return {
        id: s.id,
        icon: s.icon,
        cx: cx - rowW / 2 + cd / 2 + c * (cd + gap),
        cy: bottom - cd / 2 - (rowsN - 1 - r) * (cd + gap),
        d: cd,
        hilite: false,
        pressed: false,
      };
    });
  }

  update(): void {
    const inp = this.ctx.input;
    if (this.layoutKey !== this.key()) this.relayout();

    if (this.state === "intro") {
      if (inp.keysPressed.has("Escape")) {
        this.quitToTitle();
        return;
      }
      // click, tap, Enter or Space start; other keys (theme, mute, fullscreen, movement) leave the card up
      if (inp.released || inp.keysPressed.has("Enter") || inp.keysPressed.has(" ")) {
        this.state = "play";
        this.cardT0 = -1;
        this.ctx.audio.event("tap");
      }
      return;
    }
    this.ctx.audio.setPaused(this.state === "menu");
    if (this.state === "menu" || this.state === "lost" || this.state === "won") {
      this.lostTimer++;
      this.updateOverlay();
      return;
    }

    // pause / quit keys
    if (inp.keysPressed.has("Escape")) {
      this.quitToTitle();
      return;
    }
    if (inp.keysPressed.has("p") || inp.keysPressed.has("P")) {
      this.pause();
      return;
    }

    // sprite buttons (pause, sound)
    for (const b of this.spriteButtons) {
      b.hilite = inp.inCentered(b.cx, b.cy, b.d, b.d);
      if (inp.pressed && b.hilite) b.pressed = true;
      if (!b.hilite) b.pressed = false;
      if (inp.released && b.pressed) {
        b.pressed = false;
        if (b.kind === "pause") this.pause();
        else {
          const muted = this.ctx.audio.toggleMute();
          this.ctx.save.muted = muted;
          this.ctx.persist();
          if (!muted) this.ctx.audio.event("toggleOn");
        }
        return;
      }
    }
    if (this.state !== "play") return;

    // touch controls
    let onControl = false;
    for (const c of this.controls) {
      c.hilite = inp.inCentered(c.cx, c.cy, c.d, c.d);
      if (inp.pressed && c.hilite) {
        c.pressed = true;
        this.onControl(c.id, false);
        onControl = true;
      }
      if (!c.hilite || !inp.down) c.pressed = false;
      if (c.pressed) this.onControl(c.id, true);
    }

    // well gestures
    if (inp.pressed && !onControl && this.inWell(inp.x, inp.y)) {
      this.press = { x: inp.x, y: inp.y, t: this.ctx.clock.t, moved: false };
    }
    if (this.press && inp.down) {
      const dx = inp.x - this.press.x;
      const dy = inp.y - this.press.y;
      if (Math.abs(dx) > this.L.cell * 0.5 || Math.abs(dy) > this.L.cell * 0.5) this.press.moved = true;
      if (this.press.moved) {
        if (dy > this.L.cell * 2 && dy > Math.abs(dx) * 1.5 && this.ctx.clock.t - this.press.t < 350) {
          this.onWellSwipeDown();
          this.press = null;
        } else {
          this.onWellDrag(inp.x, inp.y);
        }
      }
    }
    if (inp.released && this.press) {
      if (!this.press.moved) this.onWellTap(inp.x, inp.y);
      this.onWellRelease(inp.x, inp.y);
      this.press = null;
    }
    if (!inp.down) this.press = null;

    this.stepPlay();
  }

  protected pause(): void {
    if (this.state !== "play") return;
    this.state = "menu";
    this.press = null;
    this.cardT0 = this.ctx.clock.t;
    this.ctx.audio.event("tap");
  }

  private updateOverlay(): void {
    const inp = this.ctx.input;
    if (inp.keysPressed.has("Escape") || inp.keysPressed.has("p") || inp.keysPressed.has("P")) {
      if (this.state === "menu") {
        this.state = "play";
        return;
      }
    }
    if (this.lostTimer < 8) return;
    if ((this.state === "lost" || this.state === "won") && (inp.keysPressed.has("Enter") || inp.keysPressed.has(" "))) {
      this.ctx.audio.event("tap");
      this.restart();
      return;
    }
    // buttons are hit where they are drawn: offset while the card slides in, hidden early on the game-over card
    if (this.state === "lost" && this.lostTimer <= 20) return;
    const off = this.cardOffset();
    const hit = this.overlayButtons().find((b) => inp.released && inp.inCentered(b.cx, b.cy + off, b.w, b.h));
    if (!hit) return;
    this.ctx.audio.event("tap");
    if (hit.id === "resume") this.state = "play";
    else if (hit.id === "menu") this.quitToTitle();
    else if (hit.id === "theme") this.ctx.setTheme(nextTheme(this.ctx.save.theme));
    else if (hit.id === "retry" || hit.id === "next") this.restart();
  }

  /** Retry after a loss (score reset) or carry on after a clear. */
  private restart(): void {
    if (this.state === "lost") {
      this.score = 0;
      this.scoreFx.v = 0;
      this.scoreShown = 0;
      this.level = 1;
    }
    this.lostFx.desat = 0;
    this.tweens.clear();
    this.effects.clear();
    this.callouts = [];
    this.press = null;
    this.state = "play";
    this.cardT0 = -1;
    this.start();
  }

  protected overlayButtons(): PillButton[] {
    const vp = this.ctx.view;
    const cx = vp.w / 2;
    const y = this.cardBottom() - 54;
    const w = 150;
    const h = 44;
    if (this.state === "intro") return [{ id: "go", label: "Play", cx, cy: y, w: 180, h, primary: true }];
    if (this.state === "lost") {
      return [
        { id: "retry", label: "Retry", cx: cx - w / 2 - 8, cy: y, w, h, primary: true },
        { id: "menu", label: "Quit to title", cx: cx + w / 2 + 8, cy: y, w, h },
      ];
    }
    if (this.state === "won") {
      return [
        { id: "next", label: "Next level", cx: cx - w / 2 - 8, cy: y, w, h, primary: true },
        { id: "menu", label: "Quit to title", cx: cx + w / 2 + 8, cy: y, w, h },
      ];
    }
    return [
      { id: "resume", label: "Resume", cx: cx - w / 2 - 8, cy: y - 52, w, h, primary: true },
      { id: "menu", label: "Quit to title", cx: cx + w / 2 + 8, cy: y - 52, w, h },
      { id: "theme", label: `Theme: ${THEME_LABELS[this.ctx.palette.name]}`, cx, cy: y, w: w * 2 + 16, h },
    ];
  }

  protected lose(): void {
    if (this.state === "lost") return;
    this.state = "lost";
    this.press = null;
    this.lostTimer = 0;
    this.cardT0 = this.ctx.clock.t + 250;
    this.tweens.to(this.lostFx, { desat: 1 }, 400);
    this.effects.vignette(0.6, 1600);
    this.ctx.audio.event("lose");
    this.recordBest();
  }

  protected win(): void {
    if (this.state === "won") return;
    this.state = "won";
    this.press = null;
    this.lostTimer = 0;
    this.cardT0 = this.ctx.clock.t + 700;
    this.ctx.audio.event("achieve");
    this.celebrate();
    this.recordBest();
  }

  protected recordBest(): void {
    const save = this.ctx.save;
    const best = save.arcadeBest[this.info.id] ?? 0;
    this.prevBest = best;
    if (this.score > best) save.arcadeBest[this.info.id] = this.score;
    this.ctx.persist();
  }

  protected get best(): number {
    return this.ctx.save.arcadeBest[this.info.id] ?? 0;
  }

  protected quitToTitle(): void {
    this.recordBest();
    this.ctx.setScene(new TitleScene(this.ctx, "arcade"));
  }

  // ---------------------------------------------------------------------------
  // Feel helpers
  // ---------------------------------------------------------------------------

  protected addScore(n: number): void {
    this.score += n;
  }

  protected callout(text: string, x: number, y: number, color: string, size = 18, display = false, dur = 800): void {
    this.callouts.push({ text, x, y, t0: this.ctx.clock.t, dur, color, size, tilt: (Math.random() - 0.5) * 0.12, rise: 26 + size * 0.4, display });
  }

  protected ring(x: number, y: number, r0: number, r1: number, color: string, width = 3, dur = 260): void {
    this.effects.ring(x, y, r0, r1, color, width, dur);
  }

  protected shake(amp: number, dir?: [number, number]): void {
    this.effects.shake(amp, dir);
  }

  protected flash(color: string, ms = 90): void {
    this.effects.flash(color, ms);
  }

  /** Ring, hit-stop, shake and flash for a pop of intensity `k` centred at (x, y). */
  protected impact(k: number, x: number, y: number, color?: Color): void {
    const sc = popScale(k);
    const L = this.L;
    this.effects.burstRing(x, y, L.cell, this.ctx.palette.callout, k, 60, 300, color);
    if (k >= 0.1) this.effects.impact(k);
    this.effects.shake(sc.shake, [x - (L.x + L.w / 2), y - (L.y + L.h / 2)]);
    if (k >= 0.25) this.effects.flash(this.ctx.palette.flash, 90, sc.flash);
    if (k >= 0.5 && color !== undefined) this.effects.wash(this.colorOf(color), 450 + 250 * k);
  }

  /** Debris, fragments and sparks from a popped tile centred at (cx, cy), in the theme's own style. */
  protected burst(cx: number, cy: number, color: Color, o: { count?: number; k?: number; shape?: TileShape; seed?: number } = {}): void {
    const cell = this.L.cell;
    const sp = this.ctx.sprites;
    const pal = this.ctx.palette;
    const shape = o.shape ?? "square";
    this.effects.pop({
      x: cx - cell / 2,
      y: cy - cell / 2,
      w: cell,
      h: cell,
      color,
      k: o.k ?? 0,
      debris: o.count ?? 12,
      draw: (g, w) => drawTile(g, sp, pal, color, -w / 2, -w / 2, w, { shape, seed: o.seed }),
      floor: this.L.y + this.L.h - cell * 0.1,
    });
  }

  /** Level clear: a fountain of debris from the bottom of the well. */
  protected celebrate(): void {
    const L = this.L;
    const xs = Array.from({ length: L.cols }, (_, x) => L.x + (x + 0.5) * L.cell);
    this.effects.celebrate(xs, L.y + L.h, L.cell, (i) => ((i % 6) + 1) as Color, this.ctx.palette.kind === "generated" ? 45 : 0);
  }

  /** Screen position of a grid cell's top-left corner. */
  protected cellPos(gx: number, gy: number): { x: number; y: number } {
    return { x: this.L.x + gx * this.L.cell, y: this.L.y + gy * this.L.cell };
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  render(g: CanvasRenderingContext2D): void {
    const clock = this.ctx.clock;
    this.tweens.update(clock.t);
    this.effects.update();
    const t = clock.t;
    if (this.score !== this.scoreShown) {
      this.scoreShown = this.score;
      this.tweens.to(this.scoreFx, { v: this.score }, COUNT_MS);
    }
    this.callouts = this.callouts.filter((c) => t - c.t0 < c.dur);

    const pal = this.ctx.palette;
    fillScreen(g, pal.background);
    if (pal.kind === "generated" && pal.backdrop !== "sprites") BACKDROPS[pal.backdrop](g, t);

    g.save();
    this.effects.applyShake(g, this.L.vw / 2, this.L.vh / 2);
    this.renderWellPanel(g);
    this.effects.renderUnder(g);
    g.save();
    const desat = this.lostFx.desat;
    if (desat > 0) g.filter = `saturate(${Math.round((1 - desat * 0.9) * 100)}%)`;
    this.renderWell(g);
    g.filter = "none";
    g.restore();
    this.effects.renderWorld(g);
    this.effects.renderWash(g, this.L.x, this.L.y, this.L.w, this.L.h);
    this.effects.renderFlash(g, this.L.x, this.L.y, this.L.w, this.L.h);
    this.renderCallouts(g);
    {
      // the HUD settles down into place as the mode opens (generated themes)
      const a = pal.kind === "generated" ? (1 - easeOutCubic(clamp01((t - this.fadeT0) / ARRIVE_MS))) * TUNING.motion : 0;
      g.save();
      g.translate(0, -a * 24);
      g.globalAlpha = 1 - a * 0.6;
      this.renderHud(g);
      g.restore();
    }
    this.effects.renderVignette(g);
    g.restore();

    if (this.state === "intro") this.renderIntro(g);
    if (this.state === "menu") this.renderCard(g, "Paused", [`${this.info.name}   ·   Score ${this.score}`], undefined, this.info.keys);
    if (this.state === "lost") {
      const best = this.score > this.prevBest && this.score > 0;
      this.renderCard(g, "Game over", [`Score ${this.score}`, `Best ${this.best}`], best ? "New best!" : undefined);
    }
    if (this.state === "won") this.renderCard(g, "Level clear", this.wonLines(), undefined);

    const e = t - this.fadeT0;
    if (e < FADE_MS && pal.kind === "classic") {
      g.globalAlpha = 1 - clamp01(e / FADE_MS);
      fillScreen(g, pal.background);
      g.globalAlpha = 1;
    }
  }

  /** The well itself: a sunken panel with faint cells, in the theme's hold-slot colours. */
  protected renderWellPanel(g: CanvasRenderingContext2D): void {
    const L = this.L;
    const pal = this.ctx.palette;
    const pad = 8;
    if (pal.kind === "classic") {
      fillRoundRect(g, L.x - pad, L.y - pad, L.w + pad * 2, L.h + pad * 2, 6, "#1b1b1b", "#3a3a3a", 2);
      g.save();
      g.globalAlpha = 0.35;
      g.strokeStyle = pal.gridLine;
      g.lineWidth = 1;
      for (let i = 1; i < L.cols; i++) {
        g.beginPath();
        g.moveTo(L.x + i * L.cell, L.y);
        g.lineTo(L.x + i * L.cell, L.y + L.h);
        g.stroke();
      }
      for (let i = 1; i < L.rows; i++) {
        g.beginPath();
        g.moveTo(L.x, L.y + i * L.cell);
        g.lineTo(L.x + L.w, L.y + i * L.cell);
        g.stroke();
      }
      g.restore();
      return;
    }
    fillRoundRect(g, L.x - pad, L.y - pad + 4, L.w + pad * 2, L.h + pad * 2, 14, pal.ui.cardShadow);
    fillRoundRect(g, L.x - pad, L.y - pad, L.w + pad * 2, L.h + pad * 2, 14, pal.well, pal.wellEdge, 1.5);
    if (this.wellCells) {
      // faint cells so the columns read, in the theme's active-well tint
      const inset = L.cell * 0.06;
      g.fillStyle = pal.wellActive;
      g.globalAlpha = 0.6;
      for (let x = 0; x < L.cols; x++) {
        for (let y = 0; y < this.rows; y++) {
          g.beginPath();
          g.roundRect(L.x + x * L.cell + inset, L.y + y * L.cell + inset, L.cell - inset * 2, L.cell - inset * 2, L.cell * 0.18);
          g.fill();
        }
      }
      g.globalAlpha = 1;
    }
  }

  /** A brick in the theme's art (see engine/tiles.ts). */
  protected drawTile(g: CanvasRenderingContext2D, color: Color, x: number, y: number, size: number, o: TileOptions = {}): void {
    drawTile(g, this.ctx.sprites, this.ctx.palette, color, x, y, size, o);
  }

  /** Progress of a colour wipe that started at `t0`, 0..1. */
  protected wipeAt(t0: number): number {
    return clamp01((this.ctx.clock.t - t0) / WIPE_MS);
  }

  private renderCallouts(g: CanvasRenderingContext2D): void {
    if (!this.callouts.length) return;
    const t = this.ctx.clock.t;
    const pal = this.ctx.palette;
    for (const c of this.callouts) {
      const e = t - c.t0;
      if (e < 0) continue;
      const p = clamp01(e / c.dur);
      const scale = 0.6 + 0.4 * easeOutBack(clamp01(e / 120));
      const fadeLen = 200 / c.dur;
      const alpha = p > 1 - fadeLen ? (1 - p) / fadeLen : 1;
      g.save();
      g.translate(c.x, c.y - c.rise * easeOutCubic(p));
      g.rotate(c.tilt);
      g.scale(scale, scale);
      g.globalAlpha = alpha;
      drawText(g, c.text, 0, 0, {
        size: c.size,
        color: c.color,
        shadow: pal.calloutShadow,
        weight: c.display ? 600 : 800,
        font: c.display ? pal.display : pal.font,
        tabular: true,
      });
      g.restore();
    }
  }

  /** Score, best, stats and next preview on one side; pause, sound and controls on the other. */
  private renderHud(g: CanvasRenderingContext2D): void {
    const L = this.L;
    const pal = this.ctx.palette;
    const inp = this.ctx.input;
    const sp = this.ctx.sprites;
    const classic = pal.kind === "classic";
    const textC = classic ? "#f0f0f0" : pal.hudText;
    const mutedC = classic ? "#9a9a9a" : pal.hudMuted;
    const shown = String(Math.round(this.scoreFx.v));
    const stats = this.stats();

    if (L.portrait) {
      const band = L.left;
      const cy = band.h / 2;
      // name and score on the left, the next piece centred, stats on the right: all inside the sound and pause buttons
      const pauseBtn = this.spriteButtons.find((b) => b.kind === "pause");
      const soundBtn = this.spriteButtons.find((b) => b.kind === "sound");
      const leftX = soundBtn ? Math.max(L.x, soundBtn.cx + soundBtn.d / 2 + 12) : L.x;
      drawText(g, this.info.name.toUpperCase(), leftX, cy - 14, { size: 11, color: mutedC, weight: 700, align: "left" });
      drawText(g, shown, leftX, cy + 12, { size: 30, color: textC, weight: 600, font: pal.display, tabular: true, align: "left" });
      let sx = pauseBtn ? Math.min(L.x + L.w, pauseBtn.cx - pauseBtn.d / 2 - 12) : L.x + L.w;
      for (let i = stats.length - 1; i >= 0; i--) {
        const st = stats[i];
        drawText(g, st.label.toUpperCase(), sx, cy - 14, { size: 10, color: mutedC, weight: 700, align: "right" });
        drawText(g, st.value, sx, cy + 12, { size: 22, color: textC, weight: 600, font: pal.display, tabular: true, align: "right" });
        sx -= 74;
      }
      const ns = Math.min(40, band.h * 0.5);
      this.renderNext(g, L.vw / 2 - ns / 2, cy - ns / 2, ns);
    } else {
      const col = L.left;
      const cx = col.x + col.w / 2;
      let y = L.y + 8;
      drawText(g, this.info.name.toUpperCase(), cx, y + 8, { size: 11, color: mutedC, weight: 700 });
      y += 26;
      drawText(g, "SCORE", cx, y + 6, { size: 11, color: mutedC, weight: 700 });
      drawText(g, shown, cx, y + 34, { size: Math.min(40, col.w * 0.3), color: textC, weight: 600, font: pal.display, tabular: true });
      y += 60;
      drawText(g, `Best ${this.best}`, cx, y + 6, { size: 12, color: mutedC, weight: 600, tabular: true });
      y += 34;
      for (const st of stats) {
        drawText(g, st.label.toUpperCase(), cx, y + 6, { size: 10, color: mutedC, weight: 700 });
        drawText(g, st.value, cx, y + 28, { size: 24, color: textC, weight: 600, font: pal.display, tabular: true });
        y += 50;
      }
      const ns = Math.min(64, col.w * 0.5);
      const label = this.nextLabel();
      if (label) drawText(g, label, cx, y + 6, { size: 10, color: mutedC, weight: 700 });
      this.renderNext(g, cx - ns / 2, y + 18, ns);
    }

    for (const b of this.spriteButtons) {
      const sprite = sp[b.sprite];
      const base = b.kind === "sound" ? (this.ctx.audio.muted ? 2 : 0) : 0;
      const frame = b.pressed ? Math.min(sprite.frames.length - 1, base + 1) : base;
      const scale = this.feel.scale(`arc:${b.kind}`, b.hilite, b.pressed);
      drawSprite(g, sprite, frame, b.cx - (b.d * scale) / 2, b.cy - (b.d * scale) / 2, b.d * scale, b.d * scale);
    }
    for (const c of this.controls) {
      const hover = c.hilite && inp.x >= 0;
      const scale = this.feel.scale(`ctl:${c.id}`, hover, c.pressed);
      const d = c.d * scale;
      fillRoundRect(
        g,
        c.cx - d / 2,
        c.cy - d / 2,
        d,
        d,
        pillRadius(pal.ui, d),
        c.pressed ? pal.ui.secondaryHover : pal.ui.secondary,
        pal.ui.secondaryEdge,
        1.5,
      );
      this.drawIcon(g, c.icon, c.cx, c.cy, d * 0.26, classic ? "#f0f0f0" : pal.ui.secondaryText);
    }
  }

  private drawIcon(g: CanvasRenderingContext2D, icon: Control["icon"], cx: number, cy: number, r: number, color: string): void {
    g.save();
    g.translate(cx, cy);
    g.strokeStyle = color;
    g.fillStyle = color;
    g.lineWidth = Math.max(2, r * 0.28);
    g.lineCap = "round";
    g.lineJoin = "round";
    const chevron = (rot: number) => {
      g.save();
      g.rotate(rot);
      g.beginPath();
      g.moveTo(-r * 0.5, -r * 0.7);
      g.lineTo(r * 0.3, 0);
      g.lineTo(-r * 0.5, r * 0.7);
      g.stroke();
      g.restore();
    };
    if (icon === "left") chevron(Math.PI);
    else if (icon === "right") chevron(0);
    else if (icon === "down") chevron(Math.PI / 2);
    else if (icon === "drop") {
      chevron(Math.PI / 2);
      g.beginPath();
      g.moveTo(-r * 0.75, r * 0.95);
      g.lineTo(r * 0.75, r * 0.95);
      g.stroke();
    } else {
      g.beginPath();
      g.arc(0, 0, r * 0.75, -Math.PI * 0.2, Math.PI * 1.25);
      g.stroke();
      g.beginPath();
      const a = -Math.PI * 0.2;
      const px = Math.cos(a) * r * 0.75;
      const py = Math.sin(a) * r * 0.75;
      g.moveTo(px - r * 0.45, py - r * 0.1);
      g.lineTo(px + r * 0.15, py - r * 0.5);
      g.lineTo(px + r * 0.25, py + r * 0.3);
      g.closePath();
      g.fill();
    }
    g.restore();
  }

  // ---------------------------------------------------------------------------
  // Cards
  // ---------------------------------------------------------------------------

  private cardOffset(): number {
    const e = this.ctx.clock.t - this.cardT0;
    const vh = this.ctx.view.h;
    if (e < 0) return vh;
    return (1 - CARD_EASE(clamp01(e / CARD_MS))) * vh * 0.6;
  }

  private cardHeight(): number {
    if (this.state === "intro") return 110 + this.introRulesHeight + 100;
    if (this.state === "menu") return 236 + 52 + 36;
    if (this.state === "won") return 236 + Math.max(0, this.wonLines().length - 2) * 24;
    return 236 + 22;
  }

  private cardBottom(): number {
    return this.ctx.view.h / 2 - this.cardHeight() / 2 + this.cardHeight();
  }

  private renderCard(g: CanvasRenderingContext2D, title: string, lines: string[], accent?: string, footer?: string): void {
    const inp = this.ctx.input;
    const pal = this.ctx.palette;
    const e = this.ctx.clock.t - this.cardT0;
    g.globalAlpha = clamp01(e / 200);
    fillScreen(g, pal.ui.dim);
    g.globalAlpha = 1;
    const off = this.cardOffset();
    const vp = this.ctx.view;
    const w = Math.min(460, vp.w - 24);
    const h = this.cardHeight();
    const x = vp.w / 2 - w / 2;
    const y = vp.h / 2 - h / 2 + off;
    drawCard(g, pal.ui, x, y, w, h, 20);
    drawText(g, title, vp.w / 2, y + 46, { size: 30, color: pal.overlayText, weight: 600, font: pal.display });
    lines.forEach((line, i) => drawText(g, line, vp.w / 2, y + 90 + i * 24, { size: 16, color: pal.hudMuted, weight: 500, tabular: true }));
    if (accent) drawText(g, accent, vp.w / 2, y + 90 + lines.length * 24, { size: 16, color: pal.overlayAccent, weight: 700 });
    if (footer) drawText(g, footer, vp.w / 2, y + h - 18, { size: 11, color: pal.hudMuted, weight: 500 });
    if (this.state === "lost" && this.lostTimer <= 20) return;
    for (const b of this.overlayButtons()) {
      b.cy += off;
      const hover = inp.inCentered(b.cx, b.cy, b.w, b.h);
      const pressed = hover && inp.down;
      b.scale = this.feel.scale(`overlay:${b.id}`, hover, pressed);
      drawPillButton(g, pal.ui, b, hover, pressed, pal.font);
    }
  }

  /** How-to-play card shown before the first piece moves. */
  private renderIntro(g: CanvasRenderingContext2D): void {
    const inp = this.ctx.input;
    const pal = this.ctx.palette;
    {
      const cw = Math.min(500, this.ctx.view.w - 24);
      let hh = 0;
      for (const rule of this.info.rules) hh += wrapText(g, rule, cw - 90, { size: 13, weight: 500 }).length * 18 + 6;
      this.introRulesHeight = hh;
    }
    const e = this.ctx.clock.t - this.cardT0;
    g.globalAlpha = clamp01(e / 200);
    fillScreen(g, pal.ui.dim);
    g.globalAlpha = 1;
    const off = this.cardOffset();
    const vp = this.ctx.view;
    const w = Math.min(500, vp.w - 24);
    const h = this.cardHeight();
    const x = vp.w / 2 - w / 2;
    const y = vp.h / 2 - h / 2 + off;
    drawCard(g, pal.ui, x, y, w, h, 20);
    drawText(g, this.info.name, vp.w / 2, y + 44, { size: 30, color: pal.overlayText, weight: 600, font: pal.display });
    drawText(g, this.info.tagline, vp.w / 2, y + 74, { size: 13, color: pal.hudMuted, weight: 600 });
    const tile = 22;
    let ly = y + 108;
    this.info.rules.forEach((rule, i) => {
      this.drawTile(g, ((i % 6) + 1) as Color, x + 26, ly - tile / 2, tile * 0.7, { s: 1 });
      for (const line of wrapText(g, rule, w - 90, { size: 13, weight: 500 })) {
        drawText(g, line, x + 56, ly, { size: 13, color: pal.overlayText, weight: 500, align: "left" });
        ly += 18;
      }
      ly += 6;
    });
    drawText(g, this.info.keys, vp.w / 2, y + h - 78, { size: 11, color: pal.hudMuted, weight: 500 });
    for (const b of this.overlayButtons()) {
      b.cy += off;
      const hover = inp.inCentered(b.cx, b.cy, b.w, b.h);
      const pressed = hover && inp.down;
      b.scale = this.feel.scale(`overlay:${b.id}`, hover, pressed);
      drawPillButton(g, pal.ui, b, hover, pressed, pal.font);
    }
  }

  /** Accent colour for a brick colour, for callouts and rings. */
  protected colorOf(c: Color): string {
    return this.ctx.palette.brickColors[c];
  }

  protected rgba(hex: string, a: number): string {
    return rgba(hex, a);
  }
}
