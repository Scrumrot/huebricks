/**
 * The 3:2 picture slides (the tutorial's intro and outro, the pause card's
 * how-to-play page): one frame of a sprite as large as fits, with back and
 * next corners that take a tap, the arrow keys or Enter.
 */
import type { Sprite, SpriteMap } from "./assets";
import type { ButtonFeel } from "./buttonFeel";
import { drawSprite } from "./draw";
import type { InputState } from "./input";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where the slides sit: as large as fits, centred. */
export function slideRect(view: { w: number; h: number }): Rect {
  const w = Math.min(view.w, view.h * 1.5);
  const h = w / 1.5;
  return { x: (view.w - w) / 2, y: (view.h - h) / 2, w, h };
}

/** What this step's input asks of the slides, if anything. */
export function slideNav(inp: InputState, r: Rect): "next" | "back" | null {
  const next = inp.keysPressed.has("ArrowRight") || inp.keysPressed.has("Enter") || (inp.pressed && inp.x > r.x + r.w - r.h / 5 && inp.y > r.y + r.h * 0.8);
  if (next) return "next";
  const back = inp.keysPressed.has("ArrowLeft") || (inp.pressed && inp.x < r.x + r.h * 0.2 && inp.y > r.y + r.h * 0.8);
  return back ? "back" : null;
}

/** One slide with its corners; `backOnFirst` shows the back button on the first slide too (where it closes the slides). */
export function drawSlides(
  g: CanvasRenderingContext2D,
  sprites: SpriteMap,
  inp: InputState,
  feel: ButtonFeel,
  r: Rect,
  slides: Sprite,
  index: number,
  backOnFirst: boolean,
): void {
  const { x, y, w, h } = r;
  drawSprite(g, slides, index, x, y, w, h);
  const size = h * 0.2;
  if (index > 0 || backOnFirst) {
    const hover = inp.inRect(x, y + h * 0.8, size, size);
    const sc = feel.scale("slide:back", hover, hover && inp.down);
    drawSprite(g, sprites.back_button_sprite, 0, x + size / 2 - (size * sc) / 2, y + h * 0.9 - (size * sc) / 2, size * sc, size * sc);
  }
  const hover = inp.inRect(x + w - size, y + h * 0.8, size, size);
  const sc = feel.scale("slide:next", hover, hover && inp.down);
  drawSprite(g, sprites.back_button_sprite, 2, x + w - size / 2 - (size * sc) / 2, y + h * 0.9 - (size * sc) / 2, size * sc, size * sc);
}
