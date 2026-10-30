import { arcadeInfo } from "../../core/arcade";
import { randomSpawnColor, type Color } from "../../core/color";
import { COLS, fallInterval, landing, levelFor, popPoints, PREVIEW, restingRow, ROWS, SPAWN_X } from "../../core/trist";
import { Well, type Cell } from "../../core/well";
import type { MusicName } from "../../engine/assets";
import { easeOutBack, easeOutCubic } from "../../engine/easing";
import { ArcadeScene, type Control } from "./ArcadeScene";
import { intensityFor } from "../../engine/fxTuning";
import { Repeater, type CellFx, type Dying, dyingScale, DYING_MS, FALL_MS, POP_BURST_MS } from "./shared";

/**
 * Hue Trist: one brick at a time falls down a seven-wide well. Land on a
 * brick it can mix with and the two become one; land anywhere else and it
 * stacks. Four or more touching of a colour pop and the stack cascades.
 */

interface Piece {
  color: Color;
  x: number;
  y: number;
  /** Smoothed draw position in cells. */
  dx: number;
  dy: number;
  drop: number;
}

export class HueTristScene extends ArcadeScene {
  readonly info = arcadeInfo("trist");
  readonly cols = COLS;
  readonly rows = ROWS;

  private well = new Well(COLS, ROWS);
  private piece: Piece | null = null;
  private next: Color[] = [];
  private phase: "fall" | "resolve" = "fall";
  private resolveTimer = 0;
  private chain = 0;
  private landed = 0;
  private popped = 0;
  private readonly fx = new Map<number, CellFx>();
  private dying: Dying[] = [];
  private readonly keys = new Repeater();
  private readonly holds = new Repeater();

  protected music(): MusicName {
    return "normal3_bgm";
  }

  protected start(): void {
    this.well = new Well(COLS, ROWS);
    this.fx.clear();
    this.dying = [];
    this.next = [];
    for (let i = 0; i < PREVIEW; i++) this.next.push(randomSpawnColor());
    this.landed = 0;
    this.popped = 0;
    this.chain = 0;
    this.level = 1;
    this.phase = "fall";
    this.spawn();
  }

  protected stats(): Array<{ label: string; value: string }> {
    return [
      { label: "Level", value: String(this.level) },
      { label: "Popped", value: String(this.popped) },
    ];
  }

  protected override controlSpec(): Array<{ id: string; icon: Control["icon"] }> {
    return [
      { id: "left", icon: "left" },
      { id: "down", icon: "down" },
      { id: "right", icon: "right" },
      { id: "drop", icon: "drop" },
    ];
  }

  private fxOf(c: Cell): CellFx {
    let f = this.fx.get(c.id);
    if (!f) {
      f = { dy: 0, s: 1, wipeFrom: -1, wipeT0: -1, sy: 1 };
      this.fx.set(c.id, f);
    }
    return f;
  }

  // ---------------------------------------------------------------------------
  // Play
  // ---------------------------------------------------------------------------

  private spawn(): void {
    const color = this.next.shift() ?? randomSpawnColor();
    this.next.push(randomSpawnColor());
    if (!this.well.isFree(SPAWN_X, 0)) {
      this.piece = null;
      this.lose();
      return;
    }
    this.piece = { color, x: SPAWN_X, y: 0, dx: SPAWN_X, dy: -1, drop: 0 };
  }

  protected stepPlay(): void {
    // on-screen holds reported this step were marked before stepPlay; decay first so nothing lingers across resolve or a drop
    this.holds.decay();
    if (this.phase === "resolve") {
      if (--this.resolveTimer <= 0) this.resolve();
      return;
    }
    const p = this.piece;
    if (!p) return;
    const inp = this.ctx.input;
    // a key tapped and released inside one step still counts as a press
    const key = (...names: string[]) => names.some((k) => inp.keysDown.has(k) || inp.keysPressed.has(k));
    const left = key("ArrowLeft", "a", "A");
    const right = key("ArrowRight", "d", "D");
    const down = key("ArrowDown", "s", "S") || this.holds.active("down");
    if (this.keys.step("left", left)) this.move(-1);
    if (this.keys.step("right", right)) this.move(1);
    if (inp.keysPressed.has(" ")) {
      this.hardDrop();
      return;
    }
    const interval = fallInterval(this.level);
    p.drop += down ? Math.max(1, interval / 4) : 1;
    if (p.drop >= interval) {
      p.drop = 0;
      if (this.well.isFree(p.x, p.y + 1)) p.y++;
      else this.land();
    }
  }

