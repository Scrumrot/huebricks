import { describe, expect, it } from "vitest";
import { BLUE, PURPLE, RED } from "../../core/color";
import { START_MS } from "../../core/swap";
import type { Cell, Well } from "../../core/well";
import type { BubbleGrid } from "../../core/bobble";
import { internals, makeHarness } from "../../test/harness";
import { TitleScene } from "../TitleScene";
import type { ArcadeState, Control } from "./ArcadeScene";
import { createArcadeScene } from "./index";

/**
 * State-machine and input tests for the arcade modes, driven through the
 * public `update()` with scripted input. These are the regressions found in
 * review; each one failed before its fix.
 */

interface Exposed {
  state: ArcadeState;
  controls: Control[];
  press: unknown;
  piece: { x: number; y: number } | null;
  phase: "fall" | "resolve";
  grid: BubbleGrid;
  shot: unknown;
  loaded: number;
  aim: number;
  launcher(): { x: number; y: number };
  L: { x: number; y: number; w: number; h: number; cell: number };
  well: Well;
  timeMs: number;
  popped: number;
  level: number;
  selected: Cell | null;
}

function startPlaying(mode: "trist" | "drhue" | "bobble" | "swap") {
  const h = makeHarness();
  const scene = createArcadeScene(h.ctx, mode);
  scene.enter?.();
  const s = internals<Exposed>(scene);
  h.input.tap("Enter");
  h.step(scene);
  expect(s.state).toBe("play");
  return { h, scene, s };
}

describe("how-to-play card", () => {
  it("starts on Enter but not on the global theme or mute keys", () => {
    const h = makeHarness();
    const scene = createArcadeScene(h.ctx, "trist");
    scene.enter?.();
    const s = internals<Exposed>(scene);
    expect(s.state).toBe("intro");
    h.input.tap("t");
    h.step(scene);
    expect(s.state).toBe("intro");
    h.input.tap("m");
    h.step(scene);
    expect(s.state).toBe("intro");
    h.input.tap("Enter");
    h.step(scene);
    expect(s.state).toBe("play");
  });

  it("backs out to the arcade grid on Escape", () => {
    const h = makeHarness();
    const scene = createArcadeScene(h.ctx, "drhue");
    scene.enter?.();
    h.input.tap("Escape");
    h.step(scene);
    expect(h.next).toBeInstanceOf(TitleScene);
  });
});

describe("on-screen controls", () => {
  it("moves one cell per tap after a long hold that ended during the resolve phase", () => {
    const { h, scene, s } = startPlaying("trist");
    const right = s.controls.find((c) => c.id === "right")!;
    const startX = s.piece!.x;
    // hold the button for ten steps while the brick falls
    h.input.press(right.cx, right.cy);
    h.step(scene);
    h.step(scene, 8);
    expect(s.piece!.x).toBeGreaterThan(startX);
    // hard drop while still holding, then let go during the resolve phase
    h.input.tap(" ");
    h.step(scene);
    expect(s.phase).toBe("resolve");
    h.input.release();
    h.step(scene);
    // wait for the next brick
    h.step(scene, 4);
    expect(s.phase).toBe("fall");
    const spawnX = s.piece!.x;
    // one tap moves exactly one cell
    h.input.press(right.cx, right.cy);
    h.step(scene);
    h.input.release();
    h.step(scene);
    expect(s.piece!.x).toBe(spawnX + 1);
  });
});

describe("well presses across state changes", () => {
  it("does not fire a shot from a press that began before a pause", () => {
    const { h, scene, s } = startPlaying("bobble");
    const l = s.launcher();
    h.input.press(l.x, l.y - s.L.cell * 3);
    h.step(scene);
    expect(s.press).not.toBeNull();
    h.input.tap("p");
    h.step(scene);
    expect(s.state).toBe("menu");
    h.input.tap("p");
    h.step(scene);
    expect(s.state).toBe("play");
    h.step(scene, 2);
    h.input.release();
    h.step(scene);
    expect(s.shot).toBeNull();
  });
});

describe("Hue Bobble", () => {
  it("loses when a shot sticks past the lose line instead of vanishing", () => {
    const { h, scene, s } = startPlaying("bobble");
    for (const b of s.grid.bubbles()) s.grid.remove(b);
    // an anchored column down to the last row, alternating so nothing pops
    for (let row = 0; row <= 10; row++) s.grid.add(row, 3, row % 2 ? BLUE : RED);
    s.loaded = RED;
    s.aim = 0;
    h.input.tap(" ");
    h.step(scene);
    expect(s.shot).not.toBeNull();
    h.step(scene, 60);
    expect(s.shot).toBeNull();
    expect(s.grid.bottomRow()).toBe(11);
    expect(s.state).toBe("lost");
    expect(h.ctx.save.arcadeBest.bobble).toBeUndefined(); // no points, nothing recorded
  });

  it("clears the cluster to win and carries the level over", () => {
    const { h, scene, s } = startPlaying("bobble");
    for (const b of s.grid.bubbles()) s.grid.remove(b);
    s.grid.add(0, 3, RED);
    s.grid.add(0, 4, RED);
    s.loaded = RED;
    s.aim = 0;
    h.input.tap(" ");
    h.step(scene, 80);
    expect(s.state).toBe("won");
    h.input.tap("Enter");
    h.step(scene, 10);
    expect(s.state).toBe("play");
    expect(internals<{ level: number }>(scene).level).toBe(2);
  });
});

