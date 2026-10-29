import { SCREEN_H, SCREEN_W } from "./constants";

/**
 * Board geometry, ported from `board_reset_size.gml`.
 * Everything is derived from the screen size and the number of cells per side.
 */
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

export function computeLayout(cellNum: number, spacing: LayoutSpacing = NO_SPACING): Layout {
  const cellSep = Math.floor(SCREEN_H / 200);
  const avail = SCREEN_H - spacing.top - spacing.gap - spacing.bottom;
  const cellH = (avail - cellSep * (cellNum + 2)) / (cellNum + 1);
  const cellW = cellH;
  const boardW = cellW * cellNum + (cellSep * cellNum - (cellNum & 1));
  const boardX = SCREEN_W / 2 - (cellW * cellNum) / 2 - (cellSep * cellNum - (cellNum & 1)) / 2;
  const boardY = spacing.top;
  const boardH = SCREEN_H - spacing.top - spacing.bottom;
  const replenishYv = SCREEN_H - spacing.bottom - cellH - cellSep;
  return { cellNum, cellSep, cellW, cellH, boardX, boardY, boardW, boardH, replenishY: replenishYv };
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
