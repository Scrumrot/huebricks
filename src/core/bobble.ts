import type { Color } from "./color";

/**
 * Hex-packed bubble grid for Hue Bobble. Rows alternate between `cols`
 * bubbles and `cols - 1` bubbles shifted right by half a bubble, like
 * Puzzle Bobble. Row 0 hangs from the ceiling. Pure logic, no rendering.
 *
 * Geometry helpers take the bubble radius `r` and return positions relative
 * to the playfield's top-left corner, with the ceiling drop (rows the whole
 * cluster has been pushed down) already applied.
 */
export interface Bubble {
  readonly id: number;
  color: Color;
  row: number;
  col: number;
}

export const ROW_PITCH = Math.sqrt(3) / 2;

let nextId = 1;

export class BubbleGrid {
  readonly cols: number;
  /** Rows the grid can hold before the lose line. */
  readonly rows: number;
  /** Rows the ceiling has come down. */
  drop = 0;
  private grid: (Bubble | null)[][];

  constructor(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    this.grid = Array.from({ length: rows }, (_, row) => Array.from({ length: this.width(row) }, () => null));
  }

  /** Bubbles in a row: shifted rows hold one fewer. */
  width(row: number): number {
    return row % 2 === 1 ? this.cols - 1 : this.cols;
  }

  inBounds(row: number, col: number): boolean {
    return row >= 0 && row < this.rows && col >= 0 && col < this.width(row);
  }

  get(row: number, col: number): Bubble | null {
    return this.inBounds(row, col) ? this.grid[row][col] : null;
  }

  isFree(row: number, col: number): boolean {
    return this.inBounds(row, col) && this.grid[row][col] === null;
  }

  add(row: number, col: number, color: Color): Bubble {
    const b: Bubble = { id: nextId++, color, row, col };
    this.grid[row][col] = b;
    return b;
  }

  remove(b: Bubble): void {
    if (this.inBounds(b.row, b.col) && this.grid[b.row][b.col] === b) this.grid[b.row][b.col] = null;
  }

  bubbles(): Bubble[] {
    const out: Bubble[] = [];
    for (const row of this.grid) for (const b of row) if (b) out.push(b);
    return out;
  }

  count(): number {
    return this.bubbles().length;
  }

  /** Lowest occupied row index, or -1 when empty. */
  bottomRow(): number {
    for (let row = this.rows - 1; row >= 0; row--) {
      if (this.grid[row].some((b) => b)) return row;
    }
    return -1;
  }

  /** The six hex neighbours of a cell (some may be out of bounds). */
  neighbors(row: number, col: number): Array<[number, number]> {
    const shifted = row % 2 === 1;
    const d = shifted ? 1 : 0;
    return [
      [row - 1, col - 1 + d],
      [row - 1, col + d],
      [row, col - 1],
      [row, col + 1],
      [row + 1, col - 1 + d],
      [row + 1, col + d],
    ];
  }

  /** Centre of a cell in playfield units, `r` being the bubble radius. */
  center(row: number, col: number, r: number): { x: number; y: number } {
    const shifted = row % 2 === 1;
    return { x: r + col * 2 * r + (shifted ? r : 0), y: r + (row + this.drop) * 2 * r * ROW_PITCH };
  }

  /** Nearest cell (row, col) to a playfield point; may be out of bounds. */
  cellAt(x: number, y: number, r: number): { row: number; col: number } {
    const row = Math.round((y - r) / (2 * r * ROW_PITCH)) - this.drop;
    const shifted = row % 2 === 1 || row % 2 === -1;
    const col = Math.round((x - r - (shifted ? r : 0)) / (2 * r));
    return { row, col };
  }

  /**
   * The free cell a shot at (x, y) should snap into: the nearest free cell
   * within two bubble widths, preferring ones that touch the cluster or the
   * ceiling. Null if nothing is reachable (should not happen in play).
   */
  snapCell(x: number, y: number, r: number): { row: number; col: number } | null {
    const near = this.cellAt(x, y, r);
    let best: { row: number; col: number } | null = null;
    let bestD = Infinity;
    for (let row = near.row - 2; row <= near.row + 2; row++) {
      for (let col = near.col - 2; col <= near.col + 2; col++) {
        if (!this.isFree(row, col)) continue;
        if (!(row === 0 || this.neighbors(row, col).some(([nr, nc]) => this.get(nr, nc)))) continue;
        const c = this.center(row, col, r);
        const d = Math.hypot(c.x - x, c.y - y);
        if (d < bestD) {
          bestD = d;
          best = { row, col };
        }
      }
    }
    return best;
  }

  /** Connected bubbles of the same colour as the one at (row, col), including it. */
  group(row: number, col: number): Bubble[] {
    const start = this.get(row, col);
    if (!start) return [];
    const seen = new Set<Bubble>([start]);
    const stack = [start];
    const out: Bubble[] = [];
    while (stack.length) {
      const b = stack.pop()!;
      out.push(b);
      for (const [nr, nc] of this.neighbors(b.row, b.col)) {
        const nb = this.get(nr, nc);
        if (nb && nb.color === start.color && !seen.has(nb)) {
          seen.add(nb);
          stack.push(nb);
        }
      }
    }
    return out;
  }

