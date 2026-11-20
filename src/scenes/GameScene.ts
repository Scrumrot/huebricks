import { Board, POP_GROUP_SIZE, type PopResult } from "../core/Board";
import { groupIfPlaced } from "../core/preview";
import { Brick } from "../core/Brick";
import { BLACK, colorFrame, randomSpawnColor, type Color } from "../core/color";
import { DEFAULT_CELL_NUM, FPS, LEVELS_PER_WORLD, MAX_WORLD } from "../core/constants";
import { cellX, cellY, gridBottom, NO_SPACING, replenishY, screenToGrid, type LayoutSpacing, type Viewport } from "../core/layout";
import { levelParams } from "../core/level";
import {
  barFill,
  lineProgress,
  linePushed,
  lineShortened,
  lineState,
  rewindLine,
  stepLine,
  tickThroughAnimation,
  wellLevel,
  type LineState,
} from "../core/replenish";
import { COLD_CHAIN, coolChain, EMPTY_TALLY, GOAL_BONUS, heatChain, multiplier, scorePop, type ChainState, type GoalState, type Tally } from "../core/scoring";
import { acceptsTarget, TUTORIAL_CELLS, TUTORIAL_LEVELS, tutorialBrick, tutorialSpec, tutorialText } from "../core/tutorial";
import type { MusicName, SpriteName } from "../engine/assets";
import { ButtonFeel } from "../engine/buttonFeel";
import { drawCard, drawSprite, drawText, type PillButton } from "../engine/draw";
import { fillScreen } from "../engine/view";
import { clamp01, easeOutBack, easeOutCubic, easeOutElastic, easeOutQuart } from "../engine/easing";
import type { VuPeak } from "../engine/vuMeter";
import { Effects } from "../engine/effects";
import { hudControls, hudRail, type Controls, type HudRail } from "../engine/hudLayout";
import { clearWave } from "../engine/clearWave";
import { ageRibbon, pushRibbon, type RibbonPoint } from "../engine/ribbon";
import { intensityFor, popScale, TUNING } from "../engine/fxTuning";
import { Tweens } from "../engine/tween";
import { cardButtonAt, cardOffset, dimBehindCard, drawCardButtons, drawMessageCard, CARD_MS } from "../engine/overlayCard";
import { drawSlides, slideNav, slideRect } from "../engine/slides";
import { PauseCard, type PauseInfo } from "./game/pauseCard";
import { BrickView, type BoardFrame, type BrickFx, type PreviewGroup, type Callout, type DieAnim, type Toast } from "./game/brickView";
import {
  ARRIVE_MS,
  CARD_HOLD_FRAMES,
  COUNT_MS,
  D,
  DEG,
  DESAT_MS,
  DIM_MS,
  FADE_MS,
  FLARE_MS,
  GRAVITY,
  HOLD,
  LAND_SETTLE_MS,
  LAND_SQUASH_MS,
  LEVEL_CARD_FRAMES,
  PICK_MS,
  POP_GROW_MS,
  POP_HOLD_MS,
  POP_STAGGER_MS,
  POP_TOTAL_MS,
  PREVIEW_COUNT,
  PUSH_ANTICIPATE_MS,
  PUSH_FRAMES,
  RING_MS,
  ROTATE_FRAMES,
  SCORE_MS,
  SHOCK_MS,
  STEP_MS,
  TOAST_MS,
} from "./game/timing";
import { drawBoardBackdrop, type Stain } from "./game/backdrop";
import { CONTROL_ART, drawControls, type SideButton } from "./game/controls";
import { drawHud } from "./game/hud";
import { drawLevelCard, levelButtons, levelCardLayout, type LevelCardLayout } from "./game/levelCard";
import type { GameContext, Scene } from "./Scene";
import { TitleScene } from "./TitleScene";

type State = "rest" | "animation" | "menu" | "tutorial" | "lost";
type Animation = "none" | "fall" | "rotate" | "pop" | "combine" | "noadd" | "begin" | "push" | "fadeout";
type TutorialPhase = "intro" | "add" | "outro";

/** Sound, hit-stop, flash and shake for one scoring pop. */
interface PopImpact {
  k: number;
  mult: number;
  semitones: number;
  color: Color;
  dir: [number, number];
}

/** Breathing room above the grid, around the fill timer and under the tray (generated themes only). */
const GENERATED_SPACING: LayoutSpacing = { top: 8, gap: 14, bottom: 14 };

function spacingFor(kind: "classic" | "generated"): LayoutSpacing {
  return kind === "generated" ? GENERATED_SPACING : NO_SPACING;
}

/** The board's viewport: the classic theme keeps its side rails even on an upright phone. */
function viewportFor(v: { w: number; h: number; portrait: boolean }, kind: "classic" | "generated"): Viewport {
  return { w: v.w, h: v.h, portrait: v.portrait && kind === "generated" };
}

/** Fields of the modern HUD geometry the classic column has no use for. */
function classicHudExtras(
  cx: number,
): Pick<HudRail, "holdLabelX" | "holdLabelAlign" | "ring" | "goalCapX" | "goalCapY" | "goalAlign" | "starsX" | "starsY" | "starStep" | "side"> {
  return {
    holdLabelX: cx,
    holdLabelAlign: "center",
    ring: { cx, cy: 0, r: 0 },
    goalCapX: cx,
    goalCapY: 0,
    goalAlign: "center",
    starsX: cx,
    starsY: 0,
    starStep: 0,
    side: 1,
  };
}

/**
 * The playing scene: board, replenish line, side buttons, pause menu and the
 * tutorial. A port of the `Board`, `Brick`, `BrickDieAnim`, `ReplenishSelector`,
 * `RotateUI`, `SpeedUI`, `PauseUI` and `TutorialText` objects, with a
 * real-time feel layer (tweens, particles, hit-stop, shake) on top.
 */
export class GameScene implements Scene {
  private readonly ctx: GameContext;
  private readonly board: Board;

  private state: State = "animation";
  private animation: Animation = "begin";
  /** Sim steps spent in the current fixed-length animation. */
  private animFrame = 0;

  // --- replenish line ---
  private line: LineState = lineState(180);
  private comboRemaining = 0;
  /** High-water mark of the line's progress, which the classic bar drains from during a push. */
  private maxPercentage = 0;
  private currentPercentage = 0;

  // --- selector (ReplenishSelector) ---
  private selected: number;
  private selectedBrick: Brick | null = null;
  private lastSelected: Brick | null = null;
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
  private buttonsTheme = "";
  /** Control geometry for the generated themes (the rotate pill and labels). */
  private controls: Controls | null = null;
  private accel = 1;

  // --- chain meter ---
  /** VU peak marker (Neon). */
  private vuPeak: VuPeak = { seg: 0, t: 0 };
  private meter: ChainState = COLD_CHAIN;

  // --- hold slot and preview ---
  private held: Brick | null = null;
  private holdHover = false;
  /** The group a drop on the hovered cell would complete, while a brick is selected. */
  private preview: PreviewGroup | null = null;
  /** Vertical squash of the whole board about its bottom edge, for the push heave. */
  private readonly heaveFx = { sy: 1 };
  /** Trail behind the brick ghost being dragged across the board. */
  private ribbon: RibbonPoint[] = [];
  private ribbonColor = "#ffffff";
  /** Centre of the most recent scoring pop, where the level-clear wave starts. */
  private lastPopAt: { x: number; y: number } | null = null;
  private nextColors: Color[] = [];

  // --- subtract goal ---
  private goal: GoalState = { subtractGoal: 0, subtractDone: 0, goalAwarded: false };
  /** What the goal ring fills toward: the level's pop quota, or the bricks a puzzle started with. */
  private popsTotal = 0;
  private bricksTotal = 0;
  /** Where this level's points came from, for the level-complete breakdown. */
  private tally: Tally = EMPTY_TALLY;
  private bestChain = 1;
  private toasts: Toast[] = [];
  /** The last eight-step well level that ticked (pixel themes). */
  private wellStep = 0;
  private chargeBlipT = -1e9;
  /** How many level-card stars have chimed so far. */
  private starsSounded = 0;
  private hiToasted = false;

  private levelCompleteDelay = LEVEL_CARD_FRAMES;
  private levelCompleteSounded = false;
  private lostTimer = 0;

  // --- pause card ---
  private readonly pause = new PauseCard();
  /** A key has been used this run, so the pause card shows the keycap hints. */
  private keyboardUsed = false;
  /** Score when this level began, restored by "Restart level". */
  private readonly levelStartScore: number;

