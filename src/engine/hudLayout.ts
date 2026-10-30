import type { Layout } from "../core/layout";

/**
 * Where the modern HUD and controls sit for a measured board, as pure
 * geometry. Landscape keeps the readouts in the column left of the board
 * and the controls in the column right of it; portrait stacks a two-row
 * band above the board and a control bar under the tray. Left-handed play
 * mirrors everything about the vertical centre line.
 */

export type ControlKind = "ccw" | "cw" | "speed" | "pause" | "sound";

export interface HudRail {
  /** Hold slot centre x and the keycap/label beside or under it. */
  cx: number;
  holdY: number;
  slot: number;
  holdLabelX: number;
  holdLabelY: number;
  holdLabelAlign: CanvasTextAlign;
  /** Sound toggle (next to pause). */
  soundX: number;
  soundY: number;
  /** Score caption/number and the chain meter under them. */
  scoreCx: number;
  scoreCapY: number;
  scoreY: number;
  meterW: number;
  chainY: number;
  /** Level pill. */
  pillCx: number;
  pillW: number;
  levelY: number;
  /** The goal ring: pops (or bricks) to go filling toward the target, with its caption beside it. */
  ring: { cx: number; cy: number; r: number };
  goalCapX: number;
  goalCapY: number;
  goalY: number;
  goalAlign: CanvasTextAlign;
  /** Subtract-goal stars: first star centre and the direction they run in. */
  starsX: number;
  starsY: number;
  starStep: number;
  /** Classic-era fields the sideways classic HUD still reads. */
  popsCx: number;
  popsCapY: number;
  popsY: number;
  goalX: number;
  goalLabelY: number;
  textSize: number;
  /** +1 for the usual right-handed layout, -1 when mirrored. */
  side: 1 | -1;
}

export interface ControlBox {
  kind: ControlKind;
  cx: number;
  cy: number;
  w: number;
  h: number;
}

export interface ControlLabel {
  text: string;
  x: number;
  y: number;
}

export interface Controls {
  buttons: ControlBox[];
  /** The rotate pair's shared pill; the ccw/cw boxes are its two halves. */
  rotatePill: { x: number; y: number; w: number; h: number };
  labels: ControlLabel[];
}

/** Largest control button, the design sheet's 64 px bar. */
export const CONTROL_MAX = 64;
/** Least room between a control and the board's tray (which overhangs the board by 8). */
export const RAIL_GAP = 22;

const flipAlign = (a: CanvasTextAlign): CanvasTextAlign => (a === "left" ? "right" : a === "right" ? "left" : a);

/** The same rail mirrored about the vertical centre line of a viewport `w` wide. */
export function mirrorRail(r: HudRail, w: number): HudRail {
  const m = (x: number) => w - x;
  return {
    ...r,
    cx: m(r.cx),
    holdLabelX: m(r.holdLabelX),
    holdLabelAlign: flipAlign(r.holdLabelAlign),
    soundX: m(r.soundX),
    scoreCx: m(r.scoreCx),
    pillCx: m(r.pillCx),
    ring: { ...r.ring, cx: m(r.ring.cx) },
    goalCapX: m(r.goalCapX),
    goalAlign: flipAlign(r.goalAlign),
    starsX: m(r.starsX),
    starStep: -r.starStep,
    popsCx: m(r.popsCx),
    goalX: m(r.goalX),
    side: -r.side as 1 | -1,
  };
}

export function mirrorControls(c: Controls, w: number): Controls {
  const m = (x: number) => w - x;
  // Mirroring moves the rotate pill, but turn-left stays on the left half of it.
  const ccw = c.buttons.find((b) => b.kind === "ccw");
  const cw = c.buttons.find((b) => b.kind === "cw");
  const swap = (b: ControlBox): number => (b.kind === "ccw" && cw ? cw.cx : b.kind === "cw" && ccw ? ccw.cx : b.cx);
  return {
    buttons: c.buttons.map((b) => ({ ...b, cx: m(swap(b)) })),
    rotatePill: { ...c.rotatePill, x: m(c.rotatePill.x + c.rotatePill.w) },
    labels: c.labels.map((l) => ({ ...l, x: m(l.x) })),
  };
}