  /** Bubbles not connected to the ceiling through other bubbles. */
  floating(): Bubble[] {
    const anchored = new Set<Bubble>();
    const stack: Bubble[] = [];
    for (const b of this.grid[0])
      if (b) {
        anchored.add(b);
        stack.push(b);
      }
    while (stack.length) {
      const b = stack.pop()!;
      for (const [nr, nc] of this.neighbors(b.row, b.col)) {
        const nb = this.get(nr, nc);
        if (nb && !anchored.has(nb)) {
          anchored.add(nb);
          stack.push(nb);
        }
      }
    }
    return this.bubbles().filter((b) => !anchored.has(b));
  }

  /** Fill the top `fillRows` rows from a colour list. */
  populate(fillRows: number, colors: readonly Color[], rng: () => number = Math.random): void {
    for (let row = 0; row < Math.min(fillRows, this.rows); row++) {
      for (let col = 0; col < this.width(row); col++) {
        if (!this.grid[row][col]) this.add(row, col, colors[Math.floor(rng() * colors.length)]);
      }
    }
  }

  /** Colours currently in the cluster (so shots stay useful). */
  colorsPresent(): Color[] {
    const set = new Set<Color>();
    for (const b of this.bubbles()) set.add(b.color);
    return [...set];
  }

  /** Debug helper: rows of colour digits ('.' = empty), shifted rows indented. */
  toString(): string {
    return this.grid.map((row, i) => (i % 2 ? " " : "") + row.map((b) => (b ? String(b.color) : ".")).join(" ")).join("\n");
  }
}

// -----------------------------------------------------------------------------
// Shot physics and level rules, pure
// -----------------------------------------------------------------------------

/** A bubble in flight, in playfield units (origin at the playfield's top-left). */
export interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface ShotStep {
  shot: Shot;
  /** Side-wall bounces during this step. */
  bounces: number;
  /** Set when the shot arrived: the bubble it touched, or null at the bare ceiling. */
  landed: { hit: Bubble | null } | null;
}

/** A shot touches a bubble inside this many radii (a little under two, so it can thread a gap). */
export const HIT_RADII = 1.8;
/** A ceiling arrival still counts as hitting a bubble within this many radii. */
export const NEAR_RADII = 2.1;

/**
 * Move a shot for one sim step inside a playfield `w` wide, bouncing off
 * the side walls and stopping at the ceiling or the first bubble it touches.
 */
export function advanceShot(grid: BubbleGrid, shot: Shot, r: number, w: number, substeps = 4): ShotStep {
  const ceilingY = grid.drop * 2 * r * ROW_PITCH;
  const bubbles = grid.bubbles().map((b) => ({ b, c: grid.center(b.row, b.col, r) }));
  let { x, y, vx } = shot;
  const { vy } = shot;
  let bounces = 0;
  for (let k = 0; k < substeps; k++) {
    x += vx / substeps;
    y += vy / substeps;
    if (x - r < 0) {
      x = r + (r - x);
      vx = -vx;
      bounces++;
    } else if (x + r > w) {
      x = w - r - (x + r - w);
      vx = -vx;
      bounces++;
    }
    const nearest = bubbles.reduce<{ b: Bubble | null; d: number }>(
      (best, { b, c }) => {
        const d = Math.hypot(c.x - x, c.y - y);
        return d < best.d ? { b, d } : best;
      },
      { b: null, d: Infinity },
    );
    if (y - r <= ceilingY || nearest.d < r * HIT_RADII) {
      return { shot: { x, y, vx, vy }, bounces, landed: { hit: nearest.d < r * NEAR_RADII ? nearest.b : null } };
    }
  }
  return { shot: { x, y, vx, vy }, bounces, landed: null };
}

/** Launch angle toward a point, clamped to `max` either side of straight up. */
export function aimToward(dx: number, dy: number, max: number): number {
  return Math.max(-max, Math.min(max, Math.atan2(dx, -dy)));
}

export const LEVEL_COLORS = (level: number): Color[] =>
  [1, 2, 4, ...(level >= 2 ? [6] : []), ...(level >= 3 ? [5] : []), ...(level >= 5 ? [3] : [])] as Color[];

/** Rows filled at the start of a level. */
export function fillRows(level: number): number {
  return Math.min(7, 3 + Math.floor((level - 1) / 2));
}

/** Shots between ceiling drops. */
export function shotsPerDrop(level: number): number {
  return Math.max(5, 9 - Math.floor(level / 3));
}

/** Shot colours: what is in the cluster, weighted double, plus the primaries so mixes stay possible. */
export function shotPool(present: readonly Color[]): Color[] {
  return [...present, ...present, 1, 2, 4];
}

export function popPoints(size: number, min: number): number {
  return size * 30 + Math.max(0, size - min) * 30;
}

export function dropBonus(loose: number): number {
  return 20 * loose * (loose + 1);
}

export function clearBonus(level: number): number {
  return 300 + level * 100;
}
