import { ARCADE_MODES, type ArcadeInfo, type ArcadeMode } from "../core/arcade";
import { BTN_H, BTN_W, MAX_WORLD, type GameType } from "../core/constants";
import type { SpriteName } from "../engine/assets";
import { ButtonFeel } from "../engine/buttonFeel";
import { drawCard, drawPillButton, drawSprite, drawText, fillRoundRect, measureText, type PillButton } from "../engine/draw";
import { fillScreen, screenRect } from "../engine/view";
import { backOut, clamp01, easeOutBack, easeOutCubic } from "../engine/easing";
import { drawBlockyBackdrop } from "../engine/blockySkin";
import { BACKDROPS, type Pointer, type Tap } from "../engine/backdrops";
import { debrisFor } from "../engine/debris";
import { drawStain, rgba as rgbaOf } from "../engine/modernSkin";
import { Particles } from "../engine/particles";
import type { Color } from "../core/color";
import { nextTheme, THEME_LABELS, THEME_ORDER } from "../engine/theme";
import { setReducedMotion } from "../engine/fxTuning";
import { drawModeGlyph } from "../engine/modeGlyph";
import { drawSpeaker, SoundControls } from "../engine/soundControls";
import { drawSwatch, fitSwatch, gridHeight, layoutGrid, swatchAt, type Swatch } from "../engine/themePicker";
import { Tweens } from "../engine/tween";
import { drawTile } from "../engine/tiles";
import { createArcadeScene } from "./arcade";
import { GameScene } from "./GameScene";
import type { GameContext, Scene } from "./Scene";

type MenuState = "main" | "mode" | "arcade" | "world" | "credits" | "settings" | "themes" | "launch";

/** A mode tile on the arcade grid. */
interface ArcadeTile {
  info: ArcadeInfo;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface MenuButton {
  id: string;
  sprite: SpriteName;
  cx: number;
  cy: number;
  w: number;
  h: number;
  /** Frame used while the pointer is held on the button. */
  pressedFrame: number;
  onPress: () => void;
}

interface WallBrick {
  cx: number;
  cy: number;
  frame: number;
  nextFrame: number;
  /** 0 = idle; otherwise progress of the flip animation in frames. */
  flip: number;
  /** Blocky wall: 0 = resting, 1 = at the top of a hop. */
  hop: number;
  /** Sim step when a tap ripple reaches this brick, or -1. */
  rippleAt: number;
}

/** A gel brick drifting up the dark field behind the Spectra title. */
interface Bubble {
  x: number;
  y: number;
  size: number;
  speed: number;
  drift: number;
  frame: number;
  /** Fade phase 0..1 over the climb. */
  phase: number;
  wobble: number;
  /** Colour flip from a tap ripple: start time (or -1) and the colour to show. */
  flipT0: number;
  nextFrame: number;
  rippleAt: number;
}

/** A paint chip lying on the paper behind the modern title. */
interface ScatterChip {
  x: number;
  y: number;
  size: number;
  tilt: number;
  frame: number;
  /** Settle animation: 0 = just dropped, 1 = resting. */
  p: number;
  /** How close the cursor is (0..1), smoothed; lifts and tilts the chip. */
  hover: number;
  /** Colour flip from a tap ripple: start time (or -1) and the colour to show. */
  flipT0: number;
  nextFrame: number;
  rippleAt: number;
}

const WALL_COLS = 12;
const WALL_SIZE = BTN_H / 2;
/** Rows of the original 760 x 507 wall; the classic world-select card is sized from it. */
const WALL_ROWS = Math.ceil((WALL_COLS * 2) / 3);
const FLIP_FRAMES = 16;
/** Ripple: ms of delay per logical unit from the tap, and the flip length. */
const RIPPLE_MS_PER_UNIT = 1.1;
const RIPPLE_FRAMES_PER_UNIT = 1 / 18;
const CHIP_FLIP_MS = 360;
const FADE_MS = 180;
const SCATTER_EASE = backOut(1.4);

/**
 * Title screen. The original built its menus out of a wall of flipping bricks
 * driven by a bespoke menu system; the classic theme keeps that wall, the
 * modern theme lays paint chips on paper. Both share the same three-step
 * flow (logo -> game mode -> world).
 */
export class TitleScene implements Scene {
  private readonly ctx: GameContext;
  private menu: MenuState = "main";
  private buttons: MenuButton[] = [];
  private wall: WallBrick[] = [];
  private chips: ScatterChip[] = [];
  private bubbles: Bubble[] = [];
  private held: MenuButton | null = null;
  private time = 0;
  private launchT0 = -1;
  private pendingType: GameType = "normal";
  private pendingArcade: ArcadeMode | null = null;
  private arcadeTiles: ArcadeTile[] = [];
  private heldTile: ArcadeTile | null = null;
  private readonly tweens = new Tweens();
  private readonly feel: ButtonFeel;
  private enterT0 = 0;
  private readonly sound = new SoundControls();
  /** Pill buttons on the modern main menu (Play, Continue). */
  private pills: PillButton[] = [];
  private heldPill: PillButton | null = null;
  /** Swatches on the theme picker card. */
  private themeSwatches: Swatch[] = [];
  /** Debris from tapping the backdrop. */
  private readonly particles = new Particles(240);
  /** Smoothed cursor offset from the centre (-0.5..0.5), for parallax. */
  private readonly parallax = { x: 0, y: 0 };
  /** Recent taps on the backdrop, for the ripple rings and the themed reactions. */
  private readonly taps: Tap[] = [];
  /** Paint stains left by taps on the Pigment paper. */
  private stains: Array<{ x: number; y: number; r: number; t: number; seed: number; color: string }> = [];
  /** Viewport size the menus were last laid out for. */
  private sizeKey = "";

  private get W(): number {
    return this.ctx.view.w;
  }

  private get H(): number {
    return this.ctx.view.h;
  }

  /**
   * Top-right utility cluster. Classic keeps its two small icon pills; the
   * modern title has a labelled theme pill that opens the picker, a speaker
   * and the fullscreen toggle, all at a finger-sized height.
   */
  private get themeToggle(): { cx: number; cy: number; w: number; h: number } {
    if (!this.generated) return { cx: this.W - 36, cy: 26, w: 48, h: 30 };
    const w = this.W < 520 ? 44 : 130;
    return { cx: this.W - 30 - 48 - 48 - 8 - w / 2, cy: 28, w, h: 38 };
  }

  private get soundToggle(): { cx: number; cy: number; w: number; h: number } {
    return { cx: this.W - 30 - 48, cy: 28, w: 38, h: 38 };
  }

  private get fullscreenToggle(): { cx: number; cy: number; w: number; h: number } {
    if (!this.generated) return { cx: this.W - 36 - 58, cy: 26, w: 48, h: 30 };
    return { cx: this.W - 30, cy: 28, w: 38, h: 38 };
  }

  /** Where the logo sits: a third of the way down sideways, centred above the bar upright. */
  private logoY(): number {
    return this.ctx.view.portrait ? (this.H - BTN_H) / 2 - 10 : 205;
  }

  /** Re-place everything for a new window size, keeping the current menu. */
  private relayout(): void {
    this.sizeKey = `${Math.round(this.W)}x${Math.round(this.H)}`;
    this.resetWall();
    this.scatterChips();
    this.resetBubbles();
    this.held = null;
    if (this.menu === "main") this.showMain();
    else if (this.menu === "mode") this.showModes();
    else if (this.menu === "arcade") this.showArcade();
    else if (this.menu === "world") this.showWorlds(this.pendingType);
  }

  constructor(ctx: GameContext, initial: "main" | "arcade" = "main") {
    this.ctx = ctx;
    this.feel = new ButtonFeel(this.tweens);
    this.relayout();
    if (initial === "arcade") this.showArcade();
  }

  /** Twenty gel bricks that float up and fade like bubbles. */
  private resetBubbles(): void {
    this.bubbles = Array.from({ length: 20 }, () => this.newBubble(Math.random()));
  }