  // --- tutorial ---
  private tutorialPhase: TutorialPhase = "intro";
  private tutorialState = 0;
  private tutorialText = "";
  private tutorialTimer = 0;

  // --- feel layer ---
  private readonly tweens = new Tweens();
  private readonly effects: Effects;
  private readonly feel: ButtonFeel;
  private readonly view: BrickView;
  private dieAnims: DieAnim[] = [];
  private stains: Stain[] = [];
  private callouts: Callout[] = [];
  private fadeT0 = 0;
  private rotateT0 = -1;
  private rotateDir = 1;
  private pushT0 = -1;
  private cardT0 = -1;
  /** Impact of the current scoring pop, held until its first brick bursts on staged themes. */
  private pendingPop: PopImpact | null = null;
  /** Intensity of the last scoring pop: the score counter ticks faster after a big one. */
  private lastK = 0;
  private lastTick = -1e9;
  private scoreShownFrom = 0;
  private barFlashT0 = -1e9;
  private selFlashT0 = -1e9;
  /** HUD score counts toward the real score. */
  private readonly scoreFx = { v: 0 };
  private scoreTarget = 0;
  private readonly badgeFx = { s: 1 };
  /** Selector ring scale: overshoots in when a new brick is picked. */
  private readonly selFx = { s: 1 };
  private lastMult = 1;
  private readonly lostFx = { desat: 0 };
  /** Paint level shown while a pop rewinds the current well. */
  private readonly levelFx = { v: 0 };
  private rewindUntil = -1;
  /** When the last level clear started (drives the backdrop flare). */
  private flareT0 = -1e9;

  constructor(ctx: GameContext) {
    this.ctx = ctx;
    this.levelStartScore = ctx.session.score;
    this.board = new Board(DEFAULT_CELL_NUM, spacingFor(ctx.palette.kind), viewportFor(ctx.view, ctx.palette.kind));
    this.selected = this.board.cellNum;
    this.selX = cellX(this.board.layout, this.selected);
    for (let i = 0; i < PREVIEW_COUNT; i++) this.nextColors.push(randomSpawnColor());
    this.feel = new ButtonFeel(this.tweens);
    this.view = new BrickView(ctx, this.board);
    this.effects = new Effects(ctx, 400);
    this.effects.collider = (x, y) => this.solidTop(x, y);
    this.scoreFx.v = ctx.session.score;
    this.scoreTarget = ctx.session.score;
    this.layoutButtons();
  }

  enter(): void {
    const { world, gameType } = this.ctx.session;
    const music: MusicName = world === 0 ? "tutorial_bgm" : `${gameType}${world}_bgm`;
    this.ctx.audio.playMusic(music);
    this.fadeT0 = this.ctx.clock.t;
    if (world !== 0) {
      this.populate();
    } else {
      this.state = "tutorial";
      this.tutorialPhase = "intro";
      this.tutorialState = 0;
      this.board.resize(TUTORIAL_CELLS);
      this.selected = this.board.cellNum;
      this.selX = cellX(this.board.layout, this.selected);
      this.layoutButtons();
    }
  }

  cursor(): string {
    const inp = this.ctx.input;
    if (this.state === "menu") return this.pause.hovering(this.ctx, this.cardOffset(), this.pauseInfo()) ? "pointer" : "default";
    if (this.state === "lost") return cardButtonAt(inp, this.overlayButtons(), this.cardOffset()) ? "pointer" : "default";
    if (this.levelCardOpen()) {
      return this.levelButtons().some((b) => inp.inCentered(b.cx, b.cy, b.w, b.h)) ? "pointer" : "default";
    }
    if (this.state === "tutorial" && this.tutorialPhase !== "add") return "pointer";
    if (this.boardDown && this.selectedBrick) return "grabbing";
    if (this.selectedBrick) return "grab";
    if (this.buttons.some((b) => b.hilite) || this.holdHover) return "pointer";
    const l = this.board.layout;
    const { gx, gy } = screenToGrid(l, inp.x, inp.y);
    const n = this.board.cellNum;
    if (gx >= 0 && gx < n && inp.y > replenishY(l) - l.cellSep * 2 && gx < this.board.replenishList.length) return "pointer";
    if (gx >= 0 && gx < n && gy >= 0 && gy < n && this.board.get(gx, gy)) return "pointer";
    return "default";
  }

  // ---------------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------------

  /** Theme plus viewport: when it changes, the board and HUD are measured again. */
  private layoutKey(): string {
    const v = this.ctx.view;
    return `${this.ctx.palette.name}:${Math.round(v.w)}x${Math.round(v.h)}:${v.portrait}:${this.ctx.save.leftHanded ? "L" : "R"}`;
  }

  private layoutButtons(): void {
    const l = this.board.layout;
    this.buttonsTheme = this.layoutKey();
    const cx = l.boardX + l.boardW + l.railW / 2;

    if (this.ctx.palette.kind === "generated") {
      const c = hudControls(l, this.ctx.save.leftHanded);
      this.buttons = c.buttons.map((b) => ({
        kind: b.kind,
        sprite: CONTROL_ART[b.kind].sprite,
        baseFrame: CONTROL_ART[b.kind].frame,
        cx: b.cx,
        cy: b.cy,
        w: b.w,
        h: b.h,
        hilite: false,
        pressed: false,
      }));
      this.controls = c;
      return;
    }

    let wid = l.railW * 0.8;
    let hit = wid;
    if (hit > l.boardH / 4) {
      hit = l.boardH / 4;
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
      mk("pause", "pause_button_sprite", 0, l.stackY + hit / 2),
      mk("ccw", "rotate_button_sprite", 0, l.stackY + l.boardH / 2 - hit / 2, 0.95),
      mk("cw", "rotate_button_sprite", 2, l.stackY + l.boardH / 2 + hit / 2, 0.95),
      mk("speed", "speedup_button_sprite", 0, l.stackY + l.boardH - hit / 2),
      { ...mk("sound", "sound_button_sprite", 0, this.rail().soundY, 0.55), cx: this.rail().soundX },
    ];
  }

  /** Vertical layout of the left rail (HUD column), in multiples of the cell height. */
  /** HUD geometry: where the score column, hold slot, sound button and goal live for this layout. */
  private rail(): HudRail {
    const l = this.board.layout;
    if (this.ctx.palette.kind === "generated") return hudRail(l, this.ctx.save.leftHanded);
    const h = l.cellH;
    // Sideways: everything in the column left of the board, as in the original.
    const cx = l.boardX - l.railW / 2;
    const textSize = Math.max(12, l.railW * 0.13);
    const y0 = l.stackY;
    const y1 = l.stackY + l.boardH;
    const base = {
      cx,
      soundX: cx,
      scoreCx: cx,
      pillCx: cx,
      popsCx: cx,
      goalX: cx,
      meterW: l.railW * 0.7,
      pillW: l.railW * 0.7,
      textSize,
      popsCapY: y1 - h * 1.1,
      popsY: y1 - h * 0.45,
    };
    return {
      ...classicHudExtras(cx),
      ...base,
      scoreCapY: y0 + h,
      scoreY: y0 + h,
      chainY: y0 + h * 1.65,
      levelY: y0 + h * 1.95,
      holdLabelY: y0 + h * 2.42,
      holdY: y0 + h * 3,
      soundY: y0 + h * 4.25,
      goalLabelY: y0 + h * 5.2,
      goalY: y0 + h * 5.55,
      slot: l.cellW * 0.9,
      popsY: y1 - h / 2,
      meterW: l.railW * 0.6,
    };
  }

  private chainMultiplier(): number {
    return multiplier(this.meter.chain);
  }

  private fxOf(b: Brick): BrickFx {
    return this.view.fxOf(b);
  }

  /** `board_populate.gml`; rows drop in from the top, bottom row first. */
  private populate(): void {
    const { world, level } = this.ctx.session;
    const params = levelParams(world, level);
    const l = this.board.layout;
    const n = this.board.cellNum;
    for (let i = 0; i < params.brickCount && i < n ** 2; i++) {
      const brick = new Brick(randomSpawnColor());
      const { gx, gy } = this.board.placeByIndex(i, brick);
      brick.x = cellX(l, gx);
      brick.y = cellY(l, gy);
      brick.spriteX = brick.x;
      brick.spriteY = brick.y - l.boardH;
      brick.prevX = brick.spriteX;
      brick.prevY = brick.spriteY;
      brick.enterDelay = ((n - 1 - gy) * D(25)) / STEP_MS;
      brick.enter = true;
    }
    this.line = lineState(params.replenishTimer);
    this.comboRemaining = params.comboRemaining;
    this.popsTotal = params.comboRemaining;
    this.bricksTotal = params.brickCount;
    this.goal = { subtractGoal: params.subtractGoal, subtractDone: 0, goalAwarded: false };

    this.state = "animation";
    this.animation = "begin";
    this.board.resetBlockPositions();
    this.board.recalculateGroups();
    this.applyPop(this.board.popGroups());
  }

