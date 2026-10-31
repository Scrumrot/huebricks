import { describe, expect, it } from "vitest";
import { ditherCells } from "./mixFx";
import { Particles } from "./particles";

describe("dither mix", () => {
  const count = (cells: boolean[][]) => cells.flat().filter(Boolean).length;

  it("turns cells on in Bayer order, monotonically, until every cell shows", () => {
    expect(count(ditherCells(0, 8))).toBe(0);
    const half = count(ditherCells(0.5, 8));
    expect(half).toBe(32);
    for (let q = 0; q <= 1; q += 0.1) expect(count(ditherCells(q + 0.1, 8))).toBeGreaterThanOrEqual(count(ditherCells(q, 8)));
    expect(count(ditherCells(1.01, 8))).toBe(64);
    // neighbours never both light first: the first cell lit is alone in its 2x2
    const first = ditherCells(0.04, 4);
    expect(count(first)).toBe(1);
    expect(first[0][0]).toBe(true);
  });
});

describe("pixel particles", () => {
  it("draw squares on the snap grid in two sizes", () => {
    const p = new Particles(4);
    p.snap = 8;
    p.spawn(13, 21, 1, ["#fff"], { speed: [0, 0], size: [20, 20], life: [500, 500], gravity: 0 });
    const rects: number[][] = [];
    const g = { save() {}, restore() {}, fillRect: (...a: number[]) => rects.push(a), set globalAlpha(_v: number) {}, set fillStyle(_v: unknown) {} };
    p.render(g as unknown as CanvasRenderingContext2D);
    expect(rects).toHaveLength(1);
    const [x, y, w, h] = rects[0];
    expect(w).toBe(8);
    expect(h).toBe(8);
    expect((x + w / 2) % 8).toBe(0);
    expect((y + h / 2) % 8).toBe(0);
  });
});
