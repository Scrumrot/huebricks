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
}

export function computeLayout(cellNum: number): Layout {
  const cellSep = Math.floor(SCREEN_H / 200);
  const cellH = (SCREEN_H - cellSep * (cellNum + 2)) / (cellNum + 1);
  const cellW = cellH;
  const boardW = cellW * cellNum + (cellSep * cellNum - (cellNum & 1));
  const boardX = SCREEN_W / 2 - (cellW * cellNum) / 2 - (cellSep * cellNum - (cellNum & 1)) / 2;
  return { cellNum, cellSep, cellW, cellH, boardX, boardY: 0, boardW, boardH: SCREEN_H };
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
  return SCREEN_H - l.cellH - l.cellSep;
}

/** Convert a screen point to grid coordinates (may be out of range). */
export function screenToGrid(l: Layout, sx: number, sy: number): { gx: number; gy: number } {
  return {
    gx: Math.floor((sx - l.boardX) / (l.cellW + l.cellSep)),
    gy: Math.floor((sy - l.boardY) / (l.cellH + l.cellSep)),
  };
}