/** Diameter of the big controls for this layout. */
export function controlSize(l: Layout): number {
  if (l.portrait) return Math.min(CONTROL_MAX, l.hudBottom * 0.5);
  return Math.min(CONTROL_MAX + 8, l.railW * 0.5, l.vp.h / 6.5);
}

function landscapeRail(l: Layout): HudRail {
  const h = l.cellH;
  const y0 = l.stackY;
  const y1 = l.stackY + l.boardH;
  const cx = l.boardX - l.railW / 2;
  const textSize = Math.max(12, l.railW * 0.13);
  const ringR = Math.min(l.railW * 0.17, h * 0.6);
  // A wide rail puts the caption beside the ring; a narrow one stacks it underneath so nothing runs into the board.
  const beside = l.railW >= 200;
  const ring = { cx: beside ? cx - l.railW * 0.22 : cx, cy: y0 + h * (beside ? 4.1 : 3.95), r: ringR };
  const slot = Math.min(l.cellW * 0.85, l.railW * 0.42);
  const d = controlSize(l);
  const pauseCx = l.boardX + l.boardW + l.railW - 16 - d * 0.4;
  return {
    cx: cx - l.railW * 0.17,
    holdY: y0 + h * 6.1,
    slot,
    holdLabelX: cx - l.railW * 0.17 + slot / 2 + 10,
    holdLabelY: y0 + h * 6.1 + slot * 0.3,
    holdLabelAlign: "left",
    soundX: pauseCx - d * 0.8,
    soundY: y0 + 16 + d * 0.4,
    scoreCx: cx,
    scoreCapY: y0 + h * 0.55,
    scoreY: y0 + h * 1.25,
    meterW: l.railW * 0.7,
    chainY: y0 + h * 1.85,
    pillCx: cx,
    pillW: l.railW * 0.92,
    levelY: y0 + h * 2.85,
    ring,
    goalCapX: beside ? ring.cx + ringR + 12 : cx,
    goalCapY: beside ? ring.cy - ringR * 0.45 : ring.cy + ringR + textSize * 0.75,
    goalY: beside ? ring.cy + ringR * 0.2 : ring.cy + ringR + textSize * 1.65,
    goalAlign: beside ? "left" : "center",
    starsX: beside ? ring.cx - ringR + textSize * 0.45 : cx - textSize * 2.2,
    starsY: beside ? ring.cy + ringR + textSize * 0.9 : ring.cy + ringR + textSize * 2.6,
    starStep: textSize * 1.1,
    popsCx: cx,
    popsCapY: y1 - h * 1.1,
    popsY: y1 - h * 0.45,
    goalX: cx,
    goalLabelY: y0 + h * 6.25,
    textSize,
    side: 1,
  };
}

function portraitRail(l: Layout): HudRail {
  const vp = l.vp;
  const yT = l.hudTopY;
  const m = 16;
  const d = controlSize(l);
  const textSize = Math.max(12, 160 * 0.13);
  const colW = 140;
  const ringR = 24;
  const ring = { cx: vp.w - m - ringR - 2, cy: yT + 118, r: ringR };
  const pillW = 168;
  const slot = Math.min(56, d * 0.9);
  const yB = l.hudBottomY + 12 + d / 2;
  const pauseCx = vp.w - m - d * 0.4;
  // The band hangs off the viewport edge, not the board: a squarer screen has a narrower board that would push it into the ring.
  const left = m;
  return {
    cx: l.boardX + slot / 2,
    holdY: yB,
    slot,
    holdLabelX: l.boardX + slot / 2,
    holdLabelY: yB + d / 2 + 14,
    holdLabelAlign: "center",
    soundX: pauseCx - d * 0.8,
    soundY: yT + 36,
    scoreCx: left + colW / 2,
    scoreCapY: yT + 18,
    scoreY: yT + 50,
    meterW: colW - 10,
    chainY: yT + 80,
    pillCx: left + pillW / 2,
    pillW,
    levelY: yT + 120,
    ring,
    goalCapX: ring.cx - ringR - 12,
    goalCapY: ring.cy - 9,
    goalY: ring.cy + 9,
    goalAlign: "right",
    starsX: left + pillW + 14 + textSize * 0.45,
    starsY: yT + 120,
    starStep: textSize * 1.1,
    popsCx: vp.w / 2,
    popsCapY: yT + 64,
    popsY: yT + 90,
    goalX: vp.w / 2,
    goalLabelY: yB - 10,
    textSize,
    side: 1,
  };
}

