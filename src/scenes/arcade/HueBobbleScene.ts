import { arcadeInfo } from "../../core/arcade";
import { BubbleGrid, ROW_PITCH, type Bubble } from "../../core/bobble";
import { BLUE, combineColors, GREEN, ORANGE, PURPLE, RED, YELLOW, type Color } from "../../core/color";
import type { MusicName } from "../../engine/assets";
import { backOut, clamp01, easeOutBack, easeOutCubic } from "../../engine/easing";
import { ArcadeScene } from "./ArcadeScene";
import { type Dying, dyingScale, DYING_MS, POP_BURST_MS } from "./shared";

/**
 * Hue Bobble: a launcher at the bottom shoots bubbles up into a hex-packed
 * cluster. A shot that can mix with the bubble it hits mixes in (the
 * HueBricks add / subtract rules); otherwise it sticks. Three or more of a
 * colour pop, anything left hanging falls, and the ceiling creeps down
 * every few shots.
 */

const COLS = 8;
const ROWS = 11;
const POP_MIN = 3;
const MAX_ANGLE = (80 * Math.PI) / 180;
const KEY_TURN = (1.6 * Math.PI) / 180;

interface Shot {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  color: Color;
}

/** A bubble cut loose from the ceiling, falling out of the well. */
interface Falling {
  x: number;
  y: number;
  vy: number;
  vx: number;
  color: Color;
  spin: number;
  rot: number;
}

interface BubbleFx {
  s: number;
  wipeFrom: Color | -1;
  wipeT0: number;
}

export class HueBobbleScene extends ArcadeScene {
  readonly info = arcadeInfo("bobble");
  readonly cols = COLS;
  readonly rows = ROWS;

  /** One overflow row past the lose line, so a shot that crosses it sticks (and loses) instead of vanishing. */
  private grid = new BubbleGrid(COLS, ROWS + 1);
  private shot: Shot | null = null;
  private loaded: Color = RED;
  private next: Color = BLUE;
  private aim = 0;
  private shots = 0;
  private shotsLeft = 8;
  private popped = 0;
  private readonly fx = new Map<number, BubbleFx>();
  private dying: Dying[] = [];
  private falling: Falling[] = [];
  /** Drawn ceiling position in rows, easing toward `grid.drop`. */
  private readonly dropFx = { v: 0 };
  private levelUp = false;
  private settleTimer = 0;
  /** Where the pointer was last step, so a resting pointer does not override keyboard aim. */
  private lastPointer = { x: -1, y: -1 };

  constructor(ctx: ConstructorParameters<typeof ArcadeScene>[0]) {
    super(ctx);
    this.extraRows = 2;
    this.wellCells = false;
  }

  protected music(): MusicName {
    return "zen1_bgm";
  }

  private get r(): number {
    return this.L.cell / 2;
  }

  private levelColors(): Color[] {
    const lv = this.level;
    const c: Color[] = [RED, BLUE, YELLOW];
    if (lv >= 2) c.push(GREEN);
    if (lv >= 3) c.push(ORANGE);
    if (lv >= 5) c.push(PURPLE);
    return c;
  }

  private shotsPerDrop(): number {
    return Math.max(5, 9 - Math.floor(this.level / 3));
  }

