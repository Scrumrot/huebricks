import { describe, expect, it } from "vitest";
import { internals, makeHarness } from "../test/harness";
import { GameScene } from "../scenes/GameScene";
import { COALESCE_MS, shouldCoalesce } from "./audio";

describe("audio mixer rules", () => {
  it("collapses repeats of one sample inside the coalesce window", () => {
    expect(shouldCoalesce(undefined, 100)).toBe(false);
    expect(shouldCoalesce(100, 100 + COALESCE_MS - 1)).toBe(true);
    expect(shouldCoalesce(100, 100 + COALESCE_MS)).toBe(false);
    expect(shouldCoalesce(100, 100 + 5, 2)).toBe(false);
  });

  it("the game dulls the music behind the pause card and opens it again on resume", () => {
    const h = makeHarness({ theme: "pigment" });
    const scene = new GameScene(h.ctx);
    scene.enter?.();
    const s = internals<{ state: string; menuPage: string }>(scene);
    h.step(scene);
    expect(h.audio.paused).toBe(false);
    s.state = "menu";
    s.menuPage = "main";
    h.step(scene);
    expect(h.audio.paused).toBe(true);
    s.state = "rest";
    h.step(scene);
    expect(h.audio.paused).toBe(false);
  });
});