  private move(dir: number): void {
    const p = this.piece;
    if (!p) return;
    if (this.well.isFree(p.x + dir, p.y)) {
      p.x += dir;
      this.ctx.audio.play("BlocksSelection_snd", 0.35, 1.3);
    }
  }

  private hardDrop(): void {
    const p = this.piece;
    if (!p) return;
    const y = restingRow(this.well, p.x, p.y);
    const fell = y - p.y;
    p.y = y;
    p.dy = y - Math.min(1.5, fell * 0.4);
    this.land();
  }

  /** The brick comes to rest: mix into what is under it, or stack. */
  private land(): void {
    const p = this.piece;
    if (!p) return;
    const L = this.L;
    const l = landing(this.well, p.x, p.y, p.color);
    this.piece = null;
    this.landed++;
    this.level = levelFor(this.landed);
    if (l.kind === "mix") {
      const below = l.into;
      const f = this.fxOf(below);
      f.wipeFrom = below.color;
      f.wipeT0 = this.ctx.clock.t;
      below.refined = l.refined;
      below.color = l.result;
      this.ctx.audio.play("BlocksCombine_snd");
      const c = this.cellPos(below.x, below.y);
      this.ring(c.x + L.cell / 2, c.y + L.cell / 2, L.cell * 0.3, L.cell * 0.9, this.colorOf(l.result), 3);
      this.effects.mixSplash(c.x + L.cell / 2, c.y + L.cell / 2, L.cell, [this.colorOf(f.wipeFrom as Color), this.colorOf(l.result)], -Math.PI / 2);
      f.s = 1.12;
      this.tweens.to(f, { s: 1 }, 200, easeOutBack);
    } else {
      const cell = this.well.add(l.x, l.y, p.color);
      const f = this.fxOf(cell);
      f.sy = 0.86;
      this.tweens.to(f, { sy: 1 }, 180, easeOutBack);
      this.ctx.audio.play("BlocksLanding_snd", 0.8);
    }
    this.chain = 0;
    this.phase = "resolve";
    this.resolveTimer = 2;
  }

  /** Pop groups, drop the stack, repeat until nothing changes, then spawn. */
  private resolve(): void {
    const groups = this.well.groups(4);
    if (groups.length) {
      this.pop(groups);
      this.resolveTimer = Math.round(DYING_MS / (1000 / 30)) + 1;
      this.phase = "resolve";
      return;
    }
    const moved = this.well.applyGravity();
    if (moved.length) {
      for (const m of moved) {
        const f = this.fxOf(m.cell);
        f.dy = m.from - m.cell.y;
        this.tweens.to(f, { dy: 0 }, FALL_MS, easeOutCubic, {
          onDone: () => {
            f.sy = 0.9;
            this.tweens.to(f, { sy: 1 }, 160, easeOutBack);
          },
        });
      }
      this.ctx.audio.play("block_fall_snd", 0.6);
      this.resolveTimer = Math.round(FALL_MS / (1000 / 30)) + 1;
      return;
    }
    this.phase = "fall";
    this.spawn();
  }

