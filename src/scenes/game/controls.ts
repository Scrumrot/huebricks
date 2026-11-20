/**
 * The side controls (`RotateUI`, `SpeedUI`, `PauseUI` and the sound button):
 * sprite buttons on classic, and on the generated themes a segmented rotate
 * pill, a charging ring around the hurry button and small captions.
 */
import type { SpriteName } from "../../engine/assets";
import type { ButtonFeel } from "../../engine/buttonFeel";
import { drawSprite, drawText, fillRoundRect, pillRadius } from "../../engine/draw";
import type { ControlKind, Controls } from "../../engine/hudLayout";
import { ICONS } from "../../engine/icons";
import type { Palette } from "../../engine/theme";
import type { GameContext } from "../Scene";

export interface SideButton {
  kind: ControlKind;
  sprite: SpriteName;
  baseFrame: number;
  cx: number;
  cy: number;
  w: number;
  h: number;
  hilite: boolean;
  pressed: boolean;
}

/** The sprite and frame each control wears on the generated themes. */
export const CONTROL_ART: Record<ControlKind, { sprite: SpriteName; frame: number }> = {
  pause: { sprite: "pause_button_sprite", frame: 0 },
  sound: { sprite: "sound_button_sprite", frame: 0 },
  ccw: { sprite: "rotate_button_sprite", frame: 0 },
  cw: { sprite: "rotate_button_sprite", frame: 2 },
  speed: { sprite: "speedup_button_sprite", frame: 0 },
};

/** The rotate pair as one segmented control: turn left, the board, turn right. */
function drawRotatePill(
  g: CanvasRenderingContext2D,
  pal: Palette,
  feel: ButtonFeel,
  buttons: SideButton[],
  pill: { x: number; y: number; w: number; h: number },
): void {
  const ui = pal.ui;
  const r = pillRadius(ui, pill.h);
  fillRoundRect(g, pill.x, pill.y + 3, pill.w, pill.h, r, ui.cardShadow);
  fillRoundRect(g, pill.x, pill.y, pill.w, pill.h, r, ui.card, ui.cardEdge, 1.5);
  g.save();
  g.beginPath();
  g.roundRect(pill.x, pill.y, pill.w, pill.h, r);
  g.clip();
  for (const btn of buttons) {
    if (btn.kind !== "ccw" && btn.kind !== "cw") continue;
    if (btn.hilite || btn.pressed) {
      g.fillStyle = btn.pressed ? ui.secondaryEdge : ui.secondary;
      g.fillRect(btn.cx - btn.w / 2, pill.y, btn.w, pill.h);
    }
  }
  g.restore();
  g.fillStyle = ui.cardEdge;
  g.fillRect(pill.x + pill.w / 2 - 0.5, pill.y + pill.h * 0.22, 1, pill.h * 0.56);
  for (const btn of buttons) {
    if (btn.kind !== "ccw" && btn.kind !== "cw") continue;
    const scale = feel.scale(btn.kind, btn.hilite, btn.pressed);
    g.save();
    g.strokeStyle = ui.secondaryText;
    g.fillStyle = ui.secondaryText;
    ICONS[btn.kind === "cw" ? "rotateCw" : "rotateCcw"](g, btn.cx, btn.cy, pill.h * 0.25 * scale);
    g.restore();
  }
}

/**
 * A ring that charges around the hurry button while it is held (or Space /
 * down is down): the replenish line's acceleration made visible, so the
 * button explains that it wants to be held rather than tapped.
 */
function drawHurryRing(g: CanvasRenderingContext2D, pal: Palette, btn: SideButton, scale: number, accel: number, t: number): void {
  const charge = (accel - 1) / 3;
  if (charge <= 0.001) return;
  const lw = Math.max(2, btn.w * 0.07);
  const radius = (btn.w * scale) / 2 + lw * 0.9;
  const full = charge >= 0.999;
  const pulse = full ? 0.85 + 0.15 * Math.sin(t / 90) : 1;
  g.save();
  g.lineWidth = lw;
  g.lineCap = "round";
  g.strokeStyle = pal.multColors[Math.min(pal.multColors.length - 1, 3)];
  g.globalAlpha = pulse;
  if (pal.glow) {
    g.shadowColor = g.strokeStyle;
    g.shadowBlur = lw * 2;
  }
  g.beginPath();
  g.arc(btn.cx, btn.cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, charge));
  g.stroke();
  g.restore();
}

/** A small keycap, for the hold slot once a keyboard has been used. */
export function drawKeycap(g: CanvasRenderingContext2D, pal: Palette, key: string, cx: number, cy: number): void {
  const ui = pal.ui;
  fillRoundRect(g, cx - 11, cy - 9, 22, 18, 5, ui.card, ui.cardEdge, 1);
  drawText(g, key, cx, cy + 1, { size: 11, color: pal.overlayText, weight: 700 });
}

/**
 * All the side controls. `controls` is the generated themes' pill and label
 * geometry (null on classic); `labelSize` their caption size; `accel` the
 * hurry multiplier that charges the ring.
 */
export function drawControls(
  g: CanvasRenderingContext2D,
  ctx: GameContext,
  feel: ButtonFeel,
  buttons: SideButton[],
  controls: Controls | null,
  labelSize: number,
  accel: number,
): void {
  const sp = ctx.sprites;
  const pal = ctx.palette;
  const generated = pal.kind === "generated";
  if (generated && controls) drawRotatePill(g, pal, feel, buttons, controls.rotatePill);
  for (const btn of buttons) {
    if (btn.kind === "sound") btn.baseFrame = ctx.audio.muted ? 2 : 0;
    if (generated && (btn.kind === "ccw" || btn.kind === "cw")) continue;
    const sprite = sp[btn.sprite];
    const maxFrame = sprite.frames.length - 1;
    const scale = feel.scale(btn.kind, btn.hilite, btn.pressed);
    const frame = btn.pressed ? Math.min(maxFrame, btn.baseFrame + 1) : btn.baseFrame;
    drawSprite(g, sprite, frame, btn.cx - (btn.w * scale) / 2, btn.cy - (btn.h * scale) / 2, btn.w * scale, btn.h * scale);
    if (btn.kind === "speed" && generated) drawHurryRing(g, pal, btn, scale, accel, ctx.clock.t);
  }
  if (generated && controls) {
    for (const lb of controls.labels) drawText(g, lb.text, lb.x, lb.y, { size: labelSize, color: pal.hudMuted, weight: 700 });
  }
}