  /** `board_populate_tutorial.gml` */
  private populateTutorial(): void {
    const l = this.board.layout;
    const spec = tutorialSpec(this.ctx.session.level);
    for (let i = 0; i < TUTORIAL_CELLS; i++) this.board.placeByIndex(i, new Brick(tutorialBrick(spec, i)));
    const rep = new Brick(spec.replenish);
    this.board.replenishList = [rep];
    this.board.resetBlockPositions();
    for (const b of this.board.allBricks()) b.settle();
    this.line = { ...this.line, num: 1 };
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
    if (this.selectedBrick) this.fxOf(b).dim = 0.7;
    return b;
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  update(): void {
    const inp = this.ctx.input;
    for (const b of this.board.allBricks()) b.snapshot();
    this.held?.snapshot();

    if (inp.keysPressed.size > 0) this.keyboardUsed = true;
    // Esc is "back": it pauses, un-pauses, steps out of a pause sub-page, and only quits where there is nothing to lose.
    if (inp.keysPressed.has("Escape")) {
      if (this.state === "menu") {
        if (!this.pause.back()) this.state = "rest";
        return;
      }
      if (this.state === "lost" || this.state === "tutorial") {
        this.quitToTitle();
        return;
      }
      if (this.state === "rest") {
        this.activateButton("pause");
        return;
      }
    }

    this.ctx.audio.setPaused(this.state === "menu");

    if (this.buttonsTheme !== this.layoutKey()) {
      this.board.setEnv(spacingFor(this.ctx.palette.kind), viewportFor(this.ctx.view, this.ctx.palette.kind));
      for (const b of this.board.allBricks()) b.settle();
      this.placeHeld();
      this.held?.settle();
      this.layoutButtons();
    }

    if (this.state === "lost") {
      this.lostTimer++;
      if (this.lostTimer <= 20) return;
      const hit = inp.released ? cardButtonAt(inp, this.overlayButtons(), this.cardOffset()) : undefined;
      if (hit?.id === "retry" || inp.keysPressed.has("Enter")) this.retry();
      else if (hit?.id === "menu") this.quitToTitle();
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

    if (this.levelCardOpen()) {
      const hit = this.levelButtons().find((b) => inp.released && inp.inCentered(b.cx, b.cy, b.w, b.h));
      if (hit?.id === "next" || inp.keysPressed.has("Enter") || inp.keysPressed.has(" ")) this.nextLevel();
      else if (hit?.id === "replay") this.restartLevel();
      else if (hit?.id === "title") this.quitToTitle();
    }

    this.updateButtons();
    this.updateSelector();
    this.stepRest();
    this.stepAnimation();
    this.stepTutorial();
    for (const b of this.board.allBricks()) this.stepBrick(b);
    if (this.held) this.stepBrick(this.held);
    this.stepDieAnims();
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
        // The original held the timer whenever progress dropped below its
        // high-water mark (after every brick used), which read as a freeze.
        const step = stepLine(this.line, n, this.board.replenishList.length, this.accel);
        for (const ev of step.events) {
          if (ev === "push") {
            this.doPush();
            break;
          }
          block = this.spawnReplenishBrick();
          if (ev === "fill") this.ctx.audio.event("fill");
        }
        if (!step.events.includes("push")) this.line = step.state;
        if (block) {
          if (this.ctx.palette.kind === "generated") {
            // The paint has set: the brick pops into its well.
            const f = this.fxOf(block);
            this.tweens.set(f, { s: 0.2 });
            this.tweens.to(f, { s: 1 }, D(280), easeOutBack);
          } else {
            block.inactiveTimer = this.line.timer;
            block.inactiveDuration = this.line.timer;
          }
        }
      }

      this.board.comboLength = 0;
      this.board.comboBonus = 0;
      this.meter = coolChain(this.meter);
    }

    // The original only ran the timer at rest, so a fast player kept it
    // frozen behind their own combines and pops. Let it tick through board
    // animations too; spawning and pushing still wait for rest.
    if (this.state === "animation" && this.animation !== "push" && this.animation !== "begin" && this.animation !== "fadeout") {
      this.line = tickThroughAnimation(this.line);
    }

    if (this.board.countBricks() + this.board.replenishList.length > 0) this.currentPercentage = lineProgress(this.line, n);
    this.maxPercentage = this.currentPercentage;
  }

  private beginLevelComplete(): void {
    if (this.state === "animation" && this.animation === "fadeout") return;
    this.state = "animation";
    this.animation = "fadeout";
    // The celebration gets the stage to itself before the card slides in.
    this.levelCompleteDelay = LEVEL_CARD_FRAMES + CARD_HOLD_FRAMES;
    this.cardT0 = this.ctx.clock.t + D((CARD_HOLD_FRAMES * 1000) / FPS);
    this.flareT0 = this.ctx.clock.t;
    if (this.ctx.palette.kind === "generated") this.ctx.audio.duck(0.5, 1800);
    const wave = this.ctx.palette.fx.clearWave ? this.startClearWave() : 0;
    if (wave > 0) this.effects.later(wave, () => this.celebrate());
    else this.celebrate();
    if (!this.levelCompleteSounded) {
      this.levelCompleteSounded = true;
      this.ctx.audio.event("achieve");
    }
  }

  /** `board_push.gml` plus the normal-mode loss check. */
  private doPush(): void {
    const result = this.board.push();
    for (const b of this.board.bricks()) b.settle();
    this.line = linePushed(this.line);
    this.selectedBrick = null;
    this.selected = this.board.cellNum;
    this.state = "animation";
    this.animation = "push";
    this.animFrame = 0;
    this.pushT0 = this.ctx.clock.t;
    if (this.ctx.palette.fx.boardHeave) {
      // The board takes the row on the chin: compresses as it lands, then springs back past true.
      this.tweens.set(this.heaveFx, { sy: 1 });
      this.tweens.to(this.heaveFx, { sy: 0.95 }, D(PUSH_ANTICIPATE_MS), easeOutCubic, {
        onDone: () => this.tweens.to(this.heaveFx, { sy: 1 }, D(620), easeOutElastic),
      });
    }
    // The pushed line is on the board now: undo any selection dim it carried.
    for (const b of this.board.bricks()) this.tweens.to(this.fxOf(b), { dim: 1 }, D(DIM_MS));
    this.barFlashT0 = this.ctx.clock.t;
    this.ctx.audio.event("push");
    if (result.overflow && this.ctx.session.gameType === "normal") {
      this.lose();
    }
  }

  /** The pause card's view of the game: mode, level, score and what is left. */
  private pauseInfo(): PauseInfo {
    const s = this.ctx.session;
    const goal = s.gameType === "puzzle" ? `${this.board.countBricks()} bricks left` : `${this.comboRemaining} pops to go`;
    return { gameType: s.gameType, world: s.world, level: s.level, score: s.score, goal, keyboardUsed: this.keyboardUsed };
  }

  private updateMenu(): void {
    const action = this.pause.update(this.ctx, this.cardOffset(), this.pauseInfo());
    if (action === "resume") this.state = "rest";
    else if (action === "restart") this.restartLevel();
    else if (action === "quit") this.quitToTitle();
  }

  /** Buttons on the game-over card. */
  private overlayButtons(): PillButton[] {
    const vp = this.ctx.view;
    const cx = vp.w / 2;
    const y = vp.h / 2 + 72;
    const w = 150;
    const h = 44;
    return [
      { id: "retry", label: "Retry", cx: cx - w / 2 - 8, cy: y, w, h, primary: true },
      { id: "menu", label: "Quit to title", cx: cx + w / 2 + 8, cy: y, w, h },
    ];
  }

  /** The modern level-complete card is up and taking input. */
  private levelCardOpen(): boolean {
    return this.state === "animation" && this.animation === "fadeout" && this.ctx.palette.kind === "generated" && this.levelCompleteDelay < 0;
  }

  /** Geometry of the modern level-complete card: a column of rows with the three buttons along the bottom. */
  private levelCard(): LevelCardLayout {
    return levelCardLayout(this.ctx.view, this.goal.subtractGoal > 0 || this.tally.subtract > 0);
  }

