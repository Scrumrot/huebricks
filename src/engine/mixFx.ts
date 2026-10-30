import { clamp01, easeOutCubic } from "./easing";
import { mixColors } from "./colorUtil";

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
