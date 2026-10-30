import { randomSpawnColor, type Color } from "../core/color";
import { BACKDROPS } from "../engine/backdrops";
import { ButtonFeel } from "../engine/buttonFeel";
import { drawCard, drawPillButton, drawText, type PillButton } from "../engine/draw";
import { easeOutBack } from "../engine/easing";
import { Effects } from "../engine/effects";
import { DEFAULT_TUNING, intensityFor, popScale, resetTuning, TUNING, type FxTuning } from "../engine/fxTuning";
import { nextTheme, THEME_LABELS } from "../engine/theme";
import { SOUND_NAMES } from "../engine/assets";
import { CUE_NAMES } from "../engine/synth";
import { SOUND_EVENTS } from "../engine/soundProfile";
import { drawTile } from "../engine/tiles";
import { Tweens } from "../engine/tween";
import { fillScreen } from "../engine/view";
import { type Dying, dyingScale, DYING_MS, POP_BURST_MS } from "./arcade/shared";
import type { GameContext, Scene } from "./Scene";
import { TitleScene } from "./TitleScene";

/**
 * Effects lab (`?fx` on the URL): a small board of tiles and buttons that
 * fire each effect on demand, with the live tuning numbers editable on
 * screen. It drives the same `Effects` layer the game uses, so what is
 * dialled in here is what the game does.
 */

const N = 4;

interface Tile {
  color: Color;
  fx: { s: number; dy: number; wipeFrom: Color | -1; wipeT0: number };
}

interface Row {
  key: keyof FxTuning;
  label: string;
  step: number;
  min: number;
  max: number;
}

const ROWS: Row[] = [
  { key: "chainForMax", label: "Chain for max", step: 1, min: 2, max: 10 },
  { key: "sizeWeight", label: "Size weight", step: 1, min: 1, max: 12 },
  { key: "debris", label: "Debris ×", step: 0.2, min: 1, max: 5 },
  { key: "sparks", label: "Sparks", step: 2, min: 0, max: 40 },
  { key: "fragmentGrid", label: "Fragment grid", step: 1, min: 2, max: 4 },
  { key: "shake", label: "Shake px", step: 1, min: 0, max: 20 },
  { key: "ring", label: "Ring +cells", step: 0.5, min: 0, max: 6 },
  { key: "freeze", label: "Hit-stop +ms", step: 10, min: 0, max: 200 },
  { key: "slowmo", label: "Slow-mo scale", step: 0.05, min: 0.1, max: 1 },
  { key: "slowmoMs", label: "Slow-mo ms", step: 20, min: 0, max: 600 },
  { key: "slowmoAt", label: "Slow-mo at", step: 0.1, min: 0, max: 1 },
  { key: "bloom", label: "Bloom", step: 0.1, min: 0, max: 1 },
];

const WIPE_MS = 160;

export class FxLabScene implements Scene {
  private readonly ctx: GameContext;
  private readonly tweens = new Tweens();
  private readonly feel: ButtonFeel;
  private readonly effects: Effects;
  private tiles: Array<Tile | null> = [];
  private sampleIndex = 0;
  private eventIndex = 0;
  private cueIndex = 0;
  private dying: Array<Dying & { k: number }> = [];
  private refills: Array<{ i: number; at: number }> = [];
  private chain = 1;
  private pendingImpact: { k: number; dir: [number, number] } | null = null;
  private buttons: PillButton[] = [];
  private layoutKey = "";
  private grid = { x: 0, y: 0, cell: 0 };
  private panel = { x: 0, y: 0, w: 0 };
  private rowsY = 0;
  private status = "";
  private statusT0 = -1e9;
  private renderMs = 0;

  constructor(ctx: GameContext) {
    this.ctx = ctx;
    this.feel = new ButtonFeel(this.tweens);
    this.effects = new Effects(ctx, 600);
    for (let i = 0; i < N * N; i++) this.tiles.push(this.freshTile());
  }

  private freshTile(): Tile {
    return { color: randomSpawnColor(), fx: { s: 1, dy: 0, wipeFrom: -1, wipeT0: -1 } };
  }

  cursor(): string {
    const inp = this.ctx.input;
    return this.buttons.some((b) => inp.inCentered(b.cx, b.cy, b.w, b.h)) ? "pointer" : "default";
  }

