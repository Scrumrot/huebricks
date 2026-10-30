import { arcadeInfo } from "../../core/arcade";
import { BLUE, RED, YELLOW, type Color } from "../../core/color";
import {
  clearPoints,
  COLS,
  fallInterval,
  fits,
  isSubtractive,
  levelBonus,
  moved,
  offsetOf,
  restingRow,
  rotated,
  ROWS,
  settleDomino,
  SPAWN_X,
  type Domino,
} from "../../core/drhue";
import { placeStains, stainLayout } from "../../core/stains";
import { Well, type Cell } from "../../core/well";
import type { MusicName } from "../../engine/assets";
import { easeOutBack, easeOutCubic } from "../../engine/easing";
import { ArcadeScene, type Control } from "./ArcadeScene";
import { intensityFor } from "../../engine/fxTuning";
import { Repeater, type CellFx, type Dying, dyingScale, DYING_MS, FALL_MS, POP_BURST_MS } from "./shared";

/**
 * Dr. Hue: the well starts with locked stains in its lower half. Dominoes
 * fall from the top; a half that lands on a stain mixes into it (the
 * HueBricks add / subtract rules), four in a line clears, and the level is
 * won when every stain is gone.
 */

/** The falling domino plus its smoothed draw position and drop timer. */
interface Piece extends Domino {
  dx: number;
  dy: number;
  drop: number;
}

export class DrHueScene extends ArcadeScene {
  readonly info = arcadeInfo("drhue");
  readonly cols = COLS;
  readonly rows = ROWS;

  private well = new Well(COLS, ROWS);
  private piece: Piece | null = null;
  private next: [Color, Color] = [RED, BLUE];
  private phase: "fall" | "resolve" = "fall";
  private resolveTimer = 0;
  private chain = 0;
  private cleared = 0;
  private landed = 0;
  private levelUp = false;
  private readonly fx = new Map<number, CellFx>();
  private dying: Dying[] = [];
  private readonly keys = new Repeater();
  private readonly holds = new Repeater();

  protected music(): MusicName {
    return "puzzle2_bgm";
  }

  protected start(): void {
    if (this.levelUp) {
      this.level++;
      this.levelUp = false;
    }
    this.well = new Well(COLS, ROWS);
    placeStains(this.well, this.level);
    this.fx.clear();
    this.dying = [];
    this.cleared = 0;
    this.landed = 0;
    this.chain = 0;
    this.phase = "fall";
    this.next = [this.pick(), this.pick()];
    this.spawn();
  }

  protected override win(): void {
    super.win();
    this.levelUp = true;
  }

  protected override wonLines(): string[] {
    return [`Level ${this.level} clear`, `Score ${this.score}`];
  }

  protected stats(): Array<{ label: string; value: string }> {
    return [
      { label: "Level", value: String(this.level) },
      { label: "Stains", value: String(this.well.count((c) => c.locked)) },
    ];
  }

  protected override controlSpec(): Array<{ id: string; icon: Control["icon"] }> {
    return [
      { id: "left", icon: "left" },
      { id: "down", icon: "down" },
      { id: "right", icon: "right" },
      { id: "rotate", icon: "rotate" },
      { id: "drop", icon: "drop" },
    ];
  }

  /** Domino colours: the level's stain colours plus the primaries, so every stain can be reached. */
  private pick(): Color {
    const pool = new Set<Color>([RED, BLUE, YELLOW, ...stainLayout(this.level, COLS, ROWS).colors]);
    const list = [...pool];
    return list[Math.floor(Math.random() * list.length)];
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
    const [a, b] = this.next;
    this.next = [this.pick(), this.pick()];
    const p: Piece = { a, b, x: SPAWN_X, y: 0, rot: 0, dx: SPAWN_X, dy: -1, drop: 0 };
    if (!fits(this.well, p)) {
      this.piece = null;
      this.lose();
      return;
    }
    this.piece = p;
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
    if (inp.keysPressed.has("ArrowUp") || inp.keysPressed.has("x") || inp.keysPressed.has("X") || inp.keysPressed.has("w") || inp.keysPressed.has("W"))
      this.rotate(1);
    if (inp.keysPressed.has("z") || inp.keysPressed.has("Z")) this.rotate(-1);
    if (inp.keysPressed.has(" ")) {
      this.hardDrop();
      return;
    }
    const interval = fallInterval(this.level, this.landed);
    p.drop += down ? Math.max(1, interval / 4) : 1;
    if (p.drop >= interval) {
      p.drop = 0;
      if (fits(this.well, p, p.x, p.y + 1)) p.y++;
      else this.land();
    }
  }

  private move(dir: number): void {
    const p = this.piece;
    const m = p && moved(this.well, p, dir);
    if (!p || !m) return;
    p.x = m.x;
    this.ctx.audio.play("BlocksSelection_snd", 0.35, 1.3);
  }

