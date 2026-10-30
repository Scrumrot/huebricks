import { arcadeInfo } from "../../core/arcade";
import type { Color } from "../../core/color";
import {
  addTime,
  adjacent,
  applyMove,
  COLS,
  drain,
  HURRY_MS,
  levelFor,
  MAX_MS,
  MIN_GROUP,
  moveFor,
  newBoard,
  popPoints,
  refill,
  ROWS,
  START_MS,
  timeBonus,
  type Move,
} from "../../core/swap";
import { Well, type Cell } from "../../core/well";
import type { MusicName } from "../../engine/assets";
import { drawText, fillRoundRect } from "../../engine/draw";
import { easeOutBack, easeOutCubic } from "../../engine/easing";
import { intensityFor } from "../../engine/fxTuning";
import { ArcadeScene, STEP_MS } from "./ArcadeScene";
import { type Dying, dyingScale, DYING_MS, FALL_MS, POP_BURST_MS } from "./shared";

/**
 * Hue Swap: a full board of tiles. Pick one, then a neighbour: if the two
 * can mix under the colour rules the first pours into the second and the
 * gap fills from above; if not, they trade places. Four or more touching of
 * a colour pop and the board cascades. A clock drains while the player
 * thinks, pops put time back, and the drain quickens with each level.
 */

/** Per-tile feel state: draw offset in cells, scale, squash and colour wipe. */
interface TileFx {
  dx: number;
  dy: number;
  s: number;
  sy: number;
  wipeFrom: Color | -1;
  wipeT0: number;
}

const steps = (ms: number) => Math.round(ms / STEP_MS) + 1;
const SWAP_MS = 170;

export class HueSwapScene extends ArcadeScene {
  readonly info = arcadeInfo("swap");
  readonly cols = COLS;
  readonly rows = ROWS;

  private well = new Well(COLS, ROWS);
  private phase: "idle" | "resolve" = "idle";
  private resolveTimer = 0;
  private chain = 0;
  private timeMs = START_MS;
  private popped = 0;
  /** Whole second last ticked at while hurrying, so the tick fires once a second. */
  private hurryTick = -1;
  private selected: Cell | null = null;
  private readonly caret = { x: Math.floor(COLS / 2), y: Math.floor(ROWS / 2) };
  /** The keyboard caret only shows once the keys are used. */
  private caretOn = false;
  /** A drag already acted this press. */
  private dragDone = false;
  private readonly fx = new Map<number, TileFx>();
  private dying: Dying[] = [];

  protected music(): MusicName {
    return "puzzle1_bgm";
  }

  protected start(): void {
    this.well = newBoard();
    this.fx.clear();
    this.dying = [];
    this.timeMs = START_MS;
    this.popped = 0;
    this.level = 1;
    this.chain = 0;
    this.hurryTick = -1;
    this.selected = null;
    this.dragDone = false;
    this.phase = "idle";
  }

  protected stats(): Array<{ label: string; value: string }> {
    return [
      { label: "Level", value: String(this.level) },
      { label: "Time", value: String(Math.ceil(this.timeMs / 1000)) },
    ];
  }

  protected override nextLabel(): string {
    return "CLOCK";
  }

  private get hurry(): boolean {
    return this.timeMs < HURRY_MS;
  }

  private fxOf(c: Cell): TileFx {
    let f = this.fx.get(c.id);
    if (!f) {
      f = { dx: 0, dy: 0, s: 1, sy: 1, wipeFrom: -1, wipeT0: -1 };
      this.fx.set(c.id, f);
    }
    return f;
  }

  private cellAt(x: number, y: number): Cell | null {
    const L = this.L;
    return this.well.get(Math.floor((x - L.x) / L.cell), Math.floor((y - L.y) / L.cell));
  }

  private centre(c: { x: number; y: number }): { x: number; y: number } {
    const p = this.cellPos(c.x, c.y);
    return { x: p.x + this.L.cell / 2, y: p.y + this.L.cell / 2 };
  }

  // ---------------------------------------------------------------------------
  // Play
  // ---------------------------------------------------------------------------

