import { Board, POP_GROUP_SIZE, type PopResult } from "../core/Board";
import { groupIfPlaced } from "../core/preview";
import { Brick } from "../core/Brick";
import { BLUE, BLACK, colorFrame, COLOR_NAMES, GREEN, ORANGE, PURPLE, randomSpawnColor, RED, YELLOW, type Color } from "../core/color";
import { DEFAULT_CELL_NUM, FPS, LEVELS_PER_WORLD, MAX_WORLD } from "../core/constants";
import { cellX, cellY, gridBottom, NO_SPACING, replenishY, screenToGrid, type LayoutSpacing, type Viewport } from "../core/layout";
import { levelParams } from "../core/level";
import { levelStars, MAX_STARS, thirdStarHint } from "../core/rating";
import type { MusicName, Sprite, SpriteName } from "../engine/assets";
import { ButtonFeel } from "../engine/buttonFeel";
import {
  drawBlock,
  drawBlockTransformed,
  drawCard,
  drawLine,
  drawPillButton,
  drawSprite,
  drawSpritePartX,
  drawText,
  fillRoundRect,
  measureText,
  type PillButton,
} from "../engine/draw";
import { fillScreen } from "../engine/view";
import { backOut, clamp01, easeOutBack, easeOutCubic, easeOutElastic, easeOutQuart, easeInBack, lerp } from "../engine/easing";
import { drawStain, rgba } from "../engine/modernSkin";
import { vuLit, vuPeak, type VuPeak } from "../engine/vuMeter";
import { BACKDROPS, furnitureOf } from "../engine/backdrops";
import { THEME_ORDER } from "../engine/theme";
import { drawKeycaps } from "../engine/keycaps";
import { drawModeGlyph, MODE_COLOR, modeLabel } from "../engine/modeGlyph";
import { SoundControls, type SoundLayout } from "../engine/soundControls";
import { drawSwatch, fitSwatch, gridHeight, layoutGrid, layoutStrip, stripThemes, swatchAt, type Swatch } from "../engine/themePicker";
import { Effects } from "../engine/effects";
import { hudControls, hudRail, type ControlKind, type Controls, type HudRail } from "../engine/hudLayout";
import { ICONS } from "../engine/icons";
import { clearWave } from "../engine/clearWave";
import { ageRibbon, drawRibbon, pushRibbon, type RibbonPoint } from "../engine/ribbon";
import { intensityFor, popScale, TUNING } from "../engine/fxTuning";
import { drawMix } from "../engine/mixFx";
import { Tweens } from "../engine/tween";
import type { GameContext, Scene } from "./Scene";
import { TitleScene } from "./TitleScene";

type State = "rest" | "animation" | "menu" | "tutorial" | "lost";
type Animation = "none" | "fall" | "rotate" | "pop" | "combine" | "noadd" | "begin" | "push" | "fadeout";
type TutorialPhase = "intro" | "add" | "outro";

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------

/**
 * Playback rate of the feel layer relative to the durations below. 1 is the
 * tuned feel; higher is snappier.
 */
const ANIM_SPEED = 1;
const STEP_MS = 1000 / FPS;
/** Duration in ms after the playback rate. */
const D = (ms: number): number => ms / ANIM_SPEED;
/** Sim steps that cover `ms` of real time. */
const frames = (ms: number): number => Math.max(1, Math.round(D(ms) / STEP_MS));

/** Fall acceleration, px per sim step squared (the GML 1.7, sped up). */
const GRAVITY = 2.7 * ANIM_SPEED;

const PICK_MS = 90;
const DIM_MS = 120;
const WIPE_MS = 160;
const RING_MS = 220;
const NOADD_MS = 260;
const POP_GROW_MS = 70;
const POP_HOLD_MS = 30;
const POP_SHRINK_MS = 140;
const POP_STAGGER_MS = 20;
const POP_TOTAL_MS = POP_GROW_MS + POP_HOLD_MS + POP_SHRINK_MS;
const SHOCK_MS = 300;
const SCORE_MS = 600;
const LAND_SQUASH_MS = 60;
/** Tube brightness per 40 ms step after a landing: dark, hot, dark, bright, settle. */
const LAND_FLICKER = [0.3, 1.3, 0.45, 1.15, 0.85, 1] as const;
const LAND_SETTLE_MS = 160;
const ROTATE_ANTICIPATE_MS = 60;
const ROTATE_MS = 260;
const PUSH_ANTICIPATE_MS = 110;
const PUSH_MS = 220;
const FADE_MS = 180;
/** The HUD slides in from its edge over this long when a level opens (generated themes). */
const ARRIVE_MS = 420;
const CARD_MS = 420;
const COUNT_MS = 500;
const DESAT_MS = 400;
const BREATHE_MS = 1400;
/** Period of the group preview's shared breath. */
const PREVIEW_MS = 720;
/** Idle breathing of resting bricks: cycle length and amplitude (logical px). */
const IDLE_MS = 2600;
const IDLE_AMP = 0.9;
/** How long the backdrop and particles celebrate a level clear. */
const FLARE_MS = 1800;
/** How long a toast chip stays at the top of the board. */
const TOAST_MS = 2000;
/** Sim steps the level-complete card waits while the celebration plays. */
const CARD_HOLD_FRAMES = 18;

const ROTATE_FRAMES = frames(ROTATE_ANTICIPATE_MS + ROTATE_MS);
const PUSH_FRAMES = frames(PUSH_ANTICIPATE_MS + PUSH_MS);
const LEVEL_CARD_FRAMES = frames(2800);

// ---------------------------------------------------------------------------
// Scoring additions
// ---------------------------------------------------------------------------

/** `selected` value meaning "the brick in the hold slot". */
const HOLD = -1;
/** Frames at rest before a chain cools off completely. */
const CHAIN_DECAY_FRAMES = FPS * 2.5;
const MAX_MULTIPLIER = 5;
/** Bonus for popping a group that contains a refined (subtracted) brick. */
const REFINED_BONUS = 150;
/** One-time bonus for completing the level's subtract goal. */
const GOAL_BONUS = 500;
/**
 * Once the replenish line is full the push counts down for this fraction of a
 * replenish period. The original waited a full period to arm the push and
 * another to fire it; this arms it at once and fires sooner.
 */
const PUSH_COUNTDOWN = 0.6;
/** Upcoming replenish colours shown as ghosts in the empty slots. */
const PREVIEW_COUNT = 3;

// ---------------------------------------------------------------------------
// Feel-layer records
// ---------------------------------------------------------------------------

/** Per-brick cosmetic state driven by tweens; the sim never reads it. */
interface BrickFx {
  /** Uniform scale (pick-up lift, punches). */
  s: number;
  /** Squash / stretch. */
  sx: number;
  sy: number;
  rot: number;
  /** Offset from the interpolated sim position (slides, shakes). */
  dx: number;
  dy: number;
  /** 0 = resting, 1 = lifted (shadow grows, chip rises). */
  lift: number;
  /** Alpha multiplier (other replenish bricks dim while one is held). */
  dim: number;
  /** Game time the colour wipe started, or -1. */
  wipeT0: number;
  /** Game time the invalid-move shake started, or -1. */
  noaddT0: number;
  fallFrom: number;
  wasFalling: boolean;
  /** Game time the brick last landed, or -1 (tube flicker / pixel flash). */
  landT0: number;
}

interface DieAnim {
  x: number;
  y: number;
  color: Color;
  /** Game time this brick starts its pop (staggered within the group). */
  t0: number;
  burst: boolean;
  /** Rotation drift direction. */
  spin: number;
  /** Moment size 0..1 for the burst. */
  k: number;
  /** Part of the level-clear wave: a smaller burst. */
  wave?: boolean;
}

/** Paint left on the paper where a group popped. */
interface Stain {
  x: number;
  y: number;
  r: number;
  color: string;
  t0: number;
  dur: number;
  seed: number;
}

/** Floating label that pops in, rises and fades (scores, chain, bonuses). */
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

/** Sound, hit-stop, flash and shake for one scoring pop. */
interface PopImpact {
  k: number;
  mult: number;
  semitones: number;
  color: Color;
  dir: [number, number];
}

interface SideButton {
  kind: ControlKind;
  sprite: SpriteName;
  baseFrame: number;
  cx: number;
  cy: number;
  w: number;
  h: number;
  hilite: boolean;
  pressed: boolean;
}

/** Replenish / board colours for the six tutorial exercises (`board_populate_tutorial.gml`). */
const TUTORIAL_LEVELS: Array<{ board: Color; target: Color; replenish: Color; canAdd: boolean; canSubtract: boolean }> = [
  { board: GREEN, target: YELLOW, replenish: BLUE, canAdd: true, canSubtract: false },
  { board: ORANGE, target: YELLOW, replenish: RED, canAdd: true, canSubtract: false },
  { board: PURPLE, target: BLUE, replenish: RED, canAdd: true, canSubtract: false },
  { board: RED, target: ORANGE, replenish: YELLOW, canAdd: false, canSubtract: true },
  { board: YELLOW, target: GREEN, replenish: BLUE, canAdd: false, canSubtract: true },
  { board: RED, target: BLUE, replenish: PURPLE, canAdd: false, canSubtract: true },
];

const DEG = Math.PI / 180;
const ROTATE_EASE = backOut(0.95);
const PUSH_EASE = backOut(0.6);
const CARD_EASE = backOut(1.2);

/** Breathing room above the grid, around the fill timer and under the tray (generated themes only). */
const GENERATED_SPACING: LayoutSpacing = { top: 8, gap: 14, bottom: 14 };

function spacingFor(kind: "classic" | "generated"): LayoutSpacing {
  return kind === "generated" ? GENERATED_SPACING : NO_SPACING;
}

/** The board's viewport: the classic theme keeps its side rails even on an upright phone. */
function viewportFor(v: { w: number; h: number; portrait: boolean }, kind: "classic" | "generated"): Viewport {
  return { w: v.w, h: v.h, portrait: v.portrait && kind === "generated" };
}

/** A small chip that slides in at the top of the board for a moment: "Subtract goal done", "New high score". */
interface Toast {
  text: string;
  color: string;
  t0: number;
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

/** Where everything on the pause card sits this frame (already shifted by the slide-in offset). */
interface PauseLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  resume: PillButton;
  restart: PillButton;
  quit: PillButton;
  keep: PillButton;
  strip: Swatch[];
  all: { cx: number; cy: number; w: number; h: number };
  sound: SoundLayout;
  keycapsY: number;
  help: { cx: number; cy: number; d: number };
}

