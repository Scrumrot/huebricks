import { BTN_H, BTN_W, MAX_WORLD, SCREEN_H, SCREEN_W, type GameType } from "../core/constants";
import type { SpriteName } from "../engine/assets";
import { drawCard, drawSprite, drawText, fillRoundRect } from "../engine/draw";
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

const WALL_COLS = 12;
const WALL_SIZE = BTN_H / 2;
const WALL_ROWS = Math.ceil((WALL_COLS * SCREEN_H) / SCREEN_W);
const FLIP_FRAMES = 16;

/** `brick_noicon_sprite` frame used for each world's transition colour (`menu_play_end.gml`). */
const WORLD_FRAMES = [7, 0, 3, 1, 4, 2, 5, 6];

/**
 * Title screen. The original built its menus out of a wall of flipping bricks
 * driven by a bespoke menu system; this keeps the brick wall and the same
 * three-step flow (logo -> game mode -> world) with plain sprite buttons.
 */
export class TitleScene implements Scene {
  private readonly ctx: GameContext;
  private menu: MenuState = "main";
  private buttons: MenuButton[] = [];
  private wall: WallBrick[] = [];
  private held: MenuButton | null = null;
  private time = 0;
  private launchRadius = 0;
  private launchX = SCREEN_W / 2;
  private launchY = SCREEN_H / 2;
  private pendingType: GameType = "normal";
  /** Segmented Classic / Modern switch on the main menu's bottom bar. */
  private readonly themeToggle = { cx: SCREEN_W * 0.722, cy: SCREEN_H - BTN_H / 2 + 6, w: BTN_H * 1.25, h: 38 };

  constructor(ctx: GameContext) {
    this.ctx = ctx;
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
    this.showMain();
  }