  protected stepPlay(): void {
    if (this.phase === "resolve") {
      if (--this.resolveTimer <= 0) this.resolve();
      return;
    }
    // the clock only runs while the player is thinking
    this.timeMs = drain(this.timeMs, STEP_MS, this.level);
    if (this.timeMs <= 0) {
      this.selected = null;
      this.lose();
      return;
    }
    if (this.hurry) {
      const second = Math.ceil(this.timeMs / 1000);
      if (second !== this.hurryTick) {
        this.hurryTick = second;
        this.ctx.audio.cue("tick", 0.8, 0.7);
      }
    }
    const keys = this.ctx.input.keysPressed;
    const nudge = (dx: number, dy: number) => {
      this.caret.x = Math.max(0, Math.min(COLS - 1, this.caret.x + dx));
      this.caret.y = Math.max(0, Math.min(ROWS - 1, this.caret.y + dy));
      this.caretOn = true;
    };
    if (keys.has("ArrowLeft") || keys.has("a") || keys.has("A")) nudge(-1, 0);
    if (keys.has("ArrowRight") || keys.has("d") || keys.has("D")) nudge(1, 0);
    if (keys.has("ArrowUp") || keys.has("w") || keys.has("W")) nudge(0, -1);
    if (keys.has("ArrowDown") || keys.has("s") || keys.has("S")) nudge(0, 1);
    if (keys.has(" ") || keys.has("Enter")) {
      this.caretOn = true;
      this.pick(this.well.get(this.caret.x, this.caret.y));
    }
  }

  /** Select a tile, or act on it with the selected one when they neighbour. */
  private pick(cell: Cell | null): void {
    if (!cell || this.phase !== "idle") return;
    const sel = this.selected;
    if (sel === cell) {
      this.selected = null;
      return;
    }
    if (!sel || !adjacent(sel, cell)) {
      this.selected = cell;
      this.ctx.audio.event("select", { volume: 0.35, rate: 1.3 });
      return;
    }
    this.act(moveFor(sel, cell));
  }

  private act(m: Move): void {
    const L = this.L;
    this.selected = null;
    this.chain = 0;
    if (m.kind === "mix") {
      const from = this.centre(m.from);
      const to = this.centre(m.into);
      const was = m.into.color;
      applyMove(this.well, m);
      this.fx.delete(m.from.id);
      const f = this.fxOf(m.into);
      f.wipeFrom = was;
      f.wipeT0 = this.ctx.clock.t;
      f.s = 1.12;
      this.tweens.to(f, { s: 1 }, 200, easeOutBack);
      this.ctx.audio.event("combine");
      this.ring(to.x, to.y, L.cell * 0.3, L.cell * 0.9, this.colorOf(m.result), 3);
      this.effects.mixSplash(to.x, to.y, L.cell, [this.colorOf(m.from.color), this.colorOf(m.result)], Math.atan2(to.y - from.y, to.x - from.x));
      this.effects.mixArc(to.x, to.y, L.cell, was, m.result);
    } else {
      const ax = m.a.x;
      const ay = m.a.y;
      const bx = m.b.x;
      const by = m.b.y;
      applyMove(this.well, m);
      for (const [c, ox, oy] of [
        [m.a, ax, ay],
        [m.b, bx, by],
      ] as const) {
        const f = this.fxOf(c);
        f.dx = ox - c.x;
        f.dy = oy - c.y;
        this.tweens.to(f, { dx: 0, dy: 0 }, SWAP_MS, easeOutCubic);
      }
      this.ctx.audio.event("landing", { volume: 0.5, rate: 1.15 });
    }
    this.phase = "resolve";
    this.resolveTimer = steps(SWAP_MS);
  }

  /** Pop groups, let the board fall and refill, repeat until it settles. */
  private resolve(): void {
    const groups = this.well.groups(MIN_GROUP);
    if (groups.length) {
      this.pop(groups);
      this.resolveTimer = steps(DYING_MS);
      return;
    }
    const moved = this.well.applyGravity().map((m) => ({ cell: m.cell, from: m.from }));
    const spawned = refill(this.well);
    const falling = [...moved, ...spawned];
    if (falling.length) {
      for (const m of falling) {
        const f = this.fxOf(m.cell);
        f.dy = m.from - m.cell.y;
        this.tweens.to(f, { dy: 0 }, FALL_MS, easeOutCubic, {
          onDone: () => {
            f.sy = 0.9;
            this.tweens.to(f, { sy: 1 }, 160, easeOutBack);
          },
        });
      }
      this.ctx.audio.event("fall", { volume: 0.6 });
      this.resolveTimer = steps(FALL_MS);
      return;
    }
    this.phase = "idle";
  }

