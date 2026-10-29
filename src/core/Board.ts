import { BLACK, combineColors, type Color } from "./color";
import { Brick } from "./Brick";
import { cellX, cellY, computeLayout, DESIGN_VIEWPORT, NO_SPACING, replenishY, type Layout, type LayoutSpacing, type Viewport } from "./layout";

/** Minimum connected bricks of one colour needed to pop. */
export const POP_GROUP_SIZE = 4;

export interface PopResult {
  /** Groups that popped this pass (each brick already removed from the grid). */
  groups: Brick[][];
  /** Points awarded for this pass. */
  score: number;
  /** Value shown over each popped brick. */
  brickValue: number;
}

export interface PushResult {
  /** True if a brick occupied the top row and was crushed by the push. */
  overflow: boolean;
}

export type CombineResult = "combined" | "noadd" | "none";

/**
 * The game board: a square grid of bricks plus the replenish line beneath it.
 *
 * This is pure game logic with no rendering or audio, ported from the
 * `board_*.gml` scripts. Animation bookkeeping (flags on bricks and the
 * state machine) lives in the scene; this class only sets the brick flags
 * the scene's animations consume.
 */
export class Board {
  layout: Layout;
  private spacing: LayoutSpacing;
  private vp: Viewport;
  /** `grid[x][y]`; `y = 0` is the top row. */
  grid: (Brick | null)[][];
  replenishList: Brick[] = [];

  /** Combo tracking shared across a chain of pops (reset by the scene at rest). */
  comboLength = 0;
  comboBonus = 0;

  constructor(cellNum: number, spacing: LayoutSpacing = NO_SPACING, vp: Viewport = DESIGN_VIEWPORT) {
    this.spacing = spacing;
    this.vp = vp;
    this.layout = computeLayout(cellNum, spacing, vp);
    this.grid = Board.emptyGrid(cellNum);
  }

  /** Re-measure the board for a theme's breathing room and the current viewport; bricks keep their cells. */
  setEnv(spacing: LayoutSpacing, vp: Viewport): void {
    this.spacing = spacing;
    this.vp = vp;
    this.layout = computeLayout(this.cellNum, spacing, vp);
    this.resetBlockPositions();
  }

  get cellNum(): number {
    return this.layout.cellNum;
  }

  private static emptyGrid(n: number): (Brick | null)[][] {
    return Array.from({ length: n }, () => Array.from({ length: n }, () => null));
  }

  /** Change board size (the tutorial plays on 4x4). Clears the grid. */
  resize(cellNum: number): void {
    this.layout = computeLayout(cellNum, this.spacing, this.vp);
    this.grid = Board.emptyGrid(cellNum);
    this.replenishList = [];
  }

  get(x: number, y: number): Brick | null {
    if (x < 0 || y < 0 || x >= this.cellNum || y >= this.cellNum) return null;
    return this.grid[x][y];
  }

  set(x: number, y: number, b: Brick | null): void {
    this.grid[x][y] = b;
  }

  /** Every brick currently on the grid (top-left to bottom-right, column major). */
  *bricks(): IterableIterator<Brick> {
    const n = this.cellNum;
    for (let x = 0; x < n; x++) {
      for (let y = 0; y < n; y++) {
        const b = this.grid[x][y];
        if (b) yield b;
      }
    }
  }

  /** Bricks on the grid plus those waiting in the replenish line. */
  *allBricks(): IterableIterator<Brick> {
    yield* this.bricks();
    yield* this.replenishList;
  }

  countBricks(): number {
    let c = 0;
    for (const _ of this.bricks()) c++;
    return c;
  }

  isEmpty(): boolean {
    return this.countBricks() === 0;
  }

  /** Place a brick at a grid cell (index `i` fills bottom row first, left to right). */
  placeByIndex(i: number, brick: Brick): { gx: number; gy: number } {
    const n = this.cellNum;
    const gx = i % n;
    const gy = n - Math.floor(i / n) - 1;
    this.grid[gx][gy] = brick;
    return { gx, gy };
  }