describe("Hue Swap", () => {
  /** Red and blue in a checkerboard: no group of four anywhere, and every neighbour pair can mix. */
  const checker = (s: Exposed) => {
    for (const c of s.well.cells()) {
      c.color = (c.x + c.y) % 2 ? BLUE : RED;
      c.refined = false;
    }
  };
  const at = (s: Exposed, x: number, y: number) => ({ x: s.L.x + (x + 0.5) * s.L.cell, y: s.L.y + (y + 0.5) * s.L.cell });
  const tap = (h: ReturnType<typeof startPlaying>["h"], scene: ReturnType<typeof startPlaying>["scene"], s: Exposed, x: number, y: number) => {
    const p = at(s, x, y);
    h.input.press(p.x, p.y);
    h.step(scene);
    h.input.release();
    h.step(scene);
  };

  it("pours the picked tile into a neighbour it can mix with, then refills the gap", () => {
    const { h, scene, s } = startPlaying("swap");
    checker(s);
    const a = s.well.get(0, 7)!;
    const b = s.well.get(1, 7)!;
    tap(h, scene, s, 0, 7);
    expect(s.selected).toBe(a);
    tap(h, scene, s, 1, 7);
    expect(s.selected).toBeNull();
    expect(b.color).toBe(PURPLE);
    expect(s.well.get(0, 7)).toBeNull();
    h.step(scene, 40);
    expect(s.well.get(0, 7)).not.toBeNull();
    expect(s.well.count()).toBe(56);
  });

  it("trades places when the two cannot mix", () => {
    const { h, scene, s } = startPlaying("swap");
    checker(s);
    const a = s.well.get(0, 7)!;
    const b = s.well.get(1, 7)!;
    a.color = b.color;
    tap(h, scene, s, 0, 7);
    tap(h, scene, s, 1, 7);
    expect(s.well.get(0, 7)).toBe(b);
    expect(s.well.get(1, 7)).toBe(a);
  });

  it("tapping a tile that is not a neighbour picks it instead", () => {
    const { h, scene, s } = startPlaying("swap");
    checker(s);
    tap(h, scene, s, 0, 7);
    tap(h, scene, s, 3, 3);
    expect(s.selected).toBe(s.well.get(3, 3));
    expect(s.well.count()).toBe(56);
    tap(h, scene, s, 3, 3);
    expect(s.selected).toBeNull();
  });

  it("a drag towards a neighbour acts once per press", () => {
    const { h, scene, s } = startPlaying("swap");
    checker(s);
    const b = s.well.get(1, 7)!;
    const p = at(s, 0, 7);
    h.input.press(p.x, p.y);
    h.step(scene);
    h.input.moveTo(p.x + s.L.cell, p.y);
    h.step(scene);
    expect(b.color).toBe(PURPLE);
    const c = s.well.get(2, 7)!;
    const was = c.color;
    h.input.moveTo(p.x + s.L.cell * 2, p.y);
    h.step(scene, 2);
    h.input.release();
    h.step(scene);
    expect(c.color).toBe(was);
    expect(s.selected).toBeNull();
  });

  it("the clock drains while thinking, not while the board resolves, and runs out into a loss", () => {
    const { h, scene, s } = startPlaying("swap");
    checker(s);
    expect(s.timeMs).toBe(START_MS);
    h.step(scene, 30);
    expect(s.timeMs).toBeLessThan(START_MS);
    const a = s.well.get(0, 7)!;
    a.color = s.well.get(1, 7)!.color;
    tap(h, scene, s, 0, 7);
    tap(h, scene, s, 1, 7);
    const before = s.timeMs;
    h.step(scene, 2);
    expect(s.timeMs).toBe(before);
    s.timeMs = 50;
    h.step(scene, 40);
    expect(s.state).toBe("lost");
  });

  it("a pop puts time back on the clock and pops count up the level", () => {
    const { h, scene, s } = startPlaying("swap");
    checker(s);
    s.timeMs = 10_000;
    s.popped = 39;
    // three reds waiting at the bottom-left; the swap at the far right completes nothing itself
    s.well.get(0, 7)!.color = RED;
    s.well.get(2, 7)!.color = RED;
    s.well.get(6, 0)!.color = s.well.get(6, 1)!.color;
    tap(h, scene, s, 6, 0);
    tap(h, scene, s, 6, 1);
    h.step(scene, 12);
    expect(s.timeMs).toBeGreaterThan(10_000);
    expect(s.popped).toBeGreaterThanOrEqual(43);
    expect(s.level).toBe(2);
  });
});
