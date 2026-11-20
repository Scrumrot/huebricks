/**
 * The modern level-complete card: stars that pop in one after another,
 * where the level's points came from, and Next / Replay / Title.
 */
import type { GameType } from "../../core/constants";
import { levelStars, MAX_STARS, thirdStarHint, type LevelRun } from "../../core/rating";
import type { Tally } from "../../core/scoring";
import type { ButtonFeel } from "../../engine/buttonFeel";
import { drawCard, drawText, measureText, type PillButton } from "../../engine/draw";
import { clamp01, easeOutBack } from "../../engine/easing";
import { ICONS } from "../../engine/icons";
import { drawModeGlyph, MODE_COLOR, modeLabel } from "../../engine/modeGlyph";
import { drawCardButtons } from "../../engine/overlayCard";
import type { GameContext } from "../Scene";

export interface LevelCardLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Breakdown rows: pops and chains, plus the subtract bonus when the level had one. */
  rows: number;
}

/** Geometry of the card: a column of rows with the three buttons along the bottom. */
export function levelCardLayout(view: { w: number; h: number }, withSubtract: boolean): LevelCardLayout {
  const rows = withSubtract ? 3 : 2;
  const w = Math.min(420, view.w - 24);
  const h = 128 + 22 + rows * 24 + 34 + 60 + 24;
  return { x: view.w / 2 - w / 2, y: Math.max(8, view.h / 2 - h / 2), w, h, rows };
}

/** Next, Replay and Title, Next as the primary, shifted by the card's slide-in offset. */
export function levelButtons(L: LevelCardLayout, off: number): PillButton[] {
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

export interface LevelCardModel {
  gameType: GameType;
  world: number;
  level: number;
  /** The score as shown (still counting up). */
  shown: number;
  run: LevelRun;
  tally: Tally;
  /** ms since the card opened, after the scene's animation rate. */
  e: number;
  /** Stretches the star choreography with the scene's animation rate. */
  scale: (ms: number) => number;
  /** The buttons take input (the celebration is over). */
  buttonsOpen: boolean;
  /** How many stars have chimed so far. */
  starsSounded: number;
}

/** Draw the card over an already dimmed screen. Returns how many stars have chimed, for the next frame. */
export function drawLevelCard(g: CanvasRenderingContext2D, ctx: GameContext, feel: ButtonFeel, L: LevelCardLayout, m: LevelCardModel, off: number): number {
  const pal = ctx.palette;
  const x = L.x;
  const y = L.y + off;
  const cx = ctx.view.w / 2;
  let sounded = m.starsSounded;
  drawCard(g, pal.ui, x, y, L.w, L.h, 20);
  drawText(g, "Level complete", cx, y + 40, { size: 28, color: pal.overlayText, weight: 600, font: pal.display });
  {
    const sub = `${modeLabel(m.gameType)} ${m.world}-${m.level + 1}`;
    const subStyle = { size: 13, color: pal.hudMuted, weight: 500 };
    const tw = measureText(g, sub, subStyle);
    drawModeGlyph(g, m.gameType, cx - tw / 2 - 6, y + 64, 5, pal.brickColors[MODE_COLOR[m.gameType]], 1.8);
    drawText(g, sub, cx + 6, y + 64, subStyle);
  }
  // stars, popping in one after another
  const stars = levelStars(m.run);
  const starY = y + 102;
  for (let i = 0; i < MAX_STARS; i++) {
    const earned = i < stars;
    const pop = easeOutBack(clamp01((m.e - m.scale(300 + i * 160)) / m.scale(260)));
    if (pop <= 0) continue;
    if (earned && i >= sounded) {
      sounded = i + 1;
      ctx.audio.event("star", { rate: 1 + i * 0.25 });
    }
    g.save();
    g.strokeStyle = earned ? pal.goalAccent : pal.hudMuted;
    g.fillStyle = earned ? pal.goalAccent : "rgba(0,0,0,0)";
    ICONS.star(g, cx + (i - 1) * 40, starY, 15 * pop);
    g.restore();
  }
  drawText(g, stars === MAX_STARS ? "Perfect" : thirdStarHint(m.run), cx, starY + 26, { size: 11, color: pal.hudMuted, weight: 600 });
  // the breakdown
  const rows: [string, number][] = [
    ["Pops", m.tally.pops],
    ["Chains", m.tally.chain],
  ];
  if (L.rows > 2) rows.push(["Subtract bonus", m.tally.subtract]);
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
  drawText(g, String(m.shown), right, ry, { ...numStyle, size: 18, color: pal.overlayAccent, align: "right" });
  if (m.buttonsOpen) drawCardButtons(g, pal, ctx.input, feel, levelButtons(L, off), 0, "level");
  return sounded;
}
