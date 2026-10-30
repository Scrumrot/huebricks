import type { Color } from "../core/color";
import type { SpawnOptions } from "./particles";
import type { Palette } from "./theme";

/** Mix a hex colour toward white. */
export function lighten(hex: string, t: number): string {
  if (!hex.startsWith("#") || hex.length !== 7) return hex;
  const n = parseInt(hex.slice(1), 16);
  const m = (c: number) => Math.round(c + (255 - c) * t);
  return `rgb(${m((n >> 16) & 255)},${m((n >> 8) & 255)},${m(n & 255)})`;
}

/**
 * What a popped brick of `color` turns into for a theme: particle colours
 * and spawn options, sized for a cell `cw` wide. Shared by the game (pops,
 * level clears) and the title screen (poking the decorations).
 */
export function debrisFor(pal: Palette, color: Color, cw: number): { colors: string[]; o: SpawnOptions } {
  const base = pal.brickColors[color];
  const light = lighten(base, 0.3);
  const basic: SpawnOptions = { speed: [180, 320], size: [cw * 0.09, cw * 0.16], life: [350, 500], gravity: 900, drag: 0.25 };
  switch (pal.popStyle) {
    case "dots":
      return { colors: [base, lighten(base, 0.55), "#ffffff"], o: { ...basic, shape: 1 } };
    case "cubes": {
      const side = pal.brickSide?.[color];
      return { colors: [base, light], o: { ...basic, shape: 2, sides: side ? [side, lighten(side, 0.2)] : undefined } };
    }
    case "splat":
      return { colors: [base, light], o: { ...basic, size: [cw * 0.1, cw * 0.2], shape: 3 } };
    case "sprinkles":
      return {
        colors: [base, "#FFFFFF", "#F7A9C4", "#FFE27A", "#9DE3C1"],
        o: { ...basic, speed: [200, 360], size: [cw * 0.12, cw * 0.2], life: [450, 700], gravity: 1000, drag: 0.3, shape: 4 },
      };
    case "shards":
      return {
        colors: [base, lighten(base, 0.5), "#FFFFFF"],
        o: { ...basic, speed: [220, 380], size: [cw * 0.1, cw * 0.2], life: [400, 600], gravity: 800, drag: 0.3, shape: 6 },
      };
    case "bats":
      return {
        colors: ["#1F1A24", "#2A1F33"],
        o: { speed: [120, 220], size: [cw * 0.22, cw * 0.34], life: [600, 900], gravity: -260, drag: 0.5, shape: 5, dir: -Math.PI / 2, spread: 1.2 },
      };
    case "snow":
      return {
        colors: ["#FFFFFF", lighten(base, 0.6)],
        o: { speed: [120, 240], size: [cw * 0.1, cw * 0.18], life: [500, 800], gravity: 150, drag: 0.2, shape: 7 },
      };
    case "leaves":
      return {
        colors: ["#5BAE4E", "#3C8A36", "#E8893A", lighten(base, 0.2)],
        o: { speed: [140, 260], size: [cw * 0.12, cw * 0.2], life: [550, 850], gravity: 220, drag: 0.3, shape: 8 },
      };
    case "confetti":
      return {
        colors: [base, "#F2D16B", "#FFFFFF"],
        o: { ...basic, speed: [200, 340], size: [cw * 0.1, cw * 0.18], life: [450, 700], gravity: 600, shape: 0 },
      };
    default:
      return { colors: [base, light], o: { ...basic, shape: 0 } };
  }
}