  enter(): void {
    this.ctx.audio.playMusic("title_bgm");
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

  private showMain(): void {
    this.menu = "main";
    this.buttons = [
      this.button("logo", "logo_sprite", SCREEN_W / 2, SCREEN_H - BTN_W, BTN_W, BTN_W, () => this.showModes(), 1),
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
    this.buttons = [
      this.button("puzzle", "puzzle_button_sprite", SCREEN_W / 2 - BTN_W, y, BTN_W, BTN_H, () => this.showWorlds("puzzle")),
      this.button("normal", "normal_button_sprite", SCREEN_W / 2, y, BTN_W, BTN_H, () => this.showWorlds("normal")),
      this.button("zen", "zen_button_sprite", SCREEN_W / 2 + BTN_W, y, BTN_W, BTN_H, () => this.showWorlds("zen")),
      this.button("back", "back_button_sprite", SCREEN_W - BTN_H / 2, SCREEN_H - BTN_H / 2, BTN_H, BTN_H, () => this.showMain()),
    ];
  }

  private showWorlds(type: GameType): void {
    this.menu = "world";
    this.pendingType = type;
    this.buttons = [];
    const modern = this.ctx.palette.name === "modern";
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
    this.launchRadius = 0;
    this.launchX = this.ctx.input.x;
    this.launchY = this.ctx.input.y;
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  update(): void {
    const inp = this.ctx.input;
    this.time++;
    this.updateWall();

    if (this.menu === "launch") {
      this.launchRadius += 50;
      if (this.launchRadius > SCREEN_W * 1.414) {
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
      // Left half picks Classic, right half picks Modern.
      const want = inp.x < this.themeToggle.cx ? "classic" : "modern";
      if (want !== this.ctx.save.theme) {
        this.ctx.audio.play("menuselect_snd");
        this.ctx.setTheme(want);
      }
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

  /** Random brick flips, echoing the idle animation of the original title. */
  private updateWall(): void {
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

  /**
   * Segmented Classic | Modern control. The active half is filled with the
   * accent colour so the current theme reads at a glance; the other half is a
   * plain outlined button.
   */
  private renderThemeToggle(g: CanvasRenderingContext2D, modern: boolean): void {
    const pal = this.ctx.palette;
    const inp = this.ctx.input;
    const t = this.themeToggle;
    const x = t.cx - t.w / 2;
    const y = t.cy - t.h / 2;
    const r = t.h / 2;
    const half = t.w / 2;
    const hover = inp.inCentered(t.cx, t.cy, t.w, t.h);
    const hoverLeft = hover && inp.x < t.cx;
    const trackFill = modern ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.14)";
    const trackStroke = modern ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.45)";
    const activeFill = pal.overlayAccent;
    const activeText = "#111111";
    const idleText = pal.titleText;
    const hoverFill = modern ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";

    if (!modern) {
      // The classic bar is a brick wall; give the control a plate so it reads.
      fillRoundRect(g, x - 5, y - 22, t.w + 10, t.h + 44, 10, "rgba(248,248,248,0.9)", "rgba(0,0,0,0.35)");
    }
    drawText(g, "THEME", t.cx, y - 9, { size: 11, color: pal.titleMuted, bold: true });
    fillRoundRect(g, x, y, t.w, t.h, r, trackFill, trackStroke, 1.5);

    // Active segment (slides to the chosen half).
    const activeX = modern ? t.cx : x;
    fillRoundRect(g, activeX + 3, y + 3, half - 6, t.h - 6, r - 3, activeFill);
    if (hover) {
      const hx = hoverLeft ? x : t.cx;
      const isActive = hoverLeft !== modern;
      if (!isActive) fillRoundRect(g, hx + 3, y + 3, half - 6, t.h - 6, r - 3, hoverFill);
    }

    drawText(g, "CLASSIC", x + half / 2, t.cy + 1, { size: 13, color: modern ? idleText : activeText, bold: true });
    drawText(g, "MODERN", t.cx + half / 2, t.cy + 1, { size: 13, color: modern ? activeText : idleText, bold: true });
    drawText(g, "press T to switch", t.cx, y + t.h + 13, { size: 10, color: pal.titleMuted, bold: false });
  }

  render(g: CanvasRenderingContext2D): void {
    const sp = this.ctx.sprites;
    const inp = this.ctx.input;

    const pal = this.ctx.palette;
    g.fillStyle = pal.background;
    g.fillRect(0, 0, SCREEN_W, SCREEN_H);

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

    const modern = pal.name === "modern";
    if (modern && this.menu !== "launch") {
      // Push the wall back so the menu chrome reads as the foreground.
      g.fillStyle = this.menu === "main" ? "rgba(5,9,20,0.30)" : "rgba(5,9,20,0.55)";
      g.fillRect(0, 0, SCREEN_W, SCREEN_H);
    }

    if (this.menu === "main") {
      drawSprite(g, sp.menu_frame_sprite, 0, 0, SCREEN_H - BTN_H, SCREEN_W, BTN_H);
      const barY = SCREEN_H - BTN_H / 2;
      if (modern) {
        drawText(g, "HIGH SCORE", SCREEN_W / 2, barY - 22, { size: 12, color: pal.titleMuted, bold: true });
        drawText(g, String(this.ctx.save.hiscore), SCREEN_W / 2, barY + 2, { size: 28, color: pal.titleText, bold: true });
        drawText(g, "Click the logo to play", SCREEN_W / 2, barY + 30, { size: 12, color: pal.titleMuted, bold: false });
      } else {
        drawText(g, `High Score: ${this.ctx.save.hiscore}`, SCREEN_W / 2, barY - 12, { size: 18, color: pal.titleText });
        drawText(g, "Click the logo to play", SCREEN_W / 2, barY + 14, { size: 14, color: pal.titleMuted, bold: false });
      }
      if (this.ctx.audio.muted) {
        drawText(g, "muted", SCREEN_W - BTN_H / 2, SCREEN_H - 10, { size: 12, color: pal.titleMuted, bold: false });
      }
      this.renderThemeToggle(g, modern);
    }

    if (this.menu === "world") {
      if (modern) {
        const w = 520;
        const h = 360;
        const x = SCREEN_W / 2 - w / 2;
        const y = SCREEN_H / 2 - 180;
        drawCard(g, x, y, w, h, 24);
        drawText(g, "SELECT A WORLD", SCREEN_W / 2, y + 30, { size: 14, color: pal.titleMuted, bold: true });
        const chip = `${this.pendingType[0].toUpperCase()}${this.pendingType.slice(1)} mode`;
        fillRoundRect(g, SCREEN_W / 2 - 60, y + 46, 120, 24, 12, "rgba(255,255,255,0.1)");
        drawText(g, chip, SCREEN_W / 2, y + 59, { size: 12, color: pal.titleText, bold: true });
        drawText(g, "Tutorial teaches the colour rules in a minute", SCREEN_W / 2, y + h - 24, { size: 12, color: pal.titleMuted, bold: false });
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
        drawText(g, "CHOOSE A MODE", SCREEN_W / 2, y - BTN_H / 2 - 30, { size: 14, color: pal.titleMuted, bold: true });
        const descriptions: Array<[number, string]> = [
          [SCREEN_W / 2 - BTN_W, "Clear the whole board"],
          [SCREEN_W / 2, "Pop the target number of groups"],
          [SCREEN_W / 2 + BTN_W, "Like Normal, but you can't lose"],
        ];
        for (const [cx, d] of descriptions) {
          drawText(g, d, cx, y + BTN_H / 2 + 18, { size: 12, color: pal.titleMuted, bold: false });
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
      const scale = pressed ? 0.95 : hover ? 1.05 : 1;
      drawSprite(g, sprite, frame, b.cx - (b.w * scale) / 2, b.cy - (b.h * scale) / 2, b.w * scale, b.h * scale);
    }

    if (this.menu === "credits") {
      g.fillStyle = "rgba(0,0,0,0.5)";
      g.fillRect(0, 0, SCREEN_W, SCREEN_H);
      drawSprite(g, sp.credits_sprite, 0, BTN_H, BTN_H, SCREEN_W - BTN_H * 2, SCREEN_H - BTN_H * 2);
    }

    if (this.menu === "launch") {
      const frame = WORLD_FRAMES[this.ctx.session.world] ?? 7;
      const tile = sp.brick_noicon_sprite.frames[frame];
      g.save();
      g.beginPath();
      g.arc(this.launchX, this.launchY, this.launchRadius, 0, Math.PI * 2);
      g.clip();
      const pattern = g.createPattern(tile, "repeat");
      const scale = WALL_SIZE / sp.brick_noicon_sprite.width;
      if (pattern) {
        g.scale(scale, scale);
        g.fillStyle = pattern;
        g.fillRect(0, 0, SCREEN_W / scale, SCREEN_H / scale);
      }
      g.restore();
    }
  }
}
