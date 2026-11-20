/**
 * The in-game HUD: score, chain meter and multiplier badge, level pill,
 * goal ring with the subtract stars, and the replenish progress bar.
 * Draws from a `HudModel` the scene builds each frame, so it holds no
 * game state of its own; the VU meter's peak marker is the one piece of
 * render-side state, passed in and handed back.
 */
import type { GameType } from "../../core/constants";
import { gridBottom, replenishY, type Layout } from "../../core/layout";
import type { LineState } from "../../core/replenish";
import type { GoalState } from "../../core/scoring";
import { drawSprite, drawSpritePartX, drawText, fillRoundRect, measureText, pillRadius } from "../../engine/draw";
import { clamp01 } from "../../engine/easing";
import { TUNING } from "../../engine/fxTuning";
import type { HudRail } from "../../engine/hudLayout";
import { ICONS } from "../../engine/icons";
import { drawModeGlyph, MODE_COLOR, modeLabel } from "../../engine/modeGlyph";
import { vuLit, vuPeak, type VuPeak } from "../../engine/vuMeter";
import type { GameContext } from "../Scene";

export interface HudModel {
  /** The score as shown (it counts up behind the real score). */
  score: string;
  mult: number;
  chain: number;
  heat: number;
  /** Scale of the multiplier badge (it punches when the multiplier changes). */
  badgeScale: number;
  gameType: GameType;
  world: number;
  level: number;
  /** What is left to clear the level and what it started at: pops, or bricks in puzzle mode. */
  left: number;
  total: number;
  goal: GoalState;
  line: LineState;
  /** The classic bar's current and high-water progress, 0..1. */
  barCurrent: number;
  barMax: number;
  /** Progress of the bar's push flash, 0..1; 1 or more once it has faded. */
  barFlash: number;
  /** Game time, for the meter's shimmer and highlight. */
  t: number;
}

