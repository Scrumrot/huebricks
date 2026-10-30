import { describe, expect, it } from "vitest";
import { popScale, resetTuning, setReducedMotion, TUNING } from "../engine/fxTuning";
import type { PillButton } from "../engine/draw";
import type { Swatch } from "../engine/themePicker";
import { internals, makeHarness, type Harness } from "../test/harness";
import { GameScene } from "./GameScene";
import type { Scene } from "./Scene";
import { TitleScene } from "./TitleScene";

/** Press and release at a point, one step each, the way a tap arrives. */
function tap(h: Harness, scene: Scene, x: number, y: number): void {
  h.input.press(x, y);
  h.step(scene);
  h.input.release();
  h.step(scene);
}

interface TitleInternals {
  menu: string;
  pills: PillButton[];
  themeSwatches: Swatch[];
  themeToggle: { cx: number; cy: number };
}

describe("title screen", () => {
  it("has Play and Continue pills on a generated theme and none on Classic", () => {
    const h = makeHarness({ theme: "pigment" });
    const t = internals<TitleInternals>(new TitleScene(h.ctx));
    expect(t.pills.map((p) => p.id)).toEqual(["play", "continue"]);
    const c = makeHarness({ theme: "classic" });
    expect(internals<TitleInternals>(new TitleScene(c.ctx)).pills).toHaveLength(0);
  });

  it("Play opens the mode menu; Continue launches Normal at the furthest world", () => {
    const h = makeHarness({ theme: "pigment", save: { worldProgress: 3 } });
    const scene = new TitleScene(h.ctx);
    scene.enter?.();
    const t = internals<TitleInternals>(scene);
    const play = t.pills.find((p) => p.id === "play")!;
    tap(h, scene, play.cx, play.cy);
    expect(t.menu).toBe("mode");
    h.input.tap("Escape");
    h.step(scene);
    expect(t.menu).toBe("main");
    const cont = t.pills.find((p) => p.id === "continue")!;
    tap(h, scene, cont.cx, cont.cy);
    expect(t.menu).toBe("launch");
    h.step(scene, 8);
    expect(h.next).toBeInstanceOf(GameScene);
    expect(h.ctx.session.gameType).toBe("normal");
    expect(h.ctx.session.world).toBe(3);
  });

  it("the theme pill opens a picker and a swatch switches the theme without closing it", () => {
    const h = makeHarness({ theme: "pigment" });
    const scene = new TitleScene(h.ctx);
    scene.enter?.();
    const t = internals<TitleInternals>(scene);
    tap(h, scene, t.themeToggle.cx, t.themeToggle.cy);
    expect(t.menu).toBe("themes");
    const sw = t.themeSwatches.find((s) => s.name === "crystals")!;
    tap(h, scene, sw.x + sw.w / 2, sw.y + sw.h / 2);
    expect(h.ctx.palette.name).toBe("crystals");
    expect(t.menu).toBe("themes");
    h.input.tap("Escape");
    h.step(scene);
    expect(t.menu).toBe("main");
  });

  it("on Classic the theme pill still cycles", () => {
    const h = makeHarness({ theme: "classic" });
    const scene = new TitleScene(h.ctx);
    scene.enter?.();
    const t = internals<TitleInternals>(scene);
    tap(h, scene, t.themeToggle.cx, t.themeToggle.cy);
    expect(t.menu).toBe("main");
    expect(h.ctx.palette.name).not.toBe("classic");
  });
});

interface GameInternals {
  state: string;
  confirmQuit: boolean;
  keyboardUsed: boolean;
  menuPage: string;
  pauseLayout(off?: number): { resume: PillButton; restart: PillButton; quit: PillButton; keep: PillButton };
}

function startGame(score = 0): { h: Harness; scene: GameScene; g: GameInternals } {
  const h = makeHarness({ theme: "pigment" });
  h.ctx.session.score = score;
  const scene = new GameScene(h.ctx);
  scene.enter?.();
  const g = internals<GameInternals>(scene);
  h.step(scene, 90);
  expect(g.state).toBe("rest");
  return { h, scene, g };
}

describe("pause card", () => {
  it("Esc pauses, Esc again resumes, and a key marks the keyboard as used", () => {
    const { h, scene, g } = startGame();
    expect(g.keyboardUsed).toBe(false);
    h.input.tap("Escape");
    h.step(scene);
    expect(g.state).toBe("menu");
    expect(g.keyboardUsed).toBe(true);
    h.input.tap("Escape");
    h.step(scene);
    expect(g.state).toBe("rest");
    expect(h.next).toBeNull();
  });

  it("Quit asks once, then quits; Keep playing cancels", () => {
    const { h, scene, g } = startGame();
    h.input.tap("Escape");
    h.step(scene, 25);
    let L = g.pauseLayout();
    tap(h, scene, L.quit.cx, L.quit.cy);
    expect(g.confirmQuit).toBe(true);
    expect(h.next).toBeNull();
    L = g.pauseLayout();
    tap(h, scene, L.keep.cx, L.keep.cy);
    expect(g.confirmQuit).toBe(false);
    L = g.pauseLayout();
    tap(h, scene, L.quit.cx, L.quit.cy);
    tap(h, scene, L.quit.cx, L.quit.cy);
    expect(h.next).toBeInstanceOf(TitleScene);
  });

  it("Restart level starts over with the score the level began with", () => {
    const { h, scene, g } = startGame(1200);
    h.ctx.session.score = 1750;
    h.input.tap("Escape");
    h.step(scene, 25);
    const L = g.pauseLayout();
    tap(h, scene, L.restart.cx, L.restart.cy);
    expect(h.next).toBeInstanceOf(GameScene);
    expect(h.ctx.session.score).toBe(1200);
  });
});

describe("reduce motion", () => {
  it("halves shake, hit-stop and debris, skips slow motion, and survives a tuning reset", () => {
    resetTuning();
    const full = popScale(1);
    setReducedMotion(true);
    const less = popScale(1);
    expect(less.shake).toBeCloseTo(full.shake / 2);
    expect(less.freezeMs).toBeCloseTo(full.freezeMs / 2);
    expect(less.debris).toBeLessThan(full.debris);
    expect(full.slowmo).toBe(true);
    expect(less.slowmo).toBe(false);
    resetTuning();
    expect(TUNING.motion).toBe(0.5);
    setReducedMotion(false);
    expect(popScale(1).shake).toBeCloseTo(full.shake);
  });
});