  // ---------------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------------

  private layout(): void {
    const v = this.ctx.view;
    const key = `${v.w}x${v.h}`;
    if (key === this.layoutKey) return;
    this.layoutKey = key;
    const m = 16;
    if (v.portrait) {
      const side = Math.min(v.w - m * 2, v.h * 0.4);
      this.grid = { x: v.w / 2 - side / 2, y: m + 30, cell: side / N };
      this.panel = { x: m, y: this.grid.y + side + 18, w: v.w - m * 2 };
    } else {
      const side = Math.min(v.h - m * 2 - 62, v.w * 0.46);
      this.grid = { x: m, y: m + 30, cell: side / N };
      this.panel = { x: m + side + 24, y: m + 8, w: v.w - (m + side + 24) - m };
    }
    const p = this.panel;
    const cols = 3;
    const gap = 8;
    const bw = (p.w - gap * (cols - 1)) / cols;
    const bh = 32;
    const actions: Array<[string, string, boolean?]> = [
      ["pop1", "Pop ×1"],
      ["pop4", "Pop ×4", true],
      ["mix", "Mix"],
      ["chain-", "Chain −"],
      ["chain+", "Chain +"],
      ["clear", "Level clear"],
      ["lose", "Lose"],
      ["drop", "Hard drop"],
      ["wash", "Chain wash"],
      ["theme", "Theme ▸"],
      ["reset", "Reset tuning"],
      ["low", "Low power"],
      ["sample", "Sample ▸"],
      ["event", "Event ▸"],
      ["cue", "Cue ▸"],
      ["duck", "Duck music"],
    ];
    this.buttons = actions.map(([id, label, primary], i) => ({
      id,
      label,
      primary,
      cx: p.x + bw / 2 + (i % cols) * (bw + gap),
      cy: p.y + bh / 2 + Math.floor(i / cols) * (bh + gap),
      w: bw,
      h: bh,
    }));
    const rowsTop = p.y + Math.ceil(actions.length / cols) * (bh + gap) + 10;
    this.rowsY = rowsTop;
    const rowH = Math.min(26, Math.max(20, (v.h - rowsTop - 44) / ROWS.length));
    ROWS.forEach((r, i) => {
      const cy = rowsTop + rowH * i + rowH / 2;
      const s = rowH - 4;
      this.buttons.push({ id: `-${r.key}`, label: "−", cx: p.x + p.w - s * 1.5 - 6, cy, w: s, h: s });
      this.buttons.push({ id: `+${r.key}`, label: "+", cx: p.x + p.w - s / 2, cy, w: s, h: s });
    });
    this.buttons.push({ id: "back", label: "Back", cx: p.x + p.w / 2, cy: v.h - 24, w: Math.min(160, p.w), h: 30 });
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  private act(id: string): void {
    if (id.startsWith("+") || id.startsWith("-")) {
      const row = ROWS.find((r) => r.key === id.slice(1));
      if (!row) return;
      const dir = id.startsWith("+") ? 1 : -1;
      const v = TUNING[row.key] + dir * row.step;
      TUNING[row.key] = Math.round(Math.min(row.max, Math.max(row.min, v)) * 1000) / 1000;
      return;
    }
    switch (id) {
      case "pop1":
        this.pop(1);
        break;
      case "pop4":
        this.pop(4);
        break;
      case "mix":
        this.mix();
        break;
      case "chain-":
        this.chain = Math.max(1, this.chain - 1);
        break;
      case "chain+":
        this.chain = Math.min(8, this.chain + 1);
        break;
      case "clear": {
        const { x, y, cell } = this.grid;
        const xs = Array.from({ length: N }, (_, i) => x + (i + 0.5) * cell);
        this.effects.celebrate(xs, y + N * cell, cell, (i) => ((i % 6) + 1) as Color);
        this.ctx.audio.event("achieve");
        break;
      }
      case "lose":
        this.effects.vignette(0.6, 1600);
        this.effects.shake(4, [0, 1]);
        this.ctx.audio.event("lose");
        break;
      case "drop": {
        const { x, y, cell } = this.grid;
        const col = Math.floor(Math.random() * N);
        const color = this.tiles[col]?.color ?? 1;
        this.effects.streak(x + (col + 0.5) * cell, y - cell * 2.5, y + N * cell, cell, this.ctx.palette.brickColors[color]);
        this.ctx.audio.event("landing");
        break;
      }
      case "wash":
        this.effects.wash(this.ctx.palette.brickColors[randomSpawnColor()], 600);
        break;
      case "sample": {
        const name = SOUND_NAMES[this.sampleIndex % SOUND_NAMES.length];
        this.sampleIndex += 1;
        this.ctx.audio.play(name);
        this.say(`sample · ${name}`);
        break;
      }
      case "event": {
        const name = SOUND_EVENTS[this.eventIndex % SOUND_EVENTS.length];
        this.eventIndex += 1;
        const color = randomSpawnColor();
        this.ctx.audio.event(name, { color, from: 1, to: 5, chain: this.chain });
        this.say(`event · ${name}`);
        break;
      }
      case "cue": {
        const name = CUE_NAMES[this.cueIndex % CUE_NAMES.length];
        this.cueIndex += 1;
        this.ctx.audio.cue(name);
        this.say(`cue · ${name}`);
        break;
      }
      case "duck":
        this.ctx.audio.duck(0.6, 900);
        this.say("music ducked");
        break;
      case "low":
        this.effects.lowPower = !this.effects.lowPower;
        this.say(this.effects.lowPower ? "Low power on" : "Low power off");
        break;
      case "theme":
        this.ctx.setTheme(nextTheme(this.ctx.save.theme));
        this.say(THEME_LABELS[this.ctx.palette.name]);
        break;
      case "reset":
        resetTuning();
        this.say("Tuning reset");
        break;
      case "back":
        this.ctx.setScene(new TitleScene(this.ctx));
        break;
    }
  }

  private say(text: string): void {
    this.status = text;
    this.statusT0 = this.ctx.clock.t;
  }

  private filledIndexes(): number[] {
    return this.tiles.map((t, i) => (t ? i : -1)).filter((i) => i >= 0);
  }

  /** Pop `count` tiles as one group, staged like the game: grow, flare, burst. */
  private pop(count: number): void {
    const free = this.filledIndexes();
    if (free.length === 0) return;
    const first = free[Math.floor(Math.random() * free.length)];
    const fx = first % N;
    const fy = Math.floor(first / N);
    const picks = [first];
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
      [1, 1],
      [-1, 0],
      [0, -1],
    ]) {
      if (picks.length >= count) break;
      const x = fx + dx;
      const y = fy + dy;
      if (x < 0 || y < 0 || x >= N || y >= N) continue;
      const i = y * N + x;
      if (this.tiles[i] && !picks.includes(i)) picks.push(i);
    }
    const k = intensityFor(this.chain, picks.length);
    const t = this.ctx.clock.t;
    const { x, y, cell } = this.grid;
    let sx = 0;
    let sy = 0;
    picks.forEach((i, n) => {
      const tile = this.tiles[i]!;
      const px = x + (i % N) * cell;
      const py = y + Math.floor(i / N) * cell;
      sx += px + cell / 2;
      sy += py + cell / 2;
      this.dying.push({ x: px, y: py, color: tile.color, t0: t + n * 20, burst: false, spin: n % 2 === 0 ? 1 : -1, k });
      this.tiles[i] = null;
      this.refills.push({ i, at: t + n * 20 + DYING_MS + 260 });
    });
    const cx = sx / picks.length;
    const cy = sy / picks.length;
    this.effects.burstRing(cx, cy, cell, this.ctx.palette.callout, k, 60, 300, this.dying[0]?.color);
    const gx = x + (N * cell) / 2;
    const gy = y + (N * cell) / 2;
    this.pendingImpact = { k, dir: [cx - gx, cy - gy] };
    this.say(`chain ${this.chain} · ${picks.length} tiles · k=${k.toFixed(2)}`);
  }

  private impact(p: { k: number; dir: [number, number] }): void {
    const pal = this.ctx.palette;
    const sc = popScale(p.k);
    this.ctx.audio.event("pop", { rate: 1.0595 ** Math.min(7, this.chain - 1), chain: this.chain, color: this.dying[0]?.color });
    this.effects.impact(p.k);
    if (this.chain >= 2 || p.k > 0.25) this.effects.shake(sc.shake, p.dir);
    if (this.chain >= 2) this.effects.flash(pal.flashFromBrick ? pal.brickColors[this.dying[0]?.color ?? 1] : pal.flash, 30, sc.flash);
  }

  private mix(): void {
    const free = this.filledIndexes();
    if (free.length === 0) return;
    const i = free[Math.floor(Math.random() * free.length)];
    const tile = this.tiles[i]!;
    let next = randomSpawnColor();
    while (next === tile.color) next = randomSpawnColor();
    tile.fx.wipeFrom = tile.color;
    tile.fx.wipeT0 = this.ctx.clock.t;
    tile.color = next;
    this.tweens.set(tile.fx, { s: 1 });
    this.tweens.to(tile.fx, { s: 1.1 }, 80, easeOutBack, { onDone: () => this.tweens.to(tile.fx, { s: 1 }, 100, easeOutBack) });
    const { x, y, cell } = this.grid;
    const cx = x + (i % N) * cell + cell / 2;
    const cy = y + Math.floor(i / N) * cell + cell / 2;
    const pal = this.ctx.palette;
    this.effects.ring(cx, cy, cell * 0.5, cell * 0.8, pal.ring, 3, 220);
    this.effects.mixSplash(cx, cy, cell, [pal.brickColors[tile.fx.wipeFrom], pal.brickColors[next]], -Math.PI / 2);
    this.effects.mixArc(cx, cy, cell, tile.fx.wipeFrom, next);
    this.ctx.audio.event("combine", { from: tile.fx.wipeFrom as Color, to: next });
  }

  // ---------------------------------------------------------------------------
  // Loop
  // ---------------------------------------------------------------------------

  update(): void {
    this.layout();
    const inp = this.ctx.input;
    if (inp.released) {
      const hit = this.buttons.find((b) => inp.inCentered(b.cx, b.cy, b.w, b.h));
      if (hit) this.act(hit.id);
    }
    const keys = inp.keysPressed;
    if (keys.has("Escape")) this.act("back");
    if (keys.has("p")) this.act("pop1");
    if (keys.has("o")) this.act("pop4");
    if (keys.has("x")) this.act("mix");
    if (keys.has("c")) this.act("clear");
    if (keys.has("l")) this.act("lose");
    if (keys.has("[")) this.act("chain-");
    if (keys.has("]")) this.act("chain+");

    const t = this.ctx.clock.t;
    this.refills = this.refills.filter((r) => {
      if (t < r.at) return true;
      const tile = this.freshTile();
      tile.fx.dy = -1.6;
      this.tiles[r.i] = tile;
      this.tweens.to(tile.fx, { dy: 0 }, 220, easeOutBack);
      return false;
    });
  }

  render(g: CanvasRenderingContext2D): void {
    this.layout();
    const clock = this.ctx.clock;
    this.tweens.update(clock.t);
    this.effects.update();
    const t = clock.t;
    const pal = this.ctx.palette;
    const v = this.ctx.view;
    const sp = this.ctx.sprites;

    const renderStart = performance.now();
    fillScreen(g, pal.background);
    if (pal.kind === "generated" && pal.backdrop !== "sprites") BACKDROPS[pal.backdrop](g, t);

    g.save();
    this.effects.applyShake(g, v.w / 2, v.h / 2);
    this.effects.renderUnder(g);

    const { x, y, cell } = this.grid;
    const size = cell * 0.9;
    const pad = cell * 0.05;
    drawText(g, "Effects lab", x, y - 12, { size: 16, color: pal.hudText, weight: 700, font: pal.display, align: "left" });
    this.tiles.forEach((tile, i) => {
      if (!tile) return;
      const px = x + (i % N) * cell + pad;
      const py = y + Math.floor(i / N) * cell + pad + tile.fx.dy * cell;
      const wipe = tile.fx.wipeT0 >= 0 ? Math.min(1, (t - tile.fx.wipeT0) / WIPE_MS) : 1;
      drawTile(g, sp, pal, tile.color, px, py, size, {
        s: tile.fx.s,
        wipeFrom: wipe < 1 ? (tile.fx.wipeFrom as Color) : undefined,
        wipe,
      });
      if (wipe >= 1) tile.fx.wipeT0 = -1;
    });
    for (const d of this.dying) {
      const e = t - d.t0;
      if (e < 0) continue;
      if (!d.burst && e >= POP_BURST_MS) {
        d.burst = true;
        if (this.pendingImpact) {
          this.impact(this.pendingImpact);
          this.pendingImpact = null;
        }
        const color = d.color;
        this.effects.pop({
          x: d.x + pad,
          y: d.y + pad,
          w: size,
          h: size,
          color,
          k: d.k,
          draw: (gg, w) => drawTile(gg, sp, pal, color, -w / 2, -w / 2, w),
          floor: y + N * cell,
        });
      }
      const { s, rot, alpha } = dyingScale(e, d.spin);
      const fading = pal.fx.fragments && e > POP_BURST_MS;
      drawTile(g, sp, pal, d.color, d.x + pad, d.y + pad, size, {
        s,
        rot,
        alpha: fading ? alpha * (1 - (e - POP_BURST_MS) / (DYING_MS - POP_BURST_MS)) : alpha,
      });
      if (pal.fx.popFlash && e >= 70 && e < POP_BURST_MS + 40) {
        const q = (e - 70) / (POP_BURST_MS + 40 - 70);
        g.save();
        g.globalAlpha = 0.9 * (1 - q * 0.6);
        g.fillStyle = "#ffffff";
        g.beginPath();
        g.roundRect(d.x + pad + size * 0.06, d.y + pad + size * 0.06, size * 0.88 * s, size * 0.88 * s, size * 0.18);
        g.fill();
        g.restore();
      }
    }
    this.dying = this.dying.filter((d) => t - d.t0 < DYING_MS);

    this.effects.renderWorld(g);
    this.effects.renderWash(g, x, y, N * cell, N * cell);
    this.effects.renderFlash(g, x, y, N * cell, N * cell);

    // Panel
    const p = this.panel;
    const inp = this.ctx.input;
    for (const b of this.buttons) {
      const hover = inp.inCentered(b.cx, b.cy, b.w, b.h);
      const pressed = hover && inp.down;
      b.scale = this.feel.scale(`lab:${b.id}`, hover, pressed);
      drawPillButton(g, pal.ui, b, hover, pressed, pal.font);
    }
    const rowH =
      this.buttons.length > 2 ? this.buttons.find((b) => b.id === `+${ROWS[1].key}`)!.cy - this.buttons.find((b) => b.id === `+${ROWS[0].key}`)!.cy : 24;
    ROWS.forEach((r, i) => {
      const cy = this.rowsY + rowH * i + rowH / 2;
      const val = TUNING[r.key];
      const changed = val !== DEFAULT_TUNING[r.key];
      drawText(g, r.label, p.x, cy, { size: 12, color: pal.hudMuted, weight: 500, font: pal.font, align: "left" });
      drawText(g, String(Math.round(val * 100) / 100), p.x + p.w - rowH * 2 - 20, cy, {
        size: 12,
        color: changed ? pal.overlayAccent : pal.hudText,
        weight: 700,
        font: pal.font,
        align: "right",
        tabular: true,
      });
    });
    const info = `chain ${this.chain}  ·  ${THEME_LABELS[pal.name]}  ·  keys: P pop, O pop×4, X mix, C clear, L lose, [ ] chain, Esc back`;
    drawText(g, info, x, y + N * cell + 18, { size: 11, color: pal.hudMuted, weight: 500, font: pal.font, align: "left" });
    this.renderMs += (performance.now() - renderStart - this.renderMs) * 0.1;
    const perf = `frame ${this.effects.frameMs.toFixed(1)} ms  ·  render ${this.renderMs.toFixed(2)} ms  ·  ${this.effects.particles.count} particles, ${this.effects.fragments.count} fragments${this.effects.lowPower ? "  ·  LOW POWER" : ""}`;
    drawText(g, perf, x, y + N * cell + 34, {
      size: 11,
      color: this.effects.lowPower ? pal.overlayAccent : pal.hudMuted,
      weight: 500,
      font: pal.font,
      align: "left",
      tabular: true,
    });
    if (t - this.statusT0 < 1600) {
      const w = Math.min(v.w - 32, 360);
      drawCard(g, pal.ui, v.w / 2 - w / 2, 8, w, 30, 12);
      drawText(g, this.status, v.w / 2, 23, { size: 13, color: pal.overlayText, weight: 600, font: pal.font });
    }
    this.effects.renderVignette(g);
    g.restore();
  }
}