/** Progress toward the level's goal as a ring, the remaining count inside. */
function drawGoalRing(g: CanvasRenderingContext2D, ctx: GameContext, ring: { cx: number; cy: number; r: number }, frac: number, text: string): void {
  const pal = ctx.palette;
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
function drawStars(g: CanvasRenderingContext2D, ctx: GameContext, r: HudRail, goal: GoalState, portrait: boolean): void {
  const pal = ctx.palette;
  const { subtractGoal: n, subtractDone, goalAwarded } = goal;
  const size = r.textSize * 0.42;
  for (let i = 0; i < n; i++) {
    const done = goalAwarded || i < subtractDone;
    g.save();
    g.strokeStyle = pal.goalAccent;
    g.fillStyle = done ? pal.goalAccent : "rgba(0,0,0,0)";
    ICONS.star(g, r.starsX + i * r.starStep, r.starsY, size);
    g.restore();
  }
  const lx = r.starsX + (n - 0.5) * r.starStep + r.side * 8;
  // Upright, the band is tight: the stars stand for themselves and the label is one word.
  const label = portrait ? (goalAwarded ? "GOAL DONE" : "GOAL") : goalAwarded ? "SUBTRACT GOAL DONE" : "SUBTRACT GOAL";
  drawText(g, label, lx, r.starsY + 1, {
    size: r.textSize * 0.5,
    color: goalAwarded ? pal.goalAccent : pal.hudMuted,
    weight: 700,
    align: r.side > 0 ? "left" : "right",
  });
}

/**
 * The chain as a VU meter: a row of segments lit in the multiplier colour,
 * brighter toward the top, with a white peak marker that holds and falls.
 * From x3 the lit run shimmers like a tube under load. Returns the peak
 * marker to carry to the next frame.
 */
function drawVuMeter(g: CanvasRenderingContext2D, ctx: GameContext, x: number, cy: number, w: number, m: HudModel, peakIn: VuPeak): VuPeak {
  const pal = ctx.palette;
  const gap = 2;
  const n = Math.max(8, Math.min(24, Math.floor(w / 8)));
  const sw = (w - gap * (n - 1)) / n;
  const h = 7;
  const lit = vuLit(m.heat, n);
  const next = vuPeak(peakIn, lit, m.t);
  const peak = next.seg - 1;
  const color = pal.multColors[m.mult];
  const shimmer = m.mult >= 3 && TUNING.motion >= 1 ? 0.85 + 0.15 * Math.sin(m.t / 37) : 1;
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
  return next;
}

/** The chain meter as a track that drains while the chain cools off, with the multiplier as a badge at its right. */
function drawChainBar(g: CanvasRenderingContext2D, ctx: GameContext, meterX: number, meterY: number, meterW: number, m: HudModel, textSize: number): void {
  const pal = ctx.palette;
  const meterH = 5;
  const { mult, heat, chain, t } = m;
  fillRoundRect(g, meterX, meterY - meterH / 2, meterW, meterH, pillRadius(pal.ui, meterH), pal.track);
  if (heat > 0) {
    const fillW = Math.max(meterH, meterW * heat);
    if (pal.glow) {
      g.save();
      g.shadowColor = pal.multColors[mult];
      g.shadowBlur = 8;
      fillRoundRect(g, meterX, meterY - meterH / 2, fillW, meterH, pillRadius(pal.ui, meterH), pal.multColors[mult]);
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
        g.roundRect(meterX, meterY - meterH / 2, fillW, meterH, pillRadius(pal.ui, meterH));
        g.clip();
        g.fillStyle = hl;
        g.fillRect(hx - 18, meterY - meterH / 2, 36, meterH);
        g.restore();
      }
    } else {
      fillRoundRect(g, meterX, meterY - meterH / 2, fillW, meterH, pillRadius(pal.ui, meterH), pal.multColors[mult]);
    }
  }
  // caption on the left, the multiplier as a badge on the right so x3 reads without watching the bar
  drawText(g, "CHAIN", meterX, meterY + 12, { size: textSize * 0.55, color: pal.hudMuted, weight: 700, align: "left" });
  if (chain > 0) {
    const bw = textSize * 2.1;
    const bh = textSize * 1.05;
    g.save();
    g.translate(meterX + meterW - bw / 2, meterY + 12);
    g.scale(m.badgeScale, m.badgeScale);
    if (pal.glow) {
      g.shadowColor = pal.multColors[mult];
      g.shadowBlur = 8;
    }
    fillRoundRect(g, -bw / 2, -bh / 2, bw, bh, pillRadius(pal.ui, bh), pal.multColors[mult]);
    g.shadowBlur = 0;
    drawText(g, `x${mult}`, 0, 1, { size: textSize * 0.7, color: "#ffffff", weight: 800, tabular: true });
    g.restore();
  }
}

/** The level pill: the mode's brick glyph before its name, the long form when the pill is wide enough. */
function drawLevelPill(g: CanvasRenderingContext2D, ctx: GameContext, r: HudRail, m: HudModel): void {
  const pal = ctx.palette;
  const textSize = r.textSize;
  const pillW = r.pillW;
  const pillH = textSize * 1.5;
  const pillY = r.levelY;
  fillRoundRect(g, r.pillCx - pillW / 2, pillY - pillH / 2, pillW, pillH, pillRadius(pal.ui, pillH), pal.pill, pal.pillEdge);
  const style = { size: textSize * 0.75, color: pal.hudText, weight: 700 };
  const gr = textSize * 0.3;
  let modeText = `${modeLabel(m.gameType)}  World ${m.world} · Level ${m.level + 1}`;
  let tw = measureText(g, modeText, style);
  if (gr * 2 + 6 + tw > pillW - textSize) {
    modeText = `${modeLabel(m.gameType)} ${m.world}-${m.level + 1}`;
    tw = measureText(g, modeText, style);
  }
  const span = gr * 2 + 6 + tw;
  drawModeGlyph(g, m.gameType, r.pillCx - span / 2 + gr, pillY, gr, pal.brickColors[MODE_COLOR[m.gameType]], 2);
  drawText(g, modeText, r.pillCx + span / 2 - tw / 2, pillY, style);
}