  protected start(): void {
    if (this.levelUp) {
      this.level++;
      this.levelUp = false;
    }
    this.grid = new BubbleGrid(COLS, ROWS + 1);
    this.grid.populate(Math.min(7, 3 + Math.floor((this.level - 1) / 2)), this.levelColors());
    this.fx.clear();
    this.dying = [];
    this.falling = [];
    this.shot = null;
    this.shots = 0;
    this.popped = 0;
    this.shotsLeft = this.shotsPerDrop();
    this.dropFx.v = 0;
    this.aim = 0;
    this.loaded = this.pick();
    this.next = this.pick();
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
      { label: "Drop in", value: String(this.shotsLeft) },
    ];
  }

  /** Shot colours: what is in the cluster, weighted, plus the primaries so mixes stay possible. */
  private pick(): Color {
    const present = this.grid.colorsPresent();
    const pool: Color[] = [...present, ...present, RED, BLUE, YELLOW];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  private fxOf(b: Bubble): BubbleFx {
    let f = this.fx.get(b.id);
    if (!f) {
      f = { s: 1, wipeFrom: -1, wipeT0: -1 };
      this.fx.set(b.id, f);
    }
    return f;
  }

  /** Launcher pivot in screen units. */
  private launcher(): { x: number; y: number } {
    const L = this.L;
    return { x: L.x + L.w / 2, y: L.y + L.h - L.cell * 1.05 };
  }

  /** Screen y of the lose line. */
  private deadline(): number {
    const L = this.L;
    return L.y + this.r + (ROWS - 1) * 2 * this.r * ROW_PITCH + this.r;
  }

  private center(row: number, col: number): { x: number; y: number } {
    const c = this.grid.center(row, col, this.r);
    const dropY = (this.dropFx.v - this.grid.drop) * 2 * this.r * ROW_PITCH;
    return { x: this.L.x + c.x, y: this.L.y + c.y + dropY };
  }

  // ---------------------------------------------------------------------------
  // Play
  // ---------------------------------------------------------------------------

  protected stepPlay(): void {
    const inp = this.ctx.input;
    const L = this.L;
    // aim: keys turn, the pointer aims when it is over the playfield
    const key = (...names: string[]) => names.some((k) => inp.keysDown.has(k) || inp.keysPressed.has(k));
    if (key("ArrowLeft", "a", "A")) this.aim = Math.max(-MAX_ANGLE, this.aim - KEY_TURN);
    if (key("ArrowRight", "d", "D")) this.aim = Math.min(MAX_ANGLE, this.aim + KEY_TURN);
    const pointerMoved = inp.x !== this.lastPointer.x || inp.y !== this.lastPointer.y;
    this.lastPointer = { x: inp.x, y: inp.y };
    if (pointerMoved && inp.x >= L.x - L.cell && inp.x <= L.x + L.w + L.cell && inp.y >= L.y && inp.y < this.launcher().y - L.cell * 0.4) this.aimAt(inp.x, inp.y);
    if (inp.keysPressed.has(" ") || inp.keysPressed.has("ArrowUp")) this.fire();

    if (this.settleTimer > 0 && --this.settleTimer === 0) this.afterSettle();
    this.stepShot();
    this.stepFalling();
  }

  private aimAt(x: number, y: number): void {
    const l = this.launcher();
    const a = Math.atan2(x - l.x, l.y - y);
    this.aim = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, a));
  }

  private fire(): void {
    if (this.shot || this.settleTimer > 0 || this.state !== "play") return;
    const l = this.launcher();
    const speed = this.L.cell * 0.62;
    this.shot = { x: l.x, y: l.y, px: l.x, py: l.y, vx: Math.sin(this.aim) * speed, vy: -Math.cos(this.aim) * speed, color: this.loaded };
    this.loaded = this.next;
    this.next = this.pick();
    this.shots++;
    this.ctx.audio.play("BlocksRepMoveUp_snd", 0.8, 1.2);
  }

  private stepShot(): void {
    const s = this.shot;
    if (!s) return;
    const L = this.L;
    const r = this.r;
    s.px = s.x;
    s.py = s.y;
    const sub = 4;
    for (let k = 0; k < sub; k++) {
      s.x += s.vx / sub;
      s.y += s.vy / sub;
      if (s.x - r < L.x) {
        s.x = L.x + r + (L.x - (s.x - r));
        s.vx = -s.vx;
        this.ctx.audio.play("BlocksSelection_snd", 0.3, 0.8);
      } else if (s.x + r > L.x + L.w) {
        s.x = L.x + L.w - r - (s.x + r - (L.x + L.w));
        s.vx = -s.vx;
        this.ctx.audio.play("BlocksSelection_snd", 0.3, 0.8);
      }
      const ceilingY = L.y + this.grid.drop * 2 * r * ROW_PITCH;
      let hit: Bubble | null = null;
      let hitD = Infinity;
      for (const b of this.grid.bubbles()) {
        const c = this.grid.center(b.row, b.col, r);
        const d = Math.hypot(L.x + c.x - s.x, L.y + c.y - s.y);
        if (d < hitD) {
          hitD = d;
          hit = b;
        }
      }
      if (s.y - r <= ceilingY || (hit && hitD < 2 * r * 0.9)) {
        this.stick(s, hit && hitD < 2 * r * 1.05 ? hit : null);
        return;
      }
    }
  }

  /** The shot arrives: mix into the bubble it hit if the colours allow, otherwise snap in beside it. */
  private stick(s: Shot, hit: Bubble | null): void {
    const L = this.L;
    const r = this.r;
    this.shot = null;
    const result = hit ? combineColors(s.color, hit.color) : null;
    let at: Bubble | null = null;
    if (hit && result !== null) {
      const f = this.fxOf(hit);
      f.wipeFrom = hit.color;
      f.wipeT0 = this.ctx.clock.t;
      f.s = 1.18;
      this.tweens.to(f, { s: 1 }, 240, easeOutBack);
      hit.color = result;
      const c = this.center(hit.row, hit.col);
      this.ring(c.x, c.y, r * 0.6, r * 2.2, this.colorOf(result), 3);
      this.ctx.audio.play("BlocksCombine_snd");
      at = hit;
    } else {
      const cell = this.grid.snapCell(s.x - L.x, s.y - L.y, r);
      if (!cell) {
        this.ctx.audio.play("BlocksIncorrect_snd", 0.5);
        this.afterSettle();
        return;
      }
      at = this.grid.add(cell.row, cell.col, s.color);
      const f = this.fxOf(at);
      f.s = 0.6;
      this.tweens.to(f, { s: 1 }, 220, backOut(2));
      this.ctx.audio.play("BlocksLanding_snd", 0.7, 1.1);
    }
    const group = this.grid.group(at.row, at.col);
    if (group.length >= POP_MIN) {
      this.pop(group);
      this.settleTimer = Math.round(DYING_MS / (1000 / 30)) + 2;
      return;
    }
    this.afterSettle();
  }

  private pop(group: Bubble[]): void {
    const r = this.r;
    let sx = 0;
    let sy = 0;
    group.forEach((b, i) => {
      const c = this.center(b.row, b.col);
      sx += c.x;
      sy += c.y;
      this.dying.push({ x: c.x - r, y: c.y - r, color: b.color, t0: this.ctx.clock.t + Math.min(i, 8) * 18, burst: false, spin: Math.random() < 0.5 ? -1 : 1 });
      this.grid.remove(b);
      this.fx.delete(b.id);
    });
    const pts = group.length * 30 + Math.max(0, group.length - POP_MIN) * 30;
    this.popped += group.length;
    this.addScore(pts);
    this.callout(`+${pts}`, sx / group.length, sy / group.length, this.ctx.palette.callout, 18);
    this.ctx.audio.play("BlocksPopping_snd");
    this.shake(2 + group.length * 0.4);
    if (group.length >= 5) this.ctx.clock.freeze(40);
    // anything no longer hanging from the ceiling drops out
    const loose = this.grid.floating();
    if (loose.length) {
      let fx = 0;
      let fy = 0;
      for (const b of loose) {
        const c = this.center(b.row, b.col);
        fx += c.x;
        fy += c.y;
        this.falling.push({ x: c.x, y: c.y, vy: -this.L.cell * 0.12, vx: (Math.random() - 0.5) * this.L.cell * 0.08, color: b.color, spin: (Math.random() - 0.5) * 0.3, rot: 0 });
        this.grid.remove(b);
        this.fx.delete(b.id);
      }
      const bonus = 20 * loose.length * (loose.length + 1);
      this.addScore(bonus);
      this.callout(`Drop +${bonus}`, fx / loose.length, fy / loose.length + this.L.cell, this.ctx.palette.overlayAccent, 16, true, 1000);
    }
  }

  /** Housekeeping after a shot lands: ceiling drop, win and lose checks. */
  private afterSettle(): void {
    if (this.state !== "play") return;
    if (this.grid.count() === 0) {
      const bonus = 300 + this.level * 100;
      this.addScore(bonus);
      this.callout(`Cleared +${bonus}`, this.L.x + this.L.w / 2, this.L.y + this.L.h * 0.4, this.ctx.palette.overlayAccent, 22, true, 1400);
      this.win();
      return;
    }
    if (--this.shotsLeft <= 0) {
      this.shotsLeft = this.shotsPerDrop();
      this.grid.drop++;
      this.tweens.to(this.dropFx, { v: this.grid.drop }, 260, backOut(1.1));
      this.ctx.audio.play("BlocksRepMoveUp_snd", 0.9, 0.7);
      this.shake(3);
    }
    if (this.grid.bottomRow() + this.grid.drop >= ROWS) {
      this.lose();
    }
  }

  private stepFalling(): void {
    const L = this.L;
    const g = L.cell * 0.045;
    for (const f of this.falling) {
      f.vy += g;
      f.y += f.vy;
      f.x += f.vx;
      f.rot += f.spin;
    }
    this.falling = this.falling.filter((f) => f.y < L.y + L.h + L.cell);
  }

  // ---------------------------------------------------------------------------
  // Input hooks
  // ---------------------------------------------------------------------------

  protected override onWellDrag(x: number, y: number): void {
    this.aimAt(x, y);
  }

  protected override onWellRelease(x: number, y: number): void {
    if (y < this.launcher().y - this.L.cell * 0.4) this.aimAt(x, y);
    this.fire();
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  protected override renderNext(g: CanvasRenderingContext2D, x: number, y: number, size: number): void {
    const s = size * 0.8;
    this.drawTile(g, this.next, x + (size - s) / 2, y + (size - s) / 2, s, { shape: "round" });
  }

  /** The aim guide: a dotted path with one wall bounce, stopping at the cluster. */
  private renderGuide(g: CanvasRenderingContext2D): void {
    const L = this.L;
    const r = this.r;
    const l = this.launcher();
    let x = l.x;
    let y = l.y;
    let vx = Math.sin(this.aim);
    let vy = -Math.cos(this.aim);
    const step = r * 0.55;
    const bubbles = this.grid.bubbles().map((b) => this.center(b.row, b.col));
    const ceilingY = L.y + this.dropFx.v * 2 * r * ROW_PITCH;
    const pal = this.ctx.palette;
    g.save();
    g.fillStyle = pal.kind === "classic" ? "rgba(255,255,255,0.5)" : this.rgba(pal.brickColors[this.loaded], 0.55);
    let bounces = 0;
    for (let i = 0; i < 90; i++) {
      x += vx * step;
      y += vy * step;
      if (x - r < L.x || x + r > L.x + L.w) {
        vx = -vx;
        x = x - r < L.x ? L.x + r : L.x + L.w - r;
        if (++bounces > 1) break;
      }
      if (y - r <= ceilingY) break;
      if (bubbles.some((c) => Math.hypot(c.x - x, c.y - y) < 2 * r * 0.9)) break;
      if (i % 2 === 0) {
        g.globalAlpha = 1 - i / 90;
        g.beginPath();
        g.arc(x, y, Math.max(1.5, r * 0.12), 0, Math.PI * 2);
        g.fill();
      }
    }
    g.restore();
  }

  private renderLauncher(g: CanvasRenderingContext2D): void {
    const L = this.L;
    const r = this.r;
    const l = this.launcher();
    const pal = this.ctx.palette;
    const classic = pal.kind === "classic";
    const base = classic ? "#2a2a2a" : pal.ui.secondary;
    const edge = classic ? "#555" : pal.ui.secondaryEdge;
    // plinth
    g.save();
    g.beginPath();
    g.arc(l.x, l.y, r * 1.5, Math.PI, 0);
    g.closePath();
    g.fillStyle = base;
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = edge;
    g.stroke();
    // barrel
    g.translate(l.x, l.y);
    g.rotate(this.aim);
    g.beginPath();
    g.roundRect(-r * 0.42, -r * 2.3, r * 0.84, r * 2.3, r * 0.3);
    g.fillStyle = classic ? "#8c8c8c" : pal.ui.primary;
    g.fill();
    g.restore();
    // the loaded bubble sits on the pivot
    const t = this.ctx.clock.t;
    const bob = Math.sin(t / 400) * 0.02;
    this.drawTile(g, this.loaded, l.x - r, l.y - r, L.cell, { shape: "round", s: 1 + bob, lift: 0.2 });
  }

  protected renderWell(g: CanvasRenderingContext2D): void {
    const L = this.L;
    const r = this.r;
    const t = this.ctx.clock.t;
    const pal = this.ctx.palette;
    const alpha = this.ctx.clock.alpha;

    // the ceiling that has come down
    const ceilingY = L.y + this.dropFx.v * 2 * r * ROW_PITCH;
    if (ceilingY > L.y + 0.5) {
      g.fillStyle = pal.kind === "classic" ? "#3a3a3a" : pal.ui.cardShadow;
      g.fillRect(L.x, L.y, L.w, ceilingY - L.y);
      g.fillStyle = pal.kind === "classic" ? "#555" : pal.wellEdge;
      g.fillRect(L.x, ceilingY - 3, L.w, 3);
    }
    // the lose line, pulsing when the cluster is close
    const dl = this.deadline();
    const danger = this.grid.bottomRow() + this.grid.drop >= ROWS - 2;
    g.save();
    g.setLineDash([6, 6]);
    g.lineWidth = danger ? 2.5 : 1.5;
    g.strokeStyle = danger ? this.rgba(pal.overlayAccent, 0.5 + 0.4 * Math.sin(t / 150)) : pal.kind === "classic" ? "rgba(255,255,255,0.25)" : this.rgba(pal.hudText, 0.22);
    g.beginPath();
    g.moveTo(L.x, dl);
    g.lineTo(L.x + L.w, dl);
    g.stroke();
    g.restore();

    this.renderGuide(g);

    for (const b of this.grid.bubbles()) {
      const f = this.fxOf(b);
      const c = this.center(b.row, b.col);
      const wipe = f.wipeT0 >= 0 ? this.wipeAt(f.wipeT0) : 1;
      const breathe = 1 + 0.012 * Math.sin(t / 900 + b.row * 0.8 + b.col * 1.3);
      this.drawTile(g, b.color, c.x - r, c.y - r, L.cell, { shape: "round", s: f.s * breathe, wipeFrom: wipe < 1 ? (f.wipeFrom as Color) : undefined, wipe });
      if (wipe >= 1) f.wipeT0 = -1;
    }
    for (const d of this.dying) {
      const e = t - d.t0;
      if (e < 0) continue;
      if (!d.burst && e >= POP_BURST_MS) {
        d.burst = true;
        this.burst(d.x + r, d.y + r, d.color);
      }
      const { s, rot, alpha: a } = dyingScale(e, d.spin);
      this.drawTile(g, d.color, d.x, d.y, L.cell, { s, rot, alpha: a, shape: "round" });
    }
    this.dying = this.dying.filter((d) => t - d.t0 < DYING_MS);
    for (const f of this.falling) {
      const fade = clamp01((L.y + L.h + L.cell - f.y) / (L.cell * 2));
      this.drawTile(g, f.color, f.x - r, f.y - r, L.cell, { shape: "round", rot: f.rot, alpha: easeOutCubic(fade) });
    }
    const s = this.shot;
    if (s) {
      const x = s.px + (s.x - s.px) * alpha;
      const y = s.py + (s.y - s.py) * alpha;
      this.drawTile(g, s.color, x - r, y - r, L.cell, { shape: "round", lift: 0.3 });
    }
    this.renderLauncher(g);
  }
}