  private newBubble(phase: number): Bubble {
    const size = 22 + Math.random() * 34;
    return {
      x: size + Math.random() * (this.W - size * 2),
      y: 0,
      size,
      speed: 14 + Math.random() * 16,
      drift: (Math.random() - 0.5) * 10,
      frame: Math.floor(Math.random() * 6),
      phase,
      wobble: Math.random() * Math.PI * 2,
      flipT0: -1,
      nextFrame: 0,
      rippleAt: -1,
    };
  }

  private renderBubbles(g: CanvasRenderingContext2D): void {
    const sp = this.ctx.sprites;
    const dt = this.ctx.clock.dt / 1000;
    const t = this.ctx.clock.t;
    const travel = this.H - BTN_H + 60;
    const ptr = this.pointer();
    const par = this.parallax;
    for (let i = 0; i < this.bubbles.length; i++) {
      let b = this.bubbles[i];
      b.phase += (b.speed * dt) / travel;
      if (b.phase >= 1) {
        b = this.newBubble(0);
        this.bubbles[i] = b;
      }
      const y = this.bubbleY(b);
      let x = b.x + Math.sin(t / 1400 + b.wobble) * b.drift;
      // the cursor nudges bubbles aside as they pass
      if (ptr) {
        const dx = x - ptr.x;
        const dy = y - ptr.y;
        const d = Math.hypot(dx, dy);
        if (d < 70 && d > 0.01) b.x += (dx / d) * (70 - d) * 0.06;
      }
      x += -par.x * b.size * 0.3;
      let frame = b.frame;
      let sx = 1;
      if (b.flipT0 >= 0) {
        const q = (t - b.flipT0) / CHIP_FLIP_MS;
        if (q >= 1) {
          b.frame = b.nextFrame;
          b.flipT0 = -1;
          frame = b.frame;
        } else {
          sx = Math.max(0.04, Math.abs(Math.cos(q * Math.PI)));
          frame = q < 0.5 ? b.frame : b.nextFrame;
        }
      }
      const a = Math.sin(b.phase * Math.PI) * 0.55;
      g.globalAlpha = a;
      const gw = b.size * 1.5;
      drawSprite(g, sp.brick_glow_sprite, frame, x - gw / 2, y - gw / 2, gw, gw);
      g.save();
      g.translate(x, y);
      g.scale(sx, 1);
      drawSprite(g, sp.brick_noicon_sprite, frame, -b.size / 2, -b.size / 2, b.size, b.size);
      g.restore();
    }
    g.globalAlpha = 1;
    if (ptr) {
      par.x += (ptr.x / this.W - 0.5 - par.x) * 0.08;
      par.y += (ptr.y / this.H - 0.5 - par.y) * 0.08;
    }
  }

