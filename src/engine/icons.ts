/**
 * One icon family for every theme: a 24-unit grid, 2.2-unit stroke, round
 * caps and joins. Each icon is drawn centred on (cx, cy) with `r` as half
 * its box, in whatever stroke and fill colour the caller has set, so a
 * theme recolours the button around it but never the glyph inside.
 */
type Ctx = CanvasRenderingContext2D;

export type IconName =
  | "play"
  | "pause"
  | "rotateCcw"
  | "rotateCw"
  | "hurry"
  | "hold"
  | "restart"
  | "soundOn"
  | "soundOff"
  | "music"
  | "theme"
  | "fullscreen"
  | "exitFullscreen"
  | "settings"
  | "back"
  | "next"
  | "title"
  | "close"
  | "about"
  | "help"
  | "swapRails"
  | "star"
  | "check"
  | "lock"
  | "trophy";

export type IconDraw = (g: Ctx, cx: number, cy: number, r: number) => void;

/** Stroke width for an icon of half-size `r` (2.2 on the 24 grid). */
export const iconStroke = (r: number): number => Math.max(1, r * (2.2 / 12));

/** Run `draw` in grid units: the origin at the icon centre, 12 units to each edge. */
function onGrid(g: Ctx, cx: number, cy: number, r: number, draw: (u: number) => void): void {
  g.save();
  g.translate(cx, cy);
  g.lineWidth = iconStroke(r);
  g.lineCap = "round";
  g.lineJoin = "round";
  draw(r / 12);
  g.restore();
}

function path(g: Ctx, u: number, pts: readonly (readonly [number, number])[], close = false): void {
  g.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x * u, y * u) : g.lineTo(x * u, y * u)));
  if (close) g.closePath();
}

function arrowHead(g: Ctx, x: number, y: number, dir: number, size: number): void {
  for (const side of [1, -1]) {
    const a = dir + Math.PI + side * (Math.PI / 4);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * size, y + Math.sin(a) * size);
    g.stroke();
  }
}

/** Three-quarter arc with an arrowhead, around an optional filled square that stands for the board. */
function turn(g: Ctx, u: number, clockwise: boolean, board: boolean): void {
  const rr = 7.2 * u;
  const dir = clockwise ? 1 : -1;
  const start = -Math.PI / 2 + dir * Math.PI * 0.3;
  const end = start + dir * Math.PI * 1.45;
  g.beginPath();
  g.arc(0, 0, rr, start, end, !clockwise);
  g.stroke();
  const ax = Math.cos(end) * rr;
  const ay = Math.sin(end) * rr;
  const travel = end + (dir * Math.PI) / 2;
  arrowHead(g, ax + Math.cos(travel) * 1.4 * u, ay + Math.sin(travel) * 1.4 * u, travel, 3.6 * u);
  if (board) {
    const sq = 4.4 * u;
    g.save();
    g.fillStyle = g.strokeStyle;
    g.beginPath();
    g.roundRect(-sq / 2, -sq / 2, sq, sq, sq * 0.2);
    g.fill();
    g.restore();
  }
}

function speaker(g: Ctx, u: number): void {
  path(
    g,
    u,
    [
      [-9, -3.5],
      [-5.5, -3.5],
      [-1, -8],
      [-1, 8],
      [-5.5, 3.5],
      [-9, 3.5],
    ],
    true,
  );
  g.fill();
}

function corner(g: Ctx, u: number, sx: number, sy: number, inward: boolean): void {
  const o = 8 * u;
  const len = 5 * u;
  const x = sx * o;
  const y = sy * o;
  if (inward) {
    path(g, 1, [
      [x, y - sy * len],
      [x, y],
      [x - sx * len, y],
    ]);
  } else {
    path(g, 1, [
      [x - sx * len, y],
      [x, y],
      [x, y - sy * len],
    ]);
  }
  g.stroke();
}

