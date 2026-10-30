import { colorFrame, type Color } from "../core/color";
import type { SpriteMap } from "./assets";
import { drawSprite } from "./draw";
import { easeOutCubic } from "./easing";
import { drawSwirlMix } from "./mixFx";
import { chipPath } from "./modernSkin";
import type { Palette } from "./theme";

/**
 * A single brick drawn anywhere on screen in the current theme's art: the
 * face sprite plus the theme's shadow, extrusion or glow, optionally clipped
 * to a bubble or a stain blob. Used by the arcade modes and the arcade menu.
 */
export type TileShape = "square" | "round" | "blob";

export interface TileOptions {
  /** Scale about the centre. */
  s?: number;
  alpha?: number;
  /** 0..1: how far the tile is lifted off the surface. */
  lift?: number;
  shape?: TileShape;
  /** Seed for blob outlines. */
  seed?: number;
  rot?: number;
  /** Draw the old colour with the new one wiping out from the centre (0..1). */
  wipeFrom?: Color;
  wipe?: number;
}

export function shapePath(g: CanvasRenderingContext2D, shape: TileShape, x: number, y: number, w: number, h: number, seed: number): void {
  if (shape === "round") {
    g.beginPath();
    g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else if (shape === "blob") {
    chipPath(g, x, y, w, h, Math.min(w, h) * 0.42, Math.min(w, h) * 0.07, seed);
  } else {
    g.beginPath();
    g.roundRect(x, y, w, h, Math.min(w, h) * 0.18);
  }
}

export function drawTile(
  g: CanvasRenderingContext2D,
  sp: SpriteMap,
  pal: Palette,
  color: Color,
  x: number,
  y: number,
  size: number,
  o: TileOptions = {},
): void {
  const s = o.s ?? 1;
  if (s <= 0.02) return;
  const alpha = o.alpha ?? 1;
  const lift = o.lift ?? 0;
  const shape = o.shape ?? "square";
  const seed = o.seed ?? 1;
  const cx = x + size / 2;
  const cy = y + size / 2;
  const w = size * s;
  const pad = w * 0.04;
  const iw = w - pad * 2;
  g.save();
  g.globalAlpha = alpha;
  g.translate(cx, cy - 4 * lift);
  if (o.rot) g.rotate(o.rot);
  // what sits under the tile
  if (pal.brickStyle === "chip" && pal.brickShadow) {
    if (lift > 0) {
      const sw = w * (1.1 + 0.3 * lift);
      g.globalAlpha = alpha * 0.55 * lift;
      drawSprite(g, sp.brick_shadow_sprite, 0, -sw / 2, -sw / 2 + 7 + 10 * lift, sw, sw);
      g.globalAlpha = alpha;
    }
    shapePath(g, shape, -iw / 2, -iw / 2 + 4 + 10 * lift, iw, iw, seed);
    g.fillStyle = pal.brickShadow;
    g.fill();
  } else if (pal.brickStyle === "gel") {
    const gw = w * 1.4;
    g.globalAlpha = alpha * (0.5 + 0.5 * lift);
    drawSprite(g, sp.brick_glow_sprite, colorFrame(color), -gw / 2, -gw / 2, gw, gw);
    g.globalAlpha = alpha;
  } else if (pal.brickStyle === "extruded" && pal.brickSide) {
    const sw = w * (1 + 0.14 * lift);
    drawSprite(g, sp.brick_shadow_sprite, 0, -sw / 2, -sw / 2 + 8 + 4 * lift, sw, sw);
    shapePath(g, shape, -iw / 2, -iw / 2 + 6 + 4 * lift, iw, iw, seed);
    g.fillStyle = pal.brickSide[color];
    g.fill();
  }
  const face = (c: Color) => drawSprite(g, sp.brick_sprite, colorFrame(c), -w / 2, -w / 2, w, w);
  const wiping = o.wipeFrom !== undefined && o.wipe !== undefined && o.wipe < 1;
  const drawFace = () => {
    if (wiping && pal.fx.mix === "swirl") {
      drawSwirlMix(g, w, o.wipe!, pal.brickColors[o.wipeFrom!], pal.brickColors[color], { old: () => face(o.wipeFrom!), next: () => face(color) });
    } else if (wiping) {
      face(o.wipeFrom!);
      g.save();
      g.beginPath();
      g.arc(0, 0, (w / 2) * 1.1 * easeOutCubic(o.wipe!), 0, Math.PI * 2);
      g.clip();
      face(color);
      g.restore();
    } else {
      face(color);
    }
  };
  if (shape !== "square") {
    g.save();
    shapePath(g, shape, -iw / 2, -iw / 2, iw, iw, seed);
    g.clip();
    // oversize the square art a little so its corners fill the shape
    const k = shape === "round" ? 1.12 : 1.06;
    g.scale(k, k);
    drawFace();
    g.restore();
    // rim: a soft highlight for bubbles, an ink edge for blobs
    shapePath(g, shape, -iw / 2, -iw / 2, iw, iw, seed);
    if (shape === "round") {
      g.lineWidth = Math.max(1, w * 0.05);
      g.strokeStyle = "rgba(255,255,255,0.35)";
      g.stroke();
      g.beginPath();
      g.ellipse(-iw * 0.2, -iw * 0.24, iw * 0.14, iw * 0.09, -0.6, 0, Math.PI * 2);
      g.fillStyle = "rgba(255,255,255,0.55)";
      g.fill();
    } else {
      g.lineWidth = Math.max(1, w * 0.035);
      g.strokeStyle = "rgba(0,0,0,0.28)";
      g.stroke();
    }
  } else {
    drawFace();
  }
  g.restore();
}
