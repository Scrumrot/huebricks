/**
 * Everything drawn on and around the board that is not HUD or chrome: the
 * bricks with their feel-layer squash, lift, wipe and shake; shadows and
 * extrusions; pops and Knit's unravel; the selector ring, crosshair and
 * drag ribbon; the hold slot; the next-colour ghosts; score callouts and
 * toast chips; the fused seams; and the impact frame. It owns the
 * per-brick cosmetic records and draws from a `BoardFrame` the scene
 * hands it each frame, so the sim never reads anything here.
 */
import type { Board } from "../../core/Board";
import type { Brick } from "../../core/Brick";
import { colorFrame, type Color } from "../../core/color";
import { cellX, cellY, gridBottom, replenishY } from "../../core/layout";
import { furnitureOf } from "../../engine/backdrops";
import { cardRadius, drawBlock, drawBlockTransformed, drawLine, drawSprite, drawText, fillRoundRect, measureText, pillRadius } from "../../engine/draw";
import { clamp01, easeInBack, easeOutBack, easeOutCubic, lerp } from "../../engine/easing";
import { TUNING } from "../../engine/fxTuning";
import type { HudRail } from "../../engine/hudLayout";
import { ICONS } from "../../engine/icons";
import { drawMix } from "../../engine/mixFx";
import { drawRibbon, type RibbonPoint } from "../../engine/ribbon";
import { fillScreen } from "../../engine/view";
import type { GameContext } from "../Scene";
import { drawKeycap } from "./controls";
import {
  BREATHE_MS,
  D,
  DEG,
  IDLE_AMP,
  IDLE_MS,
  LAND_FLICKER,
  NOADD_MS,
  POP_GROW_MS,
  POP_HOLD_MS,
  POP_SHRINK_MS,
  PREVIEW_COUNT,
  PREVIEW_MS,
  PUSH_ANTICIPATE_MS,
  PUSH_EASE,
  PUSH_MS,
  ROTATE_ANTICIPATE_MS,
  ROTATE_EASE,
  ROTATE_MS,
  TOAST_MS,
  WIPE_MS,
} from "./timing";

/** Per-brick cosmetic state driven by tweens; the sim never reads it. */
export interface BrickFx {
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

export interface DieAnim {
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

/** Floating label that pops in, rises and fades (scores, chain, bonuses). */
export interface Callout {
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

/** A small chip that slides in at the top of the board for a moment: "Subtract goal done", "New high score". */
export interface Toast {
  text: string;
  color: string;
  t0: number;
}

/** The group a drop on the hovered cell would complete, while a brick is selected. */
export interface PreviewGroup {
  key: string;
  members: Set<Brick>;
  t0: number;
}

/** The selector ring on the replenish line and the crosshair ghost over the board. */
export interface SelectorFrame {
  /** A brick on the line is selected (not nothing, not the hold slot). */
  visible: boolean;
  /** Where the ring sits (it eases between slots). */
  x: number;
  /** Ring scale: overshoots in when a new brick is picked. */
  scale: number;
  /** Game time of the last invalid-move flash. */
  flashT0: number;
  /** The crosshair ghost shows at rest and while a combine lands. */
  showGhost: boolean;
  alpha: number;
  ghostX: number;
  ghostY: number;
}

/** What the scene is showing this frame; built once per render. */
export interface BoardFrame {
  selectedBrick: Brick | null;
  held: Brick | null;
  preview: PreviewGroup | null;
  dieAnims: DieAnim[];
  callouts: Callout[];
  toasts: Toast[];
  /** Game time the rotate started, or -1; which way it turns. */
  rotateT0: number;
  rotateDir: number;
  /** Game time the push started, or -1. */
  pushT0: number;
  /** A push is landing: the next-colour ghosts step aside. */
  pushing: boolean;
  /** Vertical squash of the whole board about its bottom edge. */
  heaveSy: number;
  lost: boolean;
  rail: HudRail;
  holdHover: boolean;
  keyboardUsed: boolean;
  nextColors: Color[];
  /** Fill of the next well, 0..1. */
  wellLevel: number;
  selector: SelectorFrame;
  ribbon: RibbonPoint[];
  ribbonColor: string;
}

const NO_FRAME: BoardFrame = {
  selectedBrick: null,
  held: null,
  preview: null,
  dieAnims: [],
  callouts: [],
  toasts: [],
  rotateT0: -1,
  rotateDir: 1,
  pushT0: -1,
  pushing: false,
  heaveSy: 1,
  lost: false,
  rail: {} as HudRail,
  holdHover: false,
  keyboardUsed: false,
  nextColors: [],
  wellLevel: 0,
  selector: { visible: false, x: 0, scale: 1, flashT0: -1e9, showGhost: false, alpha: 0, ghostX: 0, ghostY: 0 },
  ribbon: [],
  ribbonColor: "#ffffff",
};

export class BrickView {
  /** Per-brick cosmetic state driven by the scene's tweens; the sim never reads it. */
  readonly fx = new Map<number, BrickFx>();
  frame: BoardFrame = NO_FRAME;