  /** The brick wall behind the classic and blocky titles (blocky starts with a few coloured bricks). */
  private resetWall(): void {
    const blocky = this.ctx.palette.name === "blocky";
    this.wall = [];
    const rows = Math.ceil(this.H / WALL_SIZE);
    const cols = Math.ceil(this.W / WALL_SIZE);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col <= cols; col++) {
        this.wall.push({
          cx: col * WALL_SIZE + WALL_SIZE / 2,
          cy: this.H - row * WALL_SIZE - WALL_SIZE / 2,
          frame: blocky && Math.random() < 0.22 ? Math.floor(Math.random() * 6) : 7,
          nextFrame: 7,
          flip: 0,
          hop: 0,
          rippleAt: -1,
        });
      }
    }
  }

  enter(): void {
    this.ctx.audio.playMusic("title_bgm");
    this.enterT0 = this.ctx.clock.t;
    this.chips.forEach((c, i) => {
      c.p = 0;
      this.tweens.to(c, { p: 1 }, 600, SCATTER_EASE, { delay: 120 + i * 40 });
    });
  }

  cursor(): string {
    const inp = this.ctx.input;
    if (this.menu === "launch") return "default";
    if (this.menu === "credits") return "pointer";
    if (this.menu === "settings") {
      const L = this.settingsLayout();
      if (this.sound.busy) return "grabbing";
      if (inp.inCentered(L.sound.toggle.cx, L.sound.toggle.cy, L.sound.toggle.d, L.sound.toggle.d)) return "pointer";
      if (inp.inCentered(L.motion.cx, L.motion.cy, L.motion.w, L.motion.h)) return "pointer";
      if (inp.inCentered(L.hands.cx, L.hands.cy, L.hands.w, L.hands.h)) return "pointer";
      return L.sound.sliders.some((sl) => inp.inRect(sl.x - 12, sl.y - 16, sl.w + 24, 32)) ? "pointer" : "default";
    }
    if (this.menu === "themes") {
      const L = this.themesLayout();
      return swatchAt(this.themeSwatches, inp.x, inp.y) || inp.inCentered(L.done.cx, L.done.cy, L.done.w, L.done.h) ? "pointer" : "default";
    }
    if (this.menu === "main" && this.pills.some((b) => inp.inCentered(b.cx, b.cy, b.w, b.h))) return "pointer";
    const so = this.soundToggle;
    if (this.menu === "main" && this.generated && inp.inCentered(so.cx, so.cy, so.w, so.h)) return "pointer";
    if (this.menu === "arcade" && this.arcadeTiles.some((tile) => inp.inRect(tile.x, tile.y, tile.w, tile.h))) return "pointer";
    const t = this.themeToggle;
    if (this.menu === "main" && inp.inCentered(t.cx, t.cy, t.w, t.h)) return "pointer";
    const fs = this.fullscreenToggle;
    if (this.menu === "main" && this.ctx.fullscreen.supported && inp.inCentered(fs.cx, fs.cy, fs.w, fs.h)) return "pointer";
    return this.buttons.some((b) => inp.inCentered(b.cx, b.cy, b.w, b.h)) ? "pointer" : "default";
  }

  /** Twelve to fifteen chips at loose tilts, kept out of the bottom bar and the logo. */
  private scatterChips(): void {
    const count = 12 + Math.floor(Math.random() * 4);
    const chips: ScatterChip[] = [];
    let guard = 0;
    while (chips.length < count && guard++ < 400) {
      const size = 34 + Math.random() * 34;
      const x = size + Math.random() * (this.W - size * 2);
      const y = size + Math.random() * (this.H - BTN_H - size * 2);
      // keep a clear patch behind the logo
      if (Math.abs(x - this.W / 2) < 230 && Math.abs(y - this.logoY()) < 130) continue;
      if (chips.some((c) => Math.hypot(c.x - x, c.y - y) < (c.size + size) * 0.75)) continue;
      chips.push({
        x,
        y,
        size,
        tilt: (Math.random() * 12 - 6) * (Math.PI / 180),
        frame: Math.floor(Math.random() * 6),
        p: 1,
        hover: 0,
        flipT0: -1,
        nextFrame: 0,
        rippleAt: -1,
      });
    }
    this.chips = chips;
  }

  // ---------------------------------------------------------------------------
  // Menu layouts
  // ---------------------------------------------------------------------------

  private button(id: string, sprite: SpriteName, cx: number, cy: number, w: number, h: number, onPress: () => void, pressedFrame = 1): MenuButton {
    return { id, sprite, cx, cy, w, h, pressedFrame, onPress };
  }

  private get generated(): boolean {
    return this.ctx.palette.kind === "generated";
  }

  private showMain(): void {
    this.menu = "main";
    const lg = this.ctx.sprites.logo_sprite;
    const logoW = Math.min(this.W - 40, BTN_W * (this.ctx.palette.name === "blocky" ? 2.1 : 1.5) * (this.ctx.view.portrait ? 1.2 : 1));
    const logo = this.generated
      ? this.button("logo", "logo_sprite", this.W / 2, this.logoY(), logoW, (logoW * lg.height) / lg.width, () => this.showModes(), 1)
      : this.button("logo", "logo_sprite", this.W / 2, this.H - BTN_W, BTN_W, BTN_W, () => this.showModes(), 1);
    this.buttons = [
      logo,
      this.button("info", "info_button_sprite", BTN_H / 2, this.H - BTN_H / 2, BTN_H, BTN_H, () => {
        this.menu = "credits";
      }),
      this.button("settings", "settings_button_sprite", this.W - BTN_H / 2, this.H - BTN_H / 2, BTN_H, BTN_H, () => {
        this.menu = "settings";
        this.buttons = [];
      }),
    ];
    // The logo stays tappable; on the modern title a Play pill is the affordance and Continue resumes the furthest world.
    this.pills = [];
    if (this.generated) {
      const logoH = (logoW * lg.height) / lg.width;
      const y = this.logoY() + logoH / 2 + 44;
      const stacked = this.W < 560;
      const wp = Math.max(1, this.ctx.save.worldProgress);
      this.pills = [
        { id: "play", label: "Play", cx: stacked ? this.W / 2 : this.W / 2 - 122, cy: y, w: 186, h: 48, primary: true },
        { id: "continue", label: `Continue  ·  World ${wp}`, cx: stacked ? this.W / 2 : this.W / 2 + 132, cy: stacked ? y + 58 : y, w: 236, h: 42 },
      ];
    }
  }

  private pressPill(id: string): void {
    if (id === "play") this.showModes();
    else if (id === "continue") {
      this.pendingType = "normal";
      this.launch(Math.max(1, this.ctx.save.worldProgress));
    }
  }

  /** The theme picker: every theme as a swatch on a card. */
  private showThemes(): void {
    this.menu = "themes";
    this.buttons = [];
    this.pills = [];
    const L = this.themesLayout();
    this.themeSwatches = layoutGrid(THEME_ORDER, L.x + 24, L.y + 66, L.w - 48, L.size, L.gap, L.rowGap);
  }

  private themesLayout(): { x: number; y: number; w: number; h: number; size: number; gap: number; rowGap: number; done: PillButton } {
    const w = Math.min(640, this.W - 16);
    const gap = 12;
    // swatches shrink until every theme fits on the card
    const size = fitSwatch(THEME_ORDER.length, w - 48, this.H - 16 - (66 + 26 + 64), this.W < 440 ? 54 : 64, gap, 0.62);
    const rowGap = size * 0.62;
    const gridH = gridHeight(THEME_ORDER.length, w - 48, size, gap, rowGap);
    const h = 66 + gridH + 26 + 64;
    const x = this.W / 2 - w / 2;
    const y = Math.max(8, this.H / 2 - h / 2);
    return { x, y, w, h, size, gap, rowGap, done: { id: "done", label: "Done", cx: this.W / 2, cy: y + h - 36, w: 150, h: 40, primary: true } };
  }

  private updateThemes(): void {
    const inp = this.ctx.input;
    const L = this.themesLayout();
    if (inp.keysPressed.has("Escape") || inp.keysPressed.has("Backspace") || inp.keysPressed.has("Enter")) {
      this.showMain();
      return;
    }
    if (!inp.released) return;
    const sw = swatchAt(this.themeSwatches, inp.x, inp.y);
    if (sw) {
      if (sw.name !== this.ctx.palette.name) {
        this.ctx.audio.event("tap");
        this.ctx.setTheme(sw.name);
        this.resetWall();
        this.resetBubbles();
      }
      return;
    }
    if (inp.inCentered(L.done.cx, L.done.cy, L.done.w, L.done.h) || !inp.inRect(L.x, L.y, L.w, L.h)) {
      this.ctx.audio.event("tap");
      this.showMain();
    }
  }

  private showModes(): void {
    this.menu = "mode";
    const stacked = this.ctx.view.portrait || this.W < BTN_W * 2 + 40;
    const vGap = BTN_H * 1.22;
    const gap = this.generated ? BTN_W * 1.04 : BTN_W + 8;
    const cy = this.H / 2 + (stacked ? 0 : 12);
    // Four modes: a 2 x 2 grid sideways, one column upright.
    const at = (i: number): [number, number] =>
      stacked ? [this.W / 2, cy + (i - 1.5) * vGap] : [this.W / 2 + ((i % 2) - 0.5) * gap, cy + (Math.floor(i / 2) - 0.5) * vGap];
    this.buttons = [
      this.button("puzzle", "puzzle_button_sprite", ...at(0), BTN_W, BTN_H, () => this.showWorlds("puzzle")),
      this.button("normal", "normal_button_sprite", ...at(1), BTN_W, BTN_H, () => this.showWorlds("normal")),
      this.button("zen", "zen_button_sprite", ...at(2), BTN_W, BTN_H, () => this.showWorlds("zen")),
      this.button("arcade", "arcade_button_sprite", ...at(3), BTN_W, BTN_H, () => this.showArcade()),
      this.button("back", "back_button_sprite", this.W - BTN_H / 2, this.H - BTN_H / 2, BTN_H, BTN_H, () => this.showMain()),
    ];
  }

  /** The arcade grid: one tile per mode, as many across as fit. */
  private showArcade(): void {
    this.menu = "arcade";
    this.heldTile = null;
    this.buttons = [this.button("back", "back_button_sprite", this.W - BTN_H / 2, this.H - BTN_H / 2, BTN_H, BTN_H, () => this.showModes())];
    const card = this.arcadeCard();
    const n = ARCADE_MODES.length;
    const cols = Math.max(1, Math.min(n, Math.floor((card.w - 32) / 176)));
    const rows = Math.ceil(n / cols);
    const gapX = 14;
    const tw = (card.w - 32 - (cols - 1) * gapX) / cols;
    const th = card.tileH;
    const gridW = cols * tw + (cols - 1) * gapX;
    this.arcadeTiles = ARCADE_MODES.map((info, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const lastRow = r === rows - 1 ? n - r * cols : cols;
      const rowW = lastRow * tw + (lastRow - 1) * gapX;
      return { info, x: card.x + card.w / 2 - rowW / 2 + c * (tw + gapX), y: card.y + 66 + r * (th + 14), w: tw, h: th };
    });
    void gridW;
  }

  /** Card behind the arcade grid, sized to the tiles it will hold. */
  private arcadeCard(): { x: number; y: number; w: number; h: number; tileH: number } {
    const w = Math.min(640, this.W - 16);
    const n = ARCADE_MODES.length;
    const cols = Math.max(1, Math.min(n, Math.floor((w - 32) / 176)));
    const rows = Math.ceil(n / cols);
    const tileH = Math.min(168, Math.max(120, (this.H - 150) / rows - 14));
    const h = 66 + rows * (tileH + 14) + 22;
    return { x: this.W / 2 - w / 2, y: Math.max(8, this.H / 2 - h / 2 - 6), w, h, tileH };
  }

  private launchArcade(mode: ArcadeMode): void {
    this.ctx.session.score = 0;
    this.pendingArcade = mode;
    this.menu = "launch";
    this.buttons = [];
    this.launchT0 = this.ctx.clock.t;
  }

  private showWorlds(type: GameType): void {
    this.menu = "world";
    this.pendingType = type;
    this.buttons = [];
    const modern = this.generated;
    const pitch = Math.min(BTN_H, (this.W - 40) / 4);
    const size = modern ? pitch * 0.84 : pitch;
    for (let w = 0; w <= MAX_WORLD; w++) {
      const col = w % 4;
      const row = Math.floor(w / 4);
      const cx = this.W / 2 + (col - 1.5) * pitch;
      const cy = this.H / 2 + (row === 0 ? -pitch / 2 : pitch / 2) + (modern ? 18 : 0);
      this.buttons.push(this.button(`world${w}`, `world${w}_sprite` as SpriteName, cx, cy, size, size, () => this.launch(w)));
    }
    this.buttons.push(this.button("back", "back_button_sprite", this.W - BTN_H / 2, this.H - BTN_H / 2, BTN_H, BTN_H, () => this.showModes()));
  }

  private launch(world: number): void {
    const s = this.ctx.session;
    s.gameType = this.pendingType;
    s.world = world;
    s.level = 0;
    s.score = 0;
    this.pendingArcade = null;
    this.menu = "launch";
    this.buttons = [];
    this.launchT0 = this.ctx.clock.t;
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  update(): void {
    const inp = this.ctx.input;
    this.time++;
    if (this.sizeKey !== `${Math.round(this.W)}x${Math.round(this.H)}`) this.relayout();
    this.updateWall();

    if (this.menu === "launch") {
      if (this.ctx.clock.t - this.launchT0 >= FADE_MS) {
        this.ctx.setScene(this.pendingArcade ? createArcadeScene(this.ctx, this.pendingArcade) : new GameScene(this.ctx));
      }
      return;
    }

    if (this.menu === "credits") {
      if (inp.released || inp.keysPressed.has("Escape")) this.showMain();
      return;
    }

    if (this.menu === "settings") {
      this.updateSettings();
      return;
    }

    if (this.menu === "themes") {
      this.updateThemes();
      return;
    }

    if (inp.keysPressed.has("Escape") || inp.keysPressed.has("Backspace")) {
      if (this.menu === "mode") this.showMain();
      else if (this.menu === "arcade") this.showModes();
      else if (this.menu === "world") this.showModes();
    }

    if (this.menu === "main" && inp.released && inp.inCentered(this.themeToggle.cx, this.themeToggle.cy, this.themeToggle.w, this.themeToggle.h)) {
      this.ctx.audio.event("tap");
      if (this.generated) {
        this.showThemes();
        return;
      }
      this.ctx.setTheme(nextTheme(this.ctx.save.theme));
      this.resetWall();
      this.resetBubbles();
      this.showMain();
      return;
    }

    const so = this.soundToggle;
    if (this.menu === "main" && this.generated && inp.released && inp.inCentered(so.cx, so.cy, so.w, so.h)) {
      this.ctx.save.muted = this.ctx.audio.toggleMute();
      if (!this.ctx.save.muted) this.ctx.audio.event("toggleOn");
      this.ctx.persist();
      if (!this.ctx.audio.muted) this.ctx.audio.event("tap");
      return;
    }

    const fs = this.fullscreenToggle;
    if (this.menu === "main" && this.ctx.fullscreen.supported && inp.released && inp.inCentered(fs.cx, fs.cy, fs.w, fs.h)) {
      this.ctx.audio.event("tap");
      this.ctx.fullscreen.toggle();
      return;
    }

    if (inp.pressed) {
      this.held = this.buttons.find((b) => inp.inCentered(b.cx, b.cy, b.w, b.h)) ?? null;
      this.heldPill = this.menu === "main" ? (this.pills.find((b) => inp.inCentered(b.cx, b.cy, b.w, b.h)) ?? null) : null;
      this.heldTile = this.menu === "arcade" ? (this.arcadeTiles.find((tile) => inp.inRect(tile.x, tile.y, tile.w, tile.h)) ?? null) : null;
      const tt = this.themeToggle;
      const onPill =
        this.menu === "main" &&
        (inp.inCentered(tt.cx, tt.cy, tt.w, tt.h) || inp.inCentered(fs.cx, fs.cy, fs.w, fs.h) || inp.inCentered(so.cx, so.cy, so.w, so.h));
      if (!this.held && !this.heldTile && !this.heldPill && !onPill) this.ripple(inp.x, inp.y);
    }
    this.stepRipples();
    if (inp.released) {
      const target = this.held;
      const tile = this.heldTile;
      const pill = this.heldPill;
      this.held = null;
      this.heldTile = null;
      this.heldPill = null;
      if (target && inp.inCentered(target.cx, target.cy, target.w, target.h)) {
        this.ctx.audio.event("tap");
        target.onPress();
      } else if (pill && inp.inCentered(pill.cx, pill.cy, pill.w, pill.h)) {
        this.ctx.audio.event("tap");
        this.pressPill(pill.id);
      } else if (tile && inp.inRect(tile.x, tile.y, tile.w, tile.h)) {
        this.ctx.audio.event("tap");
        this.launchArcade(tile.info.id);
      }
    }
    if (!inp.down) {
      this.held = null;
      this.heldTile = null;
      this.heldPill = null;
    }
  }

  /** Idle wall animation: random flips (classic) or little hops that swap colour at the top (blocky). */
  private updateWall(): void {
    const theme = this.ctx.palette.name;
    if (this.ctx.palette.kind === "generated" && this.ctx.palette.titleDeco !== "wall") return;
    if (theme === "blocky") {
      for (const b of this.wall) {
        if (b.rippleAt < 0 || this.time < b.rippleAt || b.hop !== 0) continue;
        b.rippleAt = -1;
        const next = b.nextFrame;
        this.tweens.to(b, { hop: 1 }, 150, easeOutCubic, {
          onDone: () => {
            b.frame = next;
            this.tweens.to(b, { hop: 0 }, 340, easeOutBack);
          },
        });
      }
      if (this.time % 40 === 0) {
        for (let i = 0; i < 2; i++) {
          const b = this.wall[Math.floor(Math.random() * this.wall.length)];
          if (b.hop !== 0) continue;
          this.tweens.to(b, { hop: 1 }, 150, easeOutCubic, {
            onDone: () => {
              b.frame = b.frame === 7 ? Math.floor(Math.random() * 6) : Math.random() < 0.5 ? 7 : Math.floor(Math.random() * 6);
              this.tweens.to(b, { hop: 0 }, 340, easeOutBack);
            },
          });
        }
      }
      return;
    }
    for (const b of this.wall) {
      if (b.rippleAt < 0 || this.time < b.rippleAt) continue;
      b.rippleAt = -1;
      if (b.flip === 0) b.flip = 1;
    }
    if (this.time % 45 === 0) {
      for (let i = 0; i < 2; i++) {
        const b = this.wall[Math.floor(Math.random() * this.wall.length)];
        if (b.flip === 0) {
          let next = b.frame;
          while (next === b.frame) next = Math.floor(Math.random() * 6);
          b.nextFrame = next;
          b.flip = 1;
        }
      }
    }
    for (const b of this.wall) {
      if (b.flip === 0) continue;
      b.flip++;
      if (b.flip === Math.floor(FLIP_FRAMES / 2)) b.frame = b.nextFrame;
      if (b.flip > FLIP_FRAMES) b.flip = 0;
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  /** Settings card geometry: the sound controls and the reduce-motion toggle. */
  private settingsLayout(): { x: number; y: number; w: number; h: number; sound: ReturnType<SoundControls["layout"]>; motion: PillButton; hands: PillButton } {
    const w = Math.min(460, this.W - 16);
    const x = this.W / 2 - w / 2;
    const sound = this.sound.layout(x + 24, 0, w - 48);
    const h = 70 + sound.h + 24 + 44 + 24 + 44 + 24 + 36;
    const y = this.H / 2 - h / 2;
    const soundL = this.sound.layout(x + 24, y + 70, w - 48);
    const reduce = this.ctx.save.reduceMotion;
    const motion: PillButton = {
      id: "motion",
      label: reduce ? "Reduce motion: on" : "Reduce motion: off",
      cx: this.W / 2,
      cy: y + 70 + sound.h + 24 + 22,
      w: 230,
      h: 42,
      primary: reduce,
    };
    const left = this.ctx.save.leftHanded;
    const hands: PillButton = {
      id: "hands",
      label: left ? "Rails: left-handed" : "Rails: right-handed",
      cx: this.W / 2,
      cy: motion.cy + 44 + 24,
      w: 230,
      h: 42,
      primary: left,
    };
    return { x, y, w, h, sound: soundL, motion, hands };
  }

  private updateSettings(): void {
    const inp = this.ctx.input;
    const L = this.settingsLayout();
    if (inp.keysPressed.has("Escape") || inp.keysPressed.has("Backspace")) {
      this.showMain();
      return;
    }
    if (this.sound.update(this.ctx, L.sound)) return;
    if (!inp.released) return;
    if (inp.inCentered(L.motion.cx, L.motion.cy, L.motion.w, L.motion.h)) {
      this.ctx.save.reduceMotion = !this.ctx.save.reduceMotion;
      setReducedMotion(this.ctx.save.reduceMotion);
      this.ctx.persist();
      this.ctx.audio.event("tap");
      return;
    }
    if (inp.inCentered(L.hands.cx, L.hands.cy, L.hands.w, L.hands.h)) {
      this.ctx.save.leftHanded = !this.ctx.save.leftHanded;
      this.ctx.persist();
      this.ctx.audio.event("tap");
      return;
    }
    if (!inp.inRect(L.x, L.y, L.w, L.h)) this.showMain();
  }

  /** The arcade grid: a card of mode tiles, each with a little scene from its game. */
  private renderArcade(g: CanvasRenderingContext2D): void {
    const pal = this.ctx.palette;
    const inp = this.ctx.input;
    const modern = this.generated;
    const card = this.arcadeCard();
    const textC = modern ? pal.titleText : pal.overlayText;
    const mutedC = modern ? pal.titleMuted : "#b0b0b0";
    drawCard(g, pal.ui, card.x, card.y, card.w, card.h, 24);
    drawText(g, "Arcade", this.W / 2, card.y + 30, { size: 24, color: textC, weight: 600, font: pal.display });
    drawText(g, "The colour rules, new games", this.W / 2, card.y + 52, { size: 12, color: mutedC, weight: 500 });
    for (const tile of this.arcadeTiles) {
      const hover = inp.inRect(tile.x, tile.y, tile.w, tile.h) && inp.x >= 0;
      const pressed = hover && this.heldTile === tile && inp.down;
      const scale = this.feel.scale(`arcade:${tile.info.id}`, hover, pressed);
      const w = tile.w * scale;
      const h = tile.h * scale;
      const x = tile.x + tile.w / 2 - w / 2;
      const y = tile.y + tile.h / 2 - h / 2;
      const accent = pal.brickColors[tile.info.color];
      fillRoundRect(g, x, y + 3, w, h, 16, pal.ui.cardShadow);
      fillRoundRect(g, x, y, w, h, 16, hover ? pal.ui.secondaryHover : pal.ui.secondary, hover ? accent : pal.ui.secondaryEdge, hover ? 2 : 1.5);
      this.renderArcadeIcon(g, tile.info.id, x + w / 2, y + h * 0.36, Math.min(w, h) * 0.5);
      drawText(g, tile.info.name, x + w / 2, y + h - 44, { size: Math.min(19, w * 0.11), color: textC, weight: 600, font: pal.display });
      drawText(g, tile.info.tagline, x + w / 2, y + h - 24, { size: 11, color: mutedC, weight: 500 });
      const best = this.ctx.save.arcadeBest[tile.info.id];
      if (best) drawText(g, `Best ${best}`, x + w / 2, y + h - 10, { size: 10, color: accent, weight: 700, tabular: true });
    }
  }

  /** A tiny tableau of each mode in the theme's own bricks. */
  private renderArcadeIcon(g: CanvasRenderingContext2D, mode: ArcadeMode, cx: number, cy: number, size: number): void {
    const sp = this.ctx.sprites;
    const pal = this.ctx.palette;
    const u = size / 4;
    const t = this.ctx.clock.t;
    const tile = (c: Color, x: number, y: number, s: number, shape: "square" | "round" | "blob" = "square", seed = 1, lift = 0) =>
      drawTile(g, sp, pal, c, cx + x - s / 2, cy + y - s / 2, s, { shape, seed, lift });
    if (mode === "bobble") {
      const d = u * 1.05;
      tile(1, -d, -u * 1.6, d, "round");
      tile(2, 0, -u * 1.6, d, "round");
      tile(4, d, -u * 1.6, d, "round");
      tile(1, -d / 2, -u * 1.6 + d * 0.87, d, "round");
      tile(6, d / 2, -u * 1.6 + d * 0.87, d, "round");
      // the shot on its way up
      const rise = (t / 900) % 1;
      g.save();
      g.globalAlpha = 0.5;
      g.fillStyle = pal.brickColors[2];
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        g.arc(cx + u * 0.5 - i * u * 0.16, cy + u * 1.9 - i * u * 0.45, 1.5, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
      tile(2, u * 0.5 - rise * u * 0.6, u * 1.9 - rise * u * 1.6, d * 0.9, "round", 1, 0.3);
    } else if (mode === "drhue") {
      const d = u * 1.1;
      tile(5, -d * 1.2, u * 1.4, d, "blob", 11);
      tile(1, 0, u * 1.4, d, "blob", 23);
      tile(2, d * 1.2, u * 1.4, d, "blob", 37);
      tile(4, -d * 1.2, u * 0.3, d, "blob", 41);
      const bob = Math.sin(t / 500) * u * 0.15;
      tile(1, d * 0.1, -u * 1.3 + bob, d, "square", 1, 0.3);
      tile(4, d * 1.2, -u * 1.3 + bob, d, "square", 1, 0.3);
      g.fillStyle = "rgba(255,255,255,0.45)";
      g.beginPath();
      g.roundRect(cx + d * 0.65 - d * 0.1, cy - u * 1.3 + bob - 4 * 0.3 - d * 0.22, d * 0.2, d * 0.44, d * 0.08);
      g.fill();
    } else if (mode === "trist") {
      const d = u * 1.1;
      g.save();
      g.strokeStyle = pal.kind === "classic" ? "rgba(255,255,255,0.3)" : rgbaOf(pal.titleText, 0.25);
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(cx - d * 1.9, cy - u * 2.2);
      g.lineTo(cx - d * 1.9, cy + u * 2.1);
      g.lineTo(cx + d * 1.9, cy + u * 2.1);
      g.lineTo(cx + d * 1.9, cy - u * 2.2);
      g.stroke();
      g.restore();
      tile(1, -d * 1.2, u * 1.5, d);
      tile(1, 0, u * 1.5, d);
      tile(2, d * 1.2, u * 1.5, d);
      tile(1, -d * 1.2, u * 1.5 - d, d);
      tile(6, d * 1.2, u * 1.5 - d, d);
      const fall = (t / 1100) % 1;
      tile(4, 0, -u * 1.9 + fall * u * 2.2, d, "square", 1, 0.3);
    } else {
      // a three-by-three board; the two left tiles of the middle row keep trading places
      const d = u * 1.15;
      const board: Color[] = [1, 6, 2, 4, 1, 5, 2, 3, 4];
      const k = 0.5 - 0.5 * Math.cos((t / 1500) * Math.PI * 2);
      const at = (i: number) => ({ x: ((i % 3) - 1) * d, y: (Math.floor(i / 3) - 1) * d + u * 0.2 });
      board.forEach((c, i) => {
        if (i !== 3 && i !== 4) tile(c, at(i).x, at(i).y, d * 0.92);
      });
      const a = at(3);
      const b = at(4);
      const lift = Math.sin(k * Math.PI);
      tile(board[4], b.x + (a.x - b.x) * k, b.y + lift * u * 0.25, d * 0.92, "square", 1, lift * 0.2);
      tile(board[3], a.x + (b.x - a.x) * k, a.y - lift * u * 0.25, d * 0.92, "square", 1, lift * 0.4);
    }
  }

  private renderSettings(g: CanvasRenderingContext2D): void {
    const pal = this.ctx.palette;
    const inp = this.ctx.input;
    const L = this.settingsLayout();
    fillScreen(g, pal.ui.dim);
    drawCard(g, pal.ui, L.x, L.y, L.w, L.h, 20);
    drawText(g, "Settings", this.W / 2, L.y + 38, { size: 26, color: pal.overlayText, weight: 600, font: pal.display });
    this.sound.render(g, this.ctx, L.sound, this.feel);
    const hover = inp.inCentered(L.motion.cx, L.motion.cy, L.motion.w, L.motion.h);
    L.motion.scale = this.feel.scale("settings:motion", hover, hover && inp.down);
    drawPillButton(g, pal.ui, L.motion, hover, hover && inp.down, pal.font);
    drawText(g, "Halves shake and hit-stop, skips slow motion", this.W / 2, L.motion.cy + 34, { size: 11, color: pal.hudMuted, weight: 500 });
    const handsHover = inp.inCentered(L.hands.cx, L.hands.cy, L.hands.w, L.hands.h);
    L.hands.scale = this.feel.scale("settings:hands", handsHover, handsHover && inp.down);
    drawPillButton(g, pal.ui, L.hands, handsHover, handsHover && inp.down, pal.font);
    drawText(g, "Swaps the readouts and the controls for the other thumb", this.W / 2, L.hands.cy + 34, { size: 11, color: pal.hudMuted, weight: 500 });
    drawText(g, "M mutes in game  ·  T cycles themes", this.W / 2, L.y + L.h - 20, { size: 12, color: pal.hudMuted, weight: 500 });
  }

  /** The theme picker card: a grid of swatches, the current one ringed. */
  private renderThemes(g: CanvasRenderingContext2D): void {
    const pal = this.ctx.palette;
    const inp = this.ctx.input;
    const L = this.themesLayout();
    fillScreen(g, pal.ui.dim);
    drawCard(g, pal.ui, L.x, L.y, L.w, L.h, 22);
    drawText(g, "Theme", this.W / 2, L.y + 34, { size: 26, color: pal.overlayText, weight: 600, font: pal.display });
    for (const sw of this.themeSwatches) {
      const hover = swatchAt([sw], inp.x, inp.y) !== null && inp.x >= 0;
      const scale = this.feel.scale(`swatch:${sw.name}`, hover, hover && inp.down);
      drawSwatch(g, sw, pal, sw.name === pal.name, hover, scale);
    }
    const hover = inp.inCentered(L.done.cx, L.done.cy, L.done.w, L.done.h);
    L.done.scale = this.feel.scale("themes:done", hover, hover && inp.down);
    drawPillButton(g, pal.ui, L.done, hover, hover && inp.down, pal.font);
  }

  /** Play and Continue under the logo. Continue carries the Normal-mode glyph so it reads as the same thing as the HUD pill. */
  private renderPills(g: CanvasRenderingContext2D): void {
    const pal = this.ctx.palette;
    const inp = this.ctx.input;
    for (const b of this.pills) {
      const hover = inp.inCentered(b.cx, b.cy, b.w, b.h) && inp.x >= 0;
      const pressed = hover && this.heldPill === b && inp.down;
      b.scale = this.feel.scale(`pill:${b.id}`, hover, pressed);
      drawPillButton(g, pal.ui, b, hover, pressed, pal.font);
      const scale = b.scale;
      if (b.id === "play") {
        // a play triangle left of the word
        const tw = measureText(g, b.label, { size: b.h * scale * 0.4, weight: 700, font: pal.font });
        const r = b.h * scale * 0.14;
        const x = b.cx - tw / 2 - r * 1.6;
        g.save();
        g.fillStyle = pal.ui.primaryText;
        g.beginPath();
        g.moveTo(x - r * 0.8, b.cy - r);
        g.lineTo(x + r * 0.9, b.cy);
        g.lineTo(x - r * 0.8, b.cy + r);
        g.closePath();
        g.fill();
        g.restore();
      } else {
        const tw = measureText(g, b.label, { size: b.h * scale * 0.4, weight: 700, font: pal.font });
        drawModeGlyph(g, "normal", b.cx - tw / 2 - 16 * scale, b.cy, 6 * scale, pal.brickColors[2], 2);
      }
    }
  }

  /** The modern bottom bar: high score, furthest world and arcade best side by side. */
  private renderBottomStats(g: CanvasRenderingContext2D, barY: number): void {
    const pal = this.ctx.palette;
    const save = this.ctx.save;
    const arcadeBest = Math.max(0, ...Object.values(save.arcadeBest).map((v) => v ?? 0));
    const stats: Array<{ label: string; value: string; accent?: boolean }> = [
      { label: "HIGH SCORE", value: String(save.hiscore) },
      { label: "FURTHEST", value: `World ${Math.max(1, save.worldProgress)}`, accent: true },
      { label: "ARCADE BEST", value: String(arcadeBest) },
    ];
    const pitch = Math.min(190, (this.W - BTN_H * 2 - 20) / 3);
    const size = pitch < 130 ? 22 : 30;
    stats.forEach((st, i) => {
      const x = this.W / 2 + (i - 1) * pitch;
      drawText(g, st.label, x, barY - 18, { size: 11, color: pal.titleMuted, weight: 700 });
      drawText(g, st.value, x, barY + 10, { size, color: st.accent ? pal.ui.primary : pal.titleText, weight: 600, font: pal.display, tabular: true });
    });
  }

  private renderSoundToggle(g: CanvasRenderingContext2D): void {
    const pal = this.ctx.palette;
    const inp = this.ctx.input;
    const t = this.soundToggle;
    const muted = this.ctx.audio.muted;
    const hover = inp.inCentered(t.cx, t.cy, t.w, t.h) && inp.x >= 0;
    const scale = this.feel.scale("title:sound", hover, hover && inp.down);
    const d = t.h * scale;
    fillRoundRect(g, t.cx - d / 2, t.cy - d / 2, d, d, d / 2, hover ? pal.ui.secondaryHover : pal.ui.secondary, pal.ui.secondaryEdge, 1.5);
    drawSpeaker(g, t.cx, t.cy, d * 0.2, pal.titleText, muted);
    if (hover) drawText(g, muted ? "Sound off (M)" : "Sound on (M)", t.cx, t.cy + d / 2 + 12, { size: 11, color: pal.titleMuted, weight: 600 });
  }

  /** Icon pill that switches the theme; the label only appears on hover. */
  private renderThemeToggle(g: CanvasRenderingContext2D): void {
    const pal = this.ctx.palette;
    const inp = this.ctx.input;
    const t = this.themeToggle;
    const hover = inp.inCentered(t.cx, t.cy, t.w, t.h);
    const scale = this.feel.scale("theme", hover, hover && inp.down);
    const w = t.w * scale;
    const h = t.h * scale;
    fillRoundRect(g, t.cx - w / 2, t.cy - h / 2, w, h, h / 2, hover ? pal.ui.secondaryHover : pal.ui.secondary, pal.ui.secondaryEdge, 1.5);
    const labelled = this.generated && t.w > 60;
    // half-filled circle: "contrast"
    const r = h * (labelled ? 0.2 : 0.28);
    const iconX = labelled ? t.cx - w / 2 + 18 * scale : t.cx;
    g.save();
    g.translate(iconX, t.cy);
    g.scale(scale, scale);
    g.lineWidth = 2;
    g.strokeStyle = pal.titleText;
    g.fillStyle = pal.titleText;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);
    g.closePath();
    g.fill();
    g.restore();
    if (labelled) {
      drawText(g, THEME_LABELS[pal.name], iconX + 14 * scale, t.cy + 1, { size: 13 * scale, color: pal.titleText, weight: 700, align: "left" });
      // chevron
      const cx = t.cx + w / 2 - 14 * scale;
      g.save();
      g.strokeStyle = pal.titleMuted;
      g.lineWidth = 2;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(cx - 4, t.cy - 2);
      g.lineTo(cx, t.cy + 2);
      g.lineTo(cx + 4, t.cy - 2);
      g.stroke();
      g.restore();
    }
    if (hover) {
      const label = this.generated ? "Choose a theme  ·  T cycles" : `Switch to ${THEME_LABELS[nextTheme(this.ctx.save.theme)]} (T)`;
      drawText(g, label, t.cx + w / 2, t.cy + h / 2 + 12, { size: 11, color: pal.titleMuted, weight: 600, align: "right" });
    }
  }

  private renderFullscreenToggle(g: CanvasRenderingContext2D): void {
    const pal = this.ctx.palette;
    const inp = this.ctx.input;
    const t = this.fullscreenToggle;
    const active = this.ctx.fullscreen.active;
    const hover = inp.inCentered(t.cx, t.cy, t.w, t.h);
    const scale = this.feel.scale("fullscreen", hover, hover && inp.down);
    const w = t.w * scale;
    const h = t.h * scale;
    fillRoundRect(g, t.cx - w / 2, t.cy - h / 2, w, h, h / 2, hover ? pal.ui.secondaryHover : pal.ui.secondary, pal.ui.secondaryEdge, 1.5);
    // Four corner brackets: at the corners to enter, pulled inward to exit.
    const r = h * 0.3;
    const a = r * 0.55;
    g.save();
    g.translate(t.cx, t.cy);
    g.scale(scale, scale);
    g.lineWidth = 2;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.strokeStyle = pal.titleText;
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const) {
      const c = active ? a * 0.8 : r;
      const arm = active ? r : r - a;
      g.beginPath();
      g.moveTo(sx * c, sy * arm);
      g.lineTo(sx * c, sy * c);
      g.lineTo(sx * arm, sy * c);
      g.stroke();
    }
    g.restore();
    if (hover) {
      drawText(g, active ? "Exit fullscreen (F)" : "Fullscreen (F)", t.cx, t.cy + h / 2 + 12, { size: 11, color: pal.titleMuted, weight: 600 });
    }
  }

  private renderScatter(g: CanvasRenderingContext2D): void {
    const sp = this.ctx.sprites.brick_noicon_sprite;
    const inp = this.ctx.input;
    const t = this.ctx.clock.t;
    const ptr = this.pointer();
    const par = this.parallax;
    for (const c of this.chips) {
      const p = clamp01(c.p);
      // cursor nearby: the chip lifts and wobbles
      const d = ptr ? Math.hypot(ptr.x - c.x, ptr.y - c.y) : 1e9;
      const target = clamp01(1 - d / (c.size * 0.9));
      c.hover += (target - c.hover) * 0.18;
      const lift = (1 - p) * 30 + c.hover * 8;
      const tilt = c.tilt * (2 - p) + Math.sin(t / 110) * 0.07 * c.hover;
      // ripple flip: squash on x and swap colour at the halfway point
      let frame = c.frame;
      let sx = 1;
      if (c.flipT0 >= 0) {
        const q = (t - c.flipT0) / CHIP_FLIP_MS;
        if (q >= 1) {
          c.frame = c.nextFrame;
          c.flipT0 = -1;
          frame = c.frame;
        } else {
          sx = Math.max(0.04, Math.abs(Math.cos(q * Math.PI)));
          frame = q < 0.5 ? c.frame : c.nextFrame;
        }
      }
      // bigger chips sit closer, so they shift more with the cursor
      const ox = -par.x * c.size * 0.14;
      const oy = -par.y * c.size * 0.14;
      g.save();
      g.globalAlpha = easeOutCubic(Math.min(1, p * 1.5));
      g.translate(c.x + ox, c.y - lift + oy);
      g.rotate(tilt);
      const s = c.size;
      fillRoundRect(g, (-s / 2) * sx, -s / 2 + 4 + lift * 0.3, s * sx, s, s * 0.18, this.ctx.palette.brickShadow ?? "rgba(0,0,0,0.35)");
      g.scale(sx, 1);
      drawSprite(g, sp, frame, -s / 2, -s / 2, s, s);
      g.restore();
    }
    if (ptr && inp.x >= 0) {
      par.x += (inp.x / this.W - 0.5 - par.x) * 0.08;
      par.y += (inp.y / this.H - 0.5 - par.y) * 0.08;
    }
  }

  /** Cursor position on the canvas, or null when it is off it. */
  private pointer(): Pointer {
    const inp = this.ctx.input;
    return inp.x >= 0 && inp.x <= this.W && inp.y >= 0 && inp.y <= this.H ? { x: inp.x, y: inp.y } : null;
  }

  /** Screen y of a bubble this frame. */
  private bubbleY(b: Bubble): number {
    const travel = this.H - BTN_H + 60;
    return this.H - BTN_H + 30 - b.phase * travel;
  }

  /**
   * Tap on the backdrop: a wave spreads from the point and every decoration
   * flips to one new colour as it arrives, the way the original's menu wall
   * rippled. A pinch of the theme's debris marks the tap itself.
   */
  private ripple(x: number, y: number): void {
    const t = this.ctx.clock.t;
    const frame = Math.floor(Math.random() * 6);
    for (const c of this.chips) {
      c.nextFrame = frame;
      c.rippleAt = t + Math.hypot(c.x - x, c.y - y) * RIPPLE_MS_PER_UNIT;
    }
    for (const b of this.bubbles) {
      b.nextFrame = frame;
      b.rippleAt = t + Math.hypot(b.x - x, this.bubbleY(b) - y) * RIPPLE_MS_PER_UNIT;
    }
    for (const w of this.wall) {
      w.nextFrame = frame;
      w.rippleAt = this.time + Math.hypot(w.cx - x, w.cy - y) * RIPPLE_FRAMES_PER_UNIT;
    }
    this.ctx.audio.event("select");
    const pal = this.ctx.palette;
    const { colors, o } = debrisFor(pal, (frame + 1) as Color, 44);
    this.particles.spawn(x, y, 7, colors, { ...o, speed: [o.speed[0] * 0.6, o.speed[1] * 0.7] });
    this.taps.push({ x, y, t });
    while (this.taps.length > 6) this.taps.shift();
    // Pigment: the tap leaves a paint stain on the paper in the ripple's colour.
    if (pal.stains)
      this.stains.push({ x, y, r: 26 + Math.random() * 14, t, seed: Math.floor(Math.random() * 1000), color: pal.brickColors[(frame + 1) as Color] });
  }

  /** Fading paint stains from taps (Pigment only). */
  private renderStains(g: CanvasRenderingContext2D): void {
    const t = this.ctx.clock.t;
    this.stains = this.stains.filter((s) => t - s.t < 2600);
    for (const s of this.stains) {
      const p = (t - s.t) / 2600;
      const a = p < 0.08 ? p / 0.08 : 1 - easeOutCubic((p - 0.08) / 0.92);
      drawStain(g, s.x, s.y, s.r, s.color, 0.22 * a, s.seed);
    }
  }

  /** Expanding rings from recent taps, in the theme's accent; glow themes add light. */
  private renderTapRings(g: CanvasRenderingContext2D): void {
    const pal = this.ctx.palette;
    if (pal.stains || pal.titleDeco === "wall") return;
    const t = this.ctx.clock.t;
    g.save();
    if (pal.particlesAdditive) g.globalCompositeOperation = "lighter";
    for (const tap of this.taps) {
      const age = t - tap.t;
      if (age > 900) continue;
      const q = age / 900;
      const r = 12 + easeOutCubic(q) * 260;
      g.globalAlpha = (1 - q) * 0.45;
      g.lineWidth = 3 * (1 - q) + 1;
      g.strokeStyle = pal.overlayAccent;
      g.beginPath();
      g.arc(tap.x, tap.y, r, 0, Math.PI * 2);
      g.stroke();
    }
    g.restore();
  }

  /** Start the flips whose ripple has arrived. */
  private stepRipples(): void {
    const t = this.ctx.clock.t;
    for (const c of this.chips) {
      if (c.rippleAt >= 0 && t >= c.rippleAt) {
        c.rippleAt = -1;
        c.flipT0 = t;
      }
    }
    for (const b of this.bubbles) {
      if (b.rippleAt >= 0 && t >= b.rippleAt) {
        b.rippleAt = -1;
        b.flipT0 = t;
      }
    }
  }

  render(g: CanvasRenderingContext2D): void {
    this.tweens.update(this.ctx.clock.t);
    const sp = this.ctx.sprites;
    const inp = this.ctx.input;
    const pal = this.ctx.palette;
    const modern = this.generated;
    const subMenu = this.menu !== "main" && this.menu !== "launch";

    fillScreen(g, pal.background);

    if (pal.kind === "generated" && pal.titleDeco !== "wall") {
      if (pal.backdrop !== "sprites") BACKDROPS[pal.backdrop](g, this.ctx.clock.t, undefined, 0, { pointer: this.pointer(), taps: this.taps });
      this.renderStains(g);
      if (pal.titleDeco === "chips") this.renderScatter(g);
      else this.renderBubbles(g);
      // Push the decoration back so the menu reads as the foreground.
      if (subMenu) fillScreen(g, pal.titleDim);
    } else if (pal.name === "blocky") {
      drawBlockyBackdrop(g, this.ctx.clock.t);
      // Staggered wall of toy bricks, every other row shifted half a brick.
      const wallSprite = sp.brick_noicon_sprite;
      for (const b of this.wall) {
        const row = Math.round((this.H - WALL_SIZE / 2 - b.cy) / WALL_SIZE);
        const ox = row % 2 === 1 ? -WALL_SIZE / 2 : 0;
        if (ox === 0 && b.cx > this.W) continue;
        drawSprite(g, wallSprite, b.frame, b.cx + ox - WALL_SIZE / 2, b.cy - WALL_SIZE / 2 - 10 * b.hop, WALL_SIZE, WALL_SIZE);
      }
      if (subMenu) {
        fillScreen(g, "rgba(18,24,38,0.72)");
      }
    } else {
      const wallSprite = sp.brick_noicon_sprite;
      for (const b of this.wall) {
        if (b.cx > this.W) continue;
        let xs = 1;
        if (b.flip > 0) {
          const t = b.flip / FLIP_FRAMES;
          xs = Math.abs(Math.cos(t * Math.PI));
        }
        const w = WALL_SIZE * xs;
        drawSprite(g, wallSprite, b.frame, b.cx - w / 2, b.cy - WALL_SIZE / 2, w, WALL_SIZE);
      }
    }

    this.particles.update(this.ctx.clock.dt);
    if (pal.particlesAdditive) {
      g.save();
      g.globalCompositeOperation = "lighter";
      this.particles.render(g);
      g.restore();
    } else {
      this.particles.render(g);
    }
    this.renderTapRings(g);

    if (this.menu === "main") {
      if (modern) {
        // Generated bands are uniform, so they can run out to the screen edge.
        const sr = screenRect();
        drawSprite(g, sp.menu_frame_sprite, 0, sr.x, this.H - BTN_H, sr.w, BTN_H);
      } else {
        drawSprite(g, sp.menu_frame_sprite, 0, 0, this.H - BTN_H, this.W, BTN_H);
      }
      const barY = this.H - BTN_H / 2;
      if (modern) {
        this.renderBottomStats(g, barY);
        this.renderPills(g);
        this.renderSoundToggle(g);
      } else {
        drawText(g, `High Score: ${this.ctx.save.hiscore}`, this.W / 2, barY, { size: 18, color: pal.titleText, tabular: true });
        if (this.ctx.audio.muted) {
          drawText(g, "muted", this.W - BTN_H / 2, this.H - BTN_H - 12, { size: 12, color: pal.titleMuted, weight: 500 });
        }
      }
      this.renderThemeToggle(g);
      if (this.ctx.fullscreen.supported) this.renderFullscreenToggle(g);
    }

    if (this.menu === "world") {
      if (modern) {
        const w = Math.min(520, this.W - 16);
        const h = 360;
        const x = this.W / 2 - w / 2;
        const y = this.H / 2 - 180;
        drawCard(g, pal.ui, x, y, w, h, 24);
        drawText(g, "Select a world", this.W / 2, y + 32, { size: 22, color: pal.titleText, weight: 600, font: pal.display });
        const chip = `${this.pendingType[0].toUpperCase()}${this.pendingType.slice(1)} mode`;
        fillRoundRect(g, this.W / 2 - 60, y + 50, 120, 24, 12, pal.ui.secondary, pal.ui.secondaryEdge, 1);
        drawText(g, chip, this.W / 2, y + 63, { size: 12, color: pal.titleText, weight: 700 });
        drawText(g, "Tutorial teaches the colour rules in a minute", this.W / 2, y + h - 24, { size: 12, color: pal.titleMuted, weight: 500 });
      } else {
        const bg = sp.level_select_sprite;
        const w = 5 * BTN_H;
        const h = ((WALL_ROWS - 2) * BTN_H) / 2;
        drawSprite(g, bg, 0, this.W / 2 - w / 2, this.H - (BTN_H / 2) * (WALL_ROWS / 2) - h / 2, w, h);
        drawText(g, `Select a world (${this.pendingType})`, this.W / 2, this.H / 2 - BTN_H - 12, { size: 18, color: pal.titleText });
        drawText(g, "World 0 is the tutorial", this.W / 2, this.H / 2 + BTN_H + 12, { size: 14, color: pal.titleMuted, bold: false });
      }
    }

    if (this.menu === "mode") {
      const modes = this.buttons.filter((b) => b.id !== "back");
      const top = Math.min(...modes.map((b) => b.cy));
      if (modern) {
        drawText(g, "Choose a mode", this.W / 2, top - BTN_H / 2 - 34, { size: 26, color: pal.titleText, weight: 600, font: pal.display });
        const descriptions: Record<string, string> = {
          puzzle: "Clear the whole board",
          normal: "Pop the target number of groups",
          zen: "Like Normal, but you can't lose",
          arcade: "New games on the colour rules",
        };
        for (const b of modes) {
          const d = descriptions[b.id];
          if (d) drawText(g, d, b.cx, b.cy + BTN_H / 2 + 18, { size: 12, color: pal.titleMuted, weight: 500 });
        }
      } else {
        drawText(g, "Choose a game mode", this.W / 2, top - BTN_H, { size: 20, color: pal.overlayText, shadow: "#000" });
      }
    }

    if (this.menu === "arcade") this.renderArcade(g);

    for (const b of this.buttons) {
      const sprite = sp[b.sprite];
      const hover = inp.inCentered(b.cx, b.cy, b.w, b.h);
      const pressed = this.held === b && hover;
      const frame = pressed ? Math.min(sprite.frames.length - 1, b.pressedFrame) : 0;
      const scale = this.feel.scale(b.id, hover, pressed);
      drawSprite(g, sprite, frame, b.cx - (b.w * scale) / 2, b.cy - (b.h * scale) / 2, b.w * scale, b.h * scale);
    }

    if (this.menu === "credits") {
      fillScreen(g, pal.ui.dim);
      const cs = sp.credits_sprite;
      const m = Math.min(BTN_H, this.W * 0.06, this.H * 0.06);
      const k = Math.min((this.W - m * 2) / cs.width, (this.H - m * 2) / cs.height);
      drawSprite(g, cs, 0, this.W / 2 - (cs.width * k) / 2, this.H / 2 - (cs.height * k) / 2, cs.width * k, cs.height * k);
    }
    if (this.menu === "settings") this.renderSettings(g);
    if (this.menu === "themes") this.renderThemes(g);

    // Scene fades: in from the background on entry, out to it on launch.
    const e = this.ctx.clock.t - this.enterT0;
    if (e < FADE_MS) {
      g.globalAlpha = 1 - clamp01(e / FADE_MS);
      fillScreen(g, pal.background);
      g.globalAlpha = 1;
    }
    if (this.menu === "launch") {
      g.globalAlpha = clamp01((this.ctx.clock.t - this.launchT0) / FADE_MS);
      fillScreen(g, pal.background);
      g.globalAlpha = 1;
    }
  }
}