/** The modern column: score with its glow, chain meter, level pill, goal ring and stars. */
function drawModernHud(g: CanvasRenderingContext2D, ctx: GameContext, l: Layout, r: HudRail, m: HudModel, peak: VuPeak): VuPeak {
  const pal = ctx.palette;
  const textSize = r.textSize;
  const caption = (txt: string, x: number, y: number, align: CanvasTextAlign = "center") =>
    drawText(g, txt.toUpperCase(), x, y, { size: textSize * 0.62, color: pal.hudMuted, weight: 700, align });
  const big = (txt: string, x: number, y: number) => drawText(g, txt, x, y, { size: textSize * 1.9, color: pal.hudText, weight: 700, tabular: true });
  caption("Score", r.scoreCx, r.scoreCapY);
  if (pal.glow) {
    g.save();
    g.shadowColor = pal.multColors[m.mult];
    g.shadowBlur = 6;
    big(m.score, r.scoreCx, r.scoreY);
    g.restore();
  } else {
    big(m.score, r.scoreCx, r.scoreY);
  }

  const meterX = r.scoreCx - r.meterW / 2;
  let next = peak;
  if (pal.fx.meter === "vu") {
    next = drawVuMeter(g, ctx, meterX, r.chainY, r.meterW, m, peak);
    drawText(g, "CHAIN", meterX, r.chainY + 12, { size: textSize * 0.55, color: pal.hudMuted, weight: 700, align: "left" });
    if (m.chain > 0) drawBadge(g, ctx, meterX + r.meterW, r.chainY + 12, m, textSize);
  } else {
    drawChainBar(g, ctx, meterX, r.chainY, r.meterW, m, textSize);
  }

  drawLevelPill(g, ctx, r, m);

  // The goal ring fills toward the target; the count sits inside it.
  const puzzle = m.gameType === "puzzle";
  drawGoalRing(g, ctx, r.ring, m.total > 0 ? clamp01(1 - m.left / m.total) : 0, String(m.left));
  caption(puzzle ? "Bricks left" : "Pops to go", r.goalCapX, r.goalCapY, r.goalAlign);
  drawText(g, `${Math.max(0, m.total - m.left)} of ${m.total}`, r.goalCapX, r.goalY, {
    size: textSize * 0.8,
    color: pal.hudText,
    weight: 700,
    tabular: true,
    align: r.goalAlign,
  });
  if (m.goal.subtractGoal > 0) drawStars(g, ctx, r, m.goal, l.portrait);
  return next;
}

/** The multiplier badge on its own (the VU meter draws its own track). */
function drawBadge(g: CanvasRenderingContext2D, ctx: GameContext, rightX: number, cy: number, m: HudModel, textSize: number): void {
  const pal = ctx.palette;
  const bw = textSize * 2.1;
  const bh = textSize * 1.05;
  g.save();
  g.translate(rightX - bw / 2, cy);
  g.scale(m.badgeScale, m.badgeScale);
  if (pal.glow) {
    g.shadowColor = pal.multColors[m.mult];
    g.shadowBlur = 8;
  }
  fillRoundRect(g, -bw / 2, -bh / 2, bw, bh, pillRadius(pal.ui, bh), pal.multColors[m.mult]);
  g.shadowBlur = 0;
  drawText(g, `x${m.mult}`, 0, 1, { size: textSize * 0.7, color: "#ffffff", weight: 800, tabular: true });
  g.restore();
}