export const ICONS: Record<IconName, IconDraw> = {
  play: (g, cx, cy, r) =>
    onGrid(g, cx, cy, r, (u) => {
      path(
        g,
        u,
        [
          [-6, -8.5],
          [8.5, 0],
          [-6, 8.5],
        ],
        true,
      );
      g.fill();
      g.stroke();
    }),
  pause: (g, cx, cy, r) =>
    onGrid(g, cx, cy, r, (u) => {
      for (const x of [-4, 4]) {
        g.beginPath();
        g.roundRect((x - 1.5) * u, -8 * u, 3 * u, 16 * u, 1.5 * u);
        g.fill();
      }
    }),
  rotateCcw: (g, cx, cy, r) => onGrid(g, cx, cy, r, (u) => turn(g, u, false, true)),
  rotateCw: (g, cx, cy, r) => onGrid(g, cx, cy, r, (u) => turn(g, u, true, true)),
  hurry: (g, cx, cy, r) =>
    onGrid(g, cx, cy, r, (u) => {
      for (const dy of [-3.5, 4]) {
        path(g, u, [
          [-7, dy + 3.5],
          [0, dy - 3.5],
          [7, dy + 3.5],
        ]);
        g.stroke();
      }
    }),
  hold: (g, cx, cy, r) =>
    onGrid(g, cx, cy, r, (u) => {
      // arrow dropping into a tray
      path(g, u, [
        [0, -9],
        [0, 3],
      ]);
      g.stroke();
      path(g, u, [
        [-4.5, -1],
        [0, 3.5],
        [4.5, -1],
      ]);
      g.stroke();
      path(g, u, [
        [-9, 5],
        [-9, 9],
        [9, 9],
        [9, 5],
      ]);
      g.stroke();
    }),
  restart: (g, cx, cy, r) => onGrid(g, cx, cy, r, (u) => turn(g, u, false, false)),
  soundOn: (g, cx, cy, r) =>
    onGrid(g, cx, cy, r, (u) => {
      speaker(g, u);
      for (const k of [4, 7.5]) {
        g.beginPath();
        g.arc(-1 * u, 0, k * u, -Math.PI * 0.28, Math.PI * 0.28);
        g.stroke();
      }
    }),
  soundOff: (g, cx, cy, r) =>
    onGrid(g, cx, cy, r, (u) => {
      speaker(g, u);
      path(g, u, [
        [3, -3.5],
        [9.5, 3],
      ]);
      g.stroke();
      path(g, u, [
        [9.5, -3.5],
        [3, 3],
      ]);
      g.stroke();
    }),
  music: (g, cx, cy, r) =>
    onGrid(g, cx, cy, r, (u) => {
      path(g, u, [
        [-2, 6],
        [-2, -8],
        [7, -10],
        [7, 3],
      ]);
      g.stroke();
      for (const [x, y] of [
        [-5, 6.5],
        [4, 3.5],
      ]) {
        g.beginPath();
        g.ellipse(x * u, y * u, 3.4 * u, 2.6 * u, -0.3, 0, Math.PI * 2);
        g.fill();
      }
    }),
  theme: (g, cx, cy, r) =>
    onGrid(g, cx, cy, r, (u) => {
      g.beginPath();
      g.arc(0, 0, 8.5 * u, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.arc(0, 0, 8.5 * u, -Math.PI / 2, Math.PI / 2);
      g.closePath();
      g.fill();
    }),
  fullscreen: (g, cx, cy, r) =>
    onGrid(g, cx, cy, r, (u) => {
      for (const [sx, sy] of [
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1],
      ])
        corner(g, u, sx, sy, false);
    }),
  exitFullscreen: (g, cx, cy, r) =>
    onGrid(g, cx, cy, r, (u) => {
      for (const [sx, sy] of [
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1],
      ]) {
        const o = 2.5 * u;
        const len = 6 * u;
        path(g, 1, [
          [sx * o, sy * (o + len)],
          [sx * o, sy * o],
          [sx * (o + len), sy * o],
        ]);
        g.stroke();
      }
    }),
  settings: (g, cx, cy, r) =>
    onGrid(g, cx, cy, r, (u) => {
      for (const [y, kx] of [
        [-4, 2],
        [4, -2],
      ]) {
        path(g, u, [
          [-9, y],
          [9, y],
        ]);
        g.stroke();
        g.beginPath();
        g.arc(kx * u, y * u, 2.6 * u, 0, Math.PI * 2);
        g.save();
        g.fillStyle = g.strokeStyle;
        g.fill();
        g.restore();
      }
    }),
  back: (g, cx, cy, r) =>
    onGrid(g, cx, cy, r, (u) => {
      path(g, u, [
        [8, 0],
        [-8, 0],
      ]);
      g.stroke();
      arrowHead(g, -8 * u, 0, Math.PI, 6 * u);
    }),
  next: (g, cx, cy, r) =>
    onGrid(g, cx, cy, r, (u) => {
      path(g, u, [
        [-8, 0],
        [8, 0],
      ]);
      g.stroke();
      arrowHead(g, 8 * u, 0, 0, 6 * u);
    }),
  title: (g, cx, cy, r) =>
    onGrid(g, cx, cy, r, (u) => {
      path(g, u, [
        [-9, 0],
        [0, -9],
        [9, 0],
      ]);
      g.stroke();
      path(g, u, [
        [-6.5, -2.5],
        [-6.5, 8.5],
        [6.5, 8.5],
        [6.5, -2.5],
      ]);
      g.stroke();
      path(g, u, [
        [-2.5, 8.5],
        [-2.5, 3],
        [2.5, 3],
        [2.5, 8.5],
      ]);
      g.stroke();
    }),
  close: (g, cx, cy, r) =>
    onGrid(g, cx, cy, r, (u) => {
      path(g, u, [
        [-7, -7],
        [7, 7],
      ]);
      g.stroke();
      path(g, u, [
        [7, -7],
        [-7, 7],
      ]);
      g.stroke();
    }),
  about: (g, cx, cy, r) =>
    onGrid(g, cx, cy, r, (u) => {
      path(g, u, [
        [0, -2],
        [0, 8],
      ]);
      g.stroke();
      g.beginPath();
      g.arc(0, -7.5 * u, 1.6 * u, 0, Math.PI * 2);
      g.save();
      g.fillStyle = g.strokeStyle;
      g.fill();
      g.restore();
    }),
  help: (g, cx, cy, r) =>
    onGrid(g, cx, cy, r, (u) => {
      g.beginPath();
      g.arc(0, -3.5 * u, 5 * u, Math.PI * 1.05, Math.PI * 2.1);
      g.stroke();
      path(g, u, [
        [1.6, 0.8],
        [0, 2.5],
        [0, 4.5],
      ]);
      g.stroke();
      g.beginPath();
      g.arc(0, 9 * u, 1.6 * u, 0, Math.PI * 2);
      g.save();
      g.fillStyle = g.strokeStyle;
      g.fill();
      g.restore();
    }),
  swapRails: (g, cx, cy, r) =>
    onGrid(g, cx, cy, r, (u) => {
      g.beginPath();
      g.roundRect(-10 * u, -7 * u, 5 * u, 14 * u, 1.5 * u);
      g.stroke();
      g.beginPath();
      g.roundRect(5 * u, -7 * u, 5 * u, 14 * u, 1.5 * u);
      g.fill();
      path(g, u, [
        [-2.5, 0],
        [2.5, 0],
      ]);
      g.stroke();
      arrowHead(g, 2.5 * u, 0, 0, 3 * u);
      arrowHead(g, -2.5 * u, 0, Math.PI, 3 * u);
    }),
  star: (g, cx, cy, r) =>
    onGrid(g, cx, cy, r, (u) => {
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rad = (i % 2 === 0 ? 9.5 : 4.2) * u;
        const x = Math.cos(a) * rad;
        const y = Math.sin(a) * rad;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
      g.fill();
      g.stroke();
    }),
  check: (g, cx, cy, r) =>
    onGrid(g, cx, cy, r, (u) => {
      path(g, u, [
        [-8, 0.5],
        [-2.5, 6],
        [8.5, -6],
      ]);
      g.stroke();
    }),
  lock: (g, cx, cy, r) =>
    onGrid(g, cx, cy, r, (u) => {
      g.beginPath();
      g.roundRect(-7 * u, -1 * u, 14 * u, 10.5 * u, 2 * u);
      g.stroke();
      g.beginPath();
      g.arc(0, -3 * u, 4.5 * u, Math.PI, 0);
      g.stroke();
      g.beginPath();
      g.arc(0, 4 * u, 1.5 * u, 0, Math.PI * 2);
      g.save();
      g.fillStyle = g.strokeStyle;
      g.fill();
      g.restore();
    }),
  trophy: (g, cx, cy, r) =>
    onGrid(g, cx, cy, r, (u) => {
      path(
        g,
        u,
        [
          [-6, -9],
          [6, -9],
          [6, -3],
          [0, 2.5],
          [-6, -3],
        ],
        true,
      );
      g.fill();
      g.stroke();
      for (const s of [1, -1]) {
        g.beginPath();
        g.arc(s * 7.5 * u, -6 * u, 2.6 * u, s > 0 ? -Math.PI / 2 : Math.PI / 2, s > 0 ? Math.PI / 2 : (3 * Math.PI) / 2);
        g.stroke();
      }
      path(g, u, [
        [0, 2.5],
        [0, 7],
      ]);
      g.stroke();
      path(g, u, [
        [-5, 9],
        [5, 9],
      ]);
      g.stroke();
    }),
};

export const ICON_NAMES = Object.keys(ICONS) as IconName[];