  private pop(groups: Cell[][]): void {
    const L = this.L;
    this.chain++;
    const k = intensityFor(
      this.chain,
      groups.reduce((n, g) => n + g.length, 0),
    );
    let total = 0;
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
      total += pts;
      mx += sx / group.length;
      my += sy / group.length;
      this.popped += group.length;
      const cx = sx / group.length;
      const cy = sy / group.length;
      this.callout(`+${pts}`, cx, cy - 6, this.ctx.palette.callout, 18);
      if (refined) this.callout("Refined +100", cx, cy + 16, this.ctx.palette.goalAccent, 13);
    }
    if (this.chain >= 2) {
      this.callout(
        `Chain x${this.chain}`,
        L.x + L.w / 2,
        L.y + L.h * 0.3,
        this.ctx.palette.multColors[Math.min(5, this.chain)] || this.ctx.palette.overlayAccent,
        22,
        true,
        900,
      );
    }
    this.addScore(total);
    this.ctx.audio.play("BlocksPopping_snd", 1, 1 + (this.chain - 1) * 0.08);
    this.impact(k, mx / groups.length, my / groups.length);
  }

  // ---------------------------------------------------------------------------
  // Input hooks
  // ---------------------------------------------------------------------------

  protected override onControl(id: string, held: boolean): void {
    if (this.phase !== "fall") return;
    if (id === "drop") {
      if (!held) this.hardDrop();
      return;
    }
    if (id === "down") {
      this.holds.hold("down");
      return;
    }
    const dir = id === "left" ? -1 : 1;
    if (!held) this.move(dir);
    else if (this.holds.repeat(id)) this.move(dir);
  }

  protected override onWellDrag(x: number): void {
    const p = this.piece;
    if (!p || this.phase !== "fall") return;
    const col = Math.max(0, Math.min(COLS - 1, Math.floor((x - this.L.x) / this.L.cell)));
    const dir = Math.sign(col - p.x);
    if (dir !== 0) this.move(dir);
  }

  protected override onWellSwipeDown(): void {
    this.hardDrop();
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  protected override renderNext(g: CanvasRenderingContext2D, x: number, y: number, size: number): void {
    const L = this.L;
    if (L.portrait) {
      // a row of three ghosts
      const s = size * 0.8;
      this.next.forEach((c, i) => this.drawTile(g, c, x + (size - s) / 2 + (i - 1) * (s + 6), y + (size - s) / 2, s, { alpha: 1 - i * 0.3, s: 1 - i * 0.12 }));
      return;
    }
    this.next.forEach((c, i) =>
      this.drawTile(g, c, x + (size - size * (1 - i * 0.15)) / 2, y + i * (size * 0.72), size * (1 - i * 0.15), { alpha: 1 - i * 0.3 }),
    );
  }

  protected renderWell(g: CanvasRenderingContext2D): void {
    const L = this.L;
    const t = this.ctx.clock.t;
    const dtk = 1 - Math.exp(-this.ctx.clock.dt / 45);
    // settled bricks
    for (const c of this.well.cells()) {
      const f = this.fxOf(c);
      const pos = this.cellPos(c.x, c.y + f.dy);
      const wipe = f.wipeT0 >= 0 ? this.wipeAt(f.wipeT0) : 1;
      g.save();
      if (f.sy !== 1) {
        g.translate(pos.x + L.cell / 2, pos.y + L.cell);
        g.scale(1, f.sy);
        g.translate(-(pos.x + L.cell / 2), -(pos.y + L.cell));
      }
      this.drawTile(g, c.color, pos.x, pos.y, L.cell, { s: f.s, wipeFrom: wipe < 1 ? (f.wipeFrom as Color) : undefined, wipe });
      g.restore();
      if (wipe >= 1) f.wipeT0 = -1;
      if (c.refined) this.spark(g, pos.x + L.cell * 0.78, pos.y + L.cell * 0.22, L.cell * 0.085);
    }
    // popping bricks
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
    // the falling brick, its landing ghost and the mix it would make
    const p = this.piece;
    if (p && this.phase === "fall") {
      p.dx += (p.x - p.dx) * dtk;
      p.dy += (p.y - p.dy) * dtk;
      const ly = restingRow(this.well, p.x, p.y);
      const l = landing(this.well, p.x, ly, p.color);
      if (l.kind === "mix") {
        const bp = this.cellPos(l.into.x, l.into.y);
        const pulse = 0.5 + 0.5 * Math.sin(t / 160);
        this.drawTile(g, l.result, bp.x, bp.y, L.cell, { alpha: 0.35 + 0.25 * pulse, s: 0.92 });
        g.save();
        g.lineWidth = 2;
        g.strokeStyle = this.colorOf(l.result);
        g.globalAlpha = 0.6 + 0.3 * pulse;
        g.beginPath();
        g.roundRect(bp.x + 2, bp.y + 2, L.cell - 4, L.cell - 4, L.cell * 0.18);
        g.stroke();
        g.restore();
      } else {
        const gp = this.cellPos(p.x, ly);
        this.drawTile(g, p.color, gp.x, gp.y, L.cell, { alpha: 0.22, s: 0.94 });
      }
      const pos = this.cellPos(p.dx, p.dy);
      this.drawTile(g, p.color, pos.x, pos.y, L.cell, { lift: 0.35 });
    }
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