type MenuPage = "main" | "themes" | "help";

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
  /** Scoring pops since the meter last cooled off. */
  private chain = 0;
  /** 1 right after a pop, cooling to 0 at rest. */
  private heat = 0;

  // --- hold slot and preview ---
  private held: Brick | null = null;
  private holdHover = false;
  /** The group a drop on the hovered cell would complete, while a brick is selected. */
  private preview: { key: string; members: Set<Brick>; t0: number } | null = null;
  /** Vertical squash of the whole board about its bottom edge, for the push heave. */
  private readonly heaveFx = { sy: 1 };
  /** Trail behind the brick ghost being dragged across the board. */
  private ribbon: RibbonPoint[] = [];
  private ribbonColor = "#ffffff";
  /** Centre of the most recent scoring pop, where the level-clear wave starts. */
  private lastPopAt: { x: number; y: number } | null = null;
  private nextColors: Color[] = [];

  // --- subtract goal ---
  private subtractGoal = 0;
  /** What the goal ring fills toward: the level's pop quota, or the bricks a puzzle started with. */
  private popsTotal = 0;
  private bricksTotal = 0;
  /** Where this level's points came from, for the level-complete breakdown. */
  private readonly tally = { pops: 0, chain: 0, subtract: 0 };
  private bestChain = 1;
  private toasts: Toast[] = [];
  /** The last eight-step well level that ticked (pixel themes). */
  private wellStep = 0;
  private chargeBlipT = -1e9;
  /** How many level-card stars have chimed so far. */
  private starsSounded = 0;
  private hiToasted = false;
  private subtractDone = 0;
  private goalAwarded = false;

  private levelCompleteDelay = LEVEL_CARD_FRAMES;
  private levelCompleteSounded = false;
  private lostTimer = 0;

  // --- pause card ---
  private readonly sound = new SoundControls();
  private menuPage: MenuPage = "main";
  /** Quit was tapped once; the next tap quits. */
  private confirmQuit = false;
  /** A key has been used this run, so the pause card shows the keycap hints. */
  private keyboardUsed = false;
  private helpSlide = 0;
  private themeSwatches: Swatch[] = [];
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
  private readonly fx = new Map<number, BrickFx>();
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
      this.board.resize(4);
      this.selected = this.board.cellNum;
      this.selX = cellX(this.board.layout, this.selected);
      this.layoutButtons();
    }
  }

  cursor(): string {
    const inp = this.ctx.input;
    if (this.state === "lost" || this.state === "menu") {
      return this.overlayButtons().some((b) => inp.inCentered(b.cx, b.cy, b.w, b.h)) ? "pointer" : "default";
    }
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
      const art: Record<ControlKind, { sprite: SpriteName; frame: number }> = {
        pause: { sprite: "pause_button_sprite", frame: 0 },
        sound: { sprite: "sound_button_sprite", frame: 0 },
        ccw: { sprite: "rotate_button_sprite", frame: 0 },
        cw: { sprite: "rotate_button_sprite", frame: 2 },
        speed: { sprite: "speedup_button_sprite", frame: 0 },
      };
      this.buttons = c.buttons.map((b) => ({
        kind: b.kind,
        sprite: art[b.kind].sprite,
        baseFrame: art[b.kind].frame,
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

  /** Sim steps the push countdown lasts once the line is full. */
  private pushCountdown(): number {
    return this.replenishTimer * PUSH_COUNTDOWN;
  }

  private chainMultiplier(): number {
    return Math.max(1, Math.min(MAX_MULTIPLIER, this.chain));
  }

  private fxOf(b: Brick): BrickFx {
    let f = this.fx.get(b.id);
    if (!f) {
      f = { s: 1, sx: 1, sy: 1, rot: 0, dx: 0, dy: 0, lift: 0, dim: 1, wipeT0: -1, noaddT0: -1, fallFrom: 0, wasFalling: false, landT0: -1 };
      this.fx.set(b.id, f);
    }
    return f;
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
    this.replenishTimer = params.replenishTimer;
    this.comboRemaining = params.comboRemaining;
    this.popsTotal = params.comboRemaining;
    this.bricksTotal = params.brickCount;
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
        if (this.menuPage !== "main") this.menuPage = "main";
        else this.state = "rest";
        this.confirmQuit = false;
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
      const hit = this.overlayButtons().find((b) => inp.released && inp.inCentered(b.cx, b.cy, b.w, b.h));
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
        if (this.replenishNum === 0) {
          block = this.spawnReplenishBrick();
        }
        if (this.readyToPush) {
          if (this.replenishLine > this.pushCountdown()) {
            this.doPush();
            this.readyToPush = false;
            this.replenishLine = 0;
          }
        } else if (this.replenishLine > this.replenishTimer) {
          if (this.replenishNum < n) {
            block = this.spawnReplenishBrick();
            this.ctx.audio.event("fill");
          }
          this.replenishLine = 0;
        }
        if (block) {
          if (this.ctx.palette.kind === "generated") {
            // The paint has set: the brick pops into its well.
            const f = this.fxOf(block);
            this.tweens.set(f, { s: 0.2 });
            this.tweens.to(f, { s: 1 }, D(280), easeOutBack);
          } else {
            block.inactiveTimer = this.replenishTimer;
            block.inactiveDuration = this.replenishTimer;
          }
        }
        this.replenishNum = this.board.replenishList.length;
        if (this.replenishNum >= n && !this.readyToPush) {
          // The line is full: arm the push straight away.
          this.readyToPush = true;
          this.replenishLine = 0;
        }
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
      // The original held the timer whenever progress dropped below its
      // high-water mark (after every brick used), which read as a freeze.
      this.replenishLine += this.accel;
    }

    // The original only ran the timer at rest, so a fast player kept it
    // frozen behind their own combines and pops. Let it tick through board
    // animations too; spawning and pushing still wait for rest.
    if (this.state === "animation" && this.animation !== "push" && this.animation !== "begin" && this.animation !== "fadeout") {
      if (this.replenishLine < (this.readyToPush ? this.pushCountdown() : this.replenishTimer)) this.replenishLine += 1;
    }

    if (this.board.countBricks() + this.board.replenishList.length > 0) {
      this.currentPercentage =
        this.replenishLine !== 0
          ? (this.replenishNum - 1 + (this.readyToPush ? 1 : 0)) / n + this.replenishLine / (this.readyToPush ? this.pushCountdown() : this.replenishTimer) / n
          : 0;
    }
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
    this.replenishNum = 0;
    this.replenishLine = 0;
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

  private updateMenu(): void {
    if (this.menuPage === "themes") {
      this.updateThemesPage();
      return;
    }
    if (this.menuPage === "help") {
      this.updateHelp();
      return;
    }
    const inp = this.ctx.input;
    const L = this.pauseLayout(this.cardOffset());
    if (this.sound.update(this.ctx, L.sound)) return;
    if (!inp.released) return;
    const hit = (b: { cx: number; cy: number; w: number; h: number }) => inp.inCentered(b.cx, b.cy, b.w, b.h);
    const sw = swatchAt(L.strip, inp.x, inp.y);
    if (sw) {
      if (sw.name !== this.ctx.palette.name) {
        this.ctx.audio.event("tap");
        this.ctx.setTheme(sw.name);
      }
      return;
    }
    if (hit(L.resume)) {
      this.ctx.audio.event("tap");
      this.state = "rest";
      this.confirmQuit = false;
    } else if (this.confirmQuit && hit(L.quit)) {
      this.ctx.audio.event("tap");
      this.quitToTitle();
    } else if (this.confirmQuit && hit(L.keep)) {
      this.ctx.audio.event("tap");
      this.confirmQuit = false;
    } else if (!this.confirmQuit && hit(L.quit)) {
      this.ctx.audio.event("tap");
      this.confirmQuit = true;
    } else if (!this.confirmQuit && hit(L.restart)) {
      this.ctx.audio.event("tap");
      this.restartLevel();
    } else if (hit(L.all)) {
      this.ctx.audio.event("tap");
      this.menuPage = "themes";
      const T = this.themesPageLayout();
      this.themeSwatches = layoutGrid(THEME_ORDER, T.x + 24, T.y + 62, T.w - 48, T.size, T.gap, T.rowGap);
    } else if (hit({ cx: L.help.cx, cy: L.help.cy, w: L.help.d, h: L.help.d })) {
      this.ctx.audio.event("tap");
      this.menuPage = "help";
      this.helpSlide = 0;
    }
  }

  private updateThemesPage(): void {
    const inp = this.ctx.input;
    const T = this.themesPageLayout();
    if (inp.keysPressed.has("Enter")) {
      this.menuPage = "main";
      return;
    }
    if (!inp.released) return;
    const sw = swatchAt(this.themeSwatches, inp.x, inp.y);
    if (sw) {
      if (sw.name !== this.ctx.palette.name) {
        this.ctx.audio.event("tap");
        this.ctx.setTheme(sw.name);
      }
      return;
    }
    if (inp.inCentered(T.back.cx, T.back.cy, T.back.w, T.back.h) || !inp.inRect(T.x, T.y, T.w, T.h)) {
      this.ctx.audio.event("tap");
      this.menuPage = "main";
    }
  }

  /** The how-to-play slides from the pause card; the last "next" returns to the card. */
  private updateHelp(): void {
    const inp = this.ctx.input;
    const slides = this.ctx.sprites.tutorial_intro_sprite;
    const { x: sx, y: sy, w, h } = this.slideRect();
    const next = inp.keysPressed.has("ArrowRight") || inp.keysPressed.has("Enter") || (inp.pressed && inp.x > sx + w - h / 5 && inp.y > sy + h * 0.8);
    const back = inp.keysPressed.has("ArrowLeft") || (inp.pressed && inp.x < sx + h * 0.2 && inp.y > sy + h * 0.8);
    if (next) {
      this.ctx.audio.event("tap");
      if (this.helpSlide < slides.frames.length - 1) this.helpSlide++;
      else this.menuPage = "main";
    } else if (back) {
      this.ctx.audio.event("tap");
      if (this.helpSlide > 0) this.helpSlide--;
      else this.menuPage = "main";
    }
  }

  /** Where everything on the pause card sits, shifted by `off` while the card slides in. */
  private pauseLayout(off = 0): PauseLayout {
    const vp = this.ctx.view;
    const w = Math.min(460, vp.w - 24);
    const x = vp.w / 2 - w / 2;
    const inner = w - 48;
    const probe = this.sound.layout(0, 0, inner);
    const h = 300 + probe.h + (this.keyboardUsed ? 30 : 0) + 18;
    const y = Math.max(8, vp.h / 2 - h / 2) + off;
    const bw = (inner - 12) / 2;
    const size = 44;
    const count = w >= 440 ? 6 : 5;
    return {
      x,
      y,
      w,
      h,
      resume: { id: "resume", label: "Resume", cx: vp.w / 2, cy: y + 96, w: inner, h: 44, primary: true },
      restart: { id: "restart", label: "Restart level", cx: x + 24 + bw / 2, cy: y + 150, w: bw, h: 40 },
      quit: {
        id: "quit",
        label: this.confirmQuit ? "Yes, quit" : "Quit to title",
        cx: x + 24 + bw + 12 + bw / 2,
        cy: y + 150,
        w: bw,
        h: 40,
        primary: this.confirmQuit,
      },
      keep: { id: "keep", label: "Keep playing", cx: x + 24 + bw / 2, cy: y + 150, w: bw, h: 40 },
      strip: layoutStrip(stripThemes(this.ctx.palette.name, count), x + 24, y + 212, inner - 72, size, 10),
      all: { cx: x + w - 24 - 30, cy: y + 212 + size / 2, w: 64, h: 30 },
      sound: this.sound.layout(x + 24, y + 300, inner),
      keycapsY: y + 300 + probe.h + 22,
      help: { cx: x + w - 30, cy: y + 30, d: 30 },
    };
  }

  private themesPageLayout(): { x: number; y: number; w: number; h: number; size: number; gap: number; rowGap: number; back: PillButton } {
    const vp = this.ctx.view;
    const w = Math.min(600, vp.w - 24);
    const gap = 10;
    const size = fitSwatch(THEME_ORDER.length, w - 48, vp.h - 16 - (62 + 24 + 62), vp.w < 440 ? 50 : 56, gap, 0.64);
    const rowGap = size * 0.64;
    const gridH = gridHeight(THEME_ORDER.length, w - 48, size, gap, rowGap);
    const h = 62 + gridH + 24 + 62;
    const x = vp.w / 2 - w / 2;
    const y = Math.max(8, vp.h / 2 - h / 2);
    return { x, y, w, h, size, gap, rowGap, back: { id: "back", label: "Back", cx: vp.w / 2, cy: y + h - 34, w: 140, h: 38, primary: true } };
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
  private levelCardLayout(): { x: number; y: number; w: number; h: number; rows: number } {
    const vp = this.ctx.view;
    const rows = 2 + (this.subtractGoal > 0 || this.tally.subtract > 0 ? 1 : 0);
    const w = Math.min(420, vp.w - 24);
    const h = 128 + 22 + rows * 24 + 34 + 60 + 24;
    return { x: vp.w / 2 - w / 2, y: Math.max(8, vp.h / 2 - h / 2), w, h, rows };
  }

  /** Next, Replay and Title, Next as the primary. */
  private levelButtons(): PillButton[] {
    const L = this.levelCardLayout();
    const off = this.cardOffset();
    const gap = 8;
    const w = Math.min(120, (L.w - 48 - gap * 2) / 3);
    const h = 42;
    const y = L.y + L.h - 24 - h / 2 + off;
    const cx = L.x + L.w / 2;
    return [
      { id: "next", label: "Next", cx: cx - w - gap, cy: y, w, h, primary: true },
      { id: "replay", label: "Replay", cx, cy: y, w, h },
      { id: "title", label: "Title", cx: cx + w + gap, cy: y, w, h },
    ];
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
    let mult = 1;
    if (scoring) {
      this.chain += 1;
      this.heat = 1;
      mult = this.chainMultiplier();
    }
    const generated = pal.kind === "generated";
    const total = res.groups.reduce((n, g) => n + g.length, 0);
    const k = generated && scoring ? intensityFor(this.chain, total) : 0;

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
        this.fx.delete(b.id);
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
      if (g[0].color !== BLACK) {
        const value = res.brickValue * mult * g.length;
        this.addCallout(`+${value}`, cxg, cyg, {
          delay: gi * 40 + 100,
          size: Math.max(14, l.cellH * 0.34) * (1 + 0.12 * (mult - 1)),
          color: pal.callout,
          display: true,
        });
      }
    });

    // A pop rewinds the current well instead of pausing the timer (the
    // original banked a pause, which read as the timer freezing).
    if (!this.readyToPush) {
      const from = clamp01(this.replenishLine / this.replenishTimer);
      this.replenishLine = 0;
      this.maxPercentage = 0;
      this.tweens.set(this.levelFx, { v: from });
      this.tweens.to(this.levelFx, { v: 0 }, D(360), easeOutCubic);
      this.rewindUntil = t + D(360);
    }
    this.state = "animation";
    this.animation = "pop";

    let gained = res.score * mult;
    this.tally.pops += res.score;
    this.tally.chain += res.score * (mult - 1);
    this.bestChain = Math.max(this.bestChain, mult);
    if (scoring) {
      this.comboRemaining -= 1;
      const c0 = this.groupCentre(res.groups[0]);
      this.lastPopAt = c0;
      const impact: PopImpact = {
        k,
        mult,
        semitones: Math.min(7, this.chain - 1),
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

      const refined = res.groups.filter((g) => g[0].color !== BLACK && g.some((b) => b.refined));
      for (const g of refined) {
        const bonus = REFINED_BONUS * mult;
        gained += bonus;
        this.tally.subtract += bonus;
        this.subtractDone += 1;
        const c = this.groupCentre(g);
        this.addCallout(`SUBTRACT +${bonus}`, c.x, c.y + l.cellH * 1.05, { delay: 220, size: 15, color: pal.goalAccent, dur: 900, rise: 34 });
      }
      if (this.chain >= 2) {
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

      if (this.subtractGoal > 0 && !this.goalAwarded && this.subtractDone >= this.subtractGoal) {
        this.goalAwarded = true;
        gained += GOAL_BONUS;
        this.tally.subtract += GOAL_BONUS;
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
    this.ctx.session.score += gained;
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
      if (this.chain >= 2 || p.k > 0.25) this.effects.shake(sc.shake, p.dir);
      if (this.chain >= 3) this.effects.wash(pal.brickColors[p.color], 450 + 250 * p.k);
      this.lastK = p.k;
    } else if (this.chain >= 3) {
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
          this.menuPage = "main";
          this.confirmQuit = false;
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
    const rules = this.state === "tutorial" ? TUTORIAL_LEVELS[this.ctx.session.level] : undefined;
    const p = groupIfPlaced(this.board, sel.color, gx, gy, rules?.canAdd ?? true, rules?.canSubtract ?? true);
    this.preview = p && p.members.length >= POP_GROUP_SIZE ? { key, members: new Set(p.members), t0: this.ctx.clock.t } : null;
  }

  /** 0..1 shared breath of the previewed group. */
  private previewBreath(): number {
    return 0.5 - 0.5 * Math.cos((this.ctx.clock.t / D(PREVIEW_MS)) * Math.PI * 2);
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
      this.replenishNum = list.length;
      if (this.replenishNum < this.board.cellNum) this.readyToPush = false;
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
      const spec = TUTORIAL_LEVELS[level];
      // The final exercise only accepts the blue brick as a target.
      if (level === 5) {
        if (dest && dest.color !== BLUE) return;
      }
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
        this.replenishNum = this.board.replenishList.length;
        this.readyToPush = false;
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
    if (this.readyToPush) return 0;
    const rewinding = this.ctx.clock.t < this.rewindUntil;
    const smooth = rewinding ? this.levelFx.v : clamp01(this.replenishLine / this.replenishTimer);
    return this.ctx.palette.pixelated ? Math.floor(smooth * 8) / 8 : smooth;
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
    const inp = this.ctx.input;
    const slides = this.tutorialPhase === "intro" ? this.ctx.sprites.tutorial_intro_sprite : this.ctx.sprites.tutorial_outro_sprite;
    const { x: sx, y: sy, w, h } = this.slideRect();
    const next = inp.keysPressed.has("ArrowRight") || inp.keysPressed.has("Enter") || (inp.pressed && inp.x > sx + w - h / 5 && inp.y > sy + h * 0.8);
    const back = inp.keysPressed.has("ArrowLeft") || (inp.pressed && inp.x < sx + h * 0.2 && inp.y > sy + h * 0.8);

    if (next) {
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
    } else if (back && this.tutorialState > 0) {
      this.ctx.audio.event("tap");
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
    this.effects.setBleed(mult >= 3 && this.heat > 0 ? pal.multColors[mult] : null, this.heat);
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
      this.fx.delete(b.id);
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

    const silhouette = this.effects.silhouette;
    if (silhouette) {
      this.renderImpactFrame(g, silhouette);
      return;
    }

    g.save();
    this.effects.applyShake(g, this.ctx.view.w / 2, this.ctx.view.h / 2);

    this.renderBackground(g);
    this.effects.renderUnder(g);
    if (world !== 0) {
      this.renderButtons(g);
      this.renderPreview(g);
    }

    const l = this.board.layout;
    const boardBricks = [...this.board.bricks()];
    const lineBricks = this.board.replenishList.filter((b) => b !== this.selectedBrick);
    const desat = this.lostFx.desat;

    // Board bricks, as one transform while rotating.
    g.save();
    this.applyBoardTransform(g);
    if (desat > 0) g.filter = `saturate(${Math.round((1 - desat * 0.9) * 100)}%)`;
    if (pal.brickStyle !== "flat") for (const b of boardBricks) this.renderShadow(g, b);
    for (const b of boardBricks) this.renderBrick(g, b);
    if (pal.fuse) this.renderSeams(g, boardBricks);
    if (this.preview) this.renderPreviewLinks(g);
    for (const d of this.dieAnims) this.renderDieAnim(g, d);
    g.filter = "none";
    g.restore();

    // Replenish line.
    if (pal.brickStyle !== "flat") for (const b of lineBricks) this.renderShadow(g, b);
    for (const b of lineBricks) this.renderBrick(g, b);
    this.effects.renderWorld(g);

    if (world !== 0) this.renderHoldSlot(g);
    if (this.selectedBrick && this.selectedBrick !== this.held) {
      if (pal.kind === "generated") this.renderHeldGlow(g, this.selectedBrick);
      if (pal.brickStyle !== "flat") this.renderShadow(g, this.selectedBrick);
      this.renderBrick(g, this.selectedBrick);
    }

    this.effects.renderWash(g, l.boardX, l.boardY, l.boardW, l.boardH);
    this.effects.renderFlash(g, l.boardX, l.boardY, l.boardW, l.boardH);

    this.renderSelector(g);
    this.renderCallouts(g);
    this.renderToasts(g);
    if (world > 0 && this.state !== "tutorial") this.renderHud(g);
    this.effects.renderVignette(g);
    g.restore();

    if (this.state === "animation" && this.animation === "fadeout") this.renderLevelComplete(g);
    if (this.state === "menu") this.renderMenu(g);
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

  /** Fade from the background colour when the scene starts. */
  private renderFade(g: CanvasRenderingContext2D): void {
    if (this.ctx.palette.kind !== "classic") return;
    const e = this.ctx.clock.t - this.fadeT0;
    if (e >= D(FADE_MS)) return;
    g.globalAlpha = 1 - clamp01(e / D(FADE_MS));
    fillScreen(g, this.ctx.palette.background);
    g.globalAlpha = 1;
  }

  /** Anticipation squeeze, then the quarter turn with a small overshoot. */
  private applyBoardTransform(g: CanvasRenderingContext2D): void {
    if (this.heaveFx.sy !== 1) {
      const bottom = gridBottom(this.board.layout);
      g.translate(0, bottom);
      g.scale(1, this.heaveFx.sy);
      g.translate(0, -bottom);
    }
    if (this.rotateT0 < 0) return;
    const l = this.board.layout;
    const n = l.cellNum;
    const e = this.ctx.clock.t - this.rotateT0;
    const cx = l.boardX + (n * (l.cellW + l.cellSep) - l.cellSep) / 2;
    const cy = l.boardY + (n * (l.cellH + l.cellSep) - l.cellSep) / 2;
    let scale: number;
    let angle: number;
    const a0 = D(ROTATE_ANTICIPATE_MS);
    if (e < a0) {
      scale = 1 - 0.03 * easeOutCubic(e / a0);
      angle = -this.rotateDir * Math.PI * 0.5;
    } else {
      const q = clamp01((e - a0) / D(ROTATE_MS));
      scale = 0.97 + 0.03 * easeOutCubic(q);
      angle = -this.rotateDir * Math.PI * 0.5 * (1 - ROTATE_EASE(q));
    }
    g.translate(cx, cy);
    g.rotate(angle);
    g.scale(scale, scale);
    g.translate(-cx, -cy);
  }

  /** Soft pulsing halo in the brick's own colour while it is picked up. */
  private renderHeldGlow(g: CanvasRenderingContext2D, b: Brick): void {
    const l = this.board.layout;
    const f = this.fxOf(b);
    const p = this.drawPos(b, f);
    const s = this.brickScale(b, f);
    if (s <= 0.02) return;
    const colour = this.ctx.palette.brickColors[b.color];
    const pulse = 0.5 + 0.5 * Math.sin(this.ctx.clock.t / 170);
    const w = l.cellW * s;
    const h = l.cellH * s;
    const cx = p.x + l.cellW / 2;
    const cy = p.y + l.cellH / 2;
    g.save();
    g.shadowColor = colour;
    g.shadowBlur = l.cellW * (0.3 + 0.25 * pulse);
    g.globalAlpha = 0.4 + 0.4 * pulse;
    fillRoundRect(g, cx - w / 2, cy - h / 2, w, h, l.cellW * 0.18, colour);
    g.restore();
  }

  /** Where a brick is drawn this frame: interpolated sim position plus feel-layer offsets. */
  private drawPos(b: Brick, f: BrickFx): { x: number; y: number } {
    const alpha = this.ctx.clock.alpha;
    const x = lerp(b.prevX, b.spriteX, alpha) + f.dx;
    let y = lerp(b.prevY, b.spriteY, alpha) + f.dy - 4 * f.lift;
    // Resting bricks breathe by under a pixel on a slow stagger so a quiet board still feels alive.
    if (this.ctx.palette.kind === "generated" && b.gridX >= 0 && b !== this.selectedBrick && this.state !== "lost") {
      y += Math.sin((this.ctx.clock.t / IDLE_MS) * Math.PI * 2 + b.gridX * 0.9 + b.gridY * 1.7) * IDLE_AMP;
    }
    if (this.pushT0 >= 0 && b.gridX >= 0) {
      const l = this.board.layout;
      const pitch = l.cellH + l.cellSep;
      const e = this.ctx.clock.t - this.pushT0;
      const a0 = D(PUSH_ANTICIPATE_MS);
      if (e < a0) {
        y += pitch + (b.gridY === l.cellNum - 1 ? 2 * Math.sin((e / a0) * Math.PI * 4) : 0);
      } else {
        // Generated themes let the columns lag a little so the push rolls across the board.
        const lag = this.ctx.palette.kind === "generated" ? b.gridX * D(14) : 0;
        y += pitch * (1 - PUSH_EASE(clamp01((e - a0 - lag) / D(PUSH_MS))));
      }
    }
    return { x, y };
  }

  private brickScale(b: Brick, f: BrickFx): number {
    const grow = b.inactiveDuration ? easeOutCubic(1 - b.inactiveTimer / b.inactiveDuration) : 1;
    let s = grow * f.s;
    if (b === this.selectedBrick) s *= 1 + 0.015 * (1 - Math.cos((this.ctx.clock.t / D(BREATHE_MS)) * Math.PI * 2));
    if (this.preview?.members.has(b)) s *= 1 + 0.04 * this.previewBreath();
    return s;
  }

  private noaddOffset(f: BrickFx): number {
    if (f.noaddT0 < 0) return 0;
    const e = this.ctx.clock.t - f.noaddT0;
    const p = clamp01(e / D(NOADD_MS));
    if (p >= 1) return 0;
    return 6 * Math.sin((e / 1000) * Math.PI * 2 * 18) * (1 - p);
  }

  /** Extrusion depth of a toy brick: deeper when lifted, squashed on landing. */
  private depthOf(f: BrickFx): number {
    const base = 6 + 4 * f.lift;
    return lerp(3, base, clamp01((f.sy - 0.85) / 0.15));
  }

  /**
   * What sits under a brick: a hard offset shadow for paint chips, or the
   * ambient shadow plus the extruded side for toy bricks. Both grow when the
   * brick is lifted.
   */
  private renderShadow(g: CanvasRenderingContext2D, b: Brick): void {
    const l = this.board.layout;
    const f = this.fxOf(b);
    const p = this.drawPos(b, f);
    const s = this.brickScale(b, f);
    if (s <= 0.02) return;
    const pal = this.ctx.palette;
    const pad = l.cellW * 0.04;
    const w = (l.cellW - pad * 2) * s * f.sx;
    const h = (l.cellH - pad * 2) * s * f.sy;
    const cx = p.x + l.cellW / 2 + this.noaddOffset(f);
    const faceCy = p.y + l.cellH / 2;
    const groundCy = faceCy + 4 * f.lift;
    g.globalAlpha = f.dim;
    if (pal.brickStyle === "chip" && pal.brickShadow) {
      const sw = l.cellW * s * (1.1 + 0.3 * f.lift);
      g.globalAlpha = f.dim * (0.45 + 0.55 * f.lift);
      drawSprite(g, this.ctx.sprites.brick_shadow_sprite, 0, cx - sw / 2, groundCy - sw / 2 + 7 + 10 * f.lift, sw, sw);
      g.globalAlpha = f.dim;
      fillRoundRect(g, cx - w / 2, groundCy - h / 2 + 4 + 6 * f.lift, w, h, w * 0.18, pal.brickShadow);
    } else if (pal.brickStyle === "gel") {
      // Outer bloom at 25% of the colour, stronger while lifted.
      const gw = l.cellW * 1.4 * s;
      g.globalAlpha = f.dim * (0.5 + 0.5 * f.lift);
      drawSprite(g, this.ctx.sprites.brick_glow_sprite, colorFrame(b.color), cx - gw / 2, faceCy - gw / 2, gw, gw);
    } else if (pal.brickStyle === "extruded" && pal.brickSide) {
      const spread = s * (1 + 0.14 * f.lift);
      const sw = l.cellW * spread;
      drawSprite(g, this.ctx.sprites.brick_shadow_sprite, 0, cx - sw / 2, groundCy - sw / 2 + 8 + 4 * f.lift, sw, sw);
      fillRoundRect(g, cx - w / 2, faceCy - h / 2 + this.depthOf(f), w, h, w * 0.2, pal.brickSide[b.color]);
    }
    g.globalAlpha = 1;
  }

  /** A brick sitting still in its cell, wearing its own colour. */
  private settled(b: Brick): boolean {
    if (b.gridX < 0 || b.spriteColor !== b.color) return false;
    const f = this.fxOf(b);
    if (f.lift > 0 || f.noaddT0 >= 0 || this.brickScale(b, f) < 0.98) return false;
    const l = this.board.layout;
    const p = this.drawPos(b, f);
    const slack = l.cellW * 0.08;
    return Math.abs(p.x - cellX(l, b.gridX)) < slack && Math.abs(p.y - cellY(l, b.gridY)) < slack;
  }

  /**
   * Fused seams: settled bricks of one colour lose the lead between them,
   * so a growing group reads as one pane. Drawn after the faces, before
   * anything that moves.
   */
  /** Faint links between the bricks a drop would pop together, pulsing with their shared breath. */
  private renderPreviewLinks(g: CanvasRenderingContext2D): void {
    const pv = this.preview;
    if (!pv) return;
    const l = this.board.layout;
    const fadeIn = clamp01((this.ctx.clock.t - pv.t0) / D(140));
    const col = this.ctx.palette.ring;
    const w = Math.max(2, l.cellW * 0.07);
    const centre = (b: Brick) => {
      const p = this.drawPos(b, this.fxOf(b));
      return { x: p.x + l.cellW / 2, y: p.y + l.cellH / 2 };
    };
    g.save();
    g.globalAlpha = fadeIn * (0.26 + 0.24 * this.previewBreath());
    g.fillStyle = col;
    for (const b of pv.members) {
      const c = centre(b);
      for (const nb of [this.board.get(b.gridX + 1, b.gridY), this.board.get(b.gridX, b.gridY + 1)]) {
        if (!nb || !pv.members.has(nb)) continue;
        const d = centre(nb);
        drawLine(g, c.x, c.y, d.x, d.y, w, col);
      }
      g.beginPath();
      g.arc(c.x, c.y, w * 0.9, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  /**
   * The impact frame: for a couple of frames at a huge pop the scene is flat
   * ink on the popped colour, every brick a solid block, before the normal
   * burst plays.
   */
  private renderImpactFrame(g: CanvasRenderingContext2D, paper: string): void {
    const l = this.board.layout;
    fillScreen(g, paper);
    const ink = "#15120F";
    const pad = l.cellW * 0.04;
    const box = (x: number, y: number, s = 1) => {
      const w = (l.cellW - pad * 2) * s;
      const h = (l.cellH - pad * 2) * s;
      fillRoundRect(g, x + l.cellW / 2 - w / 2, y + l.cellH / 2 - h / 2, w, h, l.cellW * 0.18, ink);
    };
    g.save();
    this.applyBoardTransform(g);
    for (const b of this.board.bricks()) {
      const p = this.drawPos(b, this.fxOf(b));
      box(p.x, p.y);
    }
    for (const d of this.dieAnims) if (!d.burst) box(d.x, d.y, 1.18);
    g.restore();
    for (const b of this.board.replenishList) {
      const p = this.drawPos(b, this.fxOf(b));
      box(p.x, p.y);
    }
    if (this.held) {
      const p = this.drawPos(this.held, this.fxOf(this.held));
      box(p.x, p.y);
    }
    g.fillStyle = ink;
    g.fillRect(l.boardX, replenishY(l) - l.cellSep * 1.5, l.boardW, Math.max(2, l.cellSep * 0.6));
  }

  private renderSeams(g: CanvasRenderingContext2D, bricks: Brick[]): void {
    const l = this.board.layout;
    const pal = this.ctx.palette;
    const across = l.cellSep + l.cellW * 0.2;
    const along = l.cellW * 0.52;
    for (const b of bricks) {
      if (!this.settled(b)) continue;
      const color = pal.brickColors[b.color];
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
      ] as const) {
        const nb = this.board.get(b.gridX + dx, b.gridY + dy);
        if (!nb || nb.color !== b.color || !this.settled(nb)) continue;
        const cx = (cellX(l, b.gridX) + cellX(l, nb.gridX) + l.cellW) / 2;
        const cy = (cellY(l, b.gridY) + cellY(l, nb.gridY) + l.cellH) / 2;
        const w = dx ? across : along;
        const h = dx ? along : across;
        g.fillStyle = color;
        g.fillRect(cx - w / 2, cy - h / 2, w, h);
        g.fillStyle = "rgba(255,255,255,0.1)";
        g.fillRect(cx - w / 2, cy - h / 2, w, h);
      }
    }
  }

  /** `Brick` draw event, plus the refined marker. */
  private renderBrick(g: CanvasRenderingContext2D, b: Brick): void {
    const l = this.board.layout;
    const f = this.fxOf(b);
    const p = this.drawPos(b, f);
    const s = this.brickScale(b, f);
    if (s <= 0.02) return;
    const sp = this.ctx.sprites;
    const brick = sp.brick_sprite;
    const xo = this.noaddOffset(f);
    const xs = s * f.sx;
    const ys = s * f.sy;
    const alpha = f.dim;
    const t = this.ctx.clock.t;

    const wiping = b.spriteColor !== b.color && f.wipeT0 >= 0;
    if (wiping && this.ctx.palette.fx.mix !== "wipe") {
      const pal = this.ctx.palette;
      const q = clamp01((t - f.wipeT0) / D(WIPE_MS));
      const w = l.cellW * xs;
      const h = l.cellH * ys;
      g.save();
      g.translate(p.x + l.cellW / 2 + xo, p.y + l.cellH / 2);
      g.rotate(f.rot);
      g.globalAlpha *= alpha;
      drawMix(g, pal.fx.mix, w, q, pal.brickColors[b.spriteColor], pal.brickColors[b.color], {
        old: () => drawSprite(g, brick, colorFrame(b.spriteColor), -w / 2, -h / 2, w, h),
        next: () => drawSprite(g, brick, colorFrame(b.color), -w / 2, -h / 2, w, h),
      });
      g.restore();
    } else if (wiping) {
      // Radial wipe: the new colour grows out of the centre over the old one.
      const q = easeOutCubic(clamp01((t - f.wipeT0) / D(WIPE_MS)));
      drawBlockTransformed(g, brick, colorFrame(b.spriteColor), p.x, p.y, l.cellW, l.cellH, xs, ys, f.rot, xo, 0, alpha);
      g.save();
      g.beginPath();
      g.arc(p.x + l.cellW / 2 + xo, p.y + l.cellH / 2, l.cellW * 0.78 * q * xs, 0, Math.PI * 2);
      g.clip();
      drawBlockTransformed(g, brick, colorFrame(b.color), p.x, p.y, l.cellW, l.cellH, xs, ys, f.rot, xo, 0, alpha);
      g.restore();
    } else {
      drawBlockTransformed(g, brick, colorFrame(b.color), p.x, p.y, l.cellW, l.cellH, xs, ys, f.rot, xo, 0, alpha);
    }

    if (f.landT0 >= 0) this.renderLanding(g, f, t - f.landT0, p.x + l.cellW / 2 + xo, p.y + l.cellH / 2, xs, ys, f.rot, alpha);

    if (f.noaddT0 >= 0) {
      const e = t - f.noaddT0;
      const tint = e < D(100) ? 0.2 * (1 - e / D(100)) : 0;
      if (tint > 0) {
        const pad = l.cellW * 0.04;
        g.globalAlpha = tint;
        fillRoundRect(g, p.x + pad + xo, p.y + pad, (l.cellW - pad * 2) * xs, (l.cellH - pad * 2) * ys, l.cellW * 0.18, "#E04A3F");
        g.globalAlpha = 1;
      }
    }

    if (b.refined && !wiping) {
      this.drawSpark(g, p.x + l.cellW * 0.78 + xo, p.y + l.cellH * 0.22, l.cellW * 0.085 * s);
    }
  }

  /**
   * What a landing brick does besides the squash. Neon's tube strikes: dark,
   * a hot flash, dark again, then steady. Pixel's brick is solid white for
   * one frame.
   */
  private renderLanding(g: CanvasRenderingContext2D, f: BrickFx, e: number, cx: number, cy: number, xs: number, ys: number, rot: number, alpha: number): void {
    const pal = this.ctx.palette;
    const l = this.board.layout;
    const kind = pal.fx.landFx;
    let over: number;
    let color = "#ffffff";
    if (kind === "flash") {
      if (e >= D(40)) {
        f.landT0 = -1;
        return;
      }
      over = 0.92;
    } else if (kind === "flicker") {
      if (e >= D(240)) {
        f.landT0 = -1;
        return;
      }
      const on = LAND_FLICKER[Math.min(LAND_FLICKER.length - 1, Math.floor(e / D(40)))];
      if (on < 1) {
        over = 1 - on;
        color = pal.background;
      } else {
        over = on - 1;
      }
    } else {
      return;
    }
    if (over <= 0.01) return;
    const pad = l.cellW * 0.04;
    g.save();
    g.translate(cx, cy);
    g.rotate(rot);
    g.scale(xs, ys);
    g.globalAlpha = over * alpha;
    fillRoundRect(g, -l.cellW / 2 + pad, -l.cellH / 2 + pad, l.cellW - pad * 2, l.cellH - pad * 2, pal.pixelated ? 0 : l.cellW * 0.18, color);
    g.restore();
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
    const pal = this.ctx.palette;
    // while a bespoke well fill is showing the next colour, its ghost would only sit on top of it
    const bespoke = pal.timer === "wells" && furnitureOf(pal).fill !== undefined && this.wellLevel() > 0;
    for (let k = bespoke ? 1 : 0; k < PREVIEW_COUNT; k++) {
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
    if (pal.kind === "generated") {
      // Dashed while empty, so it reads as a place to put something.
      g.save();
      if (!this.held) g.setLineDash([6, 5]);
      fillRoundRect(g, x, y, r.slot, r.slot, 10, active ? pal.wellActive : pal.well, active ? pal.wellActiveEdge : pal.wellEdge, this.held ? 1.5 : 2);
      g.restore();
      drawText(g, "HOLD", r.holdLabelX, r.holdLabelY, { size: Math.max(10, r.textSize * 0.62), color: pal.hudMuted, weight: 700, align: r.holdLabelAlign });
      if (this.keyboardUsed && !l.portrait) this.drawKeycap(g, "H", r.holdLabelX + r.side * 11, r.holdLabelY - 22);
    } else {
      drawSprite(g, this.ctx.sprites.replenish_frame_sprite, 0, x - 2, y - 2, r.slot + 4, r.slot + 4);
      if (active) fillRoundRect(g, x, y, r.slot, r.slot, 4, "rgba(255,255,255,0.18)");
      drawText(g, "Hold", r.cx, r.holdLabelY, { size: 12, color: pal.hudMuted, bold: false });
    }
    if (!this.held) {
      if (pal.kind === "generated") {
        g.save();
        g.strokeStyle = pal.wellHint;
        g.fillStyle = pal.wellHint;
        ICONS.hold(g, r.cx, r.holdY, r.slot * 0.27);
        g.restore();
      } else {
        drawText(g, "H", r.cx, r.holdY, { size: r.slot * 0.4, color: pal.wellHint, bold: true });
      }
      return;
    }
    const b = this.held;
    const f = this.fxOf(b);
    const p = this.drawPos(b, f);
    const s = (r.slot / l.cellW) * this.brickScale(b, f);
    const sel = this.selectedBrick === b;
    const xo = this.noaddOffset(f);
    if (pal.brickStyle === "chip" && pal.brickShadow) {
      const pad = l.cellW * 0.04;
      const w = (l.cellW - pad * 2) * s;
      fillRoundRect(g, p.x + l.cellW / 2 - w / 2 + xo, p.y + l.cellH / 2 - w / 2 + 4 + 6 * f.lift, w, w, w * 0.18, pal.brickShadow);
    } else if (pal.brickStyle === "extruded" && pal.brickSide) {
      const pad = l.cellW * 0.04;
      const w = (l.cellW - pad * 2) * s;
      fillRoundRect(g, p.x + l.cellW / 2 - w / 2 + xo, p.y + l.cellH / 2 - w / 2 + this.depthOf(f) * s, w, w, w * 0.2, pal.brickSide[b.color]);
    } else if (pal.brickStyle === "gel") {
      const gw = l.cellW * 1.4 * s;
      g.globalAlpha = 0.5 + 0.5 * f.lift;
      drawSprite(g, this.ctx.sprites.brick_glow_sprite, colorFrame(b.color), p.x + l.cellW / 2 - gw / 2 + xo, p.y + l.cellH / 2 - gw / 2, gw, gw);
      g.globalAlpha = 1;
    }
    if (sel) drawBlock(g, this.ctx.sprites.replenish_selector_sprite, 7, p.x, p.y, l.cellW, l.cellH, s * 1.1, s * 1.1, xo);
    drawBlock(g, this.ctx.sprites.brick_sprite, colorFrame(b.color), p.x, p.y, l.cellW, l.cellH, s, s, xo);
    if (sel) drawBlock(g, this.ctx.sprites.replenish_selector_sprite, colorFrame(b.color), p.x, p.y, l.cellW, l.cellH, s * 1.1, s * 1.1, xo);
    if (b.refined) this.drawSpark(g, p.x + l.cellW / 2 + r.slot * 0.28 + xo, p.y + l.cellH / 2 - r.slot * 0.28, r.slot * 0.085);
  }

  private renderCallouts(g: CanvasRenderingContext2D): void {
    if (this.callouts.length === 0) return;
    const t = this.ctx.clock.t;
    const pal = this.ctx.palette;
    g.save();
    for (const c of this.callouts) {
      const e = t - c.t0;
      if (e < 0) continue;
      const p = clamp01(e / c.dur);
      const scale = 0.6 + 0.4 * easeOutBack(clamp01(e / D(120)));
      const fadeLen = D(200) / c.dur;
      const alpha = p > 1 - fadeLen ? (1 - p) / fadeLen : 1;
      const y = c.y - c.rise * easeOutCubic(p);
      g.save();
      g.translate(c.x, y);
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
    g.restore();
  }

  /** Pop: grow, hold, shrink away with a little spin. The particles burst as the shrink starts. */
  private renderDieAnim(g: CanvasRenderingContext2D, d: DieAnim): void {
    const l = this.board.layout;
    const sp = this.ctx.sprites;
    const grow = D(POP_GROW_MS);
    const hold = D(POP_HOLD_MS);
    const shrink = D(POP_SHRINK_MS);
    let e = this.ctx.clock.t - d.t0;
    if (this.ctx.palette.fx.stepped && e > 0) {
      // four stepped frames instead of a tween
      const step = (grow + hold + shrink) / 4;
      e = Math.min(grow + hold + shrink, Math.floor(e / step) * step + 1);
    }
    if (this.ctx.palette.fx.unravel && e > 0) {
      this.renderUnravel(g, d, e / (grow + hold + shrink));
      return;
    }
    const q = clamp01((e - grow - hold) / shrink);
    const s = e <= 0 ? 1 : e < grow ? 1 + 0.18 * easeOutCubic(e / grow) : e < grow + hold ? 1.18 : 1.18 * (1 - easeInBack(q));
    const rot = e < grow + hold ? 0 : d.spin * 8 * DEG * q;
    if (s <= 0.02) return;
    const pal = this.ctx.palette;
    const pad = l.cellW * 0.04;
    const w = (l.cellW - pad * 2) * s;
    let hop = 0;
    if (pal.brickStyle === "chip" && pal.brickShadow) {
      const sw = l.cellW * s * 1.1;
      g.globalAlpha = 0.45;
      drawSprite(g, sp.brick_shadow_sprite, 0, d.x + l.cellW / 2 - sw / 2, d.y + l.cellH / 2 - sw / 2 + 7, sw, sw);
      g.globalAlpha = 1;
      fillRoundRect(g, d.x + l.cellW / 2 - w / 2, d.y + l.cellH / 2 - w / 2 + 4, w, w, w * 0.18, pal.brickShadow);
    } else if (pal.brickStyle === "extruded" && pal.brickSide) {
      // Toy bricks hop up as their extrusion collapses, then shrink in the air.
      const rise = e <= 0 ? 0 : e < grow ? easeOutCubic(e / grow) : 1;
      hop = 6 * rise;
      const depth = 6 * (1 - rise);
      const sw = l.cellW * s;
      drawSprite(g, sp.brick_shadow_sprite, 0, d.x + l.cellW / 2 - sw / 2, d.y + l.cellH / 2 - sw / 2 + 8, sw, sw);
      if (depth > 0.5) fillRoundRect(g, d.x + l.cellW / 2 - w / 2, d.y + l.cellH / 2 - w / 2 - hop + depth, w, w, w * 0.2, pal.brickSide[d.color]);
    }
    if (pal.brickStyle === "gel") {
      const gw = l.cellW * 1.4 * s;
      g.globalAlpha = 0.5;
      drawSprite(g, sp.brick_glow_sprite, colorFrame(d.color), d.x + l.cellW / 2 - gw / 2, d.y + l.cellH / 2 - gw / 2, gw, gw);
      g.globalAlpha = 1;
    }
    const fading = pal.fx.fragments && e > grow + hold;
    drawBlockTransformed(g, sp.brick_sprite, colorFrame(d.color), d.x, d.y - hop, l.cellW, l.cellH, s, s, rot, 0, 0, fading ? 1 - q : 1);
    if ((pal.brickStyle === "gel" || pal.fx.popFlash) && e >= grow && e < grow + hold + D(40)) {
      // Flare to white just before the shrink.
      const q = clamp01((e - grow) / (hold + D(40)));
      g.globalAlpha = 0.95 * (1 - q * 0.6);
      fillRoundRect(g, d.x + l.cellW / 2 - w / 2, d.y + l.cellH / 2 - w / 2 - hop, w, w, w * 0.22, "#ffffff");
      g.globalAlpha = 1;
    }
  }

  /**
   * A knitted square comes undone: rows unravel from the top, each pulling
   * out from its right end as a wavy strand, and what is left fades as the
   * yarn debris takes over.
   */
  private renderUnravel(g: CanvasRenderingContext2D, d: DieAnim, u: number): void {
    const l = this.board.layout;
    const sp = this.ctx.sprites;
    const rows = 4;
    const rowH = l.cellH / rows;
    const progress = Math.min(u, 1) * rows;
    const gone = Math.min(rows - 1, Math.floor(progress));
    const within = progress - gone;
    const rowTop = d.y + gone * rowH;
    const alpha = u > 0.7 ? Math.max(0, 1 - (u - 0.7) / 0.3) : 1;
    if (alpha <= 0) return;
    const pad = l.cellW * 0.04;
    g.save();
    g.beginPath();
    // what is still knitted: the rows below, plus the shortening row being pulled out
    g.rect(d.x - 2, rowTop + rowH, l.cellW + 4, l.cellH - (gone + 1) * rowH + 2);
    g.rect(d.x - 2, rowTop, Math.max(0, l.cellW * (1 - within) + 2 - pad), rowH + 0.5);
    g.clip();
    drawBlockTransformed(g, sp.brick_sprite, colorFrame(d.color), d.x, d.y, l.cellW, l.cellH, 1, 1, 0, 0, 0, alpha);
    g.restore();
    // the strand: from the end of the row out to the right and up, longer with every row gone
    const t = this.ctx.clock.t;
    const sx = d.x + l.cellW * (1 - within);
    const sy = rowTop + rowH / 2;
    const len = l.cellW * (0.35 + 0.65 * within + 0.4 * gone);
    g.save();
    g.globalAlpha = alpha;
    g.strokeStyle = this.ctx.palette.brickColors[d.color];
    g.lineWidth = Math.max(1.5, rowH * 0.32);
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(sx, sy);
    g.bezierCurveTo(sx + len * 0.4, sy + Math.sin(t / 40) * rowH * 0.6, sx + len * 0.7, sy - len * 0.5, sx + len, sy - len * 0.55 + Math.cos(t / 55) * 2);
    g.stroke();
    g.restore();
  }

  /** `ReplenishSelector` draw event. */
  private renderSelector(g: CanvasRenderingContext2D): void {
    const sp = this.ctx.sprites;
    const l = this.board.layout;
    const sel = sp.replenish_selector_sprite;
    const frame = this.selectedBrick ? colorFrame(this.selectedBrick.color) : 6;
    const ry = replenishY(l);
    const t = this.ctx.clock.t;

    if (this.selected !== this.board.cellNum && this.selected !== HOLD) {
      const sb = this.selectedBrick;
      const f = sb ? this.fxOf(sb) : null;
      const ss = 1.1 * this.selFx.s * (sb && f ? this.brickScale(sb, f) : 1);
      const lift = f ? -4 * f.lift : 0;
      drawBlock(g, sel, 7, this.selX, ry, l.cellW, l.cellH, ss, ss, 0, lift);
      drawBlock(g, sel, frame, this.selX, ry, l.cellW, l.cellH, ss, ss, 0, lift);
      const flash = t - this.selFlashT0;
      if (flash < D(200)) {
        g.globalAlpha = 1 - flash / D(200);
        fillRoundRect(g, this.selX - l.cellW * 0.05, ry - l.cellH * 0.05, l.cellW * 1.1, l.cellH * 1.1, l.cellW * 0.2, "rgba(0,0,0,0)", "#E04A3F", 4);
        g.globalAlpha = 1;
      }
    }

    if (this.ribbon.length > 1) {
      g.save();
      if (this.ctx.palette.particlesAdditive) g.globalCompositeOperation = "lighter";
      drawRibbon(g, this.ribbon, t, l.cellW * 0.4, this.ribbonColor);
      g.restore();
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

  /** The backdrop: paper, empty cells and the replenish ledge (modern) or the original sprites (classic). */
  private renderBackground(g: CanvasRenderingContext2D): void {
    const sp = this.ctx.sprites;
    const l = this.board.layout;
    const n = l.cellNum;
    const pal = this.ctx.palette;
    const { world } = this.ctx.session;

    if (pal.kind === "generated") {
      if (pal.backdrop !== "sprites") {
        // The scenery jolts with the board when a row lands.
        const jolt = (1 - this.heaveFx.sy) * l.cellH * 0.8;
        g.save();
        g.translate(0, jolt);
        BACKDROPS[pal.backdrop](g, this.ctx.clock.t, l, this.flare());
        g.restore();
      }
      const pad = l.cellW * 0.04;
      if (pal.timer === "wells") {
        // Wells for every cell and a tray for the replenish line; the next
        // well fills with the incoming colour as the timer runs. Paper also
        // shows its paint stains.
        const paper = pal.backdrop === "paper";
        const { well, tray, fill } = furnitureOf(pal);
        if (paper) {
          for (let x = 0; x < n; x++) {
            for (let y = 0; y < n; y++) well(g, cellX(l, x) + pad, cellY(l, y) + pad, l.cellW - pad * 2, l.cellH - pad * 2);
          }
        }
        const ry = replenishY(l);
        tray(g, l.boardX - 8, ry - 8, l.boardW + 16, l.cellH + 16);
        const t0 = this.ctx.clock.t;
        if (this.readyToPush) {
          // The tray reddens and pulses as the push gets closer.
          const near = clamp01(this.replenishLine / this.pushCountdown());
          const pulse = 0.8 + 0.2 * Math.sin(t0 / 110);
          fillRoundRect(
            g,
            l.boardX - 8,
            ry - 8,
            l.boardW + 16,
            l.cellH + 16,
            12,
            rgba(pal.overlayAccent, (0.08 + 0.3 * near) * pulse),
            rgba(pal.overlayAccent, 0.5 * near),
            1.5,
          );
        }
        const filling = this.board.replenishList.length;
        const level = this.wellLevel();
        // pixel themes fill in eight steps, with a tick on each
        if (pal.pixelated) {
          const step = Math.round(level * 8);
          if (step > this.wellStep && step > 0) this.ctx.audio.cue("tick", 0.35, 0.9 + step * 0.04);
          this.wellStep = step;
        }
        const colour = pal.brickColors[this.nextColors[0] ?? 1];
        for (let x = 0; x < n; x++) {
          const wx = cellX(l, x) + pad;
          const wy = ry + pad;
          const ww = l.cellW - pad * 2;
          const wh = l.cellH - pad * 2;
          well(g, wx, wy, ww, wh);
          if (x !== filling || this.readyToPush) continue;
          if (fill) {
            fill(g, wx, wy, ww, wh, level, colour, t0);
            continue;
          }
          // the plain fill: the colour rises inside the well, brightest at its surface, inset so it
          // stays within every theme's well art
          const inset = l.cellW * 0.07;
          const fw = ww - inset * 2;
          const fh = (wh - inset * 2) * level;
          if (fh < 0.5) continue;
          const top = wy + wh - inset - fh;
          g.save();
          g.beginPath();
          g.roundRect(wx + inset, wy + inset, fw, wh - inset * 2, l.cellW * 0.14);
          g.clip();
          const grad = g.createLinearGradient(0, top, 0, wy + wh - inset);
          grad.addColorStop(0, rgba(colour, 0.55));
          grad.addColorStop(1, rgba(colour, 0.25));
          g.fillStyle = grad;
          g.fillRect(wx + inset, top, fw, fh);
          g.fillStyle = rgba(colour, 0.9);
          g.fillRect(wx + inset, top, fw, 1.5);
          g.restore();
        }
        const t = this.ctx.clock.t;
        for (const st of pal.stains ? this.stains : []) {
          const p = (t - st.t0) / st.dur;
          if (p < 0) continue;
          const a = p < 0.08 ? p / 0.08 : 1 - easeOutCubic((p - 0.08) / 0.92);
          drawStain(g, st.x, st.y, st.r, st.color, 0.2 * a, st.seed);
        }
        return;
      }
      if (pal.emptyCell) {
        g.fillStyle = pal.emptyCell;
        for (let x = 0; x < n; x++) {
          for (let y = 0; y < n; y++) {
            g.beginPath();
            g.roundRect(cellX(l, x) + pad, cellY(l, y) + pad, l.cellW - pad * 2, l.cellH - pad * 2, l.cellW * 0.18);
            g.fill();
          }
        }
      }
      if (pal.ledge) {
        const ry = replenishY(l) + l.cellH + 1;
        g.fillStyle = "rgba(60,40,20,0.12)";
        g.fillRect(l.boardX - 6, ry + 2, l.boardW + 12, 10);
        fillRoundRect(g, l.boardX - 6, ry, l.boardW + 12, 10, 3, pal.ledge);
      }
      return;
    }

    for (let i = 0; i < n; i++) {
      drawSprite(
        g,
        sp.replenish_frame_sprite,
        0,
        l.boardX + (l.cellW + l.cellSep) * i,
        replenishY(l) - l.cellSep - 1,
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

    if (pal.gridAlpha > 0) {
      g.save();
      g.globalAlpha = pal.gridAlpha;
      const gridBottom = l.boardY + l.boardH - l.cellH - l.cellSep;
      for (let i = 1; i < n; i++) {
        const x = Math.floor(l.boardX) + Math.floor(i * (l.cellW + l.cellSep)) - l.cellSep;
        drawLine(g, x, l.boardY, x, gridBottom, l.cellSep, pal.gridLine);
      }
      for (let i = 1; i < n; i++) {
        const y = l.boardY + i * (l.cellH + l.cellSep) - l.cellSep;
        drawLine(g, l.boardX, y, l.boardX + l.boardW, y, l.cellSep, pal.gridLine);
      }
      g.restore();
    }

    drawSprite(g, sp.sidebar_sprite, 0, l.boardX - l.railW, l.stackY, l.railW, l.boardH);
    drawSprite(g, sp.sidebar_sprite, 1, Math.floor(l.boardX) + l.boardW, l.stackY, l.railW, l.boardH);
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
    if (a <= 0) return this.drawButtons(g);
    g.save();
    if (this.ctx.view.portrait) g.translate(0, a * 28);
    else g.translate(a * 36, 0);
    this.drawButtons(g);
    g.restore();
  }

  private drawButtons(g: CanvasRenderingContext2D): void {
    const sp = this.ctx.sprites;
    const pal = this.ctx.palette;
    const generated = pal.kind === "generated";
    if (generated && this.controls) this.renderRotatePill(g, this.controls.rotatePill);
    for (const btn of this.buttons) {
      if (btn.kind === "sound") btn.baseFrame = this.ctx.audio.muted ? 2 : 0;
      if (generated && (btn.kind === "ccw" || btn.kind === "cw")) continue;
      const sprite = sp[btn.sprite];
      const maxFrame = sprite.frames.length - 1;
      const scale = this.feel.scale(btn.kind, btn.hilite, btn.pressed);
      const frame = btn.pressed ? Math.min(maxFrame, btn.baseFrame + 1) : btn.baseFrame;
      drawSprite(g, sprite, frame, btn.cx - (btn.w * scale) / 2, btn.cy - (btn.h * scale) / 2, btn.w * scale, btn.h * scale);
      if (btn.kind === "speed" && generated) this.renderHurryRing(g, btn, scale);
    }
    if (generated && this.controls) {
      const size = Math.max(10, this.rail().textSize * 0.6);
      for (const lb of this.controls.labels) drawText(g, lb.text, lb.x, lb.y, { size, color: pal.hudMuted, weight: 700 });
    }
  }

  /** The rotate pair as one segmented control: turn left, the board, turn right. */
  private renderRotatePill(g: CanvasRenderingContext2D, pill: { x: number; y: number; w: number; h: number }): void {
    const ui = this.ctx.palette.ui;
    const r = pill.h / 2;
    fillRoundRect(g, pill.x, pill.y + 3, pill.w, pill.h, r, ui.cardShadow);
    fillRoundRect(g, pill.x, pill.y, pill.w, pill.h, r, ui.card, ui.cardEdge, 1.5);
    g.save();
    g.beginPath();
    g.roundRect(pill.x, pill.y, pill.w, pill.h, r);
    g.clip();
    for (const btn of this.buttons) {
      if (btn.kind !== "ccw" && btn.kind !== "cw") continue;
      if (btn.hilite || btn.pressed) {
        g.fillStyle = btn.pressed ? ui.secondaryEdge : ui.secondary;
        g.fillRect(btn.cx - btn.w / 2, pill.y, btn.w, pill.h);
      }
    }
    g.restore();
    g.fillStyle = ui.cardEdge;
    g.fillRect(pill.x + pill.w / 2 - 0.5, pill.y + pill.h * 0.22, 1, pill.h * 0.56);
    for (const btn of this.buttons) {
      if (btn.kind !== "ccw" && btn.kind !== "cw") continue;
      const scale = this.feel.scale(btn.kind, btn.hilite, btn.pressed);
      g.save();
      g.strokeStyle = ui.secondaryText;
      g.fillStyle = ui.secondaryText;
      ICONS[btn.kind === "cw" ? "rotateCw" : "rotateCcw"](g, btn.cx, btn.cy, pill.h * 0.25 * scale);
      g.restore();
    }
  }

  /** A small keycap, for the hold slot once a keyboard has been used. */
  private drawKeycap(g: CanvasRenderingContext2D, key: string, cx: number, cy: number): void {
    const ui = this.ctx.palette.ui;
    fillRoundRect(g, cx - 11, cy - 9, 22, 18, 5, ui.card, ui.cardEdge, 1);
    drawText(g, key, cx, cy + 1, { size: 11, color: this.ctx.palette.overlayText, weight: 700 });
  }

  /**
   * A ring that charges around the hurry button while it is held (or Space /
   * down is down): the replenish line's acceleration made visible, so the
   * button explains that it wants to be held rather than tapped.
   */
  private renderHurryRing(g: CanvasRenderingContext2D, btn: SideButton, scale: number): void {
    const charge = (this.accel - 1) / 3;
    if (charge <= 0.001) return;
    const pal = this.ctx.palette;
    const lw = Math.max(2, btn.w * 0.07);
    const radius = (btn.w * scale) / 2 + lw * 0.9;
    const full = charge >= 0.999;
    const pulse = full ? 0.85 + 0.15 * Math.sin(this.ctx.clock.t / 90) : 1;
    g.save();
    g.lineWidth = lw;
    g.lineCap = "round";
    g.strokeStyle = pal.multColors[Math.min(pal.multColors.length - 1, 3)];
    g.globalAlpha = pulse;
    if (pal.glow) {
      g.shadowColor = g.strokeStyle;
      g.shadowBlur = lw * 2;
    }
    g.beginPath();
    g.arc(btn.cx, btn.cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, charge));
    g.stroke();
    g.restore();
  }

  /** Progress toward the level's goal as a ring, the remaining count inside. */
  private renderGoalRing(g: CanvasRenderingContext2D, ring: { cx: number; cy: number; r: number }, frac: number, text: string): void {
    const pal = this.ctx.palette;
    const lw = Math.max(4, ring.r * 0.22);
    const rr = ring.r - lw / 2;
    g.save();
    g.lineCap = "round";
    g.lineWidth = lw;
    g.strokeStyle = pal.track;
    g.beginPath();
    g.arc(ring.cx, ring.cy, rr, 0, Math.PI * 2);
    g.stroke();
    if (frac > 0.001) {
      g.strokeStyle = pal.hudText;
      g.beginPath();
      g.arc(ring.cx, ring.cy, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, frac));
      g.stroke();
    }
    g.restore();
    drawText(g, text, ring.cx, ring.cy + 1, { size: ring.r * 0.95, color: pal.hudText, weight: 700, tabular: true });
  }

  /** One star per subtract pop the level asks for, filled as they are earned. */
  private renderStars(g: CanvasRenderingContext2D, r: HudRail): void {
    const pal = this.ctx.palette;
    const n = this.subtractGoal;
    const size = r.textSize * 0.42;
    for (let i = 0; i < n; i++) {
      const done = this.goalAwarded || i < this.subtractDone;
      g.save();
      g.strokeStyle = pal.goalAccent;
      g.fillStyle = done ? pal.goalAccent : "rgba(0,0,0,0)";
      ICONS.star(g, r.starsX + i * r.starStep, r.starsY, size);
      g.restore();
    }
    const lx = r.starsX + (n - 0.5) * r.starStep + r.side * 8;
    // Upright, the band is tight: the stars stand for themselves and the label is one word.
    const label = this.board.layout.portrait ? (this.goalAwarded ? "GOAL DONE" : "GOAL") : this.goalAwarded ? "SUBTRACT GOAL DONE" : "SUBTRACT GOAL";
    drawText(g, label, lx, r.starsY + 1, {
      size: r.textSize * 0.5,
      color: this.goalAwarded ? pal.goalAccent : pal.hudMuted,
      weight: 700,
      align: r.side > 0 ? "left" : "right",
    });
  }

  /**
   * The chain as a VU meter: a row of segments lit in the multiplier colour,
   * brighter toward the top, with a white peak marker that holds and falls.
   * From x3 the lit run shimmers like a tube under load.
   */
  private renderVuMeter(g: CanvasRenderingContext2D, x: number, cy: number, w: number, mult: number, t: number): void {
    const pal = this.ctx.palette;
    const gap = 2;
    const n = Math.max(8, Math.min(24, Math.floor(w / 8)));
    const sw = (w - gap * (n - 1)) / n;
    const h = 7;
    const lit = vuLit(this.heat, n);
    this.vuPeak = vuPeak(this.vuPeak, lit, t);
    const peak = this.vuPeak.seg - 1;
    const color = pal.multColors[mult];
    const shimmer = mult >= 3 ? 0.85 + 0.15 * Math.sin(t / 37) : 1;
    const seg = (i: number, fill: string) => fillRoundRect(g, x + i * (sw + gap), cy - h / 2, sw, h, 1.5, fill);
    for (let i = lit; i < n; i++) if (i !== peak) seg(i, pal.track);
    if (lit > 0) {
      // the lit run shares one glow pass: shadow blur is the expensive part
      g.save();
      if (pal.glow) {
        g.shadowColor = color;
        g.shadowBlur = 6;
      }
      for (let i = 0; i < lit; i++) {
        g.globalAlpha = (0.55 + 0.45 * (i / n)) * shimmer;
        seg(i, color);
      }
      g.restore();
    }
    if (peak >= lit) {
      g.save();
      if (pal.glow) {
        g.shadowColor = "#ffffff";
        g.shadowBlur = 6;
      }
      seg(peak, "rgba(255,255,255,0.85)");
      g.restore();
    }
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

  private drawHud(g: CanvasRenderingContext2D): void {
    const sp = this.ctx.sprites;
    const l = this.board.layout;
    const n = l.cellNum;
    const s = this.ctx.session;
    const pal = this.ctx.palette;
    const t = this.ctx.clock.t;
    const shown = String(Math.round(this.scoreFx.v));

    const goal = s.gameType === "puzzle" ? this.board.countBricks() : this.comboRemaining;
    const label = s.gameType === "puzzle" ? "Bricks left" : "Pops left";
    const r = this.rail();
    const textSize = r.textSize;
    const cx = r.cx;
    const mult = this.chainMultiplier();

    if (pal.kind === "generated") {
      const caption = (txt: string, x: number, y: number, align: CanvasTextAlign = "center") =>
        drawText(g, txt.toUpperCase(), x, y, { size: textSize * 0.62, color: pal.hudMuted, weight: 700, align });
      const big = (txt: string, x: number, y: number) => drawText(g, txt, x, y, { size: textSize * 1.9, color: pal.hudText, weight: 700, tabular: true });
      caption("Score", r.scoreCx, r.scoreCapY);
      if (pal.glow) {
        g.save();
        g.shadowColor = pal.multColors[mult];
        g.shadowBlur = 6;
        big(shown, r.scoreCx, r.scoreY);
        g.restore();
      } else {
        big(shown, r.scoreCx, r.scoreY);
      }

      // Chain meter: a track that drains while the chain cools off.
      const meterW = r.meterW;
      const meterH = 5;
      const meterX = r.scoreCx - meterW / 2;
      const meterY = r.chainY;
      if (pal.fx.meter === "vu") {
        this.renderVuMeter(g, meterX, meterY, meterW, mult, t);
      } else fillRoundRect(g, meterX, meterY - meterH / 2, meterW, meterH, meterH / 2, pal.track);
      if (this.heat > 0 && pal.fx.meter === "bar") {
        const fillW = Math.max(meterH, meterW * this.heat);
        if (pal.glow) {
          g.save();
          g.shadowColor = pal.multColors[mult];
          g.shadowBlur = 8;
          fillRoundRect(g, meterX, meterY - meterH / 2, fillW, meterH, meterH / 2, pal.multColors[mult]);
          g.restore();
          if (mult >= 3) {
            // travelling highlight
            const hx = meterX + ((t / 900) % 1) * fillW;
            const hl = g.createLinearGradient(hx - 18, 0, hx + 18, 0);
            hl.addColorStop(0, "rgba(255,255,255,0)");
            hl.addColorStop(0.5, "rgba(255,255,255,0.9)");
            hl.addColorStop(1, "rgba(255,255,255,0)");
            g.save();
            g.beginPath();
            g.roundRect(meterX, meterY - meterH / 2, fillW, meterH, meterH / 2);
            g.clip();
            g.fillStyle = hl;
            g.fillRect(hx - 18, meterY - meterH / 2, 36, meterH);
            g.restore();
          }
        } else {
          fillRoundRect(g, meterX, meterY - meterH / 2, fillW, meterH, meterH / 2, pal.multColors[mult]);
        }
      }
      // caption on the left, the multiplier as a badge on the right so x3 reads without watching the bar
      drawText(g, "CHAIN", meterX, meterY + 12, { size: textSize * 0.55, color: pal.hudMuted, weight: 700, align: "left" });
      if (this.chain > 0) {
        const bw = textSize * 2.1;
        const bh = textSize * 1.05;
        g.save();
        g.translate(meterX + meterW - bw / 2, meterY + 12);
        g.scale(this.badgeFx.s, this.badgeFx.s);
        if (pal.glow) {
          g.shadowColor = pal.multColors[mult];
          g.shadowBlur = 8;
        }
        fillRoundRect(g, -bw / 2, -bh / 2, bw, bh, bh / 2, pal.multColors[mult]);
        g.shadowBlur = 0;
        drawText(g, `x${mult}`, 0, 1, { size: textSize * 0.7, color: "#ffffff", weight: 800, tabular: true });
        g.restore();
      }

      const pillW = r.pillW;
      const pillH = textSize * 1.5;
      const pillY = r.levelY;
      fillRoundRect(g, r.pillCx - pillW / 2, pillY - pillH / 2, pillW, pillH, pillH / 2, pal.pill, pal.pillEdge);
      {
        // the mode's brick glyph before its name, matching the title and the pause card;
        // the long form when the pill is wide enough for it
        const style = { size: textSize * 0.75, color: pal.hudText, weight: 700 };
        const gr = textSize * 0.3;
        let modeText = `${modeLabel(s.gameType)}  World ${s.world} · Level ${s.level + 1}`;
        let tw = measureText(g, modeText, style);
        if (gr * 2 + 6 + tw > pillW - textSize) {
          modeText = `${modeLabel(s.gameType)} ${s.world}-${s.level + 1}`;
          tw = measureText(g, modeText, style);
        }
        const span = gr * 2 + 6 + tw;
        drawModeGlyph(g, s.gameType, r.pillCx - span / 2 + gr, pillY, gr, pal.brickColors[MODE_COLOR[s.gameType]], 2);
        drawText(g, modeText, r.pillCx + span / 2 - tw / 2, pillY, style);
      }

      // The goal ring fills toward the target; the count sits inside it.
      const total = s.gameType === "puzzle" ? this.bricksTotal : this.popsTotal;
      this.renderGoalRing(g, r.ring, total > 0 ? clamp01(1 - goal / total) : 0, String(goal));
      caption(s.gameType === "puzzle" ? "Bricks left" : "Pops to go", r.goalCapX, r.goalCapY, r.goalAlign);
      drawText(g, `${Math.max(0, total - goal)} of ${total}`, r.goalCapX, r.goalY, {
        size: textSize * 0.8,
        color: pal.hudText,
        weight: 700,
        tabular: true,
        align: r.goalAlign,
      });
      if (this.subtractGoal > 0) this.renderStars(g, r);
    } else {
      drawText(g, `Score:\n${shown}`, cx, r.scoreY, { size: textSize, color: pal.hudText, tabular: true });
      const meterW = r.meterW;
      g.fillStyle = "rgba(0,0,0,0.15)";
      g.fillRect(cx - meterW / 2, r.chainY - 2, meterW, 4);
      if (this.heat > 0) {
        g.fillStyle = pal.multColors[mult];
        g.fillRect(cx - meterW / 2, r.chainY - 2, meterW * this.heat, 4);
      }
      if (this.chain > 0) {
        g.save();
        g.translate(cx, r.chainY - 10);
        g.scale(this.badgeFx.s, this.badgeFx.s);
        drawText(g, `Chain x${mult}`, 0, 0, { size: textSize * 0.65, color: pal.hudText });
        g.restore();
      }
      drawText(g, `Level ${s.world}-${s.level + 1}`, cx, r.levelY, { size: textSize * 0.8, color: pal.hudMuted, bold: false });
      if (this.subtractGoal > 0) {
        drawText(g, "Subtract pops", cx, r.goalLabelY, { size: textSize * 0.65, color: pal.hudMuted, bold: false });
        drawText(g, this.goalAwarded ? `${this.subtractGoal}/${this.subtractGoal} done` : `${this.subtractDone}/${this.subtractGoal}`, cx, r.goalY, {
          size: textSize * 0.85,
          color: pal.hudText,
          tabular: true,
        });
      }
      drawText(g, `${label}\n${goal}`, cx, r.popsY, { size: textSize, color: pal.hudText, tabular: true });
    }

    const bar = sp.progressbar_sprite;
    const barX = Math.floor(l.boardX);
    const current = Math.max(0, this.readyToPush ? 1 - this.replenishLine / this.pushCountdown() : this.currentPercentage);
    const maxP = Math.max(0, this.maxPercentage);
    const barFlash = t - this.barFlashT0;

    if (pal.timer === "wells") return;

    if (pal.kind === "generated") {
      // Fill timer: a well with one segment per replenish slot. It fills left
      // to right as bricks arrive; once the line is full it drains while the
      // push counts down, in the accent colour.
      const gb = gridBottom(l);
      const gap = replenishY(l) - gb;
      const barH = 9;
      const barY = Math.round(gb + (gap - barH) / 2);
      const barW = l.boardW;
      const r = barH / 2;
      const draining = this.readyToPush;
      fillRoundRect(g, barX, barY + 1, barW, barH, r, "rgba(0,0,0,0.3)");
      g.save();
      g.beginPath();
      g.roundRect(barX, barY, barW, barH, r);
      g.clip();
      g.fillStyle = pal.track;
      g.fillRect(barX, barY, barW, barH);
      g.fillStyle = pal.trackMax;
      g.fillRect(barX, barY, barW * Math.min(1, maxP), barH);
      const fillW = barW * Math.min(1, current);
      if (draining) {
        const pulse = 0.75 + 0.25 * Math.sin(t / 120);
        g.globalAlpha = pulse;
        g.fillStyle = pal.overlayAccent;
        g.fillRect(barX, barY, fillW, barH);
        g.globalAlpha = 1;
      } else {
        drawSprite(g, bar, 0, barX, barY, fillW, barH);
      }
      // slot ticks
      g.fillStyle = pal.hudMuted;
      g.globalAlpha = 0.35;
      for (let i = 1; i < n; i++) {
        const tx = Math.round(barX + (barW * i) / n);
        g.fillRect(tx, barY + 2, 1, barH - 4);
      }
      g.globalAlpha = 1;
      if (barFlash < D(260)) {
        g.globalAlpha = 0.8 * (1 - barFlash / D(260));
        g.fillStyle = pal.barFlash;
        g.fillRect(barX, barY, barW, barH);
      }
      g.restore();
      g.lineWidth = 1;
      g.strokeStyle = pal.pillEdge;
      g.beginPath();
      g.roundRect(barX + 0.5, barY + 0.5, barW - 1, barH - 1, r);
      g.stroke();
      // tiny label on the right so the bar reads as the timer it is
      drawText(g, draining ? "PUSH" : "NEXT", barX + barW + 6, barY + barH / 2, {
        size: 9,
        color: draining ? pal.overlayAccent : pal.hudMuted,
        weight: 700,
        align: "left",
      });
      return;
    }

    const barY = Math.floor(l.boardY + n * (l.cellH + l.cellSep) - l.cellSep / 2) - 1;
    const barH = Math.max(3, l.cellSep * 1.5);
    drawSprite(g, bar, 2, barX, barY, l.boardW, barH);
    drawSpritePartX(g, bar, 1, maxP, barX, barY, l.boardW, barH);
    drawSpritePartX(g, bar, 0, current, barX, barY, l.boardW, barH);
    if (barFlash < D(260)) {
      g.globalAlpha = 0.8 * (1 - barFlash / D(260));
      g.fillStyle = "#ffffff";
      g.fillRect(barX, barY, l.boardW, barH);
      g.globalAlpha = 1;
    }
  }

  // ---------------------------------------------------------------------------
  // Cards
  // ---------------------------------------------------------------------------

  /** Where the card sits this frame: it slides up from below with an overshoot. */
  private cardOffset(): number {
    const e = this.ctx.clock.t - this.cardT0;
    const vh = this.ctx.view.h;
    if (e < 0) return vh;
    return (1 - CARD_EASE(clamp01(e / D(CARD_MS)))) * vh * 0.6;
  }

  /** Centred card with a title, body lines and the overlay buttons. */
  private renderOverlayCard(g: CanvasRenderingContext2D, title: string, lines: string[], accent?: string, footer?: string, buttons = true): void {
    const inp = this.ctx.input;
    const pal = this.ctx.palette;
    const e = this.ctx.clock.t - this.cardT0;
    g.globalAlpha = clamp01(e / D(200));
    fillScreen(g, pal.ui.dim);
    g.globalAlpha = 1;

    const off = this.cardOffset();
    const vp = this.ctx.view;
    const w = Math.min(440, vp.w - 24);
    const h = 236 + (accent ? 22 : 0) + (footer ? 26 : 0) - (buttons ? 0 : 50);
    const x = vp.w / 2 - w / 2;
    const y = vp.h / 2 - 110 + off;
    g.save();
    g.translate(0, 0);
    drawCard(g, pal.ui, x, y, w, h, 20);
    if (footer) drawText(g, footer, vp.w / 2, y + h - 22, { size: 12, color: pal.hudMuted, weight: 500 });
    drawText(g, title, vp.w / 2, y + 46, { size: 30, color: pal.overlayText, weight: 600, font: pal.display });
    lines.forEach((line, i) => {
      drawText(g, line, vp.w / 2, y + 90 + i * 24, { size: 16, color: pal.hudMuted, weight: 500, tabular: true });
    });
    if (accent) drawText(g, accent, vp.w / 2, y + 90 + lines.length * 24, { size: 16, color: pal.overlayAccent, weight: 700 });
    if (buttons && (this.state !== "lost" || this.lostTimer > 20)) {
      for (const b of this.overlayButtons()) {
        const hover = inp.inCentered(b.cx, b.cy, b.w, b.h);
        const pressed = hover && inp.down;
        b.cy += off;
        b.scale = this.feel.scale(`overlay:${b.id}`, hover, pressed);
        drawPillButton(g, pal.ui, b, hover, pressed, pal.font);
      }
    }
    g.restore();
  }

  /** Toast chips sliding in over the top row of the board, newest lowest. */
  private renderToasts(g: CanvasRenderingContext2D): void {
    if (this.toasts.length === 0) return;
    const l = this.board.layout;
    const pal = this.ctx.palette;
    const t = this.ctx.clock.t;
    const style = { size: 13, weight: 700 as const };
    this.toasts.forEach((c, i) => {
      const e = t - c.t0;
      const enter = easeOutBack(clamp01(e / D(220)));
      const leave = clamp01((e - D(TOAST_MS - 260)) / D(260));
      const alpha = (1 - leave) * clamp01(e / D(80));
      if (alpha <= 0) return;
      const tw = measureText(g, c.text, style);
      const w = tw + 28;
      const h = 26;
      const cx = l.boardX + l.boardW / 2;
      const cy = l.boardY + 16 + i * (h + 6) - (1 - enter) * 24;
      g.save();
      g.globalAlpha = alpha;
      fillRoundRect(g, cx - w / 2, cy - h / 2 + 2, w, h, h / 2, pal.ui.cardShadow);
      fillRoundRect(g, cx - w / 2, cy - h / 2, w, h, h / 2, pal.ui.card, c.color, 1.5);
      drawText(g, c.text, cx, cy + 1, { ...style, color: c.color });
      g.restore();
    });
  }

  private renderLevelComplete(g: CanvasRenderingContext2D): void {
    const s = this.ctx.session;
    const shown = Math.round(this.scoreFx.v);
    if (this.ctx.palette.kind === "generated") {
      this.renderLevelCard(g, shown);
      return;
    }
    this.renderOverlayCard(
      g,
      "Level complete",
      [`${s.gameType[0].toUpperCase()}${s.gameType.slice(1)} ${s.world}-${s.level + 1}`, `Score ${shown}`],
      undefined,
      undefined,
      false,
    );
  }

  /** The modern level-complete card: stars, where the points came from, and Next / Replay / Title. */
  private renderLevelCard(g: CanvasRenderingContext2D, shown: number): void {
    const pal = this.ctx.palette;
    const inp = this.ctx.input;
    const s = this.ctx.session;
    const vp = this.ctx.view;
    const e = this.ctx.clock.t - this.cardT0;
    g.globalAlpha = clamp01(e / D(200));
    fillScreen(g, pal.ui.dim);
    g.globalAlpha = 1;
    const L = this.levelCardLayout();
    const off = this.cardOffset();
    const x = L.x;
    const y = L.y + off;
    const cx = vp.w / 2;
    drawCard(g, pal.ui, x, y, L.w, L.h, 20);
    drawText(g, "Level complete", cx, y + 40, { size: 28, color: pal.overlayText, weight: 600, font: pal.display });
    {
      const sub = `${modeLabel(s.gameType)} ${s.world}-${s.level + 1}`;
      const subStyle = { size: 13, color: pal.hudMuted, weight: 500 };
      const tw = measureText(g, sub, subStyle);
      drawModeGlyph(g, s.gameType, cx - tw / 2 - 6, y + 64, 5, pal.brickColors[MODE_COLOR[s.gameType]], 1.8);
      drawText(g, sub, cx + 6, y + 64, subStyle);
    }
    // stars, popping in one after another
    const run = { bestChain: this.bestChain, subtractGoal: this.subtractGoal, goalDone: this.goalAwarded };
    const stars = levelStars(run);
    const starY = y + 102;
    for (let i = 0; i < MAX_STARS; i++) {
      const earned = i < stars;
      const pop = easeOutBack(clamp01((e - D(300 + i * 160)) / D(260)));
      if (pop <= 0) continue;
      if (earned && i >= this.starsSounded) {
        this.starsSounded = i + 1;
        this.ctx.audio.event("star", { rate: 1 + i * 0.25 });
      }
      g.save();
      g.strokeStyle = earned ? pal.goalAccent : pal.hudMuted;
      g.fillStyle = earned ? pal.goalAccent : "rgba(0,0,0,0)";
      ICONS.star(g, cx + (i - 1) * 40, starY, 15 * pop);
      g.restore();
    }
    drawText(g, stars === MAX_STARS ? "Perfect" : thirdStarHint(run), cx, starY + 26, { size: 11, color: pal.hudMuted, weight: 600 });
    // the breakdown
    const rows: [string, number][] = [
      ["Pops", this.tally.pops],
      ["Chains", this.tally.chain],
    ];
    if (L.rows > 2) rows.push(["Subtract bonus", this.tally.subtract]);
    const rowStyle = { size: 14, color: pal.hudMuted, weight: 500 as const };
    const numStyle = { size: 14, color: pal.overlayText, weight: 700 as const, tabular: true };
    const left = x + 40;
    const right = x + L.w - 40;
    let ry = y + 150;
    for (const [label, value] of rows) {
      drawText(g, label, left, ry, { ...rowStyle, align: "left" });
      drawText(g, String(value), right, ry, { ...numStyle, align: "right" });
      ry += 24;
    }
    g.fillStyle = pal.ui.cardEdge;
    g.fillRect(left, ry - 6, right - left, 1);
    ry += 10;
    drawText(g, "Total", left, ry, { ...rowStyle, color: pal.overlayText, weight: 700, align: "left" });
    drawText(g, String(shown), right, ry, { ...numStyle, size: 18, color: pal.overlayAccent, align: "right" });
    if (this.levelCompleteDelay < 0) {
      for (const b of this.levelButtons()) {
        const hover = inp.inCentered(b.cx, b.cy, b.w, b.h) && inp.x >= 0;
        const pressed = hover && inp.down;
        b.scale = this.feel.scale(`level:${b.id}`, hover, pressed);
        drawPillButton(g, pal.ui, b, hover, pressed, pal.font);
      }
    }
  }

  /** Pause menu (`STATE_MENU`): resume, restart, quit, a theme strip, sound and the keyboard hints. */
  private renderMenu(g: CanvasRenderingContext2D): void {
    if (this.menuPage === "help") {
      this.renderSlides(g, this.ctx.sprites.tutorial_intro_sprite, this.helpSlide, true);
      return;
    }
    const pal = this.ctx.palette;
    const inp = this.ctx.input;
    const s = this.ctx.session;
    const vp = this.ctx.view;
    const e = this.ctx.clock.t - this.cardT0;
    g.globalAlpha = clamp01(e / D(200));
    fillScreen(g, pal.ui.dim);
    g.globalAlpha = 1;
    if (this.menuPage === "themes") {
      this.renderThemesPage(g);
      return;
    }
    const L = this.pauseLayout(this.cardOffset());
    const pill = (b: PillButton, feelId: string) => {
      const hover = inp.inCentered(b.cx, b.cy, b.w, b.h) && inp.x >= 0;
      const pressed = hover && inp.down;
      b.scale = this.feel.scale(feelId, hover, pressed);
      drawPillButton(g, pal.ui, b, hover, pressed, pal.font);
    };
    drawCard(g, pal.ui, L.x, L.y, L.w, L.h, 20);
    drawText(g, "Paused", vp.w / 2, L.y + 36, { size: 28, color: pal.overlayText, weight: 600, font: pal.display });
    // mode glyph, level, score and what is left
    const goal = s.gameType === "puzzle" ? `${this.board.countBricks()} bricks left` : `${this.comboRemaining} pops to go`;
    const sub = `${modeLabel(s.gameType)} ${s.world}-${s.level + 1}   ·   ${s.score}   ·   ${goal}`;
    const subStyle = { size: 13, color: pal.hudMuted, weight: 500, tabular: true };
    const tw = measureText(g, sub, subStyle);
    drawModeGlyph(g, s.gameType, vp.w / 2 - tw / 2 - 4, L.y + 62, 5, pal.brickColors[MODE_COLOR[s.gameType]], 1.8);
    drawText(g, sub, vp.w / 2 + 8, L.y + 62, subStyle);
    // help
    {
      const hv = inp.inCentered(L.help.cx, L.help.cy, L.help.d, L.help.d) && inp.x >= 0;
      const sc = this.feel.scale("menu:help", hv, hv && inp.down);
      const d = L.help.d * sc;
      fillRoundRect(g, L.help.cx - d / 2, L.help.cy - d / 2, d, d, d / 2, hv ? pal.ui.secondaryHover : pal.ui.secondary, pal.ui.secondaryEdge, 1.5);
      drawText(g, "?", L.help.cx, L.help.cy + 1, { size: 15 * sc, color: pal.ui.secondaryText, weight: 800 });
    }
    pill(L.resume, "menu:resume");
    if (this.confirmQuit) {
      pill(L.keep, "menu:keep");
      pill(L.quit, "menu:quit");
      drawText(g, "Progress on this level is lost", vp.w / 2, L.y + 180, { size: 11, color: pal.overlayAccent, weight: 600 });
    } else {
      pill(L.restart, "menu:restart");
      pill(L.quit, "menu:quit");
    }
    fillRoundRect(g, L.x + 24, L.y + 189, L.w - 48, 1, 0, pal.ui.secondaryEdge);
    const caption = (txt: string, x: number, y: number) => drawText(g, txt, x, y, { size: 10, color: pal.hudMuted, weight: 700, align: "left" });
    caption("THEME", L.x + 24, L.y + 200);
    {
      const hv = inp.inCentered(L.all.cx, L.all.cy, L.all.w, L.all.h) && inp.x >= 0;
      drawText(g, `All ${THEME_ORDER.length}  ›`, L.x + L.w - 24, L.all.cy, {
        size: 12,
        color: hv ? pal.overlayText : pal.hudMuted,
        weight: 700,
        align: "right",
      });
    }
    for (const sw of L.strip) {
      const hv = swatchAt([sw], inp.x, inp.y) !== null && inp.x >= 0;
      drawSwatch(g, sw, pal, sw.name === pal.name, hv, this.feel.scale(`menu:sw:${sw.name}`, hv, hv && inp.down));
    }
    caption("SOUND", L.x + 24, L.y + 288);
    this.sound.render(g, this.ctx, L.sound, this.feel);
    if (this.keyboardUsed) {
      drawKeycaps(
        g,
        pal,
        [
          { key: "Q E", label: "rotate" },
          { key: "H", label: "hold" },
          { key: "Space", label: "hurry" },
          { key: "T", label: "theme" },
          { key: "Esc", label: "resume" },
        ],
        vp.w / 2,
        L.keycapsY,
      );
    }
  }

  private renderThemesPage(g: CanvasRenderingContext2D): void {
    const pal = this.ctx.palette;
    const inp = this.ctx.input;
    const T = this.themesPageLayout();
    drawCard(g, pal.ui, T.x, T.y, T.w, T.h, 20);
    drawText(g, "Theme", this.ctx.view.w / 2, T.y + 32, { size: 24, color: pal.overlayText, weight: 600, font: pal.display });
    for (const sw of this.themeSwatches) {
      const hv = swatchAt([sw], inp.x, inp.y) !== null && inp.x >= 0;
      drawSwatch(g, sw, pal, sw.name === pal.name, hv, this.feel.scale(`menu:grid:${sw.name}`, hv, hv && inp.down));
    }
    const hover = inp.inCentered(T.back.cx, T.back.cy, T.back.w, T.back.h);
    T.back.scale = this.feel.scale("menu:back", hover, hover && inp.down);
    drawPillButton(g, pal.ui, T.back, hover, hover && inp.down, pal.font);
  }

  private renderLost(g: CanvasRenderingContext2D): void {
    const s = this.ctx.session;
    const best = s.score >= this.ctx.save.hiscore && s.score > 0;
    this.renderOverlayCard(g, "Out of room", [`Score ${s.score}`, `Best ${this.ctx.save.hiscore}`], best ? "New high score!" : undefined);
  }

  /** Where the 3:2 tutorial slides sit: as large as fits, centred. */
  private slideRect(): { x: number; y: number; w: number; h: number } {
    const vp = this.ctx.view;
    const w = Math.min(vp.w, vp.h * 1.5);
    const h = w / 1.5;
    return { x: (vp.w - w) / 2, y: (vp.h - h) / 2, w, h };
  }

  private renderTutorialSlides(g: CanvasRenderingContext2D): void {
    const sp = this.ctx.sprites;
    this.renderSlides(g, this.tutorialPhase === "intro" ? sp.tutorial_intro_sprite : sp.tutorial_outro_sprite, this.tutorialState, false);
  }

  /** One 3:2 slide with back / next corners; `backOnFirst` shows the back button on the first slide too (it closes). */
  private renderSlides(g: CanvasRenderingContext2D, slides: Sprite, index: number, backOnFirst: boolean): void {
    const sp = this.ctx.sprites;
    const { x, y, w, h } = this.slideRect();
    const inp = this.ctx.input;
    drawSprite(g, slides, index, x, y, w, h);
    const size = h * 0.2;
    if (index > 0 || backOnFirst) {
      const hover = inp.inRect(x, y + h * 0.8, size, size);
      const sc = this.feel.scale("slide:back", hover, hover && inp.down);
      drawSprite(g, sp.back_button_sprite, 0, x + size / 2 - (size * sc) / 2, y + h * 0.9 - (size * sc) / 2, size * sc, size * sc);
    }
    const hover = inp.inRect(x + w - size, y + h * 0.8, size, size);
    const sc = this.feel.scale("slide:next", hover, hover && inp.down);
    drawSprite(g, sp.back_button_sprite, 2, x + w - size / 2 - (size * sc) / 2, y + h * 0.9 - (size * sc) / 2, size * sc, size * sc);
  }
}