  /** Quarter turn around the pivot with a wall kick; vertical at the top row nudges down. */
  private rotate(dir: number): void {
    const p = this.piece;
    if (!p) return;
    const r = rotated(this.well, p, dir);
    if (!r) {
      this.ctx.audio.play("BlocksIncorrect_snd", 0.4);
      return;
    }
    p.x = r.x;
    p.y = r.y;
    p.rot = r.rot;
    this.ctx.audio.play("BoardRotation_snd", 0.5, 1.4);
  }

  private hardDrop(): void {
    const p = this.piece;
    if (!p) return;
    const y = restingRow(this.well, p);
    const fell = y - p.y;
    if (fell >= 2) {
      const L = this.L;
      const [ox, oy] = offsetOf(p.rot);
      for (const [hx, hy, c] of [
        [p.x, p.y, p.a],
        [p.x + ox, p.y + oy, p.b],
      ] as const) {
        const from = this.cellPos(hx, hy);
        const to = this.cellPos(hx, hy + fell);
        this.effects.streak(from.x + L.cell / 2, from.y, to.y + L.cell, L.cell, this.colorOf(c));
      }
    }
    p.y = y;
    p.dy = y - Math.min(1.5, fell * 0.4);
    this.land();
  }

  /** Both halves come to rest. A half over a stain it can mix with soaks in; the rest stack. */
  private land(): void {
    const p = this.piece;
    if (!p) return;
    const L = this.L;
    this.piece = null;
    this.landed++;
    let mixed = false;
    let fell = false;
    for (const h of settleDomino(this.well, p)) {
      const below = h.into;
      if (below) {
        const f = this.fxOf(below);
        f.wipeFrom = below.color;
        f.wipeT0 = this.ctx.clock.t;
        below.refined = isSubtractive(h.color, below.color, h.result);
        below.color = h.result;
        f.s = 1.14;
        this.tweens.to(f, { s: 1 }, 220, easeOutBack);
        const c = this.cellPos(below.x, below.y);
        this.ring(c.x + L.cell / 2, c.y + L.cell / 2, L.cell * 0.3, L.cell * 0.9, this.colorOf(h.result), 3);
        this.effects.mixSplash(c.x + L.cell / 2, c.y + L.cell / 2, L.cell, [this.colorOf(f.wipeFrom as Color), this.colorOf(h.result)], -Math.PI / 2);
        this.effects.mixArc(c.x + L.cell / 2, c.y + L.cell / 2, L.cell, f.wipeFrom as Color, h.result);
        mixed = true;
      } else {
        const cell = this.well.add(h.x, h.y, h.color);
        const f = this.fxOf(cell);
        if (h.y > h.fromY) {
          // the half had nothing under it: it drops into place
          fell = true;
          f.dy = h.fromY - h.y;
          this.tweens.to(f, { dy: 0 }, FALL_MS, easeOutCubic, {
            onDone: () => {
              f.sy = 0.9;
              this.tweens.to(f, { sy: 1 }, 160, easeOutBack);
            },
          });
        } else {
          f.sy = 0.86;
          this.tweens.to(f, { sy: 1 }, 180, easeOutBack);
        }
      }
    }
    if (mixed) this.ctx.audio.play("BlocksCombine_snd");
    else this.ctx.audio.play("BlocksLanding_snd", 0.8);
    this.chain = 0;
    this.phase = "resolve";
    this.resolveTimer = fell ? Math.round(FALL_MS / (1000 / 30)) + 1 : 2;
  }