/** The classic column, as the original drew it: plain text, a thin chain bar and the pops counter at the bottom. */
function drawClassicHud(g: CanvasRenderingContext2D, ctx: GameContext, r: HudRail, m: HudModel): void {
  const pal = ctx.palette;
  const textSize = r.textSize;
  const cx = r.cx;
  drawText(g, `Score:\n${m.score}`, cx, r.scoreY, { size: textSize, color: pal.hudText, tabular: true });
  const meterW = r.meterW;
  g.fillStyle = "rgba(0,0,0,0.15)";
  g.fillRect(cx - meterW / 2, r.chainY - 2, meterW, 4);
  if (m.heat > 0) {
    g.fillStyle = pal.multColors[m.mult];
    g.fillRect(cx - meterW / 2, r.chainY - 2, meterW * m.heat, 4);
  }
  if (m.chain > 0) {
    g.save();
    g.translate(cx, r.chainY - 10);
    g.scale(m.badgeScale, m.badgeScale);
    drawText(g, `Chain x${m.mult}`, 0, 0, { size: textSize * 0.65, color: pal.hudText });
    g.restore();
  }
  drawText(g, `Level ${m.world}-${m.level + 1}`, cx, r.levelY, { size: textSize * 0.8, color: pal.hudMuted, bold: false });
  const { subtractGoal, subtractDone, goalAwarded } = m.goal;
  if (subtractGoal > 0) {
    drawText(g, "Subtract pops", cx, r.goalLabelY, { size: textSize * 0.65, color: pal.hudMuted, bold: false });
    drawText(g, goalAwarded ? `${subtractGoal}/${subtractGoal} done` : `${subtractDone}/${subtractGoal}`, cx, r.goalY, {
      size: textSize * 0.85,
      color: pal.hudText,
      tabular: true,
    });
  }
  const label = m.gameType === "puzzle" ? "Bricks left" : "Pops left";
  drawText(g, `${label}\n${m.left}`, cx, r.popsY, { size: textSize, color: pal.hudText, tabular: true });
}

/**
 * The fill timer under the grid (themes without wells): a well with one
 * segment per replenish slot that fills left to right as bricks arrive and,
 * once the line is full, drains in the accent colour while the push counts
 * down. Classic draws the original sprite bar at the grid's bottom edge.
 */
function drawProgressBar(g: CanvasRenderingContext2D, ctx: GameContext, l: Layout, m: HudModel): void {
  const pal = ctx.palette;
  const bar = ctx.sprites.progressbar_sprite;
  const n = l.cellNum;
  const barX = Math.floor(l.boardX);
  const current = m.barCurrent;
  const maxP = m.barMax;
  if (pal.kind === "generated") {
    const gb = gridBottom(l);
    const gap = replenishY(l) - gb;
    const barH = 9;
    const barY = Math.round(gb + (gap - barH) / 2);
    const barW = l.boardW;
    const r = barH / 2;
    const draining = m.line.readyToPush;
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
      const pulse = 0.75 + 0.25 * Math.sin(m.t / 120);
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
    if (m.barFlash < 1) {
      g.globalAlpha = 0.8 * (1 - m.barFlash);
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
  if (m.barFlash < 1) {
    g.globalAlpha = 0.8 * (1 - m.barFlash);
    g.fillStyle = "#ffffff";
    g.fillRect(barX, barY, l.boardW, barH);
    g.globalAlpha = 1;
  }
}

/** `Board` draw event: score, chain meter, level, goal counter and progress bar. Returns the VU peak to keep. */
export function drawHud(g: CanvasRenderingContext2D, ctx: GameContext, l: Layout, r: HudRail, m: HudModel, peak: VuPeak): VuPeak {
  const pal = ctx.palette;
  let next = peak;
  if (pal.kind === "generated") next = drawModernHud(g, ctx, l, r, m, peak);
  else drawClassicHud(g, ctx, r, m);
  if (pal.timer !== "wells") drawProgressBar(g, ctx, l, m);
  return next;
}
