import { clamp01, easeInOutSine, easeOutCubic } from "./easing";
import { mixColors, shade } from "./colorUtil";
import type { FxProfile } from "./fxProfile";

/**
 * The soft "swirl" colour mix: the new colour grows out of the centre as
 * before, but the edge is a feathered band of the blended colour, three
 * arcs of each paint chase each other round the seam, and a highlight
 * sweeps across once the new colour has taken. Drawn centred on the origin
 * for a tile `w` wide; the caller paints the two faces through `faces`.
 */
export interface MixFaces {
  old: () => void;
  next: () => void;
}

/** Where the sweep highlight sits for progress `q` (-1..1 across the tile), or null before it starts. */
export function sweepAt(q: number): { x: number; alpha: number } | null {
  if (q < 0.5) return null;
  const p = clamp01((q - 0.5) / 0.5);
  return { x: -1 + 2 * p, alpha: 0.4 * Math.sin(Math.PI * p) };
}

/**
 * The paper "fold" mix: a flap of the new colour folds over the old one
 * from the top-left corner down to the bottom-right, the way the tile's
 * crease runs.
 * Ahead of the flap runs a soft shadow; the flap itself shows the paper's
 * underside (a darker shade of the new colour) while it is standing up.
 */
export function drawFoldMix(g: CanvasRenderingContext2D, w: number, q: number, _oldColor: string, newColor: string, faces: MixFaces): void {
  const e = easeInOutSine(clamp01(q));
  const D = w * 0.78;
  const edge = -D + 2 * D * e;
  faces.old();
  // the part already folded over shows the new face
  g.save();
  g.rotate(Math.PI / 4);
  g.beginPath();
  g.rect(-D * 1.5, -D * 1.5, edge + D * 1.5, D * 3);
  g.clip();
  g.rotate(-Math.PI / 4);
  faces.next();
  g.restore();
  if (e <= 0.01 || e >= 0.99) return;
  const inset = w * 0.46;
  g.save();
  g.beginPath();
  g.roundRect(-inset, -inset, inset * 2, inset * 2, w * 0.06);
  g.clip();
  g.rotate(Math.PI / 4);
  const lift = Math.sin(Math.PI * e);
  const flap = D * 0.55 * lift;
  // shadow thrown ahead of the standing flap
  const sh = g.createLinearGradient(edge, 0, edge + flap * 0.9 + w * 0.05, 0);
  sh.addColorStop(0, `rgba(0,0,0,${0.28 * lift})`);
  sh.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = sh;
  g.fillRect(edge, -D * 1.5, flap * 0.9 + w * 0.05, D * 3);
  // the flap's underside, standing between the two faces
  g.fillStyle = shade(newColor, 0.8);
  g.fillRect(edge - flap, -D * 1.5, flap, D * 3);
  g.fillStyle = `rgba(255,255,255,${0.18 * lift})`;
  g.fillRect(edge - flap, -D * 1.5, Math.max(1, flap * 0.25), D * 3);
  // the crease itself
  g.fillStyle = "rgba(0,0,0,0.22)";
  g.fillRect(edge - Math.max(0.5, w * 0.006), -D * 1.5, Math.max(1, w * 0.012), D * 3);
  g.restore();
}

/**
 * The "curtain" mix: the new colour is knitted down from the top edge row
 * by row, a loose strand of the old colour unravelling just ahead of it.
 */
export function drawCurtainMix(g: CanvasRenderingContext2D, w: number, q: number, oldColor: string, newColor: string, faces: MixFaces): void {
  const e = easeInOutSine(clamp01(q));
  const H = w * 0.78;
  const edge = -H / 2 + H * e;
  faces.old();
  g.save();
  g.beginPath();
  g.rect(-H, -H, H * 2, edge + H);
  g.clip();
  faces.next();
  g.restore();
  if (e <= 0.01 || e >= 0.99) return;
  const inset = w * 0.46;
  g.save();
  g.beginPath();
  g.roundRect(-inset, -inset, inset * 2, inset * 2, w * 0.12);
  g.clip();
  // the row being knitted: a zigzag strand of the new colour over the seam
  g.strokeStyle = shade(newColor, 1.25);
  g.lineWidth = Math.max(1.5, w * 0.05);
  g.lineCap = "round";
  g.beginPath();
  const amp = w * 0.035;
  for (let k = 0; k <= 8; k++) {
    const px = -inset + (k / 8) * inset * 2;
    const py = edge + (k % 2 === 0 ? -amp : amp);
    if (k === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.stroke();
  // the loose strand of the old colour pulling away below
  g.strokeStyle = shade(oldColor, 0.85);
  g.lineWidth = Math.max(1, w * 0.035);
  g.beginPath();
  g.moveTo(-inset, edge + amp * 2);
  g.quadraticCurveTo(0, edge + amp * 2 + w * 0.12 * Math.sin(e * Math.PI), inset + w * 0.1, edge + amp * 3);
  g.stroke();
  g.restore();
}

/** The theme's mix treatment for anything but the plain radial wipe, which callers keep drawing themselves. */
export function drawMix(g: CanvasRenderingContext2D, mix: FxProfile["mix"], w: number, q: number, oldColor: string, newColor: string, faces: MixFaces): void {
  if (mix === "fold") drawFoldMix(g, w, q, oldColor, newColor, faces);
  else if (mix === "curtain") drawCurtainMix(g, w, q, oldColor, newColor, faces);
  else drawSwirlMix(g, w, q, oldColor, newColor, faces);
}

export function drawSwirlMix(g: CanvasRenderingContext2D, w: number, q: number, oldColor: string, newColor: string, faces: MixFaces): void {
  const e = easeOutCubic(clamp01(q));
  const R = w * 0.78 * e;
  faces.old();
  g.save();
  g.beginPath();
  g.arc(0, 0, R, 0, Math.PI * 2);
  g.clip();
  faces.next();
  g.restore();

  // Everything decorative stays inside the brick's rounded face.
  const inset = w * 0.46;
  const r = w * 0.18;
  g.save();
  g.beginPath();
  g.roundRect(-inset, -inset, inset * 2, inset * 2, r);
  g.clip();

  const fade = 1 - e;
  if (fade > 0.02 && R > 1) {
    g.lineCap = "round";
    g.globalAlpha = 0.55 * fade;
    g.strokeStyle = mixColors(oldColor, newColor, 0.5);
    g.lineWidth = w * 0.14 * fade + 1;
    g.beginPath();
    g.arc(0, 0, R, 0, Math.PI * 2);
    g.stroke();

    const a0 = q * 5;
    g.lineWidth = w * 0.085;
    g.globalAlpha = 0.85 * fade;
    for (let i = 0; i < 3; i++) {
      const a = a0 + (i * Math.PI * 2) / 3;
      g.strokeStyle = i % 2 === 0 ? newColor : oldColor;
      g.beginPath();
      g.arc(0, 0, R * 0.78, a, a + 1.0);
      g.stroke();
    }
  }

  const sweep = sweepAt(q);
  if (sweep) {
    g.globalAlpha = sweep.alpha;
    g.fillStyle = "#ffffff";
    g.rotate(-0.55);
    g.fillRect(sweep.x * w - w * 0.1, -w, w * 0.2, w * 2);
  }
  g.restore();
}
