import { SCREEN_H, SCREEN_W } from "../core/constants";

/**
 * The logical viewport: how many logical units the canvas spans this frame.
 *
 * The canvas always covers the window. Logical units are chosen so the short
 * side of the screen matches the original 3:2 room: held sideways, the height
 * is 506.67 units like the GameMaker room and the width grows with the aspect
 * ratio; held upright, the width is PORTRAIT_W units so a seven-cell board
 * spans the phone and the height grows instead. Scenes lay themselves out
 * from `view.w` / `view.h` rather than the fixed SCREEN_W / SCREEN_H.
 */
export interface View {
  /** CSS pixels per logical unit. */
  scale: number;
  /** Logical viewport size. */
  w: number;
  h: number;
  /** Taller than wide: scenes switch to their stacked layouts. */
  portrait: boolean;
}

/** Logical width the viewport is normalised to when taller than wide. */
export const PORTRAIT_W = 520;

export const view: View = { scale: 1, w: SCREEN_W, h: SCREEN_H, portrait: false };

/** Everything the canvas shows, in logical units. */
export function screenRect(): { x: number; y: number; w: number; h: number } {
  return { x: 0, y: 0, w: view.w, h: view.h };
}

/**
 * How far down from the top edge the corner chrome reaches on every screen:
 * the title's theme pill and toggles, the board's pause and sound. Backdrop
 * ornaments stay below it so nothing sits under a button.
 */
export const TOP_CHROME = 84;

/**
 * Where a backdrop parks its hero ornament of radius `r`. Held sideways it
 * sits against the right edge, tucked under the corner chrome. Held upright it sits
 * top-centre: on the board (`inPlay`) between the score and the pause
 * button, where the stacked HUD leaves a gap; on the title, under the
 * theme pill that occupies that gap.
 */
export function heroSpot(r: number, inPlay = false): { x: number; y: number } {
  if (view.portrait) return { x: view.w / 2, y: inPlay ? r + 18 : TOP_CHROME + r };
  // hugging the right edge keeps it inside the side rail even on a 4:3 screen, where that rail is narrow
  return { x: view.w - r - 24, y: Math.max(view.h * 0.2, TOP_CHROME + r + 10) };
}

/** Fill the whole visible canvas with `style`. */
export function fillScreen(g: CanvasRenderingContext2D, style: string | CanvasGradient | CanvasPattern): void {
  g.fillStyle = style;
  g.fillRect(0, 0, view.w, view.h);
}

/** Browser fullscreen, where the browser allows it (iPhone Safari does not). */
export interface FullscreenControl {
  readonly supported: boolean;
  readonly active: boolean;
  toggle(): void;
}