  private pop(groups: Cell[][]): void {
    const L = this.L;
    const pal = this.ctx.palette;
    this.chain++;
    const k = intensityFor(
      this.chain,
      groups.reduce((n, g) => n + g.length, 0),
    );
    let total = 0;
    let bonus = 0;
    let i = 0;
    let mx = 0;
    let my = 0;
    for (const group of groups) {
      let sx = 0;
      let sy = 0;
      const refined = group.some((c) => c.refined);
      for (const c of group) {
        const pos = this.cellPos(c.x, c.y);
        sx += pos.x + L.cell / 2;
        sy += pos.y + L.cell / 2;
        this.dying.push({
          x: pos.x,
          y: pos.y,
          color: c.color,
          t0: this.ctx.clock.t + Math.min(i, 8) * 20,
          burst: false,
          spin: Math.random() < 0.5 ? -1 : 1,
          k,
        });
        this.well.remove(c);
        this.fx.delete(c.id);
        i++;
      }
      const pts = popPoints(group.length, this.chain, refined);
      const ms = timeBonus(group.length, this.chain);
      total += pts;
      bonus += ms;
      mx += sx / group.length;
      my += sy / group.length;
      this.popped += group.length;
      const cx = sx / group.length;
      const cy = sy / group.length;
      this.callout(`+${pts}`, cx, cy - 6, pal.callout, 18);
      this.callout(`+${(ms / 1000).toFixed(1)}s`, cx, cy + 16, pal.goalAccent, 13);
      if (refined) this.callout("Refined +100", cx, cy + 32, pal.goalAccent, 13);
    }
    if (this.chain >= 2) {
      this.callout(`Chain x${this.chain}`, L.x + L.w / 2, L.y + L.h * 0.3, pal.multColors[Math.min(5, this.chain)] || pal.overlayAccent, 22, true, 900);
    }
    this.addScore(total);
    this.timeMs = addTime(this.timeMs, bonus);
    const level = levelFor(this.popped);
    if (level > this.level) {
      this.level = level;
      this.callout(`Level ${level}`, L.x + L.w / 2, L.y + L.h * 0.45, pal.overlayAccent, 24, true, 1300);
      this.ctx.audio.event("achieve", { volume: 0.6 });
    }
    this.ctx.audio.event("pop", { rate: 1 + (this.chain - 1) * 0.08, chain: this.chain });
    this.impact(k, mx / groups.length, my / groups.length, groups[0]?.[0]?.color);
  }

  // ---------------------------------------------------------------------------
  // Input hooks
  // ---------------------------------------------------------------------------

  protected override onWellTap(x: number, y: number): void {
    this.caretOn = false;
    this.pick(this.cellAt(x, y));
  }

  /** Dragging a tile half a cell towards a neighbour acts on that neighbour at once. */
  protected override onWellDrag(x: number, y: number): void {
    if (this.dragDone || this.phase !== "idle" || !this.press) return;
    const from = this.cellAt(this.press.x, this.press.y);
    if (!from) return;
    const dx = x - this.press.x;
    const dy = y - this.press.y;
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    const to = this.well.get(from.x + (horizontal ? Math.sign(dx) : 0), from.y + (horizontal ? 0 : Math.sign(dy)));
    if (!to) return;
    this.dragDone = true;
    this.caretOn = false;
    this.act(moveFor(from, to));
  }

