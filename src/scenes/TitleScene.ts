import { BTN_H, BTN_W, MAX_WORLD, SCREEN_H, SCREEN_W, type GameType } from "../core/constants";
import type { SpriteName } from "../engine/assets";
import { ButtonFeel } from "../engine/buttonFeel";
import { drawCard, drawSprite, drawText, fillRoundRect } from "../engine/draw";
import { backOut, clamp01, easeOutCubic } from "../engine/easing";
import { drawPaper } from "../engine/modernSkin";
import { Tweens } from "../engine/tween";
import { GameScene } from "./GameScene";
import type { GameContext, Scene } from "./Scene";

type MenuState = "main" | "mode" | "world" | "credits" | "launch";

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
  private held: MenuButton | null = null;
  private time = 0;
  private launchT0 = -1;
  private pendingType: GameType = "normal";
  private readonly tweens = new Tweens();
  private readonly feel: ButtonFeel;
  private enterT0 = 0;
  /** Icon pill in the top-right corner that switches the theme. */
  private readonly themeToggle = { cx: SCREEN_W - 36, cy: 26, w: 48, h: 30 };

  constructor(ctx: GameContext) {
    this.ctx = ctx;
    this.feel = new ButtonFeel(this.tweens);
    for (let row = 0; row < WALL_ROWS; row++) {
      for (let col = 0; col < WALL_COLS; col++) {
        this.wall.push({
          cx: col * WALL_SIZE + WALL_SIZE / 2,
          cy: SCREEN_H - row * WALL_SIZE - WALL_SIZE / 2,
          frame: 7,
          nextFrame: 7,
          flip: 0,
        });
      }
    }
    this.scatterChips();
    this.showMain();
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

  private get modern(): boolean {
    return this.ctx.palette.name === "modern";
  }

  private showMain(): void {
    this.menu = "main";
    const logo = this.modern
      ? this.button("logo", "logo_sprite", SCREEN_W / 2, 205, BTN_W * 1.5, BTN_W * 1.5 * (400 / 768), () => this.showModes(), 1)
      : this.button("logo", "logo_sprite", SCREEN_W / 2, SCREEN_H - BTN_W, BTN_W, BTN_W, () => this.showModes(), 1);
    this.buttons = [
      logo,
      this.button("info", "info_button_sprite", BTN_H / 2, SCREEN_H - BTN_H / 2, BTN_H, BTN_H, () => {
        this.menu = "credits";
      }),
      this.button("settings", "settings_button_sprite", SCREEN_W - BTN_H / 2, SCREEN_H - BTN_H / 2, BTN_H, BTN_H, () => {
        this.ctx.save.muted = this.ctx.audio.toggleMute();
        this.ctx.persist();
      }),
    ];
  }

  private showModes(): void {
    this.menu = "mode";
    const y = SCREEN_H - BTN_W;
    const gap = this.modern ? BTN_W * 0.97 : BTN_W;
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
    const modern = this.modern;
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
      if (inp.released || inp.keysPressed.has("Escape")) this.menu = "main";
      return;
    }

    if (inp.keysPressed.has("Escape") || inp.keysPressed.has("Backspace")) {
      if (this.menu === "mode") this.showMain();
      else if (this.menu === "world") this.showModes();
    }

    if (this.menu === "main" && inp.released && inp.inCentered(this.themeToggle.cx, this.themeToggle.cy, this.themeToggle.w, this.themeToggle.h)) {
      this.ctx.audio.play("menuselect_snd");
      this.ctx.setTheme(this.ctx.save.theme === "modern" ? "classic" : "modern");
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

  /** Random brick flips, echoing the idle animation of the original title (classic only). */
  private updateWall(): void {
    if (this.modern) return;
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
      const label = this.modern ? "Switch to Classic" : "Switch to Modern";
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
    const modern = this.modern;

    g.fillStyle = pal.background;
    g.fillRect(0, 0, SCREEN_W, SCREEN_H);

    if (modern) {
      drawPaper(g, this.ctx.clock.t);
      this.renderScatter(g);
      if (this.menu !== "main" && this.menu !== "launch") {
        // Push the chips back so the menu reads as the foreground.
        g.fillStyle = "rgba(243,238,228,0.72)";
        g.fillRect(0, 0, SCREEN_W, SCREEN_H);
      }
    } else {
      const wallSprite = sp.brick_noicon_sprite;
      for (const b of this.wall) {
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
