import { Board, type PopResult } from "../core/Board";
import { Brick } from "../core/Brick";
import {
  BLUE,
  BLACK,
  colorFrame,
  COLOR_NAMES,
  GREEN,
  ORANGE,
  PURPLE,
  randomSpawnColor,
  RED,
  YELLOW,
  type Color,
} from "../core/color";
import {
  BTN_H,
  DEFAULT_CELL_NUM,
  FPS,
  LEVEL_COMPLETE_DELAY,
  LEVELS_PER_WORLD,
  MAX_WORLD,
  SCREEN_H,
  SCREEN_W,
} from "../core/constants";
import { cellX, cellY, replenishY, screenToGrid } from "../core/layout";
import { levelParams } from "../core/level";
import type { MusicName, Sprite, SpriteName } from "../engine/assets";
import { drawBlock, drawCard, drawLine, drawPillButton, drawSprite, drawSpritePartX, drawText, fillRoundRect, type PillButton } from "../engine/draw";
import type { ThemeName } from "../engine/theme";
import type { GameContext, Scene } from "./Scene";
import { TitleScene } from "./TitleScene";

type State = "rest" | "animation" | "menu" | "tutorial" | "lost";
type Animation =
  | "none"
  | "fall"
  | "rotate"
  | "pop"
  | "combine"
  | "noadd"
  | "begin"
  | "push"
  | "fadein"
  | "fadeout";
type TutorialPhase = "intro" | "add" | "outro";

/** Floating label that rises and fades (chain multipliers, bonuses). */
interface Callout {
  text: string;
  x: number;
  y: number;
  t: number;
  color: string;
  size: number;
}

/** `selected` value meaning "the brick in the hold slot". */
const HOLD = -1;
/** Frames at rest before a chain cools off completely. */
const CHAIN_DECAY_FRAMES = FPS * 2.5;
const MAX_MULTIPLIER = 5;
/** Frames of slowed pop animation after a big chain. */
const SLOWMO_FRAMES = 14;
/**
 * Playback rate for board animations (pops, mixing, rotation, falls, push,
 * level fades) relative to the original 30 Hz GML timings. 1 = as the
 * GameMaker version; higher is snappier.
 */
const ANIM_SPEED = 1.6;
const CALLOUT_FRAMES = 50;
/** Bonus for popping a group that contains a refined (subtracted) brick. */
const REFINED_BONUS = 150;
/** One-time bonus for completing the level's subtract goal. */
const GOAL_BONUS = 500;
/** Upcoming replenish colours shown as ghosts in the empty slots. */
const PREVIEW_COUNT = 3;
/** Chain multiplier colours, indexed by multiplier. */
const MULT_COLORS = ["", "#f8fafc", "#ffc12b", "#ff8a2a", "#ef3f4f", "#9b5de5"];

interface DieAnim {
  x: number;
  y: number;
  color: Color;
  popAnim: number;
  value: number;
}

interface SideButton {
  kind: "ccw" | "cw" | "speed" | "pause" | "sound";
  sprite: SpriteName;
  baseFrame: number;
  cx: number;
  cy: number;
  w: number;
  h: number;
  hilite: boolean;
  pressed: boolean;
}

const EXPAND_SPRITES: Record<Color, SpriteName> = {
  1: "red_expand_sprite",
  2: "blue_expand_sprite",
  3: "purple_expand_sprite",
  4: "yellow_expand_sprite",
  5: "orange_expand_sprite",
  6: "green_expand_sprite",
  7: "black_expand_sprite",
};

/** Replenish / board colours for the six tutorial exercises (`board_populate_tutorial.gml`). */
const TUTORIAL_LEVELS: Array<{ board: Color; target: Color; replenish: Color; canAdd: boolean; canSubtract: boolean }> = [
  { board: GREEN, target: YELLOW, replenish: BLUE, canAdd: true, canSubtract: false },
  { board: ORANGE, target: YELLOW, replenish: RED, canAdd: true, canSubtract: false },
  { board: PURPLE, target: BLUE, replenish: RED, canAdd: true, canSubtract: false },
  { board: RED, target: ORANGE, replenish: YELLOW, canAdd: false, canSubtract: true },
  { board: YELLOW, target: GREEN, replenish: BLUE, canAdd: false, canSubtract: true },
  { board: RED, target: BLUE, replenish: PURPLE, canAdd: false, canSubtract: true },
];

/**
 * The playing scene: board, replenish line, side buttons, pause menu and the
 * tutorial. A port of the `Board`, `Brick`, `BrickDieAnim`, `ReplenishSelector`,
 * `RotateUI`, `SpeedUI`, `PauseUI` and `TutorialText` objects.
 */
export class GameScene implements Scene {
  private readonly ctx: GameContext;
  private readonly board: Board;

  private state: State = "animation";
  private animation: Animation = "fadein";

  // --- replenish line ---
  private replenishTimer = 180;
  private replenishLine = 0;
  private replenishNum = 0;
  private readyToPush = false;
  private comboRemaining = 0;
  private maxPercentage = 0;
  private currentPercentage = 0;

  // --- selector (ReplenishSelector) ---
  private selected: number;
  private selectedBrick: Brick | null = null;
  private selX = 0;
  private cx = 0;
  private cy = 0;
  private bx = 0;
  private by = 0;
  private selAlpha = 0;
  private repDown = false;
  private boardDown = false;

  // --- side buttons ---
  private buttons: SideButton[] = [];
  private buttonsTheme: ThemeName = "classic";
  private accel = 1;

  // --- chain meter ---
  /** Scoring pops since the meter last cooled off. */
  private chain = 0;
  /** 1 right after a pop, cooling to 0 at rest. */
  private heat = 0;
  private slowmo = 0;
  private callouts: Callout[] = [];

  // --- hold slot and preview ---
  private held: Brick | null = null;
  private holdHover = false;
  private nextColors: Color[] = [];

  // --- subtract goal ---
  private subtractGoal = 0;
  private subtractDone = 0;
  private goalAwarded = false;

  private dieAnims: DieAnim[] = [];
  private levelCompleteDelay = LEVEL_COMPLETE_DELAY;
  private fadeRadius = SCREEN_W * Math.SQRT2;
  private levelCompleteSounded = false;
  private lostTimer = 0;

  // --- tutorial ---
  private tutorialPhase: TutorialPhase = "intro";
  private tutorialState = 0;
  private tutorialText = "";
  private tutorialTimer = 0;

  constructor(ctx: GameContext) {
    this.ctx = ctx;
    this.board = new Board(DEFAULT_CELL_NUM);
    this.selected = this.board.cellNum;
    this.selX = cellX(this.board.layout, this.selected);
    for (let i = 0; i < PREVIEW_COUNT; i++) this.nextColors.push(randomSpawnColor());
    this.layoutButtons();
  }

  enter(): void {
    const { world, gameType } = this.ctx.session;
    const music: MusicName = world === 0 ? "tutorial_bgm" : `${gameType}${world}_bgm`;
    this.ctx.audio.playMusic(music);
  }

  // ---------------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------------

  private layoutButtons(): void {
    const l = this.board.layout;
    this.buttonsTheme = this.ctx.palette.name;
    const cx = l.boardX + l.boardW + (SCREEN_W - l.boardW) / 4;

    if (this.buttonsTheme === "modern") {
      // Four equal buttons spread evenly down the right rail, rotate pair grouped.
      const railW = (SCREEN_W - l.boardW) / 2;
      const d = Math.min(railW * 0.66, SCREEN_H / 5.2);
      const margin = 16;
      const pairGap = 8;
      const ys = [margin + d / 2, SCREEN_H / 2 - d / 2 - pairGap / 2, SCREEN_H / 2 + d / 2 + pairGap / 2, SCREEN_H - margin - d / 2];
      const mk = (kind: SideButton["kind"], sprite: SpriteName, baseFrame: number, cy: number): SideButton => ({
        kind,
        sprite,
        baseFrame,
        cx,
        cy,
        w: d,
        h: d,
        hilite: false,
        pressed: false,
      });
      this.buttons = [
        mk("pause", "pause_button_sprite", 0, ys[0]),
        mk("ccw", "rotate_button_sprite", 0, ys[1]),
        mk("cw", "rotate_button_sprite", 2, ys[2]),
        mk("speed", "speedup_button_sprite", 0, ys[3]),
        // Sound toggle sits alone in the middle of the left rail, between the HUD blocks.
        { ...mk("sound", "sound_button_sprite", 0, this.rail().soundY), cx: l.boardX / 2, w: d * 0.6, h: d * 0.6 },
      ];
      return;
    }

    let wid = ((SCREEN_W - l.boardW) / 2) * 0.8;
    let hit = wid; // the button sprites are square
    if (hit > SCREEN_H / 4) {
      hit = SCREEN_H / 4;
      wid = hit;
    }
    const mk = (kind: SideButton["kind"], sprite: SpriteName, baseFrame: number, cy: number, scale = 1): SideButton => ({
      kind,
      sprite,
      baseFrame,
      cx,
      cy,
      w: wid * scale,
      h: hit * scale,
      hilite: false,
      pressed: false,
    });
    this.buttons = [
      mk("pause", "pause_button_sprite", 0, hit / 2),
      mk("ccw", "rotate_button_sprite", 0, SCREEN_H / 2 - hit / 2, 0.95),
      mk("cw", "rotate_button_sprite", 2, SCREEN_H / 2 + hit / 2, 0.95),
      mk("speed", "speedup_button_sprite", 0, SCREEN_H - hit / 2),
      { ...mk("sound", "sound_button_sprite", 0, this.rail().soundY, 0.55), cx: l.boardX / 2 },
    ];
  }

