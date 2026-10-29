import type { Color } from "./color";

/**
 * A tall rectangular well of single-cell bricks, shared by the falling-piece
 * arcade modes (Dr. Hue, Hue Trist). Pure logic: no rendering or timing.
 *
 * `grid[x][y]` with `y = 0` the top row. Locked cells (Dr. Hue's stains)
 * never fall and are what the player has to clear.
 */
export interface Cell {
  readonly id: number;
  color: Color;
  locked: boolean;
  x: number;
  y: number;
  /**
   * True when the last mix took colour away (reached by subtracting). Purely
   * cosmetic, mirrors the main game's refined marker.
   */
  refined: boolean;
}

export interface Fall {
  cell: Cell;
  /** Row the cell fell from. */
  from: number;
}

let nextId = 1;

export class Well {
  readonly cols: number;
  readonly rows: number;
  grid: (Cell | null)[][];

  constructor(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    this.grid = Array.from({ length: cols }, () => Array.from({ length: rows }, () => null));
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows;
  }

  get(x: number, y: number): Cell | null {
    return this.inBounds(x, y) ? this.grid[x][y] : null;
  }

  /** In bounds and empty. */
  isFree(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.grid[x][y] === null;
  }

  add(x: number, y: number, color: Color, locked = false): Cell {
    const cell: Cell = { id: nextId++, color, locked, x, y, refined: false };
    this.grid[x][y] = cell;
    return cell;
  }

  remove(cell: Cell): void {
    if (this.inBounds(cell.x, cell.y) && this.grid[cell.x][cell.y] === cell) this.grid[cell.x][cell.y] = null;
  }

  move(cell: Cell, x: number, y: number): void {
    this.remove(cell);
    cell.x = x;
    cell.y = y;
    this.grid[x][y] = cell;
  }

  /** Every cell, column by column, top to bottom. */
  cells(): Cell[] {
    const out: Cell[] = [];
    for (let x = 0; x < this.cols; x++) {
      for (let y = 0; y < this.rows; y++) {
        const c = this.grid[x][y];
        if (c) out.push(c);
      }
    }
    return out;
  }

  count(pred: (c: Cell) => boolean = () => true): number {
    let n = 0;
    for (const c of this.cells()) if (pred(c)) n++;
    return n;
  }

  /** Highest occupied row (smallest y), or `rows` when empty. */
  top(): number {
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) if (this.grid[x][y]) return y;
    }
    return this.rows;
  }

  /** 4-connected groups of one colour with at least `min` cells. */
  groups(min: number): Cell[][] {
    const seen = new Set<Cell>();
    const out: Cell[][] = [];
    for (const start of this.cells()) {
      if (seen.has(start)) continue;
      seen.add(start);
      const group: Cell[] = [];
      const stack = [start];
      while (stack.length) {
        const c = stack.pop()!;
        group.push(c);
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
          const nb = this.get(c.x + dx, c.y + dy);
          if (nb && nb.color === start.color && !seen.has(nb)) {
            seen.add(nb);
            stack.push(nb);
          }
        }
      }
      if (group.length >= min) out.push(group);
    }
    return out;
  }

  /**
   * Straight runs (horizontal or vertical) of one colour with at least `min`
   * cells. A cell in both a row and a column run is reported once, in the
   * first run found; runs are returned as separate lists.
   */
  lines(min: number): Cell[][] {
    const out: Cell[][] = [];
    // rows
    for (let y = 0; y < this.rows; y++) {
      let run: Cell[] = [];
      for (let x = 0; x <= this.cols; x++) {
        const c = x < this.cols ? this.grid[x][y] : null;
        if (c && run.length && run[0].color === c.color) {
          run.push(c);
          continue;
        }
        if (run.length >= min) out.push(run);
        run = c ? [c] : [];
      }
    }
    // columns
    for (let x = 0; x < this.cols; x++) {
      let run: Cell[] = [];
      for (let y = 0; y <= this.rows; y++) {
        const c = y < this.rows ? this.grid[x][y] : null;
        if (c && run.length && run[0].color === c.color) {
          run.push(c);
          continue;
        }
        if (run.length >= min) out.push(run);
        run = c ? [c] : [];
      }
    }
    return out;
  }

  /** Distinct cells across a set of runs or groups. */
  static flatten(sets: Cell[][]): Cell[] {
    const seen = new Set<Cell>();
    const out: Cell[] = [];
    for (const s of sets) for (const c of s) if (!seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
    return out;
  }

  /**
   * Let unlocked cells drop into empty cells below them. Locked cells stay
   * put and hold up whatever rests on them. Returns what moved.
   */
  applyGravity(): Fall[] {
    const moved: Fall[] = [];
    for (let x = 0; x < this.cols; x++) {
      for (let y = this.rows - 2; y >= 0; y--) {
        const c = this.grid[x][y];
        if (!c || c.locked) continue;
        let ty = y;
        while (ty + 1 < this.rows && this.grid[x][ty + 1] === null) ty++;
        if (ty !== y) {
          this.grid[x][y] = null;
          this.grid[x][ty] = c;
          c.y = ty;
          moved.push({ cell: c, from: y });
        }
      }
    }
    return moved;
  }

  /** Debug helper: rows of colour digits, locked cells in brackets, '.' empty. */
  toString(): string {
    const rows: string[] = [];
    for (let y = 0; y < this.rows; y++) {
      let row = "";
      for (let x = 0; x < this.cols; x++) {
        const c = this.grid[x][y];
        row += c ? (c.locked ? String.fromCharCode(64 + c.color) : String(c.color)) : ".";
      }
      rows.push(row);
    }
    return rows.join("\n");
  }

  /** Build from the `toString()` format: digits are loose bricks, letters A..G locked ones. */
  static fromString(text: string): Well {
    const rows = text.trim().split("\n").map((r) => r.trim());
    const well = new Well(rows[0].length, rows.length);
    for (let y = 0; y < rows.length; y++) {
      for (let x = 0; x < rows[y].length; x++) {
        const ch = rows[y][x];
        if (ch === ".") continue;
        if (ch >= "1" && ch <= "7") well.add(x, y, Number(ch) as Color);
        else well.add(x, y, (ch.charCodeAt(0) - 64) as Color, true);
      }
    }
    return well;
  }
}
