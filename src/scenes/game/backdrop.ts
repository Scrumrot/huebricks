/**
 * The board's backdrop: on the generated themes the scenery, empty cells
 * (or wells), the replenish tray with the next well filling as the timer
 * runs, and any paint stains; on classic the original frame, world picture,
 * grid lines and sidebars.
 */
import type { Color } from "../../core/color";
import { cellX, cellY, replenishY, type Layout } from "../../core/layout";
import { pushCountdown, type LineState } from "../../core/replenish";
import { BACKDROPS, furnitureOf } from "../../engine/backdrops";
import { drawLine, drawSprite, fillRoundRect } from "../../engine/draw";
import { clamp01, easeOutCubic } from "../../engine/easing";
import { drawStain, rgba } from "../../engine/modernSkin";
import type { GameContext } from "../Scene";

/** Paint left on the paper where a group popped. */
export interface Stain {
  x: number;
  y: number;
  r: number;
  color: string;
  t0: number;
  dur: number;
  seed: number;
}

export interface BackdropModel {
  world: number;
  t: number;
  /** Vertical squash of the board from the push heave; the scenery jolts with it. */
  heaveSy: number;
  /** 1 right after a level clear, easing to 0. */
  flare: number;
  line: LineState;
  /** Fill of the next well, 0..1. */
  wellLevel: number;
  /** The colour the next well fills with. */
  nextColor: Color;
  stains: Stain[];
  /** The last eight-step well level that ticked (pixel themes). */
  wellStep: number;
}

/** Draw the backdrop under everything. Returns the well step to carry to the next frame. */
export function drawBoardBackdrop(g: CanvasRenderingContext2D, ctx: GameContext, l: Layout, m: BackdropModel): number {
  const sp = ctx.sprites;
  const n = l.cellNum;
  const pal = ctx.palette;
  let wellStep = m.wellStep;

  if (pal.kind === "generated") {
    if (pal.backdrop !== "sprites") {
      // The scenery jolts with the board when a row lands.
      const jolt = (1 - m.heaveSy) * l.cellH * 0.8;
      g.save();
      g.translate(0, jolt);
      BACKDROPS[pal.backdrop](g, m.t, l, m.flare);
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
      if (m.line.readyToPush) {
        // The tray reddens and pulses as the push gets closer.
        const near = clamp01(m.line.line / pushCountdown(m.line));
        const pulse = 0.8 + 0.2 * Math.sin(m.t / 110);
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
      const filling = m.line.num;
      const level = m.wellLevel;
      // pixel themes fill in eight steps, with a tick on each
      if (pal.pixelated) {
        const step = Math.round(level * 8);
        if (step > wellStep && step > 0) ctx.audio.cue("tick", 0.35, 0.9 + step * 0.04);
        wellStep = step;
      }
      const colour = pal.brickColors[m.nextColor];
      for (let x = 0; x < n; x++) {
        const wx = cellX(l, x) + pad;
        const wy = ry + pad;
        const ww = l.cellW - pad * 2;
        const wh = l.cellH - pad * 2;
        well(g, wx, wy, ww, wh);
        if (x !== filling || m.line.readyToPush) continue;
        if (fill) {
          fill(g, wx, wy, ww, wh, level, colour, m.t);
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
      for (const st of pal.stains ? m.stains : []) {
        const p = (m.t - st.t0) / st.dur;
        if (p < 0) continue;
        const a = p < 0.08 ? p / 0.08 : 1 - easeOutCubic((p - 0.08) / 0.92);
        drawStain(g, st.x, st.y, st.r, st.color, 0.2 * a, st.seed);
      }
      return wellStep;
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
    return wellStep;
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
    m.world,
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
  return wellStep;
}