  /** `board_reset_block_position.gml`: sync logical screen positions to grid slots. */
  resetBlockPositions(): void {
    const l = this.layout;
    for (let x = 0; x < this.cellNum; x++) {
      for (let y = 0; y < this.cellNum; y++) {
        const b = this.grid[x][y];
        if (!b) continue;
        b.x = cellX(l, x);
        b.y = cellY(l, y);
        b.gridX = x;
        b.gridY = y;
      }
    }
    this.replenishList.forEach((b, i) => {
      b.x = cellX(l, i);
      b.y = replenishY(l);
      b.gridX = -1;
      b.gridY = -1;
    });
  }

  /**
   * `board_recalculate_block_groups.gml` + `block_check_neighbors.gml`:
   * flood-fill 4-connected same-colour groups and assign them to each brick.
   */
  recalculateGroups(): void {
    const n = this.cellNum;
    const seen = new Set<Brick>();
    for (let x = 0; x < n; x++) {
      for (let y = 0; y < n; y++) {
        const start = this.grid[x][y];
        if (!start || seen.has(start)) continue;
        const group: Brick[] = [];
        const stack: [number, number][] = [[x, y]];
        seen.add(start);
        while (stack.length) {
          const [cx, cy] = stack.pop()!;
          const b = this.grid[cx][cy]!;
          group.push(b);
          for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
            const nb = this.get(cx + dx, cy + dy);
            if (nb && nb.color === start.color && !seen.has(nb)) {
              seen.add(nb);
              stack.push([cx + dx, cy + dy]);
            }
          }
        }
        for (const b of group) b.group = group;
      }
    }
  }

  /**
   * `board_pop_groups.gml`: remove every group of 4+ and score it.
   *
   * Only the first group in a pass raises the combo bonus. Black groups pop
   * but score nothing. Call `recalculateGroups()` first.
   */
  popGroups(): PopResult {
    const groups: Brick[][] = [];
    let score = 0;
    let brickValue = Math.min(50, 20 + this.comboBonus);
    let combo = false;
    const done = new Set<Brick[]>();

    for (const b of this.bricks()) {
      const g = b.group;
      if (g.length < POP_GROUP_SIZE || done.has(g)) continue;
      done.add(g);
      if (!combo) {
        this.comboBonus += (g.length - POP_GROUP_SIZE + this.comboLength) * 5;
        this.comboLength += 1;
        combo = true;
      }
      brickValue = Math.min(50, 20 + this.comboBonus);
      if (b.color !== BLACK) score += brickValue * g.length;
      groups.push(g);
    }

    for (const g of groups) {
      for (const b of g) {
        if (b.gridX >= 0 && this.grid[b.gridX][b.gridY] === b) {
          this.grid[b.gridX][b.gridY] = null;
        }
      }
    }
    return { groups, score, brickValue };
  }

  /**
   * `board_push.gml`: shift every row up by one and move the replenish line
   * into the bottom row. Any brick in the top row is destroyed.
   */
  push(): PushResult {
    const n = this.cellNum;
    let overflow = false;
    for (let x = 0; x < n; x++) {
      if (this.grid[x][0]) overflow = true;
      for (let y = 1; y < n; y++) {
        const b = this.grid[x][y];
        this.grid[x][y - 1] = b;
        if (b) {
          b.pushing = true;
          b.pushDelay = (n - x) * 5;
        }
      }
      const incoming = this.replenishList[x] ?? null;
      this.grid[x][n - 1] = incoming;
      if (incoming) {
        incoming.pushing = true;
        incoming.pushDelay = (n - x) * 5;
      }
    }
    this.replenishList = [];
    this.resetBlockPositions();
    this.recalculateGroups();
    return { overflow };
  }

  private swap(x1: number, y1: number, x2: number, y2: number): void {
    const t = this.grid[x1][y1];
    this.grid[x1][y1] = this.grid[x2][y2];
    this.grid[x2][y2] = t;
  }

  /** `board_reflect_xy.gml`: transpose. */
  private reflectXY(): void {
    for (let x = 0; x < this.cellNum; x++) {
      for (let y = 0; y < x; y++) this.swap(x, y, y, x);
    }
  }

  /** `board_flip_horizontal.gml`: mirror left-right. */
  private flipHorizontal(): void {
    const n = this.cellNum;
    for (let y = 0; y < n; y++) {
      for (let x = 0, x2 = n - 1; x < x2; x++, x2--) this.swap(x, y, x2, y);
    }
  }

  /** `board_rotate.gml`: rotate the whole grid a quarter turn. */
  rotate(clockwise: boolean): void {
    if (clockwise) {
      this.reflectXY();
      this.flipHorizontal();
    } else {
      this.flipHorizontal();
      this.reflectXY();
    }
    this.resetBlockPositions();
    this.recalculateGroups();
    for (const b of this.bricks()) b.rotate = true;
  }

  /**
   * `board_resettle_blocks.gml`: let bricks drop into empty cells below them.
   * Returns true if anything moved (those bricks get `fall = true`).
   */
  resettle(): boolean {
    const n = this.cellNum;
    let moved = false;
    for (let x = 0; x < n; x++) {
      for (let y = n - 1; y >= 0; y--) {
        if (this.grid[x][y]) continue;
        for (let by = y - 1; by >= 0; by--) {
          const b = this.grid[x][by];
          if (!b) continue;
          b.fall = true;
          this.grid[x][y] = b;
          this.grid[x][by] = null;
          moved = true;
          break;
        }
      }
    }
    this.resetBlockPositions();
    return moved;
  }

  /**
   * `board_combine.gml`: apply the selected replenish brick to the board brick
   * at (bx, by). On success the selected brick is consumed and the destination
   * takes the new colour (its animation is driven by `spriteColor !== color`).
   */
  combine(
    selected: Brick | null,
    bx: number,
    by: number,
    canAdd = true,
    canSubtract = true,
  ): CombineResult {
    const dest = this.get(bx, by);
    if (!dest || !selected) return "none";

    const result = combineColors(selected.color, dest.color, canAdd, canSubtract);
    if (result === null) {
      selected.noadd = true;
      dest.noadd = true;
      return "noadd";
    }

    // Any result other than the plain union means colour was taken away.
    dest.refined = result !== (selected.color | dest.color);
    dest.color = result;
    const idx = this.replenishList.indexOf(selected);
    if (idx >= 0) this.replenishList.splice(idx, 1);
    this.resetBlockPositions();
    this.recalculateGroups();
    return "combined";
  }

  /** `ds_grid_shuffle` as used by the randomize item. */
  shuffle(rng: () => number = Math.random): void {
    const cells: (Brick | null)[] = [];
    for (let x = 0; x < this.cellNum; x++) for (let y = 0; y < this.cellNum; y++) cells.push(this.grid[x][y]);
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    let i = 0;
    for (let x = 0; x < this.cellNum; x++) for (let y = 0; y < this.cellNum; y++) this.grid[x][y] = cells[i++];
  }

  /** Debug helper: render the grid as rows of colour digits ('.' = empty). */
  toString(): string {
    const rows: string[] = [];
    for (let y = 0; y < this.cellNum; y++) {
      let row = "";
      for (let x = 0; x < this.cellNum; x++) row += this.grid[x][y]?.color ?? ".";
      rows.push(row);
    }
    return rows.join("\n");
  }

  /** Build a board from the `toString()` format (for tests). */
  static fromString(text: string): Board {
    const rows = text.trim().split("\n").map((r) => r.trim());
    const n = rows.length;
    const board = new Board(n);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const ch = rows[y][x];
        if (ch !== ".") board.grid[x][y] = new Brick(Number(ch) as Color);
      }
    }
    board.resetBlockPositions();
    board.recalculateGroups();
    return board;
  }
}
