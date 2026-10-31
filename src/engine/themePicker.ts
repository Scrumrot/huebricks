import type { Color } from "../core/color";
import { drawText, fillRoundRect, cardRadius, pillRadius } from "./draw";
import { PALETTES, THEME_LABELS, THEME_ORDER, type Palette, type ThemeName } from "./theme";

/**
 * Theme swatches: a card in the theme's own background with one of its
 * bricks on it, used as a strip on the pause card and as a full grid on the
 * title's theme picker. Pure layout plus drawing; the caller owns the hit
 * testing and the theme switch.
 */

export interface Swatch {
  name: ThemeName;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Month tags for the seasonal themes. */
export const THEME_TAGS: Partial<Record<ThemeName, string>> = { halloween: "OCT", christmas: "DEC", winter: "JAN" };

/** A brick colour per theme so the strip reads as a rainbow rather than twelve red squares. */
const SWATCH_COLORS: Color[] = [1, 2, 4, 3, 5, 6];

/** `count` themes from the cycle order with `current` in the middle, wrapping round. */
export function stripThemes(current: ThemeName, count: number): ThemeName[] {
  const n = THEME_ORDER.length;
  const k = Math.min(count, n);
  const i = Math.max(0, THEME_ORDER.indexOf(current));
  const start = i - Math.floor((k - 1) / 2);
  return Array.from({ length: k }, (_, j) => THEME_ORDER[(((start + j) % n) + n) % n]);
}

/** One row of `size` squares centred in `w` from `x`. */
export function layoutStrip(names: readonly ThemeName[], x: number, y: number, w: number, size: number, gap: number): Swatch[] {
  const total = names.length * size + (names.length - 1) * gap;
  const x0 = x + w / 2 - total / 2;
  return names.map((name, i) => ({ name, x: x0 + i * (size + gap), y, w: size, h: size }));
}

/** Rows of squares that wrap inside `w`, centred. */
export function layoutGrid(names: readonly ThemeName[], x: number, y: number, w: number, size: number, gap: number, rowGap = gap): Swatch[] {
  const cols = Math.max(1, Math.floor((w + gap) / (size + gap)));
  const out: Swatch[] = [];
  for (let i = 0; i < names.length; i++) {
    const row = Math.floor(i / cols);
    const inRow = Math.min(cols, names.length - row * cols);
    const rowW = inRow * size + (inRow - 1) * gap;
    const x0 = x + w / 2 - rowW / 2;
    out.push({ name: names[i], x: x0 + (i % cols) * (size + gap), y: y + row * (size + rowGap), w: size, h: size });
  }
  return out;
}

/**
 * The largest swatch size, stepping down from `size`, whose grid of `count`
 * swatches fits in `maxH` when wrapped inside `w`; row gaps are `rowGapK`
 * times the swatch. Pure.
 */
export function fitSwatch(count: number, w: number, maxH: number, size: number, gap: number, rowGapK: number, min = 36): number {
  let s = size;
  while (s > min && gridHeight(count, w, s, gap, s * rowGapK) > maxH) s -= 2;
  return s;
}

export function gridHeight(count: number, w: number, size: number, gap: number, rowGap = gap): number {
  const cols = Math.max(1, Math.floor((w + gap) / (size + gap)));
  const rows = Math.ceil(count / cols);
  return rows * size + (rows - 1) * rowGap;
}

export function swatchAt(swatches: readonly Swatch[], x: number, y: number): Swatch | null {
  return swatches.find((s) => x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) ?? null;
}

/** Draw one swatch; `host` is the palette the surrounding card is drawn in (for the selection ring and label). */
export function drawSwatch(g: CanvasRenderingContext2D, sw: Swatch, host: Palette, current: boolean, hover: boolean, scale = 1, label = true): void {
  const pal = PALETTES[sw.name];
  const w = sw.w * scale;
  const h = sw.h * scale;
  const x = sw.x + sw.w / 2 - w / 2;
  const y = sw.y + sw.h / 2 - h / 2;
  const r = cardRadius(host.ui, w * 0.2);
  const idx = THEME_ORDER.indexOf(sw.name);
  const color = SWATCH_COLORS[((idx % SWATCH_COLORS.length) + SWATCH_COLORS.length) % SWATCH_COLORS.length];
  fillRoundRect(g, x, y + 2, w, h, r, host.ui.cardShadow);
  fillRoundRect(g, x, y, w, h, r, pal.background, current ? host.ui.primary : hover ? host.ui.primaryHover : host.ui.secondaryEdge, current ? 2.5 : 1.5);
  // the brick: a rounded square with a lighter inner face so it reads as a tile at any size
  const tw = w * 0.46;
  const tx = x + w / 2 - tw / 2;
  const ty = y + h / 2 - tw / 2;
  const fill = pal.brickColors[color];
  if (pal.brickShadow) fillRoundRect(g, tx, ty + tw * 0.08, tw, tw, tw * 0.22, pal.brickShadow);
  if (pal.glow) {
    g.save();
    g.shadowColor = fill;
    g.shadowBlur = tw * 0.5;
    fillRoundRect(g, tx, ty, tw, tw, tw * 0.22, fill);
    g.restore();
  } else {
    fillRoundRect(g, tx, ty, tw, tw, tw * 0.22, fill);
  }
  g.save();
  g.globalAlpha = 0.35;
  fillRoundRect(g, tx + tw * 0.22, ty + tw * 0.22, tw * 0.56, tw * 0.56, tw * 0.14, "#ffffff");
  g.restore();
  const tag = THEME_TAGS[sw.name];
  if (tag) {
    const tagW = w * 0.5;
    const tagH = Math.max(10, h * 0.2);
    fillRoundRect(g, x + w - tagW + 4, y - tagH * 0.35, tagW, tagH, pillRadius(host.ui, tagH), host.goalAccent);
    drawText(g, tag, x + w - tagW / 2 + 4, y - tagH * 0.35 + tagH / 2 + 0.5, { size: tagH * 0.68, color: "#ffffff", weight: 800 });
  }
  if (label) {
    drawText(g, THEME_LABELS[sw.name], sw.x + sw.w / 2, sw.y + sw.h + 11, {
      size: Math.max(9, Math.min(12, sw.w * 0.2)),
      color: current ? host.overlayText : host.hudMuted,
      weight: current ? 700 : 500,
    });
  }
}