  protected override onWellRelease(): void {
    this.dragDone = false;
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  /** The clock slot: a bar that empties as time runs out and flushes red when it is short. */
  protected override renderNext(g: CanvasRenderingContext2D, x: number, y: number, size: number): void {
    const L = this.L;
    const pal = this.ctx.palette;
    const classic = pal.kind === "classic";
    const t = this.ctx.clock.t;
    const w = L.portrait ? size * 2.6 : size;
    const bx = x + size / 2 - w / 2;
    const q = Math.min(1, this.timeMs / MAX_MS);
    const h = 8;
    const by = L.portrait ? y + size / 2 - h / 2 - 8 : y + 4;
    const pulse = 0.5 + 0.5 * Math.sin(t / 110);
    const fill = this.hurry ? pal.brickColors[1] : pal.goalAccent;
    fillRoundRect(g, bx, by, w, h, h / 2, classic ? "rgba(255,255,255,0.15)" : pal.ui.secondary, pal.ui.secondaryEdge, 1);
    if (q > 0) {
      g.save();
      if (this.hurry) g.globalAlpha = 0.6 + 0.4 * pulse;
      fillRoundRect(g, bx, by, Math.max(h, w * q), h, h / 2, fill);
      g.restore();
    }
    const label = this.hurry ? "Hurry!" : `${Math.ceil(this.timeMs / 1000)}s`;
    drawText(g, label, x + size / 2, by + h + 11, {
      size: 11,
      color: this.hurry ? fill : classic ? "#9a9a9a" : pal.hudMuted,
      weight: 700,
      tabular: true,
    });
  }

  protected renderWell(g: CanvasRenderingContext2D): void {
    const L = this.L;
    const t = this.ctx.clock.t;
    const pal = this.ctx.palette;
    const pulse = 0.5 + 0.5 * Math.sin(t / 160);
    g.save();
    // new tiles slide in from above the well; keep them out of the HUD
    g.beginPath();
    g.rect(L.x - L.cell, L.y, L.w + L.cell * 2, L.h + L.cell);
    g.clip();
    const sel = this.selected;
    for (const c of this.well.cells()) {
      const f = this.fxOf(c);
      const pos = this.cellPos(c.x + f.dx, c.y + f.dy);
      const wipe = f.wipeT0 >= 0 ? this.wipeAt(f.wipeT0) : 1;
      const picked = c === sel;
      g.save();
      if (f.sy !== 1) {
        g.translate(pos.x + L.cell / 2, pos.y + L.cell);
        g.scale(1, f.sy);
        g.translate(-(pos.x + L.cell / 2), -(pos.y + L.cell));
      }
      this.drawTile(g, c.color, pos.x, pos.y, L.cell, {
        s: f.s * (picked ? 1.06 + 0.02 * pulse : 1),
        lift: picked ? 0.4 : 0,
        wipeFrom: wipe < 1 ? (f.wipeFrom as Color) : undefined,
        wipe,
      });
      g.restore();
      if (wipe >= 1) f.wipeT0 = -1;
      if (c.refined) this.spark(g, pos.x + L.cell * 0.78, pos.y + L.cell * 0.22, L.cell * 0.085);
    }
    // what each neighbour of the picked tile would do
    if (sel && this.phase === "idle") {
      for (const [ox, oy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ] as const) {
        const nb = this.well.get(sel.x + ox, sel.y + oy);
        if (!nb) continue;
        const m = moveFor(sel, nb);
        const p = this.cellPos(nb.x, nb.y);
        if (m.kind === "mix") {
          this.drawTile(g, m.result, p.x, p.y, L.cell, { alpha: 0.35 + 0.25 * pulse, s: 0.92 });
          this.outline(g, p.x, p.y, this.colorOf(m.result), 0.6 + 0.3 * pulse, 2);
        } else {
          this.outline(g, p.x, p.y, pal.kind === "classic" ? "#ffffff" : pal.hudText, 0.22 + 0.1 * pulse, 1.5);
        }
      }
      const sp = this.cellPos(sel.x, sel.y);
      this.outline(g, sp.x, sp.y, pal.kind === "classic" ? "#ffffff" : pal.goalAccent, 0.75 + 0.25 * pulse, 2.5);
    }
    if (this.caretOn && this.phase === "idle") {
      const cp = this.cellPos(this.caret.x, this.caret.y);
      this.outline(g, cp.x, cp.y, pal.kind === "classic" ? "#ffffff" : pal.hudText, 0.55, 2, true);
    }
    // popping tiles
    for (const d of this.dying) {
      const e = t - d.t0;
      if (e < 0) continue;
      if (!d.burst && e >= POP_BURST_MS) {
        d.burst = true;
        this.burst(d.x + L.cell / 2, d.y + L.cell / 2, d.color, { k: d.k ?? 0 });
      }
      const { s, rot, alpha } = dyingScale(e, d.spin);
      this.drawTile(g, d.color, d.x, d.y, L.cell, { s, rot, alpha });
    }
    this.dying = this.dying.filter((d) => t - d.t0 < DYING_MS);
    g.restore();
  }

  private outline(g: CanvasRenderingContext2D, x: number, y: number, color: string, alpha: number, width: number, dashed = false): void {
    const L = this.L;
    g.save();
    g.lineWidth = width;
    g.strokeStyle = color;
    g.globalAlpha = alpha;
    if (dashed) g.setLineDash([4, 3]);
    g.beginPath();
    g.roundRect(x + 2, y + 2, L.cell - 4, L.cell - 4, L.cell * 0.18);
    g.stroke();
    g.restore();
  }

  private spark(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    const k = r * 0.3;
    g.beginPath();
    g.moveTo(x, y - r);
    g.lineTo(x + k, y - k);
    g.lineTo(x + r, y);
    g.lineTo(x + k, y + k);
    g.lineTo(x, y + r);
    g.lineTo(x - k, y + k);
    g.lineTo(x - r, y);
    g.lineTo(x - k, y - k);
    g.closePath();
    g.fillStyle = "#ffffff";
    g.strokeStyle = "rgba(0,0,0,0.6)";
    g.lineWidth = 1;
    g.fill();
    g.stroke();
  }
}
