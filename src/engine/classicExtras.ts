/**
 * Sprites the classic theme needs that the GameMaker project never had.
 *
 * The original game had no in-game sound toggle, so the classic sound button
 * is composited at start-up from the brushed-metal face of the pause button:
 * the pause bars are painted out and a speaker icon is drawn in their place,
 * in the same flat black as the other button icons.
 */
import { type Sprite, type SpriteMap } from "./assets";
import { speakerIcon } from "./modernSkin";

/**
 * Paint out the pause bars: find the bounding box of the dark icon pixels and
 * refill it row by row, blending from the face pixel just left of the box to
 * the one just right of it, which keeps the brushed sheen roughly continuous.
 */
function inpaintIcon(g: CanvasRenderingContext2D, w: number, h: number): void {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const inset = Math.round(w * 0.16);
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = inset; y < h - inset; y++) {
    for (let x = inset; x < w - inset; x++) {
      const i = (y * w + x) * 4;
      const lum = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      if (d[i + 3] > 200 && lum < 110) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }
  }
  if (x1 < 0) return;
  const pad = 3;
  x0 = Math.max(inset, x0 - pad);
  y0 = Math.max(inset, y0 - pad);
  x1 = Math.min(w - inset - 1, x1 + pad);
  y1 = Math.min(h - inset - 1, y1 + pad);
  for (let y = y0; y <= y1; y++) {
    const l = (y * w + x0 - 1) * 4;
    const r = (y * w + x1 + 1) * 4;
    for (let x = x0; x <= x1; x++) {
      const t = (x - x0 + 1) / (x1 - x0 + 2);
      const dst = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) d[dst + c] = Math.round(d[l + c] * (1 - t) + d[r + c] * t);
    }
  }
  g.putImageData(img, 0, 0);
}

/** The classic art has no ambient brick shadow; a blank frame keeps the sprite map complete. */
export function buildBlankShadow(): Sprite {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 4;
  return { name: "brick_shadow_sprite", frames: [c], width: 4, height: 4 };
}

/** No outer glow in the classic art either. */
export function buildBlankGlow(): Sprite {
  const frames = Array.from({ length: 7 }, () => {
    const c = document.createElement("canvas");
    c.width = 4;
    c.height = 4;
    return c;
  });
  return { name: "brick_glow_sprite", frames, width: 4, height: 4 };
}

export function buildClassicSoundButton(sprites: SpriteMap): Sprite {
  const face = sprites.pause_button_sprite;
  const w = face.width;
  const h = face.height;
  const frames = Array.from({ length: 4 }, (_, i) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d")!;
    g.drawImage(face.frames[0], 0, 0, w, h);
    inpaintIcon(g, w, h);
    const muted = i >= 2;
    g.fillStyle = "#161616";
    g.strokeStyle = "#161616";
    g.lineCap = "round";
    g.lineJoin = "round";
    g.lineWidth = w * 0.06;
    speakerIcon(g, w / 2, h / 2, Math.min(w, h) * 0.44, muted);
    if (muted) {
      g.strokeStyle = "#d1242f";
      g.lineWidth = w * 0.07;
      g.beginPath();
      g.moveTo(w * 0.3, h * 0.3);
      g.lineTo(w * 0.7, h * 0.7);
      g.stroke();
    }
    return c;
  });
  return { name: "sound_button_sprite", frames, width: w, height: h };
}
