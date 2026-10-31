import { describe, expect, it } from "vitest";
import { BACKDROPS, FURNITURE } from "./backdrops";
import { nextTheme, PALETTES, THEME_LABELS, THEME_ORDER, type ThemeName } from "./theme";

describe("theme registry", () => {
  it("lists every palette once in the cycle, with a label", () => {
    const names = Object.keys(PALETTES) as ThemeName[];
    expect([...THEME_ORDER].sort()).toEqual([...names].sort());
    expect(new Set(THEME_ORDER).size).toBe(THEME_ORDER.length);
    for (const n of names) {
      expect(PALETTES[n].name).toBe(n);
      expect(THEME_LABELS[n]).toBeTruthy();
    }
  });

  it("cycles through every theme and back", () => {
    let t: ThemeName = THEME_ORDER[0];
    const seen = new Set<ThemeName>();
    for (let i = 0; i < THEME_ORDER.length; i++) {
      seen.add(t);
      t = nextTheme(t);
    }
    expect(seen.size).toBe(THEME_ORDER.length);
    expect(t).toBe(THEME_ORDER[0]);
  });

  it("every generated theme has a backdrop, and well-timer themes have tray furniture", () => {
    for (const p of Object.values(PALETTES)) {
      if (p.kind === "classic") continue;
      expect(p.backdrop).not.toBe("sprites");
      expect(BACKDROPS[p.backdrop as keyof typeof BACKDROPS]).toBeTypeOf("function");
      if (p.timer === "wells") expect(FURNITURE[p.backdrop as keyof typeof FURNITURE]).toBeDefined();
    }
  });

  it("only stained glass fuses settled neighbours, and classic keeps every treatment off", () => {
    expect(
      Object.values(PALETTES)
        .filter((p) => p.fuse)
        .map((p) => p.name),
    ).toEqual(["stainedglass", "circuit"]);
    expect(PALETTES.classic.fx.signature).toBe("none");
    expect(PALETTES.classic.fx.mix).toBe("wipe");
    expect(PALETTES.origami.fx.mix).toBe("fold");
    expect(PALETTES.lantern.fx.signature).toBe("float");
    expect(PALETTES.knit.fx.mix).toBe("curtain");
    expect(PALETTES.seaglass.stainColor).toBeTruthy();
    expect(PALETTES.circuit.fuse).toBe(true);
  });
});