  private resolve(): void {
    const lines = this.well.lines(4);
    if (lines.length) {
      this.clear(lines);
      this.resolveTimer = Math.round(DYING_MS / (1000 / 30)) + 1;
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
    if (this.well.count((c) => c.locked) === 0) {
      const bonus = levelBonus(this.level);
      this.addScore(bonus);
      this.callout(`Level bonus +${bonus}`, this.L.x + this.L.w / 2, this.L.y + this.L.h * 0.4, this.ctx.palette.overlayAccent, 20, true, 1400);
      this.win();
      return;
    }
    this.phase = "fall";
    this.spawn();
  }

  private clear(lines: Cell[][]): void {
    const L = this.L;
    this.chain++;
    const cells = Well.flatten(lines);
    const k = intensityFor(this.chain, cells.length + cells.filter((c) => c.locked).length);
    let stains = 0;
    let sx = 0;
    let sy = 0;
    cells.forEach((c, i) => {
      const pos = this.cellPos(c.x, c.y);
      sx += pos.x + L.cell / 2;
      sy += pos.y + L.cell / 2;
      if (c.locked) stains++;
      this.dying.push({
        x: pos.x,
        y: pos.y,
        color: c.color,
        t0: this.ctx.clock.t + Math.min(i, 8) * 18,
        burst: false,
        spin: Math.random() < 0.5 ? -1 : 1,
        blob: c.locked,
        k,
      });
      this.well.remove(c);
      this.fx.delete(c.id);
    });
    const pts = clearPoints(cells.length, stains, this.chain);
    this.cleared += stains;
    this.addScore(pts);
    const cx = sx / cells.length;
    const cy = sy / cells.length;
    this.callout(`+${pts}`, cx, cy - 6, this.ctx.palette.callout, 18);
    if (stains) this.callout(`${stains} stain${stains > 1 ? "s" : ""} out`, cx, cy + 16, this.ctx.palette.goalAccent, 13);
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
    this.ctx.audio.play("BlocksPopping_snd", 1, 1 + (this.chain - 1) * 0.08);
    this.impact(k, sx / cells.length, sy / cells.length, cells[0]?.color);
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
    if (id === "rotate") {
      if (!held) this.rotate(1);
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

  protected override onWellTap(): void {
    this.rotate(1);
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
    const s = size * 0.55;
    const cx = x + size / 2;
    const cy = y + size / 2;
    this.drawTile(g, this.next[0], cx - s, cy - s / 2, s);
    this.drawTile(g, this.next[1], cx, cy - s / 2, s);
    this.drawJoin(g, cx, cy, s, 0);
  }

  /** A small bar across the join so the two halves read as one domino. */
  private drawJoin(g: CanvasRenderingContext2D, jx: number, jy: number, cell: number, rot: number): void {
    g.save();
    g.translate(jx, jy);
    g.rotate(rot * (Math.PI / 2));
    g.fillStyle = "rgba(255,255,255,0.45)";
    g.beginPath();
    g.roundRect(-cell * 0.1, -cell * 0.22, cell * 0.2, cell * 0.44, cell * 0.08);
    g.fill();
    g.restore();
  }

  protected renderWell(g: CanvasRenderingContext2D): void {
    const L = this.L;
    const t = this.ctx.clock.t;
    const dtk = 1 - Math.exp(-this.ctx.clock.dt / 45);
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
      if (c.locked) {
        // stains breathe slowly, each on its own phase
        const pulse = 0.97 + 0.03 * Math.sin(t / 700 + c.id * 1.3);
        this.drawTile(g, c.color, pos.x, pos.y, L.cell, {
          s: f.s * pulse,
          shape: "blob",
          seed: c.id * 7 + 3,
          wipeFrom: wipe < 1 ? (f.wipeFrom as Color) : undefined,
          wipe,
        });
      } else {
        this.drawTile(g, c.color, pos.x, pos.y, L.cell, { s: f.s });
      }
      g.restore();
      if (wipe >= 1) f.wipeT0 = -1;
    }
    for (const d of this.dying) {
      const e = t - d.t0;
      if (e < 0) continue;
      if (!d.burst && e >= POP_BURST_MS) {
        d.burst = true;
        this.burst(d.x + L.cell / 2, d.y + L.cell / 2, d.color, { count: d.blob ? 16 : 10, k: d.k ?? 0, shape: d.blob ? "blob" : "square", seed: 5 });
      }
      const { s, rot, alpha } = dyingScale(e, d.spin);
      this.drawTile(g, d.color, d.x, d.y, L.cell, { s, rot, alpha, shape: d.blob ? "blob" : "square", seed: 5 });
    }
    this.dying = this.dying.filter((d) => t - d.t0 < DYING_MS);

    const p = this.piece;
    if (p && this.phase === "fall") {
      p.dx += (p.x - p.dx) * dtk;
      p.dy += (p.y - p.dy) * dtk;
      // ghost at the landing spot, with the mixes it would make
      const ly = restingRow(this.well, p);
      const pulse = 0.5 + 0.5 * Math.sin(t / 160);
      for (const h of settleDomino(this.well, p, p.x, ly)) {
        const below = h.into;
        if (below) {
          const bp = this.cellPos(below.x, below.y);
          this.drawTile(g, h.result, bp.x, bp.y, L.cell, { alpha: 0.4 + 0.25 * pulse, s: 0.9, shape: "blob", seed: below.id * 7 + 3 });
        } else {
          const gp = this.cellPos(h.x, h.y);
          this.drawTile(g, h.color, gp.x, gp.y, L.cell, { alpha: 0.2, s: 0.94 });
        }
      }
      const [ox, oy] = offsetOf(p.rot);
      const a = this.cellPos(p.dx, p.dy);
      const b = this.cellPos(p.dx + ox, p.dy + oy);
      this.drawTile(g, p.a, a.x, a.y, L.cell, { lift: 0.35 });
      this.drawTile(g, p.b, b.x, b.y, L.cell, { lift: 0.35 });
      this.drawJoin(g, (a.x + b.x) / 2 + L.cell / 2, (a.y + b.y) / 2 + L.cell / 2 - 4 * 0.35, L.cell, p.rot);
    }
  }
}