  /**
   * Vertical layout of the left rail (HUD column). Everything is a multiple
   * of the cell height so it scales with the board size.
   */
  private rail(): {
    cx: number;
    chainY: number;
    levelY: number;
    holdLabelY: number;
    holdY: number;
    soundY: number;
    goalLabelY: number;
    goalY: number;
    slot: number;
  } {
    const l = this.board.layout;
    const h = l.cellH;
    const cx = l.boardX / 2;
    if (this.ctx.palette.name === "modern") {
      return { cx, chainY: h * 1.7, levelY: h * 2.45, holdLabelY: h * 3.05, holdY: h * 3.6, soundY: h * 4.85, goalLabelY: h * 5.75, goalY: h * 6.1, slot: l.cellW * 0.8 };
    }
    return { cx, chainY: h * 1.65, levelY: h * 1.95, holdLabelY: h * 2.42, holdY: h * 3, soundY: h * 4.25, goalLabelY: h * 5.2, goalY: h * 5.55, slot: l.cellW * 0.9 };
  }

  private chainMultiplier(): number {
    return Math.max(1, Math.min(MAX_MULTIPLIER, this.chain));
  }

  /** `board_populate.gml` */
  private populate(): void {
    const { world, level } = this.ctx.session;
    const params = levelParams(world, level);
    const l = this.board.layout;
    let entrance = 0;
    for (let i = 0; i < params.brickCount && i < this.board.cellNum ** 2; i++) {
      const brick = new Brick(randomSpawnColor());
      const { gx, gy } = this.board.placeByIndex(i, brick);
      brick.x = cellX(l, gx);
      brick.y = cellY(l, gy);
      brick.spriteX = brick.x;
      brick.spriteY = brick.y - l.boardH;
      brick.enterDelay = ++entrance;
      brick.enter = true;
    }
    this.replenishTimer = params.replenishTimer;
    this.comboRemaining = params.comboRemaining;
    this.subtractGoal = params.subtractGoal;

    this.state = "animation";
    this.animation = "begin";
    this.board.resetBlockPositions();
    this.board.recalculateGroups();
    this.applyPop(this.board.popGroups());
  }

  /** `board_populate_tutorial.gml` */
  private populateTutorial(): void {
    const l = this.board.layout;
    const spec = TUTORIAL_LEVELS[this.ctx.session.level];
    for (let i = 0; i < 4; i++) {
      const brick = new Brick(i === 3 ? spec.target : spec.board);
      this.board.placeByIndex(i, brick);
    }
    const rep = new Brick(spec.replenish);
    this.board.replenishList = [rep];
    this.board.resetBlockPositions();
    for (const b of this.board.allBricks()) b.settle();
    this.replenishNum = 1;
    this.selected = this.board.cellNum;
    this.selX = cellX(l, this.selected);
    this.selectedBrick = null;
  }

