import { SCREEN_H, SCREEN_W } from "./constants";

/**
 * Board geometry, ported from `board_reset_size.gml`.
 * Everything is derived from the screen size and the number of cells per side.
 */
/** The logical viewport the board is laid out in (see engine/view.ts). */
export interface Viewport {
  w: number;
  h: number;
  /** Stack the HUD above and below the board instead of beside it. */
  portrait: boolean;
}

/** The original 3:2 room; the default so the classic geometry is unchanged. */
export const DESIGN_VIEWPORT: Viewport = { w: SCREEN_W, h: SCREEN_H, portrait: false };

/** Narrowest HUD column beside the board before the board starts shrinking (landscape). */
const RAIL_MIN = 104;
/** Margin either side of the board, and the HUD bands above and below it (portrait). */
const PORTRAIT_MARGIN = 18;
const PORTRAIT_TOP = 112;
const PORTRAIT_BOTTOM = 116;

export interface Layout {
  cellNum: number;
  cellSep: number;
  cellW: number;
  cellH: number;
  boardX: number;
  boardY: number;
  boardW: number;
  boardH: number;
  /** Screen y of the replenish line (the row of pending bricks under the grid). */
  replenishY: number;
  /** The viewport this layout was measured for. */
  vp: Viewport;
  /** HUD stacked above/below the board (true) or beside it (false). */
  portrait: boolean;
  /** Width of each HUD column beside the board (0 in portrait); the board sits between them. */
  railW: number;
  /** Heights of the HUD bands above and below the board (0 in landscape). */
  hudTop: number;
  hudBottom: number;
  /** Top edges of those bands: the bands hug the board so the whole block sits centred. */
  hudTopY: number;
  hudBottomY: number;
  /** Top of the grid-plus-tray stack (its height is `boardH`); side HUD columns span it. */
  stackY: number;
}

/**
 * Extra breathing room a theme asks for: above the grid, between the grid
 * and the replenish line (where the fill timer sits), and under the line.
 * The classic layout uses none, exactly like the GameMaker original.
 */
export interface LayoutSpacing {
  top: number;
  gap: number;
  bottom: number;
}

export const NO_SPACING: LayoutSpacing = { top: 0, gap: 0, bottom: 0 };

export function computeLayout(cellNum: number, spacing: LayoutSpacing = NO_SPACING, vp: Viewport = DESIGN_VIEWPORT): Layout {
  const portrait = vp.portrait;
  const cellSep = Math.floor(Math.min(vp.w, vp.h) / 200);
  const seps = cellSep * cellNum - (cellNum & 1);
  const hudTop = portrait ? PORTRAIT_TOP : 0;
  const hudBottom = portrait ? PORTRAIT_BOTTOM : 0;
  const sideMin = portrait ? PORTRAIT_MARGIN : RAIL_MIN;
  // The grid, the gap under it and the replenish row form one stack. Cells are
  // as big as the height allows (the original rule) unless the width is the
  // tighter constraint, and the stack is centred in whatever is left over.
  const availH = vp.h - hudTop - hudBottom - spacing.top - spacing.gap - spacing.bottom;
  const fromH = (availH - cellSep * (cellNum + 2)) / (cellNum + 1);
  const fromW = (vp.w - sideMin * 2 - seps) / cellNum;
  const cellH = Math.max(8, Math.min(fromH, fromW));
  const cellW = cellH;
  const boardW = cellW * cellNum + seps;
  const boardX = vp.w / 2 - boardW / 2;
  const stackH = cellH * (cellNum + 1) + cellSep * (cellNum + 2) + spacing.gap;
  const free = Math.max(0, vp.h - hudTop - hudBottom - spacing.top - spacing.bottom - stackH);
  const hudTopY = free / 2;
  const stackY = hudTopY + hudTop;
  const boardY = stackY + spacing.top;
  const replenishYv = boardY + cellNum * cellH + (cellNum + 1) * cellSep + spacing.gap;
  const hudBottomY = replenishYv + cellH + cellSep + spacing.bottom;
  const railW = portrait ? 0 : Math.min(boardX, Math.max(150, vp.h * 0.315));
  return {
    cellNum,
    cellSep,
    cellW,
    cellH,
    boardX,
    boardY,
    boardW,
    boardH: stackH,
    replenishY: replenishYv,
    vp,
    portrait,
    railW,
    hudTop,
    hudBottom,
    hudTopY,
    hudBottomY,
    stackY,
  };
}

/** Screen x of grid column `gx`. */
export function cellX(l: Layout, gx: number): number {
  return gx * (l.cellW + l.cellSep) + l.boardX;
}

/** Screen y of grid row `gy`. */
export function cellY(l: Layout, gy: number): number {
  return gy * (l.cellH + l.cellSep) + l.boardY;
}

/** Screen y of the replenish line (the row of pending bricks under the board). */
export function replenishY(l: Layout): number {
  return l.replenishY;
}

/** Bottom edge of the grid (where the fill timer and the gap begin). */
export function gridBottom(l: Layout): number {
  return cellY(l, l.cellNum) - l.cellSep;
}

/** Convert a screen point to grid coordinates (may be out of range). */
export function screenToGrid(l: Layout, sx: number, sy: number): { gx: number; gy: number } {
  return {
    gx: Math.floor((sx - l.boardX) / (l.cellW + l.cellSep)),
    gy: Math.floor((sy - l.boardY) / (l.cellH + l.cellSep)),
  };
}
