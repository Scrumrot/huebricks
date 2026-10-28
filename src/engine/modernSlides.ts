import { BLACK, BLUE, GREEN, ORANGE, PURPLE, RED, YELLOW, type Color } from "../core/color";
import type { Sprite, SpriteName } from "./assets";
import {
  canvas,
  chevronUp,
  circleButton,
  CARD,
  DISPLAY,
  drawGlyphs,
  FONT,
  INK,
  INK_MUTED,
  inkOn,
  MODERN_COLORS,
  PAPER,
  PAPER_CELL,
  rgba,
  rotateIcon,
  roundRect,
  text,
  tile,
  type Ctx,
} from "./modernSkin";

/**
 * Modern-theme tutorial slides (`tutorial_intro_sprite`, 7 frames, and
 * `tutorial_outro_sprite`, 3 frames). Each slide is drawn at the original
 * 768 x 512 size and stretched over the whole screen by the scene, which also
 * draws the back / next buttons in the bottom corners, so captions stay inside
 * the middle of the bottom band.
 */

const W = 768;
const H = 512;
const CAPTION_Y = 448;
const CAPTION_MAX_W = 500;

function wrap(g: Ctx, s: string, maxW: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const probe = line ? `${line} ${w}` : w;
    if (g.measureText(probe).width > maxW && line) {
      lines.push(line);
      line = w;
    } else {
      line = probe;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function background(g: Ctx): void {
  g.fillStyle = PAPER;
  g.fillRect(0, 0, W, H);
  const vig = g.createRadialGradient(W / 2, H * 0.45, W * 0.25, W / 2, H * 0.45, W * 0.75);
  vig.addColorStop(0, "rgba(230,223,210,0)");
  vig.addColorStop(1, "rgba(230,223,210,1)");
  g.fillStyle = vig;
  g.fillRect(0, 0, W, H);
  // bottom caption band
  g.fillStyle = "rgba(60,40,20,0.07)";
  g.fillRect(0, H * 0.78, W, H * 0.22);
}

function caption(g: Ctx, s: string): void {
  g.font = `600 25px ${DISPLAY}`;
  const lines = wrap(g, s, CAPTION_MAX_W);
  const lineH = 31;
  const y0 = CAPTION_Y - ((lines.length - 1) * lineH) / 2;
  lines.forEach((l, i) => text(g, l, W / 2, y0 + i * lineH, 25, INK, 600, "center", DISPLAY));
}

function stepIndicator(g: Ctx, index: number, total: number): void {
  const r = 4;
  const gap = 14;
  const x0 = W / 2 - ((total - 1) * gap) / 2;
  for (let i = 0; i < total; i++) {
    g.beginPath();
    g.arc(x0 + i * gap, 24, r, 0, Math.PI * 2);
    g.fillStyle = i === index ? INK : "rgba(31,28,24,0.2)";
    g.fill();
  }
}

/** A brick at (cx, cy) with its colour glyph. */
function brick(g: Ctx, color: Color, cx: number, cy: number, size: number): void {
  tile(g, cx - size / 2, cy - size / 2, size, size, MODERN_COLORS[color]);
  drawGlyphs(g, color, cx, cy, size);
}

function label(g: Ctx, s: string, cx: number, cy: number, color = INK, size = 22): void {
  text(g, s, cx, cy, size, color, 700);
}

type Cell = Color | 0;

/** A small board: `rows` of `cols` cells, bottom row last. */
function miniBoard(g: Ctx, x: number, y: number, cols: number, rows: number, cell: number, cells: Cell[][]): void {
  const gap = 4;
  const w = cols * (cell + gap) + gap;
  const h = rows * (cell + gap) + gap;
  roundRect(g, x, y + 4, w, h, 10);
  g.fillStyle = "rgba(60,40,20,0.14)";
  g.fill();
  roundRect(g, x, y, w, h, 10);
  g.fillStyle = CARD;
  g.fill();
  g.lineWidth = 1;
  g.strokeStyle = "rgba(31,28,24,0.18)";
  g.stroke();
  g.strokeStyle = "rgba(31,28,24,0.07)";
  for (let c = 1; c < cols; c++) {
    const lx = x + gap / 2 + c * (cell + gap);
    g.beginPath();
    g.moveTo(lx, y + 2);
    g.lineTo(lx, y + h - 2);
    g.stroke();
  }
  for (let r = 1; r < rows; r++) {
    const ly = y + gap / 2 + r * (cell + gap);
    g.beginPath();
    g.moveTo(x + 2, ly);
    g.lineTo(x + w - 2, ly);
    g.stroke();
  }
  cells.forEach((row, r) => {
    row.forEach((c, col) => {
      if (!c) return;
      const cx = x + gap + col * (cell + gap) + cell / 2;
      const cy = y + gap + r * (cell + gap) + cell / 2;
      brick(g, c, cx, cy, cell);
    });
  });
}

/** Replenish wells under a mini board, with optional bricks. */
function miniReplenish(g: Ctx, x: number, y: number, cols: number, cell: number, cells: Cell[], selected = -1): void {
  const gap = 4;
  for (let c = 0; c < cols; c++) {
    const cx = x + gap + c * (cell + gap);
    roundRect(g, cx, y, cell, cell, 8);
    g.fillStyle = PAPER_CELL;
    g.fill();
    g.lineWidth = 1;
    g.strokeStyle = "rgba(31,28,24,0.14)";
    g.stroke();
    const col = cells[c];
    if (col) brick(g, col, cx + cell / 2, y + cell / 2, cell * 0.8);
    if (c === selected) {
      g.lineWidth = 3;
      g.strokeStyle = INK;
      roundRect(g, cx - 3, y - 3, cell + 6, cell + 6, 10);
      g.stroke();
    }
  }
}

function arrow(g: Ctx, x1: number, y1: number, x2: number, y2: number, color = INK): void {
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = 3;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke();
  const a = Math.atan2(y2 - y1, x2 - x1);
  const s = 10;
  g.beginPath();
  g.moveTo(x2, y2);
  g.lineTo(x2 - Math.cos(a - 0.5) * s, y2 - Math.sin(a - 0.5) * s);
  g.lineTo(x2 - Math.cos(a + 0.5) * s, y2 - Math.sin(a + 0.5) * s);
  g.closePath();
  g.fill();
}

function callout(g: Ctx, s: string, cx: number, cy: number): void {
  g.font = `700 16px ${FONT}`;
  const w = g.measureText(s).width + 24;
  roundRect(g, cx - w / 2, cy - 12, w, 28, 14);
  g.fillStyle = "rgba(60,40,20,0.16)";
  g.fill();
  roundRect(g, cx - w / 2, cy - 14, w, 28, 14);
  g.fillStyle = INK;
  g.fill();
  text(g, s, cx, cy + 1, 16, PAPER, 700);
}

const R = RED;
const B = BLUE;
const Y = YELLOW;
const P = PURPLE;
const O = ORANGE;
const G = GREEN;

type SlideDraw = (g: Ctx) => void;

function buildSlides(name: SpriteName, slides: Array<{ draw: SlideDraw; caption: string }>, offset: number, total: number): Sprite {
  const frames = slides.map((s, i) =>
    canvas(W, H, (g) => {
      background(g);
      s.draw(g);
      caption(g, s.caption);
      stepIndicator(g, offset + i, total);
    }),
  );
  return { name, frames, width: W, height: H };
}

export function buildTutorialSlides(logo: Sprite): { intro: Sprite; outro: Sprite } {
  const total = 10;

  const intro = buildSlides(
    "tutorial_intro_sprite",
    [
      {
        caption: "How to play",
        draw: (g) => {
          g.drawImage(logo.frames[0], W / 2 - 192, 80, 384, 200);
          text(g, "A puzzle about mixing colours", W / 2, 320, 20, INK_MUTED, 500);
        },
      },
      {
        caption: "There are seven different colours in HueBricks.",
        draw: (g) => {
          const cx = W / 2;
          const cy = 205;
          const r = 118;
          const ring: Color[] = [Y, G, B, P, R, O];
          g.strokeStyle = "rgba(31,28,24,0.15)";
          g.lineWidth = 2;
          g.beginPath();
          g.arc(cx, cy, r, 0, Math.PI * 2);
          g.stroke();
          ring.forEach((_, i) => {
            const a = -Math.PI / 2 + (i * Math.PI) / 3;
            g.beginPath();
            g.moveTo(cx, cy);
            g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
            g.stroke();
          });
          ring.forEach((c, i) => {
            const a = -Math.PI / 2 + (i * Math.PI) / 3;
            brick(g, c, cx + Math.cos(a) * r, cy + Math.sin(a) * r, 70);
          });
          brick(g, BLACK, cx, cy, 64);
        },
      },
      {
        caption: "The symbols on a brick show which colours it contains.",
        draw: (g) => {
          label(g, "Primary colours", W / 2, 60, INK_MUTED, 18);
          const items: Array<[Color, string]> = [
            [R, "Red"],
            [Y, "Yellow"],
            [B, "Blue"],
          ];
          items.forEach(([c, n], i) => {
            const x = W / 2 + (i - 1) * 200;
            label(g, n, x, 110, MODERN_COLORS[c], 26);
            brick(g, c, x, 240, 150);
          });
        },
      },
      {
        caption: "Secondary colours contain two primary colours.",
        draw: (g) => {
          label(g, "Secondary colours", W / 2, 60, INK_MUTED, 18);
          const items: Array<[Color, string, string]> = [
            [P, "Purple", "red + blue"],
            [O, "Orange", "red + yellow"],
            [G, "Green", "blue + yellow"],
          ];
          items.forEach(([c, n, f], i) => {
            const x = W / 2 + (i - 1) * 200;
            label(g, n, x, 110, MODERN_COLORS[c], 26);
            brick(g, c, x, 230, 140);
            label(g, f, x, 330, INK_MUTED, 16);
          });
        },
      },
      {
        caption: "Chromatic gray contains all three primary colours.",
        draw: (g) => {
          label(g, "Tertiary colour", W / 2, 60, INK_MUTED, 18);
          label(g, "Chromatic gray", W / 2, 110, INK, 26);
          brick(g, BLACK, W / 2, 230, 150);
          label(g, "red + blue + yellow", W / 2, 335, INK_MUTED, 16);
        },
      },
      {
        caption: "When four or more bricks of the same colour touch, they pop.",
        draw: (g) => {
          const cell = 56;
          const cols = 6;
          const rows = 4;
          const bw = cols * (cell + 4) + 4;
          const x = W / 2 - bw / 2;
          const y = 80;
          miniBoard(g, x, y, cols, rows, cell, [
            [0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0],
            [O, G, G, P, 0, Y],
            [R, G, G, O, Y, B],
          ]);
          // highlight the 2x2 green group
          const gx = x + 4 + 1 * (cell + 4) - 6;
          const gy = y + 4 + 2 * (cell + 4) - 6;
          g.lineWidth = 3;
          g.strokeStyle = INK;
          g.setLineDash([8, 6]);
          roundRect(g, gx, gy, 2 * (cell + 4) + 8, 2 * (cell + 4) + 8, 12);
          g.stroke();
          g.setLineDash([]);
          callout(g, "4 connected = pop!", x + bw / 2, y - 26);
        },
      },
      {
        caption: "Pick a brick from the replenish line, then click a brick on the board to mix it in.",
        draw: (g) => {
          const cell = 50;
          const cols = 6;
          const rows = 4;
          const bw = cols * (cell + 4) + 4;
          const x = W / 2 - bw / 2 + 60;
          const y = 50;
          miniBoard(g, x, y, cols, rows, cell, [
            [0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0],
            [O, G, 0, 0, 0, Y],
            [R, B, R, O, Y, B],
          ]);
          const ry = y + rows * (cell + 4) + 14;
          miniReplenish(g, x, ry, cols, cell, [B, Y, 0, 0, 0, 0], 0);
          // arrow from selected replenish brick to the red board brick
          const sx = x + 4 + cell / 2;
          const sy = ry;
          const tx = x + 4 + 2 * (cell + 4) + cell / 2;
          const ty = y + 4 + 3 * (cell + 4) + cell;
          arrow(g, sx + 10, sy - 4, tx - 6, ty + 2, MODERN_COLORS[B]);
          callout(g, "Play area", x - 90, y + 60);
          callout(g, "Replenish line", x - 100, ry + cell / 2);
          label(g, "blue + red = purple", x + bw / 2, ry + cell + 30, INK_MUTED, 15);
        },
      },
    ],
    0,
    total,
  );

  const outro = buildSlides(
    "tutorial_outro_sprite",
    [
      {
        caption: "Use the rotate buttons to turn the whole board a quarter turn.",
        draw: (g) => {
          const size = 120;
          for (const [i, cw] of [false, true].entries()) {
            const cx = W / 2 + (i === 0 ? -1 : 1) * 190;
            const c = canvas(size, size, (gg, w, h) => circleButton(gg, w, h, false, (g3, x, y, r) => rotateIcon(g3, x, y, r, cw)));
            g.drawImage(c, cx - size / 2, 150 - size / 2);
            label(g, cw ? "Clockwise" : "Counter-clockwise", cx, 240, INK_MUTED, 16);
          }
          const cell = 36;
          miniBoard(g, W / 2 - (3 * (cell + 4) + 4) / 2, 88, 3, 3, cell, [
            [0, 0, 0],
            [0, 0, 0],
            [R, B, Y],
          ]);
          label(g, "Bricks fall into the new orientation", W / 2, 300, INK_MUTED, 15);
        },
      },
      {
        caption: "Hold the speed button to hurry the replenish line.",
        draw: (g) => {
          const size = 130;
          const c = canvas(size, size, (gg, w, h) => circleButton(gg, w, h, true, chevronUp));
          g.drawImage(c, W / 2 - size / 2, 170 - size / 2);
          // progress bar
          const bx = W / 2 - 160;
          const by = 280;
          roundRect(g, bx, by, 320, 10, 5);
          g.fillStyle = "rgba(31,28,24,0.12)";
          g.fill();
          const grad = g.createLinearGradient(bx, 0, bx + 320, 0);
          grad.addColorStop(0, MODERN_COLORS[YELLOW]);
          grad.addColorStop(1, MODERN_COLORS[RED]);
          roundRect(g, bx, by, 220, 10, 5);
          g.fillStyle = grad;
          g.fill();
          label(g, "Replenish line progress", W / 2, 312, INK_MUTED, 15);
          label(g, "Popping groups pauses the timer for a moment", W / 2, 340, INK_MUTED, 15);
        },
      },
      {
        caption: "Objectives of each mode.",
        draw: (g) => {
          const modes: Array<[string, string, string]> = [
            ["Puzzle", MODERN_COLORS[RED], "Clear the play area to win the level."],
            ["Normal", MODERN_COLORS[YELLOW], "Pop a set number of groups to win the level."],
            ["Zen", MODERN_COLORS[BLUE], "Just like Normal, but you can't lose."],
          ];
          modes.forEach(([n, colour, desc], i) => {
            const y = 95 + i * 95;
            tile(g, 120, y - 30, 170, 60, colour, { radius: 30 });
            text(g, n, 205, y + 1, 26, inkOn(colour), 600, "center", DISPLAY);
            text(g, desc, 315, y + 1, 20, INK, 600, "left");
            g.fillStyle = rgba(colour, 0.35);
            g.fillRect(315, y + 18, 320, 2);
          });
        },
      },
    ],
    7,
    total,
  );

  return { intro, outro };
}