  constructor(
    private readonly ctx: GameContext,
    private readonly board: Board,
  ) {}

  fxOf(b: Brick): BrickFx {
    let f = this.fx.get(b.id);
    if (!f) {
      f = { s: 1, sx: 1, sy: 1, rot: 0, dx: 0, dy: 0, lift: 0, dim: 1, wipeT0: -1, noaddT0: -1, fallFrom: 0, wasFalling: false, landT0: -1 };
      this.fx.set(b.id, f);
    }
    return f;
  }

  /** 0..1 shared breath of the previewed group. */
  private previewBreath(): number {
    return 0.5 - 0.5 * Math.cos((this.ctx.clock.t / D(PREVIEW_MS)) * Math.PI * 2);
  }

  /** Anticipation squeeze, then the quarter turn with a small overshoot. */
  applyBoardTransform(g: CanvasRenderingContext2D): void {
    if (this.frame.heaveSy !== 1) {
      const bottom = gridBottom(this.board.layout);
      g.translate(0, bottom);
      g.scale(1, this.frame.heaveSy);
      g.translate(0, -bottom);
    }
    if (this.frame.rotateT0 < 0) return;
    const l = this.board.layout;
    const n = l.cellNum;
    const e = this.ctx.clock.t - this.frame.rotateT0;
    const cx = l.boardX + (n * (l.cellW + l.cellSep) - l.cellSep) / 2;
    const cy = l.boardY + (n * (l.cellH + l.cellSep) - l.cellSep) / 2;
    let scale: number;
    let angle: number;
    const a0 = D(ROTATE_ANTICIPATE_MS);
    if (e < a0) {
      scale = 1 - 0.03 * easeOutCubic(e / a0);
      angle = -this.frame.rotateDir * Math.PI * 0.5;
    } else {
      const q = clamp01((e - a0) / D(ROTATE_MS));
      scale = 0.97 + 0.03 * easeOutCubic(q);
      angle = -this.frame.rotateDir * Math.PI * 0.5 * (1 - ROTATE_EASE(q));
    }
    g.translate(cx, cy);
    g.rotate(angle);
    g.scale(scale, scale);
    g.translate(-cx, -cy);
  }

