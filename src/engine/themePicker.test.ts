import { describe, expect, it } from "vitest";
import { fitSwatch, gridHeight } from "./themePicker";
import { THEME_ORDER } from "./theme";

describe("theme picker grid", () => {
  it("shrinks the swatches until every theme fits the card", () => {
    const n = THEME_ORDER.length;
    const w = 512;
    const maxH = 507 - 16 - 156;
    const size = fitSwatch(n, w, maxH, 64, 12, 0.62);
    expect(size).toBeLessThan(64);
    expect(gridHeight(n, w, size, 12, size * 0.62)).toBeLessThanOrEqual(maxH);
    // plenty of room keeps the full size
    expect(fitSwatch(n, 592, 900, 64, 12, 0.62)).toBe(64);
  });
});
