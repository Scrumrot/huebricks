import { describe, expect, it } from "vitest";
import { computeLayout } from "../core/layout";
import { CONTROL_MAX, hudControls, hudRail } from "./hudLayout";

const SPACING = { top: 8, gap: 14, bottom: 14 };
const landscape = computeLayout(7, SPACING, { w: 1067, h: 507, portrait: false });
const portrait = computeLayout(7, SPACING, { w: 390, h: 844, portrait: true });

const overlaps = (a: { cx: number; cy: number; w: number; h: number }, b: { cx: number; cy: number; w: number; h: number }) =>
  Math.abs(a.cx - b.cx) < (a.w + b.w) / 2 && Math.abs(a.cy - b.cy) < (a.h + b.h) / 2;

describe("modern HUD geometry", () => {
  it("keeps the readouts left of the board and the controls right of it sideways", () => {
    const r = hudRail(landscape);
    const c = hudControls(landscape);
    expect(r.scoreCx).toBeLessThan(landscape.boardX);
    expect(r.ring.cx + r.ring.r).toBeLessThan(landscape.boardX);
    for (const b of c.buttons) expect(b.cx - b.w / 2).toBeGreaterThan(landscape.boardX + landscape.boardW);
    expect(c.rotatePill.x).toBeGreaterThan(landscape.boardX + landscape.boardW);
  });

  it("gives portrait a 64 px control bar under the tray with nothing overlapping", () => {
    const c = hudControls(portrait);
    const bar = c.buttons.filter((b) => b.kind !== "pause" && b.kind !== "sound");
    for (const b of bar) {
      expect(b.h).toBe(CONTROL_MAX);
      expect(b.cy - b.h / 2).toBeGreaterThan(portrait.hudBottomY);
      expect(b.cy + b.h / 2).toBeLessThan(portrait.vp.h);
    }
    for (let i = 0; i < c.buttons.length; i++) for (let j = i + 1; j < c.buttons.length; j++) expect(overlaps(c.buttons[i], c.buttons[j])).toBe(false);
    const r = hudRail(portrait);
    expect(r.ring.cy + r.ring.r).toBeLessThan(portrait.stackY);
    expect(c.labels.map((l) => l.text)).toEqual(["ROTATE", "HURRY"]);
  });

  it("puts the board low on an upright phone", () => {
    expect(portrait.hudTopY).toBeGreaterThan((portrait.vp.h - portrait.hudTop - portrait.hudBottom - portrait.boardH) / 2);
  });

  it("mirrors everything about the centre line for left-handed play", () => {
    for (const l of [landscape, portrait]) {
      const w = l.vp.w;
      const r = hudRail(l);
      const m = hudRail(l, true);
      expect(m.scoreCx).toBeCloseTo(w - r.scoreCx);
      expect(m.ring.cx).toBeCloseTo(w - r.ring.cx);
      expect(m.cx).toBeCloseTo(w - r.cx);
      expect(m.side).toBe(-1);
      expect(m.goalAlign).toBe(r.goalAlign === "left" ? "right" : r.goalAlign === "right" ? "left" : r.goalAlign);
      const c = hudControls(l);
      const mc = hudControls(l, true);
      c.buttons.forEach((b, i) => {
        expect(mc.buttons[i].kind).toBe(b.kind);
        expect(mc.buttons[i].cy).toBe(b.cy);
        if (b.kind !== "ccw" && b.kind !== "cw") expect(mc.buttons[i].cx).toBeCloseTo(w - b.cx);
      });
      // turn-left keeps the left half of the pill whichever side it is on
      const at = (cs: typeof c, k: string) => cs.buttons.find((b) => b.kind === k)!.cx;
      expect(at(c, "ccw")).toBeLessThan(at(c, "cw"));
      expect(at(mc, "ccw")).toBeLessThan(at(mc, "cw"));
      expect(mc.rotatePill.x).toBeCloseTo(w - c.rotatePill.x - c.rotatePill.w);
    }
  });
});