  /** Next, Replay and Title, where they sit this frame. */
  private levelButtons(): PillButton[] {
    return levelButtons(this.levelCard(), this.cardOffset());
  }

  /** Queue a toast chip (modern themes only). */
  private toast(text: string, color: string): void {
    if (this.ctx.palette.kind !== "generated") return;
    this.toasts.push({ text, color, t0: this.ctx.clock.t });
    this.ctx.audio.event("toast");
  }

  /** Start this level over with the score it began with. */
  private restartLevel(): void {
    this.ctx.session.score = this.levelStartScore;
    this.ctx.setScene(new GameScene(this.ctx));
  }

  /** Restart the current level from a score of zero. */
  private retry(): void {
    this.ctx.session.score = 0;
    this.ctx.setScene(new GameScene(this.ctx));
  }

  private lose(): void {
    this.state = "lost";
    this.lostTimer = 0;
    this.cardT0 = this.ctx.clock.t + D(250);
    this.tweens.to(this.lostFx, { desat: 1 }, D(DESAT_MS));
    this.effects.vignette(0.6, 1600);
    this.ctx.audio.event("lose");
    this.recordHighScore();
  }

  /** `Board` step event, STATE_ANIMATION block. */
  private stepAnimation(): void {
    if (this.state !== "animation") return;
    const bricks = [...this.board.allBricks()];
    const count = (pred: (b: Brick) => boolean) => bricks.filter(pred).length;
    const { world } = this.ctx.session;
    this.animFrame++;

    switch (this.animation) {
      case "fadeout":
        this.levelCompleteDelay--;
        // Classic moves on by itself as the original did; the modern card waits for Next, Replay or Title.
        if (this.levelCompleteDelay < 0 && this.ctx.palette.kind !== "generated") this.nextLevel();
        return;
      case "push":
        this.maxPercentage -= 1 / (this.board.cellNum * 5);
        if (this.animFrame >= PUSH_FRAMES) {
          for (const b of bricks) b.pushing = false;
          this.pushT0 = -1;
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
          this.ctx.audio.event("landing");
        }
        break;
      case "rotate":
        if (this.animFrame >= ROTATE_FRAMES) {
          for (const b of bricks) b.rotate = false;
          this.rotateT0 = -1;
          this.animation = "fall";
          this.board.resetBlockPositions();
          if (this.board.resettle()) this.ctx.audio.event("fall");
        }
        break;
      case "pop":
        if (this.dieAnims.length === 0) {
          if (this.board.resettle()) {
            this.animation = "fall";
            this.ctx.audio.event("fall");
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
    const t = this.ctx.clock.t;
    const l = this.board.layout;
    const pal = this.ctx.palette;
    const scoring = res.score !== 0;
    if (scoring) this.meter = heatChain(this.meter);
    const chain = this.meter.chain;
    const score = scorePop(
      {
        score: res.score,
        brickValue: res.brickValue,
        groups: res.groups.map((g) => ({ size: g.length, black: g[0].color === BLACK, refined: g.some((b) => b.refined) })),
      },
      this.meter,
      this.goal,
      this.tally,
    );
    const { mult } = score;
    const generated = pal.kind === "generated";
    const total = res.groups.reduce((n, g) => n + g.length, 0);
    const k = generated && scoring ? intensityFor(chain, total) : 0;

    res.groups.forEach((g, gi) => {
      // Centroid, then pop outward from it in a spiral-ish distance order.
      let cxg = 0;
      let cyg = 0;
      for (const b of g) {
        cxg += b.x + l.cellW / 2;
        cyg += b.y + l.cellH / 2;
      }
      cxg /= g.length;
      cyg /= g.length;
      const ordered = [...g].sort((a, b) => Math.hypot(a.x - cxg, a.y - cyg) - Math.hypot(b.x - cxg, b.y - cyg));
      ordered.forEach((b, i) => {
        this.view.fx.delete(b.id);
        this.dieAnims.push({ x: b.x, y: b.y, color: b.color, t0: t + D(gi * 40 + i * POP_STAGGER_MS), burst: false, spin: i % 2 === 0 ? 1 : -1, k });
      });
      this.effects.burstRing(cxg, cyg, l.cellW, pal.callout, k, D(gi * 40 + 60), D(SHOCK_MS), g[0].color);
      if (pal.stains) {
        let ext = 0;
        for (const b of g) ext = Math.max(ext, Math.hypot(b.x + l.cellW / 2 - cxg, b.y + l.cellH / 2 - cyg));
        this.stains.push({
          x: cxg,
          y: cyg,
          r: ext * 0.55 + l.cellW * 0.45,
          color: pal.stainColor ?? pal.brickColors[g[0].color],
          t0: t + D(gi * 40 + 100),
          dur: D(5200),
          seed: Math.floor(Math.random() * 1e6),
        });
      }
      if (score.groupValues[gi] > 0) {
        this.addCallout(`+${score.groupValues[gi]}`, cxg, cyg, {
          delay: gi * 40 + 100,
          size: Math.max(14, l.cellH * 0.34) * (1 + 0.12 * (mult - 1)),
          color: pal.callout,
          display: true,
        });
      }
    });

    // A pop rewinds the current well instead of pausing the timer (the
    // original banked a pause, which read as the timer freezing).
    if (!this.line.readyToPush) {
      const from = wellLevel(this.line);
      this.line = rewindLine(this.line);
      this.maxPercentage = 0;
      this.tweens.set(this.levelFx, { v: from });
      this.tweens.to(this.levelFx, { v: 0 }, D(360), easeOutCubic);
      this.rewindUntil = t + D(360);
    }
    this.state = "animation";
    this.animation = "pop";

    this.tally = score.tally;
    this.goal = score.goal;
    this.bestChain = Math.max(this.bestChain, mult);
    if (scoring) {
      this.comboRemaining -= 1;
      const c0 = this.groupCentre(res.groups[0]);
      this.lastPopAt = c0;
      const impact: PopImpact = {
        k,
        mult,
        semitones: Math.min(7, chain - 1),
        color: res.groups[0][0].color,
        dir: [c0.x - (l.boardX + l.boardW / 2), c0.y - (l.boardY + l.boardH / 2)],
      };
      if (pal.fx.stagedPop) this.pendingPop = impact;
      else this.popImpact(impact);
      if (mult !== this.lastMult) {
        this.lastMult = mult;
        this.tweens.set(this.badgeFx, { s: 1.5 });
        this.tweens.to(this.badgeFx, { s: 1 }, D(650), easeOutElastic);
      }

      for (const gi of score.refinedGroups) {
        const c = this.groupCentre(res.groups[gi]);
        this.addCallout(`SUBTRACT +${score.refinedBonus}`, c.x, c.y + l.cellH * 1.05, { delay: 220, size: 15, color: pal.goalAccent, dur: 900, rise: 34 });
      }
      if (chain >= 2) {
        const c = this.groupCentre(res.groups[0]);
        const colors = pal.multColors;
        this.addCallout(`CHAIN x${mult}`, c.x, c.y - l.cellH * 1.1, {
          delay: 180,
          size: 18 + mult * 2,
          color: colors[mult],
          dur: 900,
          rise: 40,
          display: true,
        });
      }

      if (score.goalJustDone) {
        this.toast("Subtract goal done", pal.goalAccent);
        this.ctx.audio.event("achieve");
        this.addCallout(`SUBTRACT GOAL +${GOAL_BONUS}`, l.boardX + l.boardW / 2, l.boardY + l.boardH * 0.4, {
          delay: 300,
          size: 24,
          color: pal.goalAccent,
          dur: 1400,
          rise: 30,
          display: true,
        });
      }
    }
    this.ctx.session.score += score.gained;
    if (!this.hiToasted && this.ctx.save.hiscore > 0 && this.ctx.session.score > this.ctx.save.hiscore) {
      this.hiToasted = true;
      this.toast("New high score", pal.overlayAccent);
    }
  }

  /** Fire a pop's impact: on staged themes this lands on the first burst frame, otherwise when the pop is decided. */
  private popImpact(p: PopImpact): void {
    const pal = this.ctx.palette;
    const generated = pal.kind === "generated";
    this.ctx.audio.event("pop", { rate: 1.0595 ** p.semitones, color: p.color, chain: p.mult });
    const sc = popScale(p.k);
    this.effects.impact(p.k, p.mult >= 3 ? sc.freezeMs + 30 : sc.freezeMs);
    if (p.mult >= 4 || p.k >= 0.85) this.effects.impactFrame(pal.brickColors[p.color]);
    if (generated && p.k >= 0.35) this.ctx.audio.duck(0.25 + 0.35 * p.k, 500 + 400 * p.k);
    if (p.mult >= 2) this.effects.flash(pal.flashFromBrick ? pal.brickColors[p.color] : pal.flash, 30, generated ? sc.flash : 1);
    if (generated) {
      if (this.meter.chain >= 2 || p.k > 0.25) this.effects.shake(sc.shake, p.dir);
      if (this.meter.chain >= 3) this.effects.wash(pal.brickColors[p.color], 450 + 250 * p.k);
      this.lastK = p.k;
    } else if (this.meter.chain >= 3) {
      this.effects.shake(3, [0, 0]);
    }
  }

  private groupCentre(group: Brick[]): { x: number; y: number } {
    const l = this.board.layout;
    let x = 0;
    let y = 0;
    for (const b of group) {
      x += b.x + l.cellW / 2;
      y += b.y + l.cellH / 2;
    }
    x /= group.length;
    y /= group.length;
    x = Math.max(l.boardX + 70, Math.min(l.boardX + l.boardW - 70, x));
    return { x, y };
  }

  private addCallout(
    text: string,
    x: number,
    y: number,
    o: { delay?: number; dur?: number; size?: number; color?: string; rise?: number; display?: boolean } = {},
  ): void {
    this.callouts.push({
      text,
      x,
      y,
      t0: this.ctx.clock.t + D(o.delay ?? 0),
      dur: D(o.dur ?? SCORE_MS),
      color: o.color ?? this.ctx.palette.callout,
      size: o.size ?? 16,
      tilt: (Math.random() * 2 - 1) * 4 * DEG,
      rise: o.rise ?? 28,
      display: o.display ?? false,
    });
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
    this.ctx.setScene(new GameScene(this.ctx));
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

    if (interactive) {
      if (inp.keysPressed.has("q") || inp.keysPressed.has("ArrowLeft")) this.activateButton("ccw");
      if (inp.keysPressed.has("e") || inp.keysPressed.has("ArrowRight")) this.activateButton("cw");
      if (inp.keysPressed.has("p")) this.activateButton("pause");
    }

    const speed = this.buttons.find((b) => b.kind === "speed")!;
    const speeding = speed.pressed || inp.keysDown.has(" ") || inp.keysDown.has("ArrowDown");
    if (speeding && this.state === "rest") {
      this.accel = Math.min(4, this.accel * 1.1);
      // a rising blip every few frames while the charge builds
      const t = this.ctx.clock.t;
      if (t - this.chargeBlipT > D(110)) {
        this.chargeBlipT = t;
        this.ctx.audio.event("charge", { rate: 1 + (this.accel - 1) / 3, volume: 0.6 });
      }
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
          for (const b of this.board.bricks()) b.settle();
          this.state = "animation";
          this.animation = "rotate";
          this.animFrame = 0;
          this.rotateT0 = this.ctx.clock.t;
          this.rotateDir = kind === "cw" ? 1 : -1;
          this.ctx.audio.event("rotate");
        }
        break;
      case "pause":
        if (this.state === "rest") {
          this.state = "menu";
          this.pause.open();
          this.cardT0 = this.ctx.clock.t;
          this.ctx.audio.event("cardIn");
        } else if (this.state === "menu") {
          this.state = "rest";
          this.ctx.audio.event("cardOut");
        }
        break;
      case "speed":
        break;
      case "sound": {
        const muted = this.ctx.audio.toggleMute();
        this.ctx.save.muted = muted;
        this.ctx.persist();
        if (!muted) this.ctx.audio.event("toggleOn");
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
    const inRepZone = inp.y > replenishY(l) - l.cellSep * 2;
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
          this.ctx.audio.event("select");
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
    this.syncSelectionFx();
    this.updatePreview(inp.x, inp.y);
  }

  /** Work out which bricks a drop on the cell under the pointer would pop together, for the breathing preview. */
  private updatePreview(px: number, py: number): void {
    const sel = this.selectedBrick;
    const placing = this.state === "rest" || (this.state === "tutorial" && this.tutorialPhase === "add");
    const l = this.board.layout;
    const n = this.board.cellNum;
    const { gx, gy } = screenToGrid(l, px, py);
    if (!this.ctx.palette.fx.groupPreview || !sel || !placing || gx < 0 || gy < 0 || gx >= n || gy >= n) {
      this.preview = null;
      return;
    }
    const key = `${sel.color}:${gx}:${gy}`;
    if (this.preview?.key === key) return;
    const rules = this.state === "tutorial" ? tutorialSpec(this.ctx.session.level) : undefined;
    const p = groupIfPlaced(this.board, sel.color, gx, gy, rules?.canAdd ?? true, rules?.canSubtract ?? true);
    this.preview = p && p.members.length >= POP_GROUP_SIZE ? { key, members: new Set(p.members), t0: this.ctx.clock.t } : null;
  }

  /** Lift the newly selected brick, drop the old one, dim the rest of the line. */
  private syncSelectionFx(): void {
    const sel = this.selectedBrick;
    if (sel === this.lastSelected) return;
    if (this.lastSelected) this.tweens.to(this.fxOf(this.lastSelected), { s: 1, lift: 0 }, D(160), easeOutBack);
    if (sel) {
      this.tweens.to(this.fxOf(sel), { s: 1.12, lift: 1 }, D(PICK_MS), easeOutBack);
      this.tweens.set(this.selFx, { s: 0.8 });
      this.tweens.to(this.selFx, { s: 1 }, D(200), easeOutBack);
    }
    // Only the rest of the line dims; anything on the board (including bricks a
    // push just moved there) always comes back to full strength.
    for (const b of this.board.allBricks()) {
      if (b === sel) continue;
      const inLine = this.board.replenishList.includes(b);
      this.tweens.to(this.fxOf(b), { dim: inLine && sel ? 0.7 : 1 }, D(DIM_MS));
    }
    if (this.held && this.held !== sel) this.tweens.to(this.fxOf(this.held), { dim: 1 }, D(DIM_MS));
    this.lastSelected = sel;
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
      this.line = lineShortened(this.line, list.length, this.board.cellNum);
      this.deselect();
      this.ctx.audio.event("select");
    } else if (this.held) {
      this.selected = this.selected === HOLD ? this.board.cellNum : HOLD;
      this.ctx.audio.event("select");
    }
  }

  /** Park the held brick on the hold slot (it slides there via the feel layer). */
  private placeHeld(): void {
    if (!this.held) return;
    const l = this.board.layout;
    const r = this.rail();
    this.held.x = r.cx - l.cellW / 2;
    this.held.y = r.holdY - l.cellH / 2;
    this.held.gridX = -1;
    this.held.gridY = -1;
  }

  private deselect(): void {
    this.selected = this.board.cellNum;
    this.selX = cellX(this.board.layout, this.selected);
  }

  private onBoardRelease(): void {
    const { world, level } = this.ctx.session;
    const dest = this.board.get(this.cx, this.cy);
    if (this.state === "rest") {
      const fromHold = this.selectedBrick !== null && this.selectedBrick === this.held;
      const result = this.board.combine(this.selectedBrick, this.cx, this.cy);
      this.handleCombine(result, dest);
      if (result === "combined" && fromHold) this.held = null;
      this.deselect();
    } else if (this.state === "tutorial" && this.tutorialPhase === "add") {
      const spec = tutorialSpec(level);
      if (!acceptsTarget(level, dest?.color ?? null)) return;
      const result = this.board.combine(this.selectedBrick, this.cx, this.cy, spec.canAdd, spec.canSubtract);
      this.handleCombine(result, dest);
      this.deselect();
      if (result === "combined" && world === 0) {
        if (this.tutorialState < 4) this.tutorialState = 4;
        this.board.replenishList = [];
      }
    }
  }

  private handleCombine(result: "combined" | "noadd" | "none", dest: Brick | null): void {
    const t = this.ctx.clock.t;
    const l = this.board.layout;
    switch (result) {
      case "noadd": {
        this.state = "animation";
        this.animation = "noadd";
        this.animFrame = 0;
        this.ctx.audio.event("noadd");
        this.selFlashT0 = t;
        for (const b of this.board.allBricks()) {
          if (b.noadd) this.fxOf(b).noaddT0 = t;
        }
        if (this.held?.noadd) this.fxOf(this.held).noaddT0 = t;
        break;
      }
      case "combined": {
        const from = this.selectedBrick;
        this.selectedBrick = null;
        // a brick left the line: a push that was counting down stands down
        this.line = { ...this.line, num: this.board.replenishList.length, readyToPush: false };
        this.state = "animation";
        this.animation = "combine";
        this.animFrame = 0;
        this.ctx.audio.event("combine", dest ? { from: dest.spriteColor, to: dest.color } : {});
        if (dest) {
          const f = this.fxOf(dest);
          f.wipeT0 = t;
          this.tweens.set(f, { s: 1 });
          this.tweens.to(f, { s: 1.1 }, D(80), easeOutBack, {
            onDone: () => this.tweens.to(f, { s: 1 }, D(100), easeOutBack),
          });
          const pal = this.ctx.palette;
          const cx = dest.x + l.cellW / 2;
          const cy = dest.y + l.cellH / 2;
          this.effects.ring(cx, cy, l.cellW * 0.5, l.cellW * 0.8, pal.ring, 3, D(RING_MS));
          const dir = from ? Math.atan2(dest.y - from.y, dest.x - from.x) : undefined;
          this.effects.mixSplash(cx, cy, l.cellW, [pal.brickColors[dest.spriteColor], pal.brickColors[dest.color]], dir);
          this.effects.mixArc(cx, cy, l.cellW, dest.spriteColor, dest.color);
        }
        break;
      }
      case "none":
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Bricks and pop animations
  // ---------------------------------------------------------------------------

  /** `Brick` step event: sim-side motion (gravity) plus the hooks that start feel-layer tweens. */
  private stepBrick(b: Brick): void {
    const f = this.fxOf(b);
    const stable = !b.fall && !b.enter && !b.pushing && !b.rotate;
    const animating = this.state === "animation";
    const positional = animating && (this.animation === "fall" || this.animation === "begin" || this.animation === "push" || this.animation === "rotate");

    // Logical position jumped while the brick is not in a sim-driven motion
    // (the replenish line shifted, a brick went to the hold slot): slide there.
    if (stable && !positional && (b.spriteX !== b.x || b.spriteY !== b.y)) {
      f.dx += b.spriteX - b.x;
      f.dy += b.spriteY - b.y;
      b.spriteX = b.x;
      b.spriteY = b.y;
      b.prevX = b.x;
      b.prevY = b.y;
      this.tweens.to(f, { dx: 0, dy: 0 }, D(200), easeOutQuart);
    }

    switch (this.state) {
      case "rest":
      case "tutorial":
        b.settle();
        break;
      case "animation":
        if (this.animation !== "fall" && this.animation !== "begin") b.grav = 0;
        switch (this.animation) {
          case "push":
            // Positions are already final; the slide is drawn by the feel layer.
            break;
          case "begin":
            if (b.enterDelay <= 0) {
              if (b.spriteY < b.y) {
                if (!f.wasFalling) {
                  f.wasFalling = true;
                  f.fallFrom = b.spriteY;
                }
                b.grav += GRAVITY;
                b.spriteY += b.grav;
              }
              if (b.spriteY >= b.y && b.enter) {
                b.spriteY = b.y;
                b.enter = false;
                this.onLand(b, f);
              }
            } else {
              b.enterDelay--;
            }
            break;
          case "combine":
            b.colorTween -= 1;
            if (b.colorTween <= 0) b.spriteColor = b.color;
            b.spriteX = b.x;
            b.spriteY = b.y;
            break;
          case "noadd":
            b.noaddTimer += 1;
            if (b.noaddTimer > Brick.NOADD_DURATION) {
              b.noaddTimer = 0;
              b.noadd = false;
              f.noaddT0 = -1;
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
            // The whole board turns as one transform; sprites sit at their new slots.
            b.colorTween = Brick.TWEEN_FRAMES;
            break;
          case "fall":
            b.colorTween = Brick.TWEEN_FRAMES;
            b.spriteX = b.x;
            if (b.fall && !f.wasFalling) {
              f.wasFalling = true;
              f.fallFrom = b.spriteY;
            }
            if (b.spriteY < b.y) {
              b.grav += GRAVITY;
              b.spriteY += b.grav;
              if (b.grav > GRAVITY * 4 && this.ctx.palette.kind === "generated") {
                const l = this.board.layout;
                this.effects.trail(b.spriteX + l.cellW / 2, b.spriteY + l.cellH * 0.3, 0, b.grav * FPS, this.ctx.palette.brickColors[b.color], l.cellW);
              }
            }
            if (b.spriteY >= b.y) {
              b.spriteY = b.y;
              if (b.fall) {
                b.fall = false;
                this.onLand(b, f);
              }
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

  /** Landing squash, plus a dust puff for anything that dropped more than a cell. */
  private onLand(b: Brick, f: BrickFx): void {
    const l = this.board.layout;
    const fell = b.y - f.fallFrom;
    f.wasFalling = false;
    if (this.ctx.palette.fx.landFx !== "none") f.landT0 = this.ctx.clock.t;
    this.tweens.set(f, { sx: 1.15, sy: 0.85 });
    this.tweens.to(f, { sx: 1, sy: 1 }, D(LAND_SETTLE_MS), easeOutBack, { delay: D(LAND_SQUASH_MS) });
    if (fell > l.cellH * 1.5) {
      const dust = this.ctx.palette.dust;
      const count = Math.min(9, 3 + Math.floor(fell / l.cellH) * 2);
      this.effects.particles.spawn(b.x + l.cellW / 2, b.y + l.cellH, count, dust, {
        speed: [30, 80],
        size: [3, 5],
        life: [200, 350],
        gravity: 250,
        dir: -Math.PI / 2,
        spread: 1.3,
        shape: 1,
      });
    }
  }

  /** Timer level 0..1 shown in the next well: nothing while a push is pending, the rewind tween while rewinding, eight steps when pixelated. */
  private wellLevel(): number {
    if (this.line.readyToPush) return 0;
    const rewinding = this.ctx.clock.t < this.rewindUntil;
    if (!rewinding) return wellLevel(this.line, this.ctx.palette.pixelated);
    return this.ctx.palette.pixelated ? Math.floor(this.levelFx.v * 8) / 8 : this.levelFx.v;
  }

  /** `BrickDieAnim` step event: a pop is over once its last brick has shrunk away. */
  private stepDieAnims(): void {
    if (this.dieAnims.length === 0) return;
    const t = this.ctx.clock.t;
    this.dieAnims = this.dieAnims.filter((d) => t - d.t0 < D(POP_TOTAL_MS));
  }

  // ---------------------------------------------------------------------------
  // Tutorial
  // ---------------------------------------------------------------------------

  private updateTutorialSlides(): void {
    const slides = this.tutorialPhase === "intro" ? this.ctx.sprites.tutorial_intro_sprite : this.ctx.sprites.tutorial_outro_sprite;
    const nav = slideNav(this.ctx.input, slideRect(this.ctx.view));

    if (nav === "next") {
      this.ctx.audio.event("tap");
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
    } else if (nav === "back" && this.tutorialState > 0) {
      this.ctx.audio.event("tap");
      this.tutorialState--;
    }
  }

  /** `Board` step event, STATE_TUTORIAL block (the hands-on part). */
  private stepTutorial(): void {
    if (this.state !== "tutorial" || this.tutorialPhase !== "add") return;
    const s = this.ctx.session;
    const spec = tutorialSpec(s.level);

    switch (this.tutorialState) {
      case 0:
        this.selectedBrick = null;
        this.populateTutorial();
        this.tutorialText = tutorialText(spec, "select");
        this.tutorialState = 1;
        break;
      case 2:
        this.tutorialText = tutorialText(spec, "combine");
        this.tutorialState = 3;
        break;
      case 4:
        this.tutorialText = tutorialText(spec, "done");
        this.tutorialTimer = 0;
        this.tutorialState = 5;
        break;
      case 5:
        this.selectedBrick = null;
        this.tutorialTimer++;
        if (this.tutorialTimer > 30) {
          s.level += 1;
          this.deselect();
          this.board.resize(TUTORIAL_CELLS);
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

  /** Advance the real-time feel layer; called once per rendered frame. */
  private stepFx(): void {
    const clock = this.ctx.clock;
    this.tweens.update(clock.t);
    this.effects.update();
    const t = clock.t;
    if (this.ctx.session.score !== this.scoreTarget) {
      this.scoreTarget = this.ctx.session.score;
      this.tweens.to(this.scoreFx, { v: this.scoreTarget }, D(COUNT_MS * (1 - 0.5 * this.lastK)));
    }
    if (this.ctx.palette.fx.stagedPop && this.scoreFx.v < this.scoreTarget - 0.5 && t - this.lastTick > 45) {
      this.lastTick = t;
      const progress = 1 - (this.scoreTarget - this.scoreFx.v) / Math.max(1, this.scoreTarget - this.scoreShownFrom);
      this.ctx.audio.cue("tick", 0.5, 1 + 0.6 * clamp01(progress));
    }
    if (this.scoreFx.v >= this.scoreTarget - 0.5) this.scoreShownFrom = this.scoreTarget;
    for (const d of this.dieAnims) {
      const e = t - d.t0;
      if (!d.burst && e >= D(POP_GROW_MS + POP_HOLD_MS)) {
        d.burst = true;
        this.burst(d);
      }
    }
    this.stains = this.stains.filter((s) => t - s.t0 < s.dur);
    this.callouts = this.callouts.filter((c) => t - c.t0 < c.dur);
    this.toasts = this.toasts.filter((c) => t - c.t0 < D(TOAST_MS));
    const pal = this.ctx.palette;
    const mult = this.chainMultiplier();
    this.effects.setBleed(mult >= 3 && this.meter.heat > 0 ? pal.multColors[mult] : null, this.meter.heat);
    if (pal.fx.liftRibbon) {
      const l = this.board.layout;
      const sel = this.selectedBrick;
      if (this.boardDown && sel) {
        this.ribbonColor = pal.brickColors[sel.color];
        this.ribbon = pushRibbon(this.ribbon, this.bx + l.cellW / 2, this.by + l.cellH / 2, t);
      } else {
        this.ribbon = ageRibbon(this.ribbon, t);
      }
    }
  }

  /** Debris, fragments and sparks flying out of a popped brick, in the theme's own style. */
  private burst(d: DieAnim): void {
    const l = this.board.layout;
    const sp = this.ctx.sprites;
    const frame = colorFrame(d.color);
    if (this.pendingPop) {
      this.popImpact(this.pendingPop);
      this.pendingPop = null;
    }
    this.effects.pop({
      x: d.x,
      y: d.y,
      w: l.cellW,
      h: l.cellH,
      color: d.color,
      k: d.k,
      debris: d.wave ? 4 : undefined,
      draw: (g, w, h) => drawSprite(g, sp.brick_sprite, frame, -w / 2, -h / 2, w, h),
      floor: gridBottom(l),
      signature: !this.ctx.palette.stains,
    });
  }

  /** Level clear: a fountain of the theme's debris from every column. */
  private celebrate(): void {
    const l = this.board.layout;
    const n = l.cellNum;
    const y = cellY(l, n) - l.cellSep;
    const xs = Array.from({ length: n }, (_, x) => cellX(l, x) + l.cellW / 2);
    this.effects.celebrate(xs, y, l.cellW, (i) => ((i % 6) + 1) as Color, this.ctx.palette.kind === "generated" ? 45 : 0);
  }

  /**
   * Pop whatever is left on the board in a wave spreading from the last pop,
   * each brick with its own small burst and a rising chime. Returns how long
   * until the fountain should follow, or 0 when the board was already empty.
   */
  private startClearWave(): number {
    const l = this.board.layout;
    const bricks = [...this.board.bricks()];
    if (bricks.length === 0) return 0;
    const origin = this.lastPopAt ?? { x: l.boardX + l.boardW / 2, y: l.boardY + l.boardH / 2 };
    const t = this.ctx.clock.t;
    const steps = clearWave(bricks, (b) => ({ x: b.x + l.cellW / 2, y: b.y + l.cellH / 2 }), origin, l.cellW + l.cellSep);
    steps.forEach((s, i) => {
      const b = s.item;
      this.board.set(b.gridX, b.gridY, null);
      this.view.fx.delete(b.id);
      this.dieAnims.push({ x: b.x, y: b.y, color: b.color, t0: t + D(s.delay), burst: false, spin: i % 2 === 0 ? 1 : -1, k: 0.15, wave: true });
      this.effects.later(D(s.delay), () => this.ctx.audio.cue("sparkle", 0.25, s.rate));
    });
    return D(steps[steps.length - 1].delay + POP_TOTAL_MS);
  }

  /**
   * Where debris lands: the top of a resting brick under (x, y) or the tray
   * ledge under the board; open air while the board is turning or taking a
   * push, when nothing is where it looks.
   */
  private solidTop(x: number, y: number): number | null {
    if (this.state === "animation" && (this.animation === "rotate" || this.animation === "push")) return null;
    const l = this.board.layout;
    if (x < l.boardX || x > l.boardX + l.boardW) return null;
    const bottom = gridBottom(l);
    if (y >= bottom) return y < bottom + l.cellSep * 3 ? bottom : null;
    const { gx, gy } = screenToGrid(l, x, y);
    const b = this.board.get(gx, gy);
    if (!b) return null;
    const top = cellY(l, gy);
    return Math.abs(b.y - top) > 1 ? null : top;
  }

  /** 1 right after a level clear, easing to 0 over FLARE_MS. */
  private flare(): number {
    const p = clamp01((this.ctx.clock.t - this.flareT0) / D(FLARE_MS));
    return (1 - p) * (1 - p);
  }

  render(g: CanvasRenderingContext2D): void {
    this.stepFx();
    const { world } = this.ctx.session;
    const pal = this.ctx.palette;

    fillScreen(g, pal.background);

    if (this.state === "tutorial" && this.tutorialPhase !== "add") {
      this.renderTutorialSlides(g);
      this.renderFade(g);
      return;
    }

    this.view.frame = this.boardFrame();
    const silhouette = this.effects.silhouette;
    if (silhouette) {
      this.view.renderImpactFrame(g, silhouette);
      return;
    }

    g.save();
    this.effects.applyShake(g, this.ctx.view.w / 2, this.ctx.view.h / 2);

    this.renderBackground(g);
    this.effects.renderUnder(g);
    if (world !== 0) {
      this.renderButtons(g);
      this.view.renderPreview(g);
    }

    const l = this.board.layout;
    const boardBricks = [...this.board.bricks()];
    const lineBricks = this.board.replenishList.filter((b) => b !== this.selectedBrick);
    const desat = this.lostFx.desat;

    // Board bricks, as one transform while rotating.
    g.save();
    this.view.applyBoardTransform(g);
    if (desat > 0) g.filter = `saturate(${Math.round((1 - desat * 0.9) * 100)}%)`;
    if (pal.brickStyle !== "flat") for (const b of boardBricks) this.view.renderShadow(g, b);
    for (const b of boardBricks) this.view.renderBrick(g, b);
    if (pal.fuse) this.view.renderSeams(g, boardBricks);
    if (this.preview) this.view.renderPreviewLinks(g);
    for (const d of this.dieAnims) this.view.renderDieAnim(g, d);
    g.filter = "none";
    g.restore();

    // Replenish line.
    if (pal.brickStyle !== "flat") for (const b of lineBricks) this.view.renderShadow(g, b);
    for (const b of lineBricks) this.view.renderBrick(g, b);
    this.effects.renderWorld(g);

    if (world !== 0) this.view.renderHoldSlot(g);
    if (this.selectedBrick && this.selectedBrick !== this.held) {
      if (pal.kind === "generated") this.view.renderHeldGlow(g, this.selectedBrick);
      if (pal.brickStyle !== "flat") this.view.renderShadow(g, this.selectedBrick);
      this.view.renderBrick(g, this.selectedBrick);
    }

    this.effects.renderWash(g, l.boardX, l.boardY, l.boardW, l.boardH);
    this.effects.renderFlash(g, l.boardX, l.boardY, l.boardW, l.boardH);

    this.view.renderSelector(g);
    this.view.renderCallouts(g);
    this.view.renderToasts(g);
    if (world > 0 && this.state !== "tutorial") this.renderHud(g);
    this.effects.renderVignette(g);
    g.restore();

    if (this.state === "animation" && this.animation === "fadeout") this.renderLevelComplete(g);
    if (this.state === "menu") {
      // the how-to-play slides cover the view themselves
      if (this.pause.page !== "help") dimBehindCard(g, pal, this.ctx.clock.t - this.cardT0, D(200));
      this.pause.render(g, this.ctx, this.feel, this.cardOffset(), this.pauseInfo());
    }
    if (this.state === "lost") this.renderLost(g);

    if (world === 0 && this.tutorialPhase === "add" && this.tutorialText) {
      const lay = this.board.layout;
      const vp = lay.vp;
      // Upright, the caption sits in the top band; sideways it floats over the top of the board.
      const ty = lay.portrait ? lay.hudTopY + lay.hudTop / 2 : vp.h / 4;
      if (pal.kind === "generated") {
        const lines = this.tutorialText.split("\n").length;
        const h = 24 * lines + 28;
        const w = Math.min(460, vp.w - 24);
        drawCard(g, pal.ui, vp.w / 2 - w / 2, ty - h / 2, w, h, 16);
        drawText(g, this.tutorialText, vp.w / 2, ty, { size: 20, color: pal.tutorialText, weight: 600, font: pal.display });
      } else {
        drawText(g, this.tutorialText, vp.w / 2, ty, { size: 22, color: pal.tutorialText, shadow: pal.tutorialShadow });
      }
    }
    this.renderFade(g);
  }

  /** What the board view draws this frame. */
  private boardFrame(): BoardFrame {
    return {
      selectedBrick: this.selectedBrick,
      held: this.held,
      preview: this.preview,
      dieAnims: this.dieAnims,
      callouts: this.callouts,
      toasts: this.toasts,
      rotateT0: this.rotateT0,
      rotateDir: this.rotateDir,
      pushT0: this.pushT0,
      pushing: this.state === "animation" && this.animation === "push",
      heaveSy: this.heaveFx.sy,
      lost: this.state === "lost",
      rail: this.rail(),
      holdHover: this.holdHover,
      keyboardUsed: this.keyboardUsed,
      nextColors: this.nextColors,
      wellLevel: this.wellLevel(),
      selector: {
        visible: this.selected !== this.board.cellNum && this.selected !== HOLD,
        x: this.selX,
        scale: this.selFx.s,
        flashT0: this.selFlashT0,
        showGhost: this.state === "rest" || (this.state === "animation" && this.animation === "combine"),
        alpha: this.selAlpha,
        ghostX: this.bx,
        ghostY: this.by,
      },
      ribbon: this.ribbon,
      ribbonColor: this.ribbonColor,
    };
  }

  /** Fade from the background colour when the scene starts. */
  private renderFade(g: CanvasRenderingContext2D): void {
    if (this.ctx.palette.kind !== "classic") return;
    const e = this.ctx.clock.t - this.fadeT0;
    if (e >= D(FADE_MS)) return;
    g.globalAlpha = 1 - clamp01(e / D(FADE_MS));
    fillScreen(g, this.ctx.palette.background);
    g.globalAlpha = 1;
  }

  /**
   * Fused seams: settled bricks of one colour lose the lead between them,
   * so a growing group reads as one pane. Drawn after the faces, before
   * anything that moves.
   */

  /** The backdrop: paper, empty cells and the replenish ledge (modern) or the original sprites (classic). */
  private renderBackground(g: CanvasRenderingContext2D): void {
    this.wellStep = drawBoardBackdrop(g, this.ctx, this.board.layout, {
      world: this.ctx.session.world,
      t: this.ctx.clock.t,
      heaveSy: this.heaveFx.sy,
      flare: this.flare(),
      line: this.line,
      wellLevel: this.wellLevel(),
      nextColor: this.nextColors[0] ?? 1,
      stains: this.stains,
      wellStep: this.wellStep,
    });
  }

  /**
   * How far the HUD still has to travel in from its edge as the scene opens:
   * 0 once it has arrived. Classic never moves.
   */
  private arrival(): number {
    if (this.ctx.palette.kind !== "generated") return 0;
    const p = clamp01((this.ctx.clock.t - this.fadeT0) / D(ARRIVE_MS));
    return (1 - easeOutCubic(p)) * TUNING.motion;
  }

  private renderButtons(g: CanvasRenderingContext2D): void {
    const a = this.arrival();
    const labelSize = Math.max(10, this.rail().textSize * 0.6);
    if (a <= 0) return drawControls(g, this.ctx, this.feel, this.buttons, this.controls, labelSize, this.accel);
    g.save();
    if (this.ctx.view.portrait) g.translate(0, a * 28);
    else g.translate(a * 36, 0);
    drawControls(g, this.ctx, this.feel, this.buttons, this.controls, labelSize, this.accel);
    g.restore();
  }

  /** `Board` draw event: score, chain meter, level, goal counter and progress bar. */
  private renderHud(g: CanvasRenderingContext2D): void {
    const a = this.arrival();
    if (a <= 0) return this.drawHud(g);
    g.save();
    if (this.ctx.view.portrait) g.translate(0, -a * 28);
    else g.translate(-a * 36, 0);
    this.drawHud(g);
    g.restore();
  }

  /** The HUD's view of the game this frame. */
  private drawHud(g: CanvasRenderingContext2D): void {
    const s = this.ctx.session;
    const t = this.ctx.clock.t;
    const puzzle = s.gameType === "puzzle";
    this.vuPeak = drawHud(
      g,
      this.ctx,
      this.board.layout,
      this.rail(),
      {
        score: String(Math.round(this.scoreFx.v)),
        mult: this.chainMultiplier(),
        chain: this.meter.chain,
        heat: this.meter.heat,
        badgeScale: this.badgeFx.s,
        gameType: s.gameType,
        world: s.world,
        level: s.level,
        left: puzzle ? this.board.countBricks() : this.comboRemaining,
        total: puzzle ? this.bricksTotal : this.popsTotal,
        goal: this.goal,
        line: this.line,
        barCurrent: this.line.readyToPush ? barFill(this.line, this.board.cellNum) : Math.max(0, this.currentPercentage),
        barMax: Math.max(0, this.maxPercentage),
        barFlash: (t - this.barFlashT0) / D(260),
        t,
      },
      this.vuPeak,
    );
  }

  // ---------------------------------------------------------------------------
  // Cards
  // ---------------------------------------------------------------------------

  /** Where the card sits this frame: it slides up from below with an overshoot. */
  private cardOffset(): number {
    return cardOffset(this.ctx.clock.t - this.cardT0, this.ctx.view.h, D(CARD_MS));
  }

  /** Centred card with a title, body lines and the overlay buttons. */
  private renderOverlayCard(g: CanvasRenderingContext2D, title: string, lines: string[], accent?: string, buttons = true): void {
    const pal = this.ctx.palette;
    dimBehindCard(g, pal, this.ctx.clock.t - this.cardT0, D(200));
    const off = this.cardOffset();
    const vp = this.ctx.view;
    const w = Math.min(440, vp.w - 24);
    const h = 236 + (accent ? 22 : 0) - (buttons ? 0 : 50);
    drawMessageCard(g, pal, { title, lines, accent, x: vp.w / 2 - w / 2, y: vp.h / 2 - 110, w, h }, off);
    if (buttons && (this.state !== "lost" || this.lostTimer > 20)) drawCardButtons(g, pal, this.ctx.input, this.feel, this.overlayButtons(), off);
  }

  private renderLevelComplete(g: CanvasRenderingContext2D): void {
    const s = this.ctx.session;
    const shown = Math.round(this.scoreFx.v);
    if (this.ctx.palette.kind === "generated") {
      const e = this.ctx.clock.t - this.cardT0;
      dimBehindCard(g, this.ctx.palette, e, D(200));
      this.starsSounded = drawLevelCard(
        g,
        this.ctx,
        this.feel,
        this.levelCard(),
        {
          gameType: s.gameType,
          world: s.world,
          level: s.level,
          shown,
          run: { bestChain: this.bestChain, subtractGoal: this.goal.subtractGoal, goalDone: this.goal.goalAwarded },
          tally: this.tally,
          e,
          scale: D,
          buttonsOpen: this.levelCompleteDelay < 0,
          starsSounded: this.starsSounded,
        },
        this.cardOffset(),
      );
      return;
    }
    this.renderOverlayCard(
      g,
      "Level complete",
      [`${s.gameType[0].toUpperCase()}${s.gameType.slice(1)} ${s.world}-${s.level + 1}`, `Score ${shown}`],
      undefined,
      false,
    );
  }

  private renderLost(g: CanvasRenderingContext2D): void {
    const s = this.ctx.session;
    const best = s.score >= this.ctx.save.hiscore && s.score > 0;
    this.renderOverlayCard(g, "Out of room", [`Score ${s.score}`, `Best ${this.ctx.save.hiscore}`], best ? "New high score!" : undefined);
  }

  private renderTutorialSlides(g: CanvasRenderingContext2D): void {
    const sp = this.ctx.sprites;
    const slides = this.tutorialPhase === "intro" ? sp.tutorial_intro_sprite : sp.tutorial_outro_sprite;
    drawSlides(g, sp, this.ctx.input, this.feel, slideRect(this.ctx.view), slides, this.tutorialState, false);
  }
}