  private spawnReplenishBrick(): Brick {
    const l = this.board.layout;
    const idx = this.board.replenishList.length;
    const color = this.nextColors.shift() ?? randomSpawnColor();
    this.nextColors.push(randomSpawnColor());
    const b = new Brick(color, cellX(l, idx), replenishY(l));
    this.board.replenishList.push(b);
    return b;
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  update(): void {
    const inp = this.ctx.input;
    if (inp.keysPressed.has("Escape") || inp.keysPressed.has("Backspace")) {
      this.quitToTitle();
      return;
    }

    if (this.buttonsTheme !== this.ctx.palette.name) this.layoutButtons();

    if (this.state === "lost") {
      this.lostTimer++;
      if (this.lostTimer <= 20) return;
      if (this.ctx.palette.name === "modern") {
        const hit = this.overlayButtons().find((b) => inp.released && inp.inCentered(b.cx, b.cy, b.w, b.h));
        if (hit?.id === "retry" || inp.keysPressed.has("Enter")) this.retry();
        else if (hit?.id === "menu") this.quitToTitle();
      } else if (inp.pressed || inp.keysPressed.has("Enter") || inp.keysPressed.has(" ")) {
        this.quitToTitle();
      }
      return;
    }

    if (this.state === "tutorial" && this.tutorialPhase !== "add") {
      this.updateTutorialSlides();
      return;
    }

    if (this.state === "menu") {
      this.updateButtons();
      this.updateMenu();
      return;
    }

    this.updateButtons();
    this.updateSelector();
    this.stepRest();
    this.stepAnimation();
    this.stepTutorial();
    for (const b of this.board.allBricks()) this.stepBrick(b);
    if (this.held) this.stepBrick(this.held);
    this.stepDieAnims();
    this.stepCallouts();
    if (this.slowmo > 0) this.slowmo--;
  }

  /** `Board` step event, STATE_REST block. */
  private stepRest(): void {
    const n = this.board.cellNum;
    if (this.state === "rest") {
      let block: Brick | null = null;

      if (this.ctx.session.gameType === "puzzle" && this.board.isEmpty()) {
        this.beginLevelComplete();
      }

      if (this.comboRemaining <= 0) {
        this.beginLevelComplete();
      } else if (this.state === "rest") {
        if (this.replenishNum === 0) {
          block = this.spawnReplenishBrick();
        }
        if (this.replenishLine > this.replenishTimer) {
          if (this.readyToPush) {
            this.doPush();
            this.readyToPush = false;
          } else if (this.replenishNum < n) {
            block = this.spawnReplenishBrick();
            this.ctx.audio.play("BlocksFillRepLine_snd");
          } else {
            this.readyToPush = true;
          }
          this.replenishLine = 0;
        }
        if (block) {
          block.inactiveTimer = this.replenishTimer;
          block.inactiveDuration = this.replenishTimer;
        }
        this.replenishNum = this.board.replenishList.length;
      }

      this.board.comboLength = 0;
      this.board.comboBonus = 0;
      if (this.heat > 0) {
        this.heat -= 1 / CHAIN_DECAY_FRAMES;
        if (this.heat <= 0) {
          this.heat = 0;
          this.chain = 0;
        }
      }
      if (this.currentPercentage === this.maxPercentage) {
        this.replenishLine += this.accel;
      } else {
        this.maxPercentage -= this.accel / n / this.replenishTimer;
      }
    }

    if (this.board.countBricks() + this.board.replenishList.length > 0) {
      this.currentPercentage =
        this.replenishLine !== 0
          ? (this.replenishNum - 1 + (this.readyToPush ? 1 : 0)) / n + this.replenishLine / this.replenishTimer / n
          : 0;
    }
    if (this.currentPercentage > this.maxPercentage) this.maxPercentage = this.currentPercentage;
  }

  private beginLevelComplete(): void {
    if (this.state === "animation" && this.animation === "fadeout") return;
    this.state = "animation";
    this.animation = "fadeout";
    this.levelCompleteDelay = LEVEL_COMPLETE_DELAY;
    if (!this.levelCompleteSounded) {
      this.levelCompleteSounded = true;
      this.ctx.audio.play("achievment_snd");
    }
  }

  /** `board_push.gml` plus the normal-mode loss check. */
  private doPush(): void {
    const result = this.board.push();
    this.replenishNum = 0;
    this.replenishLine = 0;
    this.selectedBrick = null;
    this.selected = this.board.cellNum;
    this.state = "animation";
    this.animation = "push";
    this.ctx.audio.play("BlocksRepMoveUp_snd");
    if (result.overflow && this.ctx.session.gameType === "normal") {
      this.lose();
    }
  }

  /** Pause-menu geometry shared by update and render. */
  private menuButtonRect(): { x: number; y: number; size: number } {
    const size = SCREEN_H / 4;
    return { x: SCREEN_W / 2 - size / 2, y: SCREEN_H / 2, size };
  }

  private updateMenu(): void {
    const inp = this.ctx.input;
    if (this.ctx.palette.name === "modern") {
      const hit = this.overlayButtons().find((b) => inp.released && inp.inCentered(b.cx, b.cy, b.w, b.h));
      if (!hit) return;
      this.ctx.audio.play("menuselect_snd");
      if (hit.id === "resume") this.state = "rest";
      else if (hit.id === "menu") this.quitToTitle();
      return;
    }
    const r = this.menuButtonRect();
    if (inp.released && inp.inRect(r.x, r.y, r.size, r.size)) {
      this.ctx.audio.play("menuselect_snd");
      this.quitToTitle();
    }
  }

  /** Buttons on the modern pause and game-over cards. */
  private overlayButtons(): PillButton[] {
    const cx = SCREEN_W / 2;
    const y = SCREEN_H / 2 + 72;
    const w = 150;
    const h = 44;
    if (this.state === "lost") {
      return [
        { id: "retry", label: "Try again", cx: cx - w / 2 - 8, cy: y, w, h, primary: true },
        { id: "menu", label: "Main menu", cx: cx + w / 2 + 8, cy: y, w, h },
      ];
    }
    return [
      { id: "resume", label: "Resume", cx: cx - w / 2 - 8, cy: y, w, h, primary: true },
      { id: "menu", label: "Main menu", cx: cx + w / 2 + 8, cy: y, w, h },
    ];
  }

  /** Restart the current level from a score of zero. */
  private retry(): void {
    this.ctx.session.score = 0;
    this.ctx.setScene(new GameScene(this.ctx));
  }

  private lose(): void {
    this.state = "lost";
    this.lostTimer = 0;
    this.ctx.audio.play("tryagain_snd");
    this.recordHighScore();
  }

  /** `Board` step event, STATE_ANIMATION block. */
  private stepAnimation(): void {
    if (this.state !== "animation") return;
    const bricks = [...this.board.allBricks()];
    const count = (pred: (b: Brick) => boolean) => bricks.filter(pred).length;
    const { world } = this.ctx.session;

    switch (this.animation) {
      case "fadeout":
        this.levelCompleteDelay -= ANIM_SPEED;
        if (this.levelCompleteDelay < 0) this.nextLevel();
        return;
      case "fadein":
        this.fadeRadius *= 0.96 ** ANIM_SPEED;
        if (this.fadeRadius <= BTN_H / 2) {
          if (world !== 0) {
            this.populate();
          } else {
            this.state = "tutorial";
            this.tutorialPhase = "intro";
            this.tutorialState = 0;
            this.board.resize(4);
            this.selected = this.board.cellNum;
            this.selX = cellX(this.board.layout, this.selected);
            this.layoutButtons();
          }
        }
        return;
      case "push":
        this.maxPercentage -= 1 / (this.board.cellNum * 5);
        if (count((b) => b.pushing) === 0) {
          this.state = "rest";
          this.maxPercentage = 0;
        }
        break;
      case "begin":
        if (count((b) => b.enter) === 0) this.state = "rest";
        break;
      case "fall":
        if (count((b) => b.fall) === 0) {
          this.state = "rest";
          this.ctx.audio.play("BlocksLanding_snd");
        }
        break;
      case "rotate":
        if (count((b) => b.rotate) === 0) {
          this.animation = "fall";
          this.board.resetBlockPositions();
          if (this.board.resettle()) this.ctx.audio.play("block_fall_snd");
        }
        break;
      case "pop":
        if (this.dieAnims.length === 0) {
          if (this.board.resettle()) {
            this.animation = "fall";
            this.ctx.audio.play("block_fall_snd");
          } else {
            this.state = "rest";
          }
        }
        break;
      case "combine":
        if (count((b) => b.color !== b.spriteColor) === 0) {
          this.state = world === 0 ? "tutorial" : "rest";
        }
        break;
      case "noadd":
        if (count((b) => b.noadd) === 0) {
          this.state = world === 0 ? "tutorial" : "rest";
        }
        break;
      case "none":
        this.state = "rest";
        break;
    }

    if (this.state === "rest") {
      this.animation = "none";
      this.board.resetBlockPositions();
      this.board.recalculateGroups();
      this.applyPop(this.board.popGroups());
    }
  }

  /**
   * Turn a `popGroups` result into die animations, score and state.
   *
   * On top of the GML scoring, every scoring pop advances the chain meter and
   * the whole pass is multiplied by the chain length (up to x5). Groups that
   * contain a refined brick earn a bonus and count toward the subtract goal.
   */
  private applyPop(res: PopResult): void {
    if (res.groups.length === 0) return;
    const scoring = res.score !== 0;
    let mult = 1;
    if (scoring) {
      this.chain += 1;
      this.heat = 1;
      mult = this.chainMultiplier();
    }
    for (const g of res.groups) {
      for (const b of g) {
        this.dieAnims.push({ x: b.x, y: b.y, color: b.color, popAnim: 0, value: res.brickValue * mult });
      }
    }
    this.maxPercentage = Math.min(1, this.maxPercentage + 1 / this.board.cellNum);
    this.state = "animation";
    this.animation = "pop";

    let gained = res.score * mult;
    if (scoring) {
      this.comboRemaining -= 1;
      this.ctx.audio.play("BlocksPopping_snd");

      const refined = res.groups.filter((g) => g[0].color !== BLACK && g.some((b) => b.refined));
      for (const g of refined) {
        const bonus = REFINED_BONUS * mult;
        gained += bonus;
        this.subtractDone += 1;
        this.addCallout(`SUBTRACT +${bonus}`, g, 0.45, "#7dd3fc", 15);
      }
      if (this.chain >= 2) {
        this.addCallout(`CHAIN x${mult}`, res.groups[0], -0.45, MULT_COLORS[mult], 18 + mult * 2);
      }
      if (this.chain >= 3) this.slowmo = SLOWMO_FRAMES;

      if (this.subtractGoal > 0 && !this.goalAwarded && this.subtractDone >= this.subtractGoal) {
        this.goalAwarded = true;
        gained += GOAL_BONUS;
        this.ctx.audio.play("achievment_snd");
        const l = this.board.layout;
        this.callouts.push({ text: `SUBTRACT GOAL +${GOAL_BONUS}`, x: l.boardX + l.boardW / 2, y: l.boardH * 0.4, t: 0, color: "#7dd3fc", size: 24 });
      }
    }
    this.ctx.session.score += gained;
  }

  /** Add a rising label above (`dy < 0`) or below the centre of a popped group. */
  private addCallout(text: string, group: Brick[], dy: number, color: string, size: number): void {
    const l = this.board.layout;
    let x = 0;
    let y = 0;
    for (const b of group) {
      x += b.x + l.cellW / 2;
      y += b.y + l.cellH / 2;
    }
    x /= group.length;
    y /= group.length;
    // Keep the label inside the board horizontally.
    x = Math.max(l.boardX + 70, Math.min(l.boardX + l.boardW - 70, x));
    this.callouts.push({ text, x, y: y + dy * l.cellH, t: 0, color, size });
  }

  private stepCallouts(): void {
    for (const c of this.callouts) {
      c.t += 1;
      c.y -= c.t < 10 ? 1.2 : 0.35;
    }
    this.callouts = this.callouts.filter((c) => c.t < CALLOUT_FRAMES);
  }

  private nextLevel(): void {
    const s = this.ctx.session;
    s.level += 1;
    if (s.level >= LEVELS_PER_WORLD) {
      s.level = 0;
      s.world = Math.min(MAX_WORLD, s.world + 1);
    }
    if (s.world > this.ctx.save.worldProgress) {
      this.ctx.save.worldProgress = s.world;
    }
    this.recordHighScore();
    const next = new GameScene(this.ctx);
    this.ctx.setScene(next);
  }

  private recordHighScore(): void {
    if (this.ctx.session.score > this.ctx.save.hiscore) {
      this.ctx.save.hiscore = this.ctx.session.score;
    }
    this.ctx.persist();
  }

  private quitToTitle(): void {
    this.recordHighScore();
    this.ctx.setScene(new TitleScene(this.ctx));
  }

  // ---------------------------------------------------------------------------
  // Side buttons (RotateUI / SpeedUI / PauseUI)
  // ---------------------------------------------------------------------------

  private updateButtons(): void {
    const inp = this.ctx.input;
    const interactive = this.ctx.session.world !== 0;
    for (const btn of this.buttons) {
      btn.hilite = (interactive || btn.kind === "sound") && inp.inCentered(btn.cx, btn.cy, btn.w, btn.h);
      if (inp.pressed && btn.hilite) btn.pressed = true;
      if (!btn.hilite) btn.pressed = false;
      if (inp.released && btn.pressed) {
        btn.pressed = false;
        this.activateButton(btn.kind);
      }
    }

    // Keyboard equivalents.
    if (interactive) {
      if (inp.keysPressed.has("q") || inp.keysPressed.has("ArrowLeft")) this.activateButton("ccw");
      if (inp.keysPressed.has("e") || inp.keysPressed.has("ArrowRight")) this.activateButton("cw");
      if (inp.keysPressed.has("p")) this.activateButton("pause");
    }

    const speed = this.buttons.find((b) => b.kind === "speed")!;
    const speeding = speed.pressed || inp.keysDown.has(" ") || inp.keysDown.has("ArrowDown");
    if (speeding && this.state === "rest") {
      this.accel = Math.min(4, this.accel * 1.1);
    } else {
      this.accel = 1;
    }
  }

  private activateButton(kind: SideButton["kind"]): void {
    switch (kind) {
      case "ccw":
      case "cw":
        if (this.state === "rest") {
          this.board.rotate(kind === "cw");
          this.state = "animation";
          this.animation = "rotate";
          this.ctx.audio.play("BoardRotation_snd");
        }
        break;
      case "pause":
        if (this.state === "rest") {
          this.state = "menu";
        } else if (this.state === "menu") {
          this.state = "rest";
        }
        break;
      case "speed":
        break;
      case "sound": {
        const muted = this.ctx.audio.toggleMute();
        this.ctx.save.muted = muted;
        this.ctx.persist();
        if (!muted) this.ctx.audio.play("menuselect_snd");
        break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Replenish selector (ReplenishSelector object)
  // ---------------------------------------------------------------------------

  private updateSelector(): void {
    const inp = this.ctx.input;
    const l = this.board.layout;
    const n = this.board.cellNum;
    const { gx, gy } = screenToGrid(l, inp.x, inp.y);
    const inColumns = gx >= 0 && gx < n;
    const inRepZone = inp.y > SCREEN_H - l.cellH - l.cellSep * 3;
    const onBoard = gy >= 0 && gy < n;

    // Hold slot: stash the selected replenish brick, or pick the held brick up.
    const hold = this.rail();
    const canHold = this.ctx.session.world !== 0 && this.state === "rest";
    this.holdHover = canHold && inp.inCentered(hold.cx, hold.holdY, hold.slot, hold.slot);
    if (canHold && ((inp.pressed && this.holdHover) || inp.keysPressed.has("h"))) this.toggleHold();

    if (this.state !== "menu") {
      if (inp.pressed && inColumns) {
        if (inRepZone) {
          this.selected = gx;
          this.repDown = true;
          this.ctx.audio.play("BlocksSelection_snd");
        } else if (onBoard) {
          this.boardDown = true;
          this.cx = gx;
          this.cy = gy;
          this.selAlpha -= (this.selAlpha - 1) / 2;
          if (this.selAlpha > 0.95) this.selAlpha = 1;
        }
      } else if (inp.down && inColumns) {
        if (inRepZone && this.repDown) {
          this.selected = gx;
        } else if (onBoard && this.boardDown) {
          this.cx = gx;
          this.cy = gy;
          this.selAlpha -= (this.selAlpha - 1) / 2;
          if (this.selAlpha > 0.95) this.selAlpha = 1;
        }
      }
    }

    if (inp.released) {
      if (this.repDown) {
        this.repDown = false;
        if (this.ctx.session.world === 0 && this.selectedBrick && this.tutorialState < 2) {
          this.tutorialState = 2;
        }
      }
      if (this.boardDown) {
        this.boardDown = false;
        this.onBoardRelease();
      }
    }

    if (!this.boardDown) this.selAlpha /= 2;

    const goalX = this.selected === HOLD ? this.selX : cellX(l, this.selected);
    this.selX -= (this.selX - goalX) / 1.2;
    this.bx -= (this.bx - cellX(l, this.cx)) / 1.2;
    this.by -= (this.by - cellY(l, this.cy)) / 1.2;

    this.selectedBrick = this.selected === HOLD ? this.held : (this.board.replenishList[this.selected] ?? null);
  }

  /**
   * Move the selected replenish brick into the hold slot (swapping with the
   * brick already there, if any), or select the held brick when nothing on
   * the line is selected. Only one brick can ever be out of the line, so the
   * push timer is only ever delayed by a single slot.
   */
  private toggleHold(): void {
    const list = this.board.replenishList;
    const sel = this.selectedBrick;
    if (sel && this.selected !== HOLD) {
      const idx = list.indexOf(sel);
      if (idx < 0) return;
      if (this.held) {
        list[idx] = this.held;
      } else {
        list.splice(idx, 1);
      }
      this.held = sel;
      sel.inactiveTimer = 0;
      sel.inactiveDuration = 0;
      this.placeHeld();
      this.board.resetBlockPositions();
      for (const b of list) b.settle();
      this.replenishNum = list.length;
      if (this.replenishNum < this.board.cellNum) this.readyToPush = false;
      this.deselect();
      this.ctx.audio.play("BlocksSelection_snd");
    } else if (this.held) {
      this.selected = this.selected === HOLD ? this.board.cellNum : HOLD;
      this.ctx.audio.play("BlocksSelection_snd");
    }
  }

  /** Park the held brick on the hold slot (as a full-size cell; it is drawn scaled). */
  private placeHeld(): void {
    if (!this.held) return;
    const l = this.board.layout;
    const r = this.rail();
    this.held.x = r.cx - l.cellW / 2;
    this.held.y = r.holdY - l.cellH / 2;
    this.held.gridX = -1;
    this.held.gridY = -1;
    this.held.settle();
  }

  private deselect(): void {
    this.selected = this.board.cellNum;
    this.selX = cellX(this.board.layout, this.selected);
  }

  private onBoardRelease(): void {
    const { world, level } = this.ctx.session;
    if (this.state === "rest") {
      const fromHold = this.selectedBrick !== null && this.selectedBrick === this.held;
      const result = this.board.combine(this.selectedBrick, this.cx, this.cy);
      this.handleCombine(result);
      if (result === "combined" && fromHold) this.held = null;
      this.deselect();
    } else if (this.state === "tutorial" && this.tutorialPhase === "add") {
      const spec = TUTORIAL_LEVELS[level];
      // The final exercise only accepts the blue brick as a target.
      if (level === 5) {
        const dest = this.board.get(this.cx, this.cy);
        if (dest && dest.color !== BLUE) return;
      }
      const result = this.board.combine(this.selectedBrick, this.cx, this.cy, spec.canAdd, spec.canSubtract);
      this.handleCombine(result);
      this.deselect();
      if (result === "combined" && world === 0) {
        if (this.tutorialState < 4) this.tutorialState = 4;
        this.board.replenishList = [];
      }
    }
  }

  private handleCombine(result: "combined" | "noadd" | "none"): void {
    switch (result) {
      case "noadd":
        this.state = "animation";
        this.animation = "noadd";
        this.ctx.audio.play("BlocksIncorrect_snd");
        break;
      case "combined":
        this.selectedBrick = null;
        this.replenishNum = this.board.replenishList.length;
        this.readyToPush = false;
        this.state = "animation";
        this.animation = "combine";
        this.ctx.audio.play("BlocksCombine_snd");
        break;
      case "none":
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Bricks and pop animations
  // ---------------------------------------------------------------------------

  /** `Brick` step event. */
  private stepBrick(b: Brick): void {
    switch (this.state) {
      case "rest":
      case "tutorial":
        b.settle();
        break;
      case "animation":
        if (this.animation !== "fall" && this.animation !== "begin" && this.animation !== "push") b.grav = 0;
        switch (this.animation) {
          case "push":
            if (b.pushDelay > 0) {
              b.pushDelay -= ANIM_SPEED;
            } else if (b.spriteY > b.y) {
              b.grav -= ANIM_SPEED;
              b.spriteY += b.grav;
              if (b.spriteY < b.y) {
                b.spriteY = b.y;
                b.pushing = false;
              }
            } else {
              b.pushing = false;
            }
            break;
          case "begin":
            if (b.enterDelay <= 0) {
              if (b.spriteY < b.y) {
                b.grav += 1.7 * ANIM_SPEED;
                b.spriteY += b.grav;
              } else {
                b.enter = false;
                b.spriteY = b.y;
              }
            } else {
              b.enterDelay -= ANIM_SPEED;
            }
            break;
          case "combine":
            b.colorTween -= 0.4 * ANIM_SPEED;
            if (b.colorTween < 0) b.spriteColor = b.color;
            b.spriteX = b.x;
            b.spriteY = b.y;
            break;
          case "noadd":
            b.noaddTimer += ANIM_SPEED;
            if (b.noaddTimer > Brick.NOADD_DURATION) {
              b.noaddTimer = 0;
              b.noadd = false;
            }
            b.colorTween = Brick.TWEEN_FRAMES;
            b.spriteX = b.x;
            b.spriteY = b.y;
            break;
          case "pop":
            b.colorTween = Brick.TWEEN_FRAMES;
            b.spriteX = b.x;
            b.spriteY = b.y;
            break;
          case "rotate":
            b.colorTween = Brick.TWEEN_FRAMES;
            b.spriteX -= (b.spriteX - b.x) / (5 / ANIM_SPEED);
            b.spriteY -= (b.spriteY - b.y) / (5 / ANIM_SPEED);
            if (Math.abs(b.spriteX - b.x) < 1) b.spriteX = b.x;
            if (Math.abs(b.spriteY - b.y) < 1) b.spriteY = b.y;
            if (b.spriteX === b.x && b.spriteY === b.y) b.rotate = false;
            break;
          case "fall":
            b.colorTween = Brick.TWEEN_FRAMES;
            b.spriteX = b.x;
            if (b.spriteY < b.y) {
              b.grav += 1.7 * ANIM_SPEED;
              b.spriteY += b.grav;
            }
            if (b.spriteY >= b.y) {
              b.spriteY = b.y;
              b.fall = false;
            }
            break;
          default:
            break;
        }
        break;
      default:
        break;
    }

    if (b.inactiveDuration && this.state === "rest") {
      const inList = this.board.replenishList.includes(b);
      b.inactiveTimer -= this.accel;
      if (b.inactiveTimer <= 0 || !inList) {
        b.inactiveTimer = 0;
        b.inactiveDuration = 0;
      }
    }
  }

  /** `BrickDieAnim` step event. */
  private stepDieAnims(): void {
    const frames = this.ctx.sprites.brick_pop_sprite.frames.length;
    const step = (this.slowmo > 0 ? 0.16 : 0.4) * ANIM_SPEED;
    for (const d of this.dieAnims) d.popAnim += step;
    this.dieAnims = this.dieAnims.filter((d) => d.popAnim <= frames + 5);
  }

  // ---------------------------------------------------------------------------
  // Tutorial
  // ---------------------------------------------------------------------------

  private updateTutorialSlides(): void {
    const inp = this.ctx.input;
    const slides =
      this.tutorialPhase === "intro" ? this.ctx.sprites.tutorial_intro_sprite : this.ctx.sprites.tutorial_outro_sprite;
    const w = SCREEN_W;
    const h = SCREEN_H;
    const next = inp.keysPressed.has("ArrowRight") || inp.keysPressed.has("Enter") || (inp.pressed && inp.x > w - h / 5 && inp.y > h * 0.8);
    const back = inp.keysPressed.has("ArrowLeft") || (inp.pressed && inp.x < h * 0.2 && inp.y > h * 0.8);

    if (next) {
      this.ctx.audio.play("menuselect_snd");
      if (this.tutorialState < slides.frames.length - 1) {
        this.tutorialState++;
      } else if (this.tutorialPhase === "intro") {
        this.tutorialPhase = "add";
        this.tutorialState = 0;
      } else {
        this.ctx.session.level = 0;
        this.ctx.save.tutorialDone = true;
        this.ctx.persist();
        this.ctx.setScene(new TitleScene(this.ctx));
      }
    } else if (back && this.tutorialState > 0) {
      this.ctx.audio.play("menuselect_snd");
      this.tutorialState--;
    }
  }

  /** `Board` step event, STATE_TUTORIAL block (the hands-on part). */
  private stepTutorial(): void {
    if (this.state !== "tutorial" || this.tutorialPhase !== "add") return;
    const s = this.ctx.session;
    const spec = TUTORIAL_LEVELS[s.level];
    const repName = COLOR_NAMES[spec.replenish];
    const targetName = COLOR_NAMES[spec.target];

    switch (this.tutorialState) {
      case 0:
        this.selectedBrick = null;
        this.populateTutorial();
        this.tutorialText = `To begin, please select the ${repName}\nBlock from the Replenish Line.`;
        this.tutorialState = 1;
        break;
      case 2:
        this.tutorialText = spec.canAdd
          ? `Now add the selected Block to the\n${targetName} Block on the Board.`
          : `Now subtract the selected Block from the\n${targetName} Block on the Board.`;
        this.tutorialState = 3;
        break;
      case 4:
        this.tutorialText = "Congratulations!";
        this.tutorialTimer = 0;
        this.tutorialState = 5;
        break;
      case 5:
        this.selectedBrick = null;
        this.tutorialTimer++;
        if (this.tutorialTimer > 30) {
          s.level += 1;
          this.deselect();
          this.board.resize(4);
          this.tutorialState = 0;
          this.tutorialText = "";
          if (s.level >= TUTORIAL_LEVELS.length) {
            this.tutorialPhase = "outro";
            this.tutorialState = 0;
          }
        }
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  render(g: CanvasRenderingContext2D): void {
    const sp = this.ctx.sprites;
    const { world } = this.ctx.session;

    const pal = this.ctx.palette;
    g.fillStyle = pal.background;
    g.fillRect(0, 0, SCREEN_W, SCREEN_H);

    if (this.state === "tutorial" && this.tutorialPhase !== "add") {
      this.renderTutorialSlides(g);
      return;
    }

    this.renderBackground(g);
    if (world !== 0) {
      this.renderButtons(g);
      this.renderPreview(g);
    }

    // Bricks (selected brick last so it sits on top).
    for (const d of this.dieAnims) this.renderDieAnim(g, d);
    for (const b of this.board.allBricks()) {
      if (b !== this.selectedBrick) this.renderBrick(g, b);
    }
    if (world !== 0) this.renderHoldSlot(g);
    if (this.selectedBrick && this.selectedBrick !== this.held) this.renderBrick(g, this.selectedBrick);

    if (this.slowmo > 0) {
      const l = this.board.layout;
      g.fillStyle = `rgba(255,255,255,${(0.12 * this.slowmo) / SLOWMO_FRAMES})`;
      g.fillRect(l.boardX, l.boardY, l.boardW, l.boardH);
    }

    this.renderSelector(g);
    this.renderCallouts(g);

    if (world > 0 && this.state !== "tutorial") this.renderHud(g);

    if (this.state === "animation" && this.animation === "fadeout") {
      const s = sp.level_complete_sprite;
      const w = SCREEN_W / 2.5;
      const h = w * (s.height / s.width);
      g.fillStyle = "rgba(0,0,0,0.55)";
      g.fillRect(0, 0, SCREEN_W, SCREEN_H);
      drawSprite(g, s, 0, SCREEN_W / 2 - w / 2, SCREEN_H / 2 - h / 2, w, h);
    }

    if (this.state === "animation" && this.animation === "fadein") this.renderFadeIn(g);
    if (this.state === "menu") this.renderMenu(g);
    if (this.state === "lost") this.renderLost(g);

    if (world === 0 && this.tutorialPhase === "add" && this.tutorialText) {
      if (pal.name === "modern") {
        const lines = this.tutorialText.split("\n").length;
        const h = 24 * lines + 28;
        fillRoundRect(g, SCREEN_W / 2 - 230, SCREEN_H / 4 - h / 2, 460, h, 16, "rgba(17,24,39,0.9)", "rgba(255,255,255,0.12)");
        drawText(g, this.tutorialText, SCREEN_W / 2, SCREEN_H / 4, { size: 20, color: pal.tutorialText });
      } else {
        drawText(g, this.tutorialText, SCREEN_W / 2, SCREEN_H / 4, { size: 22, color: pal.tutorialText, shadow: pal.tutorialShadow });
      }
    }
  }

  /** The static backdrop drawn once per frame by `RotateUI` in the original. */
  private renderBackground(g: CanvasRenderingContext2D): void {
    const sp = this.ctx.sprites;
    const l = this.board.layout;
    const n = l.cellNum;
    const { world } = this.ctx.session;

    for (let i = 0; i < n; i++) {
      drawSprite(
        g,
        sp.replenish_frame_sprite,
        0,
        l.boardX + (l.cellW + l.cellSep) * i,
        l.boardH - l.cellH - l.cellSep * 2 - 1,
        l.cellW + l.cellSep,
        l.cellH + 2 * l.cellSep,
      );
    }
    drawSprite(
      g,
      sp.worldbg_sprite,
      world,
      Math.floor(l.boardX) - 1,
      Math.floor(l.boardY),
      Math.floor(l.boardW) + 2,
      Math.floor(l.boardH - l.cellH - l.cellSep * 2),
    );

    g.save();
    g.globalAlpha = this.ctx.palette.gridAlpha;
    const gridBottom = l.boardY + l.boardH - l.cellH - l.cellSep;
    for (let i = 1; i < n; i++) {
      const x = Math.floor(l.boardX) + Math.floor(i * (l.cellW + l.cellSep)) - l.cellSep;
      drawLine(g, x, l.boardY, x, gridBottom, l.cellSep, this.ctx.palette.gridLine);
    }
    for (let i = 1; i < n; i++) {
      const y = l.boardY + i * (l.cellH + l.cellSep) - l.cellSep;
      drawLine(g, l.boardX, y, l.boardX + l.boardW, y, l.cellSep, this.ctx.palette.gridLine);
    }
    g.restore();

    drawSprite(g, sp.sidebar_sprite, 0, 0, 0, l.boardX, SCREEN_H);
    drawSprite(g, sp.sidebar_sprite, 1, Math.floor(l.boardX) + l.boardW, 0, l.boardX, SCREEN_H);
  }

  private renderButtons(g: CanvasRenderingContext2D): void {
    const sp = this.ctx.sprites;
    for (const btn of this.buttons) {
      if (btn.kind === "sound") btn.baseFrame = this.ctx.audio.muted ? 2 : 0;
      const sprite = sp[btn.sprite];
      const maxFrame = sprite.frames.length - 1;
      if (btn.hilite && !btn.pressed) {
        drawSprite(g, sprite, btn.baseFrame, btn.cx - (btn.w * 1.05) / 2, btn.cy - (btn.h * 1.05) / 2, btn.w * 1.05, btn.h * 1.05);
      } else if (btn.pressed) {
        const f = Math.min(maxFrame, btn.baseFrame + 1);
        drawSprite(g, sprite, f, btn.cx - (btn.w * 0.95) / 2, btn.cy - (btn.h * 0.95) / 2, btn.w * 0.95, btn.h * 0.95);
      } else {
        drawSprite(g, sprite, btn.baseFrame, btn.cx - btn.w / 2, btn.cy - btn.h / 2, btn.w, btn.h);
      }
    }
  }

  /** `Brick` draw event, plus the refined marker. */
  private renderBrick(g: CanvasRenderingContext2D, b: Brick): void {
    this.renderBrickBody(g, b);
    if (b.refined && !(this.state === "animation" && this.animation === "combine" && b.spriteColor !== b.color)) {
      const l = this.board.layout;
      const scale = b.inactiveDuration ? 1 - b.inactiveTimer / b.inactiveDuration : 1;
      this.drawSpark(g, b.spriteX + l.cellW * 0.78, b.spriteY + l.cellH * 0.22, l.cellW * 0.085 * scale);
    }
  }

  /** Four-point star used to mark refined bricks. */
  private drawSpark(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    if (r <= 0) return;
    const k = r * 0.3;
    g.beginPath();
    g.moveTo(x, y - r);
    g.lineTo(x + k, y - k);
    g.lineTo(x + r, y);
    g.lineTo(x + k, y + k);
    g.lineTo(x, y + r);
    g.lineTo(x - k, y + k);
    g.lineTo(x - r, y);
    g.lineTo(x - k, y - k);
    g.closePath();
    g.fillStyle = "#ffffff";
    g.strokeStyle = "rgba(0,0,0,0.6)";
    g.lineWidth = 1;
    g.fill();
    g.stroke();
  }

  /** Ghosts of the next replenish colours in the empty slots of the line. */
  private renderPreview(g: CanvasRenderingContext2D): void {
    if (this.state === "animation" && this.animation === "push") return;
    const l = this.board.layout;
    const n = this.board.cellNum;
    const start = this.board.replenishList.length;
    const ry = replenishY(l);
    for (let k = 0; k < PREVIEW_COUNT; k++) {
      const i = start + k;
      if (i >= n) break;
      const s = 0.58 - k * 0.08;
      const alpha = 0.42 - k * 0.1;
      drawBlock(g, this.ctx.sprites.brick_sprite, colorFrame(this.nextColors[k]), cellX(l, i), ry, l.cellW, l.cellH, s, s, 0, 0, alpha);
    }
  }

  /** The hold slot in the left rail and the brick parked in it. */
  private renderHoldSlot(g: CanvasRenderingContext2D): void {
    const l = this.board.layout;
    const r = this.rail();
    const pal = this.ctx.palette;
    const x = r.cx - r.slot / 2;
    const y = r.holdY - r.slot / 2;
    const active = this.holdHover && (this.selectedBrick !== null || this.held !== null);
    if (pal.name === "modern") {
      fillRoundRect(g, x, y, r.slot, r.slot, 10, active ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.06)", active ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.16)");
      drawText(g, "HOLD", r.cx, r.holdLabelY, { size: Math.max(10, l.boardX * 0.08), color: pal.hudMuted, bold: true });
    } else {
      drawSprite(g, this.ctx.sprites.replenish_frame_sprite, 0, x - 2, y - 2, r.slot + 4, r.slot + 4);
      if (active) fillRoundRect(g, x, y, r.slot, r.slot, 4, "rgba(255,255,255,0.18)");
      drawText(g, "Hold", r.cx, r.holdLabelY, { size: 12, color: pal.hudMuted, bold: false });
    }
    if (!this.held) {
      drawText(g, "H", r.cx, r.holdY, { size: r.slot * 0.4, color: pal.name === "modern" ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.18)", bold: true });
      return;
    }
    const b = this.held;
    const s = r.slot / l.cellW;
    const sel = this.selectedBrick === b;
    if (sel) drawBlock(g, this.ctx.sprites.replenish_selector_sprite, 7, b.x, b.y, l.cellW, l.cellH, s * 1.1, s * 1.1);
    drawBlock(g, this.ctx.sprites.brick_sprite, colorFrame(b.color), b.x, b.y, l.cellW, l.cellH, s, s);
    if (sel) drawBlock(g, this.ctx.sprites.replenish_selector_sprite, colorFrame(b.color), b.x, b.y, l.cellW, l.cellH, s * 1.1, s * 1.1);
    if (b.refined) this.drawSpark(g, r.cx + r.slot * 0.28, r.holdY - r.slot * 0.28, r.slot * 0.085);
  }

  private renderCallouts(g: CanvasRenderingContext2D): void {
    if (this.callouts.length === 0) return;
    g.save();
    for (const c of this.callouts) {
      const fade = c.t > CALLOUT_FRAMES - 15 ? (CALLOUT_FRAMES - c.t) / 15 : 1;
      const pop = c.t < 6 ? 1 + (6 - c.t) * 0.06 : 1;
      g.globalAlpha = fade;
      drawText(g, c.text, c.x, c.y, { size: c.size * pop, color: c.color, shadow: "rgba(0,0,0,0.85)" });
    }
    g.restore();
  }

  /** `Brick` draw event body (colour, scale and per-animation effects). */
  private renderBrickBody(g: CanvasRenderingContext2D, b: Brick): void {
    const sp = this.ctx.sprites;
    const l = this.board.layout;
    const brick = sp.brick_sprite;
    const scale = b.inactiveDuration ? 1 - b.inactiveTimer / b.inactiveDuration : 1;
    const draw = (sprite: Sprite, frame: number, xs = 1, ys = 1, xo = 0, yo = 0) =>
      drawBlock(g, sprite, frame, b.spriteX, b.spriteY, l.cellW, l.cellH, xs, ys, xo, yo);

    if (this.state !== "animation") {
      draw(brick, colorFrame(b.color), scale, scale);
      return;
    }

    switch (this.animation) {
      case "combine":
        if (b.spriteColor !== b.color) {
          const ind = Math.min(Brick.TWEEN_FRAMES - b.colorTween, Brick.TWEEN_FRAMES - 1);
          draw(brick, colorFrame(b.spriteColor));
          draw(sp[EXPAND_SPRITES[b.color]], ind);
        } else {
          draw(brick, colorFrame(b.color), scale, scale);
        }
        break;
      case "noadd":
        if (b.noadd) {
          const rx = Math.random() * l.cellSep * 2 - l.cellSep;
          const ry = Math.random() * l.cellSep * 2 - l.cellSep;
          draw(brick, colorFrame(b.color), 0.9, 0.9, rx, ry);
        } else {
          draw(brick, colorFrame(b.color), scale, scale);
        }
        break;
      case "rotate": {
        let d = Math.hypot(b.x - b.spriteX, b.y - b.spriteY);
        const mid = Math.floor(this.board.cellNum / 2);
        if (this.board.cellNum % 2 === 1 && b.gridX === mid && b.gridY === mid) {
          const nb = this.board.get(mid, mid + 1) ?? this.board.get(mid + 1, mid) ?? this.board.get(mid - 1, mid);
          if (nb) d = Math.hypot(nb.x - nb.spriteX, nb.y - nb.spriteY);
        }
        if (d === 0) {
          draw(brick, colorFrame(b.color), scale, scale);
        } else {
          const s = 0.65 + 0.35 / Math.max(1, d);
          draw(brick, colorFrame(b.color), s, s);
        }
        break;
      }
      default:
        draw(brick, colorFrame(b.color), scale, scale);
        break;
    }
  }

  /** `BrickDieAnim` draw event. */
  private renderDieAnim(g: CanvasRenderingContext2D, d: DieAnim): void {
    const sp = this.ctx.sprites;
    const l = this.board.layout;
    const pop = sp.brick_pop_sprite;
    const frames = pop.frames.length;
    if (d.popAnim < frames / 2) {
      drawSprite(g, sp.brick_sprite, colorFrame(d.color), d.x, d.y, l.cellW, l.cellH);
    }
    if (d.popAnim < frames - 0.5) {
      drawSprite(g, pop, Math.floor(d.popAnim), d.x, d.y, l.cellW, l.cellH);
    } else if (d.color !== BLACK) {
      drawText(g, `+${d.value}`, d.x + l.cellW / 2, d.y + l.cellH / 2, {
        size: Math.max(12, l.cellH * 0.3),
        color: "#fff",
        shadow: "#000",
      });
    }
  }

  /** `ReplenishSelector` draw event. */
  private renderSelector(g: CanvasRenderingContext2D): void {
    const sp = this.ctx.sprites;
    const l = this.board.layout;
    const sel = sp.replenish_selector_sprite;
    const frame = this.selectedBrick ? colorFrame(this.selectedBrick.color) : 6;
    const ry = replenishY(l);

    if (this.selected !== this.board.cellNum && this.selected !== HOLD) {
      drawBlock(g, sel, 7, this.selX, ry, l.cellW, l.cellH, 1.1, 1.1);
      drawBlock(g, sel, frame, this.selX, ry, l.cellW, l.cellH, 1.1, 1.1);
    }

    const showGhost = this.state === "rest" || (this.state === "animation" && this.animation === "combine");
    if (showGhost && this.selAlpha > 0.01) {
      g.save();
      g.globalAlpha = Math.min(1, this.selAlpha);
      const col = this.ctx.palette.crosshair;
      const bx = this.bx;
      const by = this.by;
      drawLine(g, l.boardX, by + l.cellH / 2, bx, by + l.cellH / 2, 3, col);
      drawLine(g, bx + l.cellW / 2, l.boardY, bx + l.cellW / 2, by, 3, col);
      drawLine(g, bx + l.cellW, by + l.cellH / 2, l.boardX + l.boardW, by + l.cellH / 2, 3, col);
      drawLine(g, bx + l.cellW / 2, by + l.cellH, bx + l.cellW / 2, l.boardY + l.boardW, 3, col);
      drawBlock(g, sel, frame, bx, by, l.cellW, l.cellH, 1.1, 1.1);
      g.restore();
    }
  }

  /** `Board` draw event: score, goal counter and progress bar. */
  private renderHud(g: CanvasRenderingContext2D): void {
    const sp = this.ctx.sprites;
    const l = this.board.layout;
    const n = l.cellNum;
    const s = this.ctx.session;
    const textSize = Math.max(12, l.boardX * 0.13);
    const pal = this.ctx.palette;

    const goal = s.gameType === "puzzle" ? this.board.countBricks() : this.comboRemaining;
    const label = s.gameType === "puzzle" ? "Bricks left" : "Pops left";
    const cx = l.boardX / 2;

    if (pal.name === "modern") {
      // Small uppercase captions over large numbers, in a side column.
      const caption = (t: string, y: number) =>
        drawText(g, t.toUpperCase(), cx, y, { size: textSize * 0.62, color: pal.hudMuted, bold: true });
      const big = (t: string, y: number) => drawText(g, t, cx, y, { size: textSize * 1.9, color: pal.hudText, bold: true });
      caption("Score", l.cellH * 0.55);
      big(String(s.score), l.cellH * 1.25);

      // Chain meter: a track that drains while the chain cools off.
      const r = this.rail();
      const mult = this.chainMultiplier();
      const meterW = l.boardX * 0.7;
      const meterH = 5;
      const meterX = cx - meterW / 2;
      const meterY = r.chainY;
      fillRoundRect(g, meterX, meterY - meterH / 2, meterW, meterH, meterH / 2, "rgba(255,255,255,0.12)");
      if (this.heat > 0) {
        fillRoundRect(g, meterX, meterY - meterH / 2, Math.max(meterH, meterW * this.heat), meterH, meterH / 2, MULT_COLORS[mult]);
      }
      drawText(g, this.chain > 0 ? `CHAIN  x${mult}` : "CHAIN", cx, meterY + 12, {
        size: textSize * 0.55,
        color: this.chain > 0 ? MULT_COLORS[mult] : pal.hudMuted,
        bold: true,
      });

      const pillW = l.boardX * 0.7;
      const pillH = textSize * 1.5;
      const pillY = r.levelY;
      g.fillStyle = "rgba(255,255,255,0.08)";
      g.beginPath();
      g.roundRect(cx - pillW / 2, pillY - pillH / 2, pillW, pillH, pillH / 2);
      g.fill();
      drawText(g, `${s.gameType[0].toUpperCase()}${s.gameType.slice(1)} ${s.world}-${s.level + 1}`, cx, pillY, {
        size: textSize * 0.75,
        color: pal.hudText,
        bold: true,
      });

      if (this.subtractGoal > 0) {
        caption("Subtract pops", r.goalLabelY);
        const done = this.goalAwarded;
        drawText(g, done ? `${this.subtractGoal} / ${this.subtractGoal}  ✓` : `${this.subtractDone} / ${this.subtractGoal}`, cx, r.goalY, {
          size: textSize * 1.1,
          color: done ? "#7dd3fc" : pal.hudText,
          bold: true,
        });
      }

      caption(label, SCREEN_H - l.cellH * 1.1);
      big(String(goal), SCREEN_H - l.cellH * 0.45);
    } else {
      const r = this.rail();
      const mult = this.chainMultiplier();
      drawText(g, `Score:\n${s.score}`, cx, l.cellH, { size: textSize, color: pal.hudText });
      const meterW = l.boardX * 0.6;
      g.fillStyle = "rgba(0,0,0,0.15)";
      g.fillRect(cx - meterW / 2, r.chainY - 2, meterW, 4);
      if (this.heat > 0) {
        g.fillStyle = MULT_COLORS[mult];
        g.fillRect(cx - meterW / 2, r.chainY - 2, meterW * this.heat, 4);
      }
      if (this.chain > 0) {
        drawText(g, `Chain x${mult}`, cx, r.chainY - 10, { size: textSize * 0.65, color: pal.hudText });
      }
      drawText(g, `Level ${s.world}-${s.level + 1}`, cx, r.levelY, { size: textSize * 0.8, color: pal.hudMuted, bold: false });
      if (this.subtractGoal > 0) {
        drawText(g, "Subtract pops", cx, r.goalLabelY, { size: textSize * 0.65, color: pal.hudMuted, bold: false });
        drawText(g, this.goalAwarded ? `${this.subtractGoal}/${this.subtractGoal} done` : `${this.subtractDone}/${this.subtractGoal}`, cx, r.goalY, {
          size: textSize * 0.85,
          color: pal.hudText,
        });
      }
      drawText(g, `${label}\n${goal}`, cx, SCREEN_H - l.cellH / 2, { size: textSize, color: pal.hudText });
    }

    const bar = sp.progressbar_sprite;
    const barX = Math.floor(l.boardX);
    const current = Math.max(0, this.readyToPush ? 1 - this.replenishLine / this.replenishTimer : this.currentPercentage);
    const maxP = Math.max(0, this.maxPercentage);

    if (pal.name === "modern") {
      // Rounded track sitting on the seam between the grid and the replenish row.
      const barH = 6;
      const barY = Math.floor(l.boardY + n * (l.cellH + l.cellSep) - l.cellSep) - 1;
      const barW = l.boardW;
      g.save();
      g.beginPath();
      g.roundRect(barX, barY, barW, barH, barH / 2);
      g.clip();
      g.fillStyle = "rgba(255,255,255,0.16)";
      g.fillRect(barX, barY, barW, barH);
      g.fillStyle = "rgba(255,255,255,0.34)";
      g.fillRect(barX, barY, barW * Math.min(1, maxP), barH);
      drawSprite(g, bar, 0, barX, barY, barW * Math.min(1, current), barH);
      g.restore();
      return;
    }

    const barY = Math.floor(l.boardY + n * (l.cellH + l.cellSep) - l.cellSep / 2) - 1;
    const barH = Math.max(3, l.cellSep * 1.5);
    drawSprite(g, bar, 2, barX, barY, l.boardW, barH);
    drawSpritePartX(g, bar, 1, maxP, barX, barY, l.boardW, barH);
    drawSpritePartX(g, bar, 0, current, barX, barY, l.boardW, barH);
  }

  private renderFadeIn(g: CanvasRenderingContext2D): void {
    const sp = this.ctx.sprites;
    const r = this.fadeRadius;
    if (r <= 0) return;
    g.save();
    g.beginPath();
    g.arc(SCREEN_W / 2, SCREEN_H / 2, r, 0, Math.PI * 2);
    g.clip();
    const tile = sp.brick_noicon_sprite.frames[7];
    const size = BTN_H / 2;
    const pattern = g.createPattern(tile, "repeat");
    if (pattern) {
      const scale = size / sp.brick_noicon_sprite.width;
      g.scale(scale, scale);
      g.fillStyle = pattern;
      g.fillRect(0, 0, SCREEN_W / scale, SCREEN_H / scale);
    } else {
      g.fillStyle = "#222";
      g.fillRect(0, 0, SCREEN_W, SCREEN_H);
    }
    g.restore();
  }

  /** Pause menu (`STATE_MENU`). */
  private renderMenu(g: CanvasRenderingContext2D): void {
    const sp = this.ctx.sprites;
    const l = this.board.layout;
    const s = this.ctx.session;
    const inp = this.ctx.input;

    const pal = this.ctx.palette;
    if (pal.name === "modern") {
      this.renderOverlayCard(
        g,
        "Paused",
        [`${s.gameType[0].toUpperCase()}${s.gameType.slice(1)} ${s.world}-${s.level + 1}   ·   Score ${s.score}`],
        undefined,
        "Q / E rotate  ·  H hold a brick  ·  Space speed up  ·  P pause  ·  Esc quit",
      );
      return;
    }
    g.fillStyle = "rgba(0,0,0,0.1)";
    g.fillRect(0, 0, SCREEN_W, SCREEN_H);
    g.fillStyle = "#000";
    g.fillRect(l.boardX, l.boardY, l.boardW, l.boardH);
    drawSprite(g, sp.logo_sprite, 0, (SCREEN_W * 7) / 16, 0, SCREEN_W / 8, SCREEN_W / 8);
    drawText(g, `Level ${s.world}-${s.level + 1}`, SCREEN_W / 2, SCREEN_H / 4, { size: 22, color: pal.overlayText });
    drawText(g, `Score: ${s.score}`, SCREEN_W / 2, (SCREEN_H * 3) / 8, { size: 22, color: pal.overlayText });

    const btn = sp.menu_button_sprite;
    const { x, y, size: width } = this.menuButtonRect();
    const fill = inp.down && inp.inRect(x, y, width, width);
    drawText(g, "Main Menu", x + width / 2, y - 14, { size: 18, color: pal.overlayText });
    drawSprite(g, btn, fill ? 1 : 0, x, y, width, width);
    drawText(g, "Paused - press the pause button or P to resume", SCREEN_W / 2, SCREEN_H - 24, {
      size: 14,
      color: "#aaaaaa",
      bold: false,
    });
  }

  /** Centered modern card with a title, body lines and the overlay buttons. */
  private renderOverlayCard(g: CanvasRenderingContext2D, title: string, lines: string[], accent?: string, footer?: string): void {
    const inp = this.ctx.input;
    const pal = this.ctx.palette;
    g.fillStyle = "rgba(4,8,16,0.6)";
    g.fillRect(0, 0, SCREEN_W, SCREEN_H);
    const w = 440;
    const h = 236 + (accent ? 22 : 0) + (footer ? 26 : 0);
    const x = SCREEN_W / 2 - w / 2;
    const y = SCREEN_H / 2 - 110;
    drawCard(g, x, y, w, h, 20);
    if (footer) drawText(g, footer, SCREEN_W / 2, y + h - 22, { size: 12, color: pal.hudMuted, bold: false });
    drawText(g, title.toUpperCase(), SCREEN_W / 2, y + 44, { size: 26, color: pal.overlayText, bold: true });
    lines.forEach((line, i) => {
      drawText(g, line, SCREEN_W / 2, y + 86 + i * 24, { size: 16, color: pal.hudMuted, bold: false });
    });
    if (accent) drawText(g, accent, SCREEN_W / 2, y + 86 + lines.length * 24, { size: 16, color: pal.overlayAccent, bold: true });
    if (this.state !== "lost" || this.lostTimer > 20) {
      for (const b of this.overlayButtons()) {
        const hover = inp.inCentered(b.cx, b.cy, b.w, b.h);
        drawPillButton(g, b, hover, hover && inp.down, pal.font);
      }
    }
  }

  private renderLost(g: CanvasRenderingContext2D): void {
    const s = this.ctx.session;
    const pal = this.ctx.palette;
    if (pal.name === "modern") {
      const best = s.score >= this.ctx.save.hiscore && s.score > 0;
      this.renderOverlayCard(g, "Out of room", [`A brick was pushed off the top.`, `Score ${s.score}`], best ? "New high score!" : undefined);
      return;
    }
    g.fillStyle = "rgba(0,0,0,0.75)";
    g.fillRect(0, 0, SCREEN_W, SCREEN_H);
    drawText(g, "Sorry, but you have lost!", SCREEN_W / 2, SCREEN_H / 2 - 40, { size: 32, color: pal.overlayText, shadow: "#000" });
    drawText(g, `Score: ${s.score}`, SCREEN_W / 2, SCREEN_H / 2 + 10, { size: 22, color: pal.overlayText });
    if (s.score >= this.ctx.save.hiscore && s.score > 0) {
      drawText(g, "New high score!", SCREEN_W / 2, SCREEN_H / 2 + 40, { size: 18, color: pal.overlayAccent });
    }
    if (this.lostTimer > 20) {
      drawText(g, "Click to return to the menu", SCREEN_W / 2, SCREEN_H * 0.8, { size: 16, color: "#aaa", bold: false });
    }
  }

  private renderTutorialSlides(g: CanvasRenderingContext2D): void {
    const sp = this.ctx.sprites;
    const slides = this.tutorialPhase === "intro" ? sp.tutorial_intro_sprite : sp.tutorial_outro_sprite;
    const h = SCREEN_H;
    drawSprite(g, slides, this.tutorialState, 0, 0, SCREEN_W, SCREEN_H);
    if (this.tutorialState > 0) {
      drawSprite(g, sp.back_button_sprite, 0, 0, h * 0.8, h * 0.2, h * 0.2);
    }
    drawSprite(g, sp.back_button_sprite, 2, SCREEN_W - h * 0.2, h * 0.8, h * 0.2, h * 0.2);
  }
}
