import { BLUE, RED, YELLOW, type Color } from "../core/color";
import type { GameType } from "../core/constants";
import { GLYPHS, glyphPath } from "./skinKit";

/**
 * Each game mode borrows a brick's glyph so the mode reads the same way on
 * the title, in the HUD pill and on the pause card: Puzzle is the red
 * octagon, Normal the blue diamond, Zen the yellow circle.
 */
export const MODE_COLOR: Record<GameType, Color> = { puzzle: RED, normal: BLUE, zen: YELLOW };

export function modeLabel(type: GameType): string {
  return type[0].toUpperCase() + type.slice(1);
}

/** Stroke the mode's glyph centred at (cx, cy) with radius `r`. */
export function drawModeGlyph(g: CanvasRenderingContext2D, type: GameType, cx: number, cy: number, r: number, color: string, lineWidth = 2): void {
  g.save();
  g.lineWidth = lineWidth;
  g.lineJoin = "round";
  g.strokeStyle = color;
  g.beginPath();
  glyphPath(g, GLYPHS[MODE_COLOR[type]][0], cx, cy, r);
  g.stroke();
  g.restore();
}
