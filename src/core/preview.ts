import type { Board } from "./Board";
import type { Brick } from "./Brick";
import { combineColors, type Color } from "./color";

/** What a drop would do to the board: the colour the target takes and the group it would then belong to. */
export interface PlacementPreview {
  color: Color;
  /** The target brick and every brick 4-connected to it in the new colour. */
  members: Brick[];
}

const STEPS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const;

/**
 * The group the board brick at (x, y) would join if the selected colour were
 * applied to it, without touching the board. Null when there is no brick
 * there or the combine is illegal under the level's rules.
 */
export function groupIfPlaced(board: Board, selected: Color, x: number, y: number, canAdd = true, canSubtract = true): PlacementPreview | null {
  const dest = board.get(x, y);
  if (!dest) return null;
  const color = combineColors(selected, dest.color, canAdd, canSubtract);
  if (color === null) return null;
  const colorAt = (b: Brick): Color => (b === dest ? color : b.color);
  const seen = new Set<Brick>([dest]);
  const members: Brick[] = [];
  const stack: [number, number][] = [[x, y]];
  while (stack.length) {
    const [cx, cy] = stack.pop()!;
    members.push(board.get(cx, cy)!);
    for (const [dx, dy] of STEPS) {
      const nb = board.get(cx + dx, cy + dy);
      if (nb && !seen.has(nb) && colorAt(nb) === color) {
        seen.add(nb);
        stack.push([cx + dx, cy + dy]);
      }
    }
  }
  return { color, members };
}
