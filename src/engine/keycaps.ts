import { drawText, fillRoundRect, measureText } from "./draw";
import type { Palette } from "./theme";

/** A keyboard hint: the key as a cap, then what it does. */
export interface Keycap {
  key: string;
  label: string;
}

/**
 * A row of keycap hints centred on `cx`. Keys that share a label (Q and E
 * for rotate) are written as one entry with the keys separated by spaces.
 */
export function drawKeycaps(g: CanvasRenderingContext2D, pal: Palette, caps: Keycap[], cx: number, y: number, size = 11): void {
  const capH = size + 8;
  const padX = 6;
  const gapKey = 3;
  const gapLabel = 5;
  const gapGroup = 14;
  const keyStyle = { size, weight: 700, color: pal.overlayText };
  const labelStyle = { size, weight: 500, color: pal.hudMuted };
  const groups = caps.map((c) => {
    const keys = c.key.split(" ").map((k) => ({ k, w: measureText(g, k, keyStyle) + padX * 2 }));
    const keysW = keys.reduce((n, k) => n + k.w, 0) + gapKey * (keys.length - 1);
    const labelW = measureText(g, c.label, labelStyle);
    return { keys, label: c.label, labelW, w: keysW + gapLabel + labelW };
  });
  const total = groups.reduce((n, gr) => n + gr.w, 0) + gapGroup * (groups.length - 1);
  let x = cx - total / 2;
  for (const gr of groups) {
    for (const k of gr.keys) {
      fillRoundRect(g, x, y - capH / 2, k.w, capH, 4, pal.ui.secondary, pal.ui.secondaryEdge, 1);
      drawText(g, k.k, x + k.w / 2, y + 1, keyStyle);
      x += k.w + gapKey;
    }
    x += gapLabel - gapKey;
    drawText(g, gr.label, x, y + 1, { ...labelStyle, align: "left" });
    x += gr.labelW + gapGroup;
  }
}