  /** Soft pulsing halo in the brick's own colour while it is picked up. */
  renderHeldGlow(g: CanvasRenderingContext2D, b: Brick): void {
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
  drawPos(b: Brick, f: BrickFx): { x: number; y: number } {
    const alpha = this.ctx.clock.alpha;
    const x = lerp(b.prevX, b.spriteX, alpha) + f.dx;
    let y = lerp(b.prevY, b.spriteY, alpha) + f.dy - 4 * f.lift;
    // Resting bricks breathe by under a pixel on a slow stagger so a quiet board still feels alive.
    if (this.ctx.palette.kind === "generated" && b.gridX >= 0 && b !== this.frame.selectedBrick && !this.frame.lost) {
      y += Math.sin((this.ctx.clock.t / IDLE_MS) * Math.PI * 2 + b.gridX * 0.9 + b.gridY * 1.7) * IDLE_AMP;
    }
    if (this.frame.pushT0 >= 0 && b.gridX >= 0) {
      const l = this.board.layout;
      const pitch = l.cellH + l.cellSep;
      const e = this.ctx.clock.t - this.frame.pushT0;
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

  brickScale(b: Brick, f: BrickFx): number {
    const grow = b.inactiveDuration ? easeOutCubic(1 - b.inactiveTimer / b.inactiveDuration) : 1;
    let s = grow * f.s;
    if (b === this.frame.selectedBrick) s *= 1 + 0.015 * (1 - Math.cos((this.ctx.clock.t / D(BREATHE_MS)) * Math.PI * 2));
    if (this.frame.preview?.members.has(b)) s *= 1 + 0.04 * this.previewBreath();
    return s;
  }

  noaddOffset(f: BrickFx): number {
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
  renderShadow(g: CanvasRenderingContext2D, b: Brick): void {
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
  settled(b: Brick): boolean {
    if (b.gridX < 0 || b.spriteColor !== b.color) return false;
    const f = this.fxOf(b);
    if (f.lift > 0 || f.noaddT0 >= 0 || this.brickScale(b, f) < 0.98) return false;
    const l = this.board.layout;
    const p = this.drawPos(b, f);
    const slack = l.cellW * 0.08;
    return Math.abs(p.x - cellX(l, b.gridX)) < slack && Math.abs(p.y - cellY(l, b.gridY)) < slack;
  }

  /** Faint links between the bricks a drop would pop together, pulsing with their shared breath. */
  renderPreviewLinks(g: CanvasRenderingContext2D): void {
    const pv = this.frame.preview;
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
  renderImpactFrame(g: CanvasRenderingContext2D, paper: string): void {
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
    for (const d of this.frame.dieAnims) if (!d.burst) box(d.x, d.y, 1.18);
    g.restore();
    for (const b of this.board.replenishList) {
      const p = this.drawPos(b, this.fxOf(b));
      box(p.x, p.y);
    }
    if (this.frame.held) {
      const p = this.drawPos(this.frame.held, this.fxOf(this.frame.held));
      box(p.x, p.y);
    }
    g.fillStyle = ink;
    g.fillRect(l.boardX, replenishY(l) - l.cellSep * 1.5, l.boardW, Math.max(2, l.cellSep * 0.6));
  }

  renderSeams(g: CanvasRenderingContext2D, bricks: Brick[]): void {
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
  renderBrick(g: CanvasRenderingContext2D, b: Brick): void {
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
      if (e >= D(240) || TUNING.motion < 1) {
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
  renderPreview(g: CanvasRenderingContext2D): void {
    if (this.frame.pushing) return;
    const l = this.board.layout;
    const n = this.board.cellNum;
    const start = this.board.replenishList.length;
    const ry = replenishY(l);
    const pal = this.ctx.palette;
    // while a bespoke well fill is showing the next colour, its ghost would only sit on top of it
    const bespoke = pal.timer === "wells" && furnitureOf(pal).fill !== undefined && this.frame.wellLevel > 0;
    for (let k = bespoke ? 1 : 0; k < PREVIEW_COUNT; k++) {
      const i = start + k;
      if (i >= n) break;
      const s = 0.58 - k * 0.08;
      const alpha = 0.42 - k * 0.1;
      drawBlock(g, this.ctx.sprites.brick_sprite, colorFrame(this.frame.nextColors[k]), cellX(l, i), ry, l.cellW, l.cellH, s, s, 0, 0, alpha);
    }
  }

  /** The hold slot in the left rail and the brick parked in it. */
  renderHoldSlot(g: CanvasRenderingContext2D): void {
    const l = this.board.layout;
    const r = this.frame.rail;
    const pal = this.ctx.palette;
    const x = r.cx - r.slot / 2;
    const y = r.holdY - r.slot / 2;
    const active = this.frame.holdHover && (this.frame.selectedBrick !== null || this.frame.held !== null);
    // an empty slot invites a selected brick with a slow pulse of its active edge
    const invite = pal.kind === "generated" && !this.frame.held && this.frame.selectedBrick !== null && !active && TUNING.motion > 0;
    const pulse = invite ? 0.5 + 0.5 * Math.sin(this.ctx.clock.t / 260) : 0;
    if (pal.kind === "generated") {
      // Dashed while empty, so it reads as a place to put something.
      g.save();
      if (!this.frame.held) g.setLineDash([6, 5]);
      const slotR = cardRadius(pal.ui, 10);
      fillRoundRect(g, x, y, r.slot, r.slot, slotR, active ? pal.wellActive : pal.well, active ? pal.wellActiveEdge : pal.wellEdge, this.frame.held ? 1.5 : 2);
      if (pulse > 0) {
        g.globalAlpha = pulse * 0.7;
        fillRoundRect(g, x, y, r.slot, r.slot, slotR, "rgba(0,0,0,0)", pal.overlayAccent, 2);
        g.globalAlpha = 1;
      }
      g.restore();
      drawText(g, "HOLD", r.holdLabelX, r.holdLabelY, { size: Math.max(10, r.textSize * 0.62), color: pal.hudMuted, weight: 700, align: r.holdLabelAlign });
      if (this.frame.keyboardUsed && !l.portrait) drawKeycap(g, pal, "H", r.holdLabelX + r.side * 11, r.holdLabelY - 22);
    } else {
      drawSprite(g, this.ctx.sprites.replenish_frame_sprite, 0, x - 2, y - 2, r.slot + 4, r.slot + 4);
      if (active) fillRoundRect(g, x, y, r.slot, r.slot, 4, "rgba(255,255,255,0.18)");
      drawText(g, "Hold", r.cx, r.holdLabelY, { size: 12, color: pal.hudMuted, bold: false });
    }
    if (!this.frame.held) {
      if (pal.kind === "generated") {
        g.save();
        g.strokeStyle = pal.wellHint;
        g.fillStyle = pal.wellHint;
        ICONS.hold(g, r.cx, r.holdY, r.slot * 0.27);
        if (pulse > 0) {
          g.globalAlpha = pulse * 0.5;
          g.strokeStyle = pal.overlayAccent;
          g.fillStyle = pal.overlayAccent;
          ICONS.hold(g, r.cx, r.holdY, r.slot * 0.27);
        }
        g.restore();
      } else {
        drawText(g, "H", r.cx, r.holdY, { size: r.slot * 0.4, color: pal.wellHint, bold: true });
      }
      return;
    }
    const b = this.frame.held;
    const f = this.fxOf(b);
    const p = this.drawPos(b, f);
    const s = (r.slot / l.cellW) * this.brickScale(b, f);
    const sel = this.frame.selectedBrick === b;
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

  renderCallouts(g: CanvasRenderingContext2D): void {
    if (this.frame.callouts.length === 0) return;
    const t = this.ctx.clock.t;
    const pal = this.ctx.palette;
    g.save();
    for (const c of this.frame.callouts) {
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
  renderDieAnim(g: CanvasRenderingContext2D, d: DieAnim): void {
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
  renderSelector(g: CanvasRenderingContext2D): void {
    const sp = this.ctx.sprites;
    const l = this.board.layout;
    const sel = sp.replenish_selector_sprite;
    const frame = this.frame.selectedBrick ? colorFrame(this.frame.selectedBrick.color) : 6;
    const ry = replenishY(l);
    const t = this.ctx.clock.t;

    if (this.frame.selector.visible) {
      const sb = this.frame.selectedBrick;
      const f = sb ? this.fxOf(sb) : null;
      const ss = 1.1 * this.frame.selector.scale * (sb && f ? this.brickScale(sb, f) : 1);
      const lift = f ? -4 * f.lift : 0;
      drawBlock(g, sel, 7, this.frame.selector.x, ry, l.cellW, l.cellH, ss, ss, 0, lift);
      drawBlock(g, sel, frame, this.frame.selector.x, ry, l.cellW, l.cellH, ss, ss, 0, lift);
      const flash = t - this.frame.selector.flashT0;
      if (flash < D(200)) {
        g.globalAlpha = 1 - flash / D(200);
        fillRoundRect(
          g,
          this.frame.selector.x - l.cellW * 0.05,
          ry - l.cellH * 0.05,
          l.cellW * 1.1,
          l.cellH * 1.1,
          l.cellW * 0.2,
          "rgba(0,0,0,0)",
          "#E04A3F",
          4,
        );
        g.globalAlpha = 1;
      }
    }

    if (this.frame.ribbon.length > 1) {
      g.save();
      if (this.ctx.palette.particlesAdditive) g.globalCompositeOperation = "lighter";
      drawRibbon(g, this.frame.ribbon, t, l.cellW * 0.4, this.frame.ribbonColor);
      g.restore();
    }
    const showGhost = this.frame.selector.showGhost;
    if (showGhost && this.frame.selector.alpha > 0.01) {
      g.save();
      g.globalAlpha = Math.min(1, this.frame.selector.alpha);
      const col = this.ctx.palette.crosshair;
      const bx = this.frame.selector.ghostX;
      const by = this.frame.selector.ghostY;
      drawLine(g, l.boardX, by + l.cellH / 2, bx, by + l.cellH / 2, 3, col);
      drawLine(g, bx + l.cellW / 2, l.boardY, bx + l.cellW / 2, by, 3, col);
      drawLine(g, bx + l.cellW, by + l.cellH / 2, l.boardX + l.boardW, by + l.cellH / 2, 3, col);
      drawLine(g, bx + l.cellW / 2, by + l.cellH, bx + l.cellW / 2, l.boardY + l.boardW, 3, col);
      drawBlock(g, sel, frame, bx, by, l.cellW, l.cellH, 1.1, 1.1);
      g.restore();
    }
  }

  /** Toast chips sliding in over the top row of the board, newest lowest. */
  renderToasts(g: CanvasRenderingContext2D): void {
    if (this.frame.toasts.length === 0) return;
    const l = this.board.layout;
    const pal = this.ctx.palette;
    const t = this.ctx.clock.t;
    const style = { size: 13, weight: 700 as const };
    this.frame.toasts.forEach((c, i) => {
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
      const tr = pillRadius(pal.ui, h);
      fillRoundRect(g, cx - w / 2, cy - h / 2 + 2, w, h, tr, pal.ui.cardShadow);
      fillRoundRect(g, cx - w / 2, cy - h / 2, w, h, tr, pal.ui.card, c.color, 1.5);
      drawText(g, c.text, cx, cy + 1, { ...style, color: c.color });
      g.restore();
    });
  }
}