/** HUD geometry for a generated theme; `leftHanded` mirrors it. */
export function hudRail(l: Layout, leftHanded = false): HudRail {
  const r = l.portrait ? portraitRail(l) : landscapeRail(l);
  return leftHanded ? mirrorRail(r, l.vp.w) : r;
}

function landscapeControls(l: Layout, r: HudRail): Controls {
  const d = controlSize(l);
  const cx = l.boardX + l.boardW + l.railW / 2;
  const y0 = l.stackY;
  const y1 = l.stackY + l.boardH;
  const margin = 16;
  const pauseCx = l.boardX + l.boardW + l.railW - margin - d * 0.4;
  const hurryCy = y1 - margin - 16 - d / 2;
  // The tray overhangs the board by 8; keep the pill well clear of it.
  const pillW = Math.min(l.railW - 2 * RAIL_GAP, d * 2.7);
  const pillH = d * 0.8;
  const pillCy = hurryCy - d / 2 - 28 - pillH / 2;
  return {
    buttons: [
      { kind: "pause", cx: pauseCx, cy: y0 + margin + d * 0.4, w: d * 0.8, h: d * 0.8 },
      { kind: "sound", cx: r.soundX, cy: r.soundY, w: d * 0.6, h: d * 0.6 },
      { kind: "ccw", cx: cx - pillW / 4, cy: pillCy, w: pillW / 2, h: pillH },
      { kind: "cw", cx: cx + pillW / 4, cy: pillCy, w: pillW / 2, h: pillH },
      { kind: "speed", cx, cy: hurryCy, w: d, h: d },
    ],
    rotatePill: { x: cx - pillW / 2, y: pillCy - pillH / 2, w: pillW, h: pillH },
    labels: [{ text: "HOLD TO HURRY", x: cx, y: y1 - margin + 4 }],
  };
}

function portraitControls(l: Layout, r: HudRail): Controls {
  const vp = l.vp;
  const d = controlSize(l);
  const m = 16;
  const yB = r.holdY;
  const labelY = r.holdLabelY;
  const hurryCx = vp.w - m - d / 2;
  const left = r.cx + r.slot / 2 + 18;
  const right = hurryCx - d / 2 - 18;
  const pillW = Math.min(300, right - left);
  const pillCx = (left + right) / 2;
  const pauseCx = vp.w - m - d * 0.4;
  return {
    buttons: [
      { kind: "pause", cx: pauseCx, cy: r.soundY, w: d * 0.8, h: d * 0.8 },
      { kind: "sound", cx: r.soundX, cy: r.soundY, w: d * 0.6, h: d * 0.6 },
      { kind: "ccw", cx: pillCx - pillW / 4, cy: yB, w: pillW / 2, h: d },
      { kind: "cw", cx: pillCx + pillW / 4, cy: yB, w: pillW / 2, h: d },
      { kind: "speed", cx: hurryCx, cy: yB, w: d, h: d },
    ],
    rotatePill: { x: pillCx - pillW / 2, y: yB - d / 2, w: pillW, h: d },
    labels: [
      { text: "ROTATE", x: pillCx, y: labelY },
      { text: "HURRY", x: hurryCx, y: labelY },
    ],
  };
}

/** Control geometry for a generated theme, matching `hudRail` for the same layout and hand. */
export function hudControls(l: Layout, leftHanded = false): Controls {
  const r = l.portrait ? portraitRail(l) : landscapeRail(l);
  const c = l.portrait ? portraitControls(l, r) : landscapeControls(l, r);
  return leftHanded ? mirrorControls(c, l.vp.w) : c;
}
