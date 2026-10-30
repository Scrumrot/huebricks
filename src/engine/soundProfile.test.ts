import { describe, expect, it } from "vitest";
import { internals, makeHarness } from "../test/harness";
import { GameScene } from "../scenes/GameScene";
import { MATERIALS, SAMPLE_FOR, SOUND_EVENTS } from "./soundProfile";
import { PALETTES } from "./theme";

describe("sound profiles", () => {
  it("every modern theme synthesises on a material and Classic keeps the recordings", () => {
    for (const p of Object.values(PALETTES)) {
      if (p.kind === "classic") expect(p.sound).toBeNull();
      else expect(Object.values(MATERIALS)).toContain(p.sound);
    }
  });

  it("maps every event to a recording or a deliberate silence for Classic", () => {
    for (const ev of SOUND_EVENTS) expect(ev in SAMPLE_FOR, ev).toBe(true);
    expect(SAMPLE_FOR.pop).toBe("BlocksPopping_snd");
    expect(SAMPLE_FOR.toast).toBeNull();
  });

  it("the game asks for events, not samples: the pause card and the pop carry their detail", () => {
    const h = makeHarness({ theme: "pigment" });
    const scene = new GameScene(h.ctx);
    scene.enter?.();
    const s = internals<{
      state: string;
      activateButton(kind: string): void;
      popImpact(p: { k: number; mult: number; semitones: number; color: number; dir: [number, number] }): void;
    }>(scene);
    h.step(scene);
    s.state = "rest";
    s.activateButton("pause");
    expect(h.audio.events.map((e) => e.name)).toContain("cardIn");
    s.popImpact({ k: 0.5, mult: 3, semitones: 2, color: 5, dir: [0, 1] });
    const pop = h.audio.events.find((e) => e.name === "pop");
    expect(pop?.opts).toMatchObject({ color: 5, chain: 3 });
    expect(h.audio.played).toHaveLength(0);
  });
});
