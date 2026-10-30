import { describe, expect, it } from "vitest";
import { BLUE, RED } from "../../core/color";
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
}

function startPlaying(mode: "trist" | "drhue" | "bobble") {
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
