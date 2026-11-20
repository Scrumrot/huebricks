/**
 * The message cards every scene shows over the action (paused, game over,
 * level clear, how to play): a dimmed screen, a card that rises from below
 * with an overshoot, a title, body lines and a row of pill buttons. Scenes
 * pick the geometry and the words; the look is shared here.
 */
import type { ButtonFeel } from "./buttonFeel";
import { drawCard, drawPillButton, drawText, type PillButton } from "./draw";
import { backOut, clamp01 } from "./easing";
import type { InputState } from "./input";
import type { Palette } from "./theme";
import { fillScreen } from "./view";

/** How long a card takes to slide in. */
export const CARD_MS = 420;
const CARD_EASE = backOut(1.2);
/** How long the screen behind a card takes to dim. */
const DIM_MS = 200;

/**
 * How far below its rest position a card sits `e` ms after it was opened:
 * the whole view height before it opens, then an eased rise with a little
 * overshoot. `ms` stretches the slide (the game scene slows it with its
 * animation rate).
 */
export function cardOffset(e: number, viewH: number, ms = CARD_MS): number {
  if (e < 0) return viewH;
  return (1 - CARD_EASE(clamp01(e / ms))) * viewH * 0.6;
}

/** Dim the screen behind a card, fading in over the first moments. */
export function dimBehindCard(g: CanvasRenderingContext2D, pal: Palette, e: number, ms = DIM_MS): void {
  g.globalAlpha = clamp01(e / ms);
  fillScreen(g, pal.ui.dim);
  g.globalAlpha = 1;
}

export interface MessageCard {
  title: string;
  lines: string[];
  /** A line in the accent colour under the body (a new best, say). */
  accent?: string;
  /** Small print along the bottom edge (key hints). */
  footer?: string;
  x: number;
  /** Where the card rests; the slide-in offset is added here. */
  y: number;
  w: number;
  h: number;
}

/** The card, its words and nothing else; buttons go through `drawCardButtons`. */
export function drawMessageCard(g: CanvasRenderingContext2D, pal: Palette, card: MessageCard, off: number): void {
  const cx = card.x + card.w / 2;
  const y = card.y + off;
  drawCard(g, pal.ui, card.x, y, card.w, card.h, 20);
  drawText(g, card.title, cx, y + 46, { size: 30, color: pal.overlayText, weight: 600, font: pal.display });
  card.lines.forEach((line, i) => drawText(g, line, cx, y + 90 + i * 24, { size: 16, color: pal.hudMuted, weight: 500, tabular: true }));
  if (card.accent) drawText(g, card.accent, cx, y + 90 + card.lines.length * 24, { size: 16, color: pal.overlayAccent, weight: 700 });
  if (card.footer) drawText(g, card.footer, cx, y + card.h - 18, { size: 11, color: pal.hudMuted, weight: 500 });
}

/**
 * Pill buttons riding on a sliding card: each is hit and drawn where it
 * sits this frame, and squashes under the pointer through the shared feel.
 * `prefix` keeps the feel ids apart between cards.
 */
export function drawCardButtons(
  g: CanvasRenderingContext2D,
  pal: Palette,
  inp: InputState,
  feel: ButtonFeel,
  buttons: PillButton[],
  off: number,
  prefix = "overlay",
): void {
  for (const b of buttons) {
    b.cy += off;
    const hover = inp.inCentered(b.cx, b.cy, b.w, b.h) && inp.x >= 0;
    const pressed = hover && inp.down;
    b.scale = feel.scale(`${prefix}:${b.id}`, hover, pressed);
    drawPillButton(g, pal.ui, b, hover, pressed, pal.font);
  }
}

/** The button under the pointer, with the buttons shifted by the slide-in offset. */
export function cardButtonAt(inp: InputState, buttons: PillButton[], off: number): PillButton | undefined {
  return buttons.find((b) => inp.inCentered(b.cx, b.cy + off, b.w, b.h));
}
