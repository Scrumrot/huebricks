import { BTN_H, BTN_W, MAX_WORLD, SCREEN_H, SCREEN_W, type GameType } from "../core/constants";
import type { SpriteName } from "../engine/assets";
import { ButtonFeel } from "../engine/buttonFeel";
import { drawCard, drawPillButton, drawSprite, drawText, fillRoundRect, type PillButton } from "../engine/draw";
import { backOut, clamp01, easeOutBack, easeOutCubic } from "../engine/easing";
import { drawBlockyBackdrop } from "../engine/blockySkin";
import { drawPaper } from "../engine/modernSkin";
import { drawSpectraBackdrop } from "../engine/spectraSkin";
import { nextTheme, THEME_LABELS } from "../engine/theme";
import { Tweens } from "../engine/tween";
import { GameScene } from "./GameScene";
import type { GameContext, Scene } from "./Scene";

type MenuState = "main" | "mode" | "world" | "credits" | "settings" | "launch";

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
}

const WALL_COLS = 12;
const WALL_SIZE = BTN_H / 2;
const WALL_ROWS = Math.ceil((WALL_COLS * SCREEN_H) / SCREEN_W);
const FLIP_FRAMES = 16;
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
  private readonly tweens = new Tweens();
  private readonly feel: ButtonFeel;
  private enterT0 = 0;
  /** Which slider the pointer is dragging on the sound card. */
  private dragging: "music" | "sfx" | null = null;
  /** Icon pill in the top-right corner that switches the theme. */
  private readonly themeToggle = { cx: SCREEN_W - 36, cy: 26, w: 48, h: 30 };

  constructor(ctx: GameContext) {
    this.ctx = ctx;
    this.feel = new ButtonFeel(this.tweens);
    this.resetWall();
    this.scatterChips();
    this.resetBubbles();
    this.showMain();
  }

  /** Twenty gel bricks that float up and fade like bubbles. */
  private resetBubbles(): void {
    this.bubbles = Array.from({ length: 20 }, () => this.newBubble(Math.random()));
  }

  private newBubble(phase: number): Bubble {
    const size = 22 + Math.random() * 34;
    return {
      x: size + Math.random() * (SCREEN_W - size * 2),
      y: 0,
      size,
      speed: 14 + Math.random() * 16,
      drift: (Math.random() - 0.5) * 10,
      frame: Math.floor(Math.random() * 6),
      phase,
      wobble: Math.random() * Math.PI * 2,
    };
  }

  private renderBubbles(g: CanvasRenderingContext2D): void {
    const sp = this.ctx.sprites;
    const dt = this.ctx.clock.dt / 1000;
    const t = this.ctx.clock.t;
    const travel = SCREEN_H - BTN_H + 60;
    for (let i = 0; i < this.bubbles.length; i++) {
      let b = this.bubbles[i];
      b.phase += (b.speed * dt) / travel;
      if (b.phase >= 1) {
        b = this.newBubble(0);
        this.bubbles[i] = b;
      }
      const y = SCREEN_H - BTN_H + 30 - b.phase * travel;
      const x = b.x + Math.sin(t / 1400 + b.wobble) * b.drift;
      const a = Math.sin(b.phase * Math.PI) * 0.55;
      g.globalAlpha = a;
      const gw = b.size * 1.5;
      drawSprite(g, sp.brick_glow_sprite, b.frame, x - gw / 2, y - gw / 2, gw, gw);
      drawSprite(g, sp.brick_noicon_sprite, b.frame, x - b.size / 2, y - b.size / 2, b.size, b.size);
    }
    g.globalAlpha = 1;
  }

  /** The brick wall behind the classic and blocky titles (blocky starts with a few coloured bricks). */
  private resetWall(): void {
    const blocky = this.ctx.palette.name === "blocky";
    this.wall = [];
    for (let row = 0; row < WALL_ROWS; row++) {
      for (let col = 0; col <= WALL_COLS; col++) {
        this.wall.push({
          cx: col * WALL_SIZE + WALL_SIZE / 2,
          cy: SCREEN_H - row * WALL_SIZE - WALL_SIZE / 2,
          frame: blocky && Math.random() < 0.22 ? Math.floor(Math.random() * 6) : 7,
          nextFrame: 7,
          flip: 0,
          hop: 0,
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
      if (this.dragging) return "grabbing";
      if (inp.inCentered(L.toggle.cx, L.toggle.cy, L.toggle.w, L.toggle.h)) return "pointer";
      return L.sliders.some((sl) => inp.inRect(sl.x - 12, sl.y - 16, sl.w + 24, 32)) ? "pointer" : "default";
    }
    const t = this.themeToggle;
    if (this.menu === "main" && inp.inCentered(t.cx, t.cy, t.w, t.h)) return "pointer";
    return this.buttons.some((b) => inp.inCentered(b.cx, b.cy, b.w, b.h)) ? "pointer" : "default";
  }

  /** Twelve to fifteen chips at loose tilts, kept out of the bottom bar and the logo. */
  private scatterChips(): void {
    const count = 12 + Math.floor(Math.random() * 4);
    const chips: ScatterChip[] = [];
    let guard = 0;
    while (chips.length < count && guard++ < 400) {
      const size = 34 + Math.random() * 34;
      const x = size + Math.random() * (SCREEN_W - size * 2);
      const y = size + Math.random() * (SCREEN_H - BTN_H - size * 2);
      // keep a clear patch behind the logo
      if (Math.abs(x - SCREEN_W / 2) < 230 && Math.abs(y - 205) < 130) continue;
      if (chips.some((c) => Math.hypot(c.x - x, c.y - y) < (c.size + size) * 0.75)) continue;
      chips.push({ x, y, size, tilt: (Math.random() * 12 - 6) * (Math.PI / 180), frame: Math.floor(Math.random() * 6), p: 1 });
    }
    this.chips = chips;
  }

  // ---------------------------------------------------------------------------
  // Menu layouts
  // ---------------------------------------------------------------------------

  private button(
    id: string,
    sprite: SpriteName,
    cx: number,
    cy: number,
    w: number,
    h: number,
    onPress: () => void,
    pressedFrame = 1,
  ): MenuButton {
    return { id, sprite, cx, cy, w, h, pressedFrame, onPress };
  }

  private get generated(): boolean {
    return this.ctx.palette.kind === "generated";
  }

  private showMain(): void {
    this.menu = "main";
    const lg = this.ctx.sprites.logo_sprite;
    const logoW = BTN_W * (this.ctx.palette.name === "blocky" ? 2.1 : 1.5);
    const logo = this.generated
      ? this.button("logo", "logo_sprite", SCREEN_W / 2, 205, logoW, (logoW * lg.height) / lg.width, () => this.showModes(), 1)
      : this.button("logo", "logo_sprite", SCREEN_W / 2, SCREEN_H - BTN_W, BTN_W, BTN_W, () => this.showModes(), 1);
    this.buttons = [
      logo,
      this.button("info", "info_button_sprite", BTN_H / 2, SCREEN_H - BTN_H / 2, BTN_H, BTN_H, () => {
        this.menu = "credits";
      }),
      this.button("settings", "settings_button_sprite", SCREEN_W - BTN_H / 2, SCREEN_H - BTN_H / 2, BTN_H, BTN_H, () => {
        this.menu = "settings";
        this.buttons = [];
      }),
    ];
  }

  private showModes(): void {
    this.menu = "mode";
    const y = SCREEN_H - BTN_W;
    const gap = this.generated ? BTN_W * 0.97 : BTN_W;
    this.buttons = [
      this.button("puzzle", "puzzle_button_sprite", SCREEN_W / 2 - gap, y, BTN_W, BTN_H, () => this.showWorlds("puzzle")),
      this.button("normal", "normal_button_sprite", SCREEN_W / 2, y, BTN_W, BTN_H, () => this.showWorlds("normal")),
      this.button("zen", "zen_button_sprite", SCREEN_W / 2 + gap, y, BTN_W, BTN_H, () => this.showWorlds("zen")),
      this.button("back", "back_button_sprite", SCREEN_W - BTN_H / 2, SCREEN_H - BTN_H / 2, BTN_H, BTN_H, () => this.showMain()),
    ];
  }

  private showWorlds(type: GameType): void {
    this.menu = "world";
    this.pendingType = type;
    this.buttons = [];
    const modern = this.generated;
    const size = modern ? BTN_H * 0.84 : BTN_H;
    for (let w = 0; w <= MAX_WORLD; w++) {
      const col = w % 4;
      const row = Math.floor(w / 4);
      const cx = BTN_H * (col + 2) - BTN_H / 2;
      const cy = SCREEN_H / 2 + (row === 0 ? -BTN_H / 2 : BTN_H / 2) + (modern ? 18 : 0);
      this.buttons.push(
        this.button(`world${w}`, `world${w}_sprite` as SpriteName, cx, cy, size, size, () => this.launch(w)),
      );
    }
    this.buttons.push(
      this.button("back", "back_button_sprite", SCREEN_W - BTN_H / 2, SCREEN_H - BTN_H / 2, BTN_H, BTN_H, () => this.showModes()),
    );
  }

  private launch(world: number): void {
    const s = this.ctx.session;
    s.gameType = this.pendingType;
    s.world = world;
    s.level = 0;
    s.score = 0;
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
    this.updateWall();

    if (this.menu === "launch") {
      if (this.ctx.clock.t - this.launchT0 >= FADE_MS) {
        this.ctx.setScene(new GameScene(this.ctx));
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

    if (inp.keysPressed.has("Escape") || inp.keysPressed.has("Backspace")) {
      if (this.menu === "mode") this.showMain();
      else if (this.menu === "world") this.showModes();
    }

    if (this.menu === "main" && inp.released && inp.inCentered(this.themeToggle.cx, this.themeToggle.cy, this.themeToggle.w, this.themeToggle.h)) {
      this.ctx.audio.play("menuselect_snd");
      this.ctx.setTheme(nextTheme(this.ctx.save.theme));
      this.resetWall();
      this.resetBubbles();
      this.showMain();
      return;
    }

    if (inp.pressed) {
      this.held = this.buttons.find((b) => inp.inCentered(b.cx, b.cy, b.w, b.h)) ?? null;
    }
    if (inp.released) {
      const target = this.held;
      this.held = null;
      if (target && inp.inCentered(target.cx, target.cy, target.w, target.h)) {
        this.ctx.audio.play("menuselect_snd");
        target.onPress();
      }
    }
    if (!inp.down) this.held = null;
  }

  /** Idle wall animation: random flips (classic) or little hops that swap colour at the top (blocky). */
  private updateWall(): void {
    const theme = this.ctx.palette.name;
    if (theme === "pigment" || theme === "spectra") return;
    if (theme === "blocky") {
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

  /** Sound card geometry: card rect, toggle pill and the two slider tracks. */
  private settingsLayout(): { x: number; y: number; w: number; h: number; toggle: PillButton; sliders: Array<{ id: "music" | "sfx"; label: string; x: number; y: number; w: number }> } {
    const w = 420;
    const h = 270;
    const x = SCREEN_W / 2 - w / 2;
    const y = SCREEN_H / 2 - h / 2;
    const muted = this.ctx.audio.muted;
    const toggle: PillButton = { id: "mute", label: muted ? "Sound off" : "Sound on", cx: SCREEN_W / 2, cy: y + 92, w: 170, h: 42, primary: !muted };
    const sx = x + 140;
    const sw = w - 230;
    return {
      x,
      y,
      w,
      h,
      toggle,
      sliders: [
        { id: "music", label: "Music", x: sx, y: y + 156, w: sw },
        { id: "sfx", label: "Effects", x: sx, y: y + 206, w: sw },
      ],
    };
  }

  private updateSettings(): void {
    const inp = this.ctx.input;
    const L = this.settingsLayout();
    if (inp.keysPressed.has("Escape") || inp.keysPressed.has("Backspace")) {
      this.showMain();
      return;
    }
    if (inp.pressed) {
      this.dragging = null;
      for (const sl of L.sliders) {
        if (inp.inRect(sl.x - 12, sl.y - 16, sl.w + 24, 32)) this.dragging = sl.id;
      }
    }
    if ((inp.down || inp.pressed) && this.dragging) {
      const sl = L.sliders.find((q) => q.id === this.dragging)!;
      const v = Math.max(0, Math.min(1, (inp.x - sl.x) / sl.w));
      if (sl.id === "music") {
        this.ctx.save.music = v;
        this.ctx.audio.setMusicVolume(v);
      } else {
        this.ctx.save.sfx = v;
        this.ctx.audio.setSfxVolume(v);
      }
    }
    if (inp.released) {
      if (this.dragging) {
        if (this.dragging === "sfx") this.ctx.audio.play("BlocksSelection_snd");
        this.dragging = null;
        this.ctx.persist();
        return;
      }
      if (inp.inCentered(L.toggle.cx, L.toggle.cy, L.toggle.w, L.toggle.h)) {
        this.ctx.save.muted = this.ctx.audio.toggleMute();
        this.ctx.persist();
        if (!this.ctx.audio.muted) this.ctx.audio.play("menuselect_snd");
        return;
      }
      if (!inp.inRect(L.x, L.y, L.w, L.h)) this.showMain();
    }
  }

  private renderSettings(g: CanvasRenderingContext2D): void {
    const pal = this.ctx.palette;
    const inp = this.ctx.input;
    const L = this.settingsLayout();
    g.fillStyle = pal.ui.dim;
    g.fillRect(0, 0, SCREEN_W, SCREEN_H);
    drawCard(g, pal.ui, L.x, L.y, L.w, L.h, 20);
    drawText(g, "Sound", SCREEN_W / 2, L.y + 42, { size: 28, color: pal.overlayText, weight: 600, font: pal.display });
    const hover = inp.inCentered(L.toggle.cx, L.toggle.cy, L.toggle.w, L.toggle.h);
    L.toggle.scale = this.feel.scale("settings:mute", hover, hover && inp.down);
    drawPillButton(g, pal.ui, L.toggle, hover, hover && inp.down, pal.font);
    const muted = this.ctx.audio.muted;
    for (const sl of L.sliders) {
      const v = sl.id === "music" ? this.ctx.save.music : this.ctx.save.sfx;
      drawText(g, sl.label, sl.x - 18, sl.y, { size: 15, color: pal.overlayText, weight: 700, align: "right" });
      g.globalAlpha = muted ? 0.45 : 1;
      fillRoundRect(g, sl.x, sl.y - 4, sl.w, 8, 4, pal.track);
      fillRoundRect(g, sl.x, sl.y - 4, Math.max(8, sl.w * v), 8, 4, pal.ui.primary);
      const kx = sl.x + sl.w * v;
      const active = this.dragging === sl.id;
      fillRoundRect(g, kx - 9, sl.y - 9, 18, 18, 9, pal.ui.card, pal.ui.primary, active ? 3 : 2);
      g.globalAlpha = 1;
      drawText(g, `${Math.round(v * 100)}%`, sl.x + sl.w + 16, sl.y, { size: 13, color: pal.hudMuted, weight: 600, tabular: true, align: "left" });
    }
    drawText(g, "In game, the speaker button toggles sound  ·  M mutes", SCREEN_W / 2, L.y + L.h - 24, { size: 12, color: pal.hudMuted, weight: 500 });
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
    // half-filled circle: "contrast"
    const r = h * 0.28;
    g.save();
    g.translate(t.cx, t.cy);
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
    if (hover) {
      const label = `Switch to ${THEME_LABELS[nextTheme(this.ctx.save.theme)]}`;
      drawText(g, label, t.cx - 4, t.cy + h / 2 + 12, { size: 11, color: pal.titleMuted, weight: 600, align: "right" });
      drawText(g, "(T)", t.cx + 14, t.cy + h / 2 + 12, { size: 11, color: pal.titleMuted, weight: 600, align: "left" });
    }
  }

  private renderScatter(g: CanvasRenderingContext2D): void {
    const sp = this.ctx.sprites.brick_noicon_sprite;
    for (const c of this.chips) {
      const p = clamp01(c.p);
      const lift = (1 - p) * 30;
      const tilt = c.tilt * (2 - p);
      g.save();
      g.globalAlpha = easeOutCubic(Math.min(1, p * 1.5));
      g.translate(c.x, c.y - lift);
      g.rotate(tilt);
      const s = c.size;
      fillRoundRect(g, -s / 2, -s / 2 + 4 + lift * 0.3, s, s, s * 0.18, "rgba(60,40,20,0.18)");
      drawSprite(g, sp, c.frame, -s / 2, -s / 2, s, s);
      g.restore();
    }
  }

  render(g: CanvasRenderingContext2D): void {
    this.tweens.update(this.ctx.clock.t);
    const sp = this.ctx.sprites;
    const inp = this.ctx.input;
    const pal = this.ctx.palette;
    const modern = this.generated;
    const subMenu = this.menu !== "main" && this.menu !== "launch";

    g.fillStyle = pal.background;
    g.fillRect(0, 0, SCREEN_W, SCREEN_H);

    if (pal.name === "pigment") {
      drawPaper(g, this.ctx.clock.t);
      this.renderScatter(g);
      if (subMenu) {
        // Push the chips back so the menu reads as the foreground.
        g.fillStyle = "rgba(243,238,228,0.72)";
        g.fillRect(0, 0, SCREEN_W, SCREEN_H);
      }
    } else if (pal.name === "spectra") {
      drawSpectraBackdrop(g, this.ctx.clock.t);
      this.renderBubbles(g);
      if (subMenu) {
        g.fillStyle = "rgba(7,7,12,0.7)";
        g.fillRect(0, 0, SCREEN_W, SCREEN_H);
      }
    } else if (pal.name === "blocky") {
      drawBlockyBackdrop(g, this.ctx.clock.t);
      // Staggered wall of toy bricks, every other row shifted half a brick.
      const wallSprite = sp.brick_noicon_sprite;
      for (const b of this.wall) {
        const row = Math.round((SCREEN_H - WALL_SIZE / 2 - b.cy) / WALL_SIZE);
        const ox = row % 2 === 1 ? -WALL_SIZE / 2 : 0;
        if (ox === 0 && b.cx > SCREEN_W) continue;
        drawSprite(g, wallSprite, b.frame, b.cx + ox - WALL_SIZE / 2, b.cy - WALL_SIZE / 2 - 10 * b.hop, WALL_SIZE, WALL_SIZE);
      }
      if (subMenu) {
        g.fillStyle = "rgba(18,24,38,0.72)";
        g.fillRect(0, 0, SCREEN_W, SCREEN_H);
      }
    } else {
      const wallSprite = sp.brick_noicon_sprite;
      for (const b of this.wall) {
        if (b.cx > SCREEN_W) continue;
        let xs = 1;
        if (b.flip > 0) {
          const t = b.flip / FLIP_FRAMES;
          xs = Math.abs(Math.cos(t * Math.PI));
        }
        const w = WALL_SIZE * xs;
        drawSprite(g, wallSprite, b.frame, b.cx - w / 2, b.cy - WALL_SIZE / 2, w, WALL_SIZE);
      }
    }

    if (this.menu === "main") {
      drawSprite(g, sp.menu_frame_sprite, 0, 0, SCREEN_H - BTN_H, SCREEN_W, BTN_H);
      const barY = SCREEN_H - BTN_H / 2;
      if (modern) {
        drawText(g, "HIGH SCORE", SCREEN_W / 2, barY - 20, { size: 12, color: pal.titleMuted, weight: 700 });
        drawText(g, String(this.ctx.save.hiscore), SCREEN_W / 2, barY + 10, { size: 34, color: pal.titleText, weight: 600, font: pal.display, tabular: true });
      } else {
        drawText(g, `High Score: ${this.ctx.save.hiscore}`, SCREEN_W / 2, barY, { size: 18, color: pal.titleText, tabular: true });
      }
      if (this.ctx.audio.muted) {
        drawText(g, "muted", SCREEN_W - BTN_H / 2, SCREEN_H - BTN_H - 12, { size: 12, color: pal.titleMuted, weight: 500 });
      }
      this.renderThemeToggle(g);
    }

    if (this.menu === "world") {
      if (modern) {
        const w = 520;
        const h = 360;
        const x = SCREEN_W / 2 - w / 2;
        const y = SCREEN_H / 2 - 180;
        drawCard(g, pal.ui, x, y, w, h, 24);
        drawText(g, "Select a world", SCREEN_W / 2, y + 32, { size: 22, color: pal.titleText, weight: 600, font: pal.display });
        const chip = `${this.pendingType[0].toUpperCase()}${this.pendingType.slice(1)} mode`;
        fillRoundRect(g, SCREEN_W / 2 - 60, y + 50, 120, 24, 12, pal.ui.secondary, pal.ui.secondaryEdge, 1);
        drawText(g, chip, SCREEN_W / 2, y + 63, { size: 12, color: pal.titleText, weight: 700 });
        drawText(g, "Tutorial teaches the colour rules in a minute", SCREEN_W / 2, y + h - 24, { size: 12, color: pal.titleMuted, weight: 500 });
      } else {
        const bg = sp.level_select_sprite;
        const w = 5 * BTN_H;
        const h = ((WALL_ROWS - 2) * BTN_H) / 2;
        drawSprite(g, bg, 0, SCREEN_W / 2 - w / 2, SCREEN_H - (BTN_H / 2) * (WALL_ROWS / 2) - h / 2, w, h);
        drawText(g, `Select a world (${this.pendingType})`, SCREEN_W / 2, SCREEN_H / 2 - BTN_H - 12, { size: 18, color: pal.titleText });
        drawText(g, "World 0 is the tutorial", SCREEN_W / 2, SCREEN_H / 2 + BTN_H + 12, { size: 14, color: pal.titleMuted, bold: false });
      }
    }

    if (this.menu === "mode") {
      const y = SCREEN_H - BTN_W;
      if (modern) {
        drawText(g, "Choose a mode", SCREEN_W / 2, y - BTN_H / 2 - 34, { size: 26, color: pal.titleText, weight: 600, font: pal.display });
        const gap = BTN_W * 0.97;
        const descriptions: Array<[number, string]> = [
          [SCREEN_W / 2 - gap, "Clear the whole board"],
          [SCREEN_W / 2, "Pop the target number of groups"],
          [SCREEN_W / 2 + gap, "Like Normal, but you can't lose"],
        ];
        for (const [cx, d] of descriptions) {
          drawText(g, d, cx, y + BTN_H / 2 + 18, { size: 12, color: pal.titleMuted, weight: 500 });
        }
      } else {
        drawText(g, "Choose a game mode", SCREEN_W / 2, y - BTN_H, { size: 20, color: pal.overlayText, shadow: "#000" });
      }
    }

    for (const b of this.buttons) {
      const sprite = sp[b.sprite];
      const hover = inp.inCentered(b.cx, b.cy, b.w, b.h);
      const pressed = this.held === b && hover;
      const frame = pressed ? Math.min(sprite.frames.length - 1, b.pressedFrame) : 0;
      const scale = this.feel.scale(b.id, hover, pressed);
      drawSprite(g, sprite, frame, b.cx - (b.w * scale) / 2, b.cy - (b.h * scale) / 2, b.w * scale, b.h * scale);
    }

    if (this.menu === "credits") {
      g.fillStyle = pal.ui.dim;
      g.fillRect(0, 0, SCREEN_W, SCREEN_H);
      drawSprite(g, sp.credits_sprite, 0, BTN_H, BTN_H, SCREEN_W - BTN_H * 2, SCREEN_H - BTN_H * 2);
    }
    if (this.menu === "settings") this.renderSettings(g);

    // Scene fades: in from the background on entry, out to it on launch.
    const e = this.ctx.clock.t - this.enterT0;
    if (e < FADE_MS) {
      g.globalAlpha = 1 - clamp01(e / FADE_MS);
      g.fillStyle = pal.background;
      g.fillRect(0, 0, SCREEN_W, SCREEN_H);
      g.globalAlpha = 1;
    }
    if (this.menu === "launch") {
      g.globalAlpha = clamp01((this.ctx.clock.t - this.launchT0) / FADE_MS);
      g.fillStyle = pal.background;
      g.fillRect(0, 0, SCREEN_W, SCREEN_H);
      g.globalAlpha = 1;
    }
  }
}
