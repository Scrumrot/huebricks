import type { GameContext } from "../scenes/Scene";
import type { ButtonFeel } from "./buttonFeel";
import { drawText, fillRoundRect } from "./draw";

/**
 * The sound controls shared by the title's settings card and the pause card:
 * a round speaker toggle and Music / Effects sliders. The caller lays them
 * out in a rectangle; the controls handle their own dragging and persist
 * through the context.
 */

type SliderId = "music" | "sfx";

export interface Slider {
  id: SliderId;
  label: string;
  x: number;
  y: number;
  w: number;
}

export interface SoundLayout {
  toggle: { cx: number; cy: number; d: number };
  sliders: Slider[];
  /** Total height used. */
  h: number;
}

const TOGGLE_D = 36;
const LABEL_W = 46;
const ROW_H = 36;

export class SoundControls {
  private dragging: SliderId | null = null;

  /** Fit the toggle and both sliders in `w` from (x, y): one row when it is wide enough, else the sliders stack under. */
  layout(x: number, y: number, w: number): SoundLayout {
    const toggle = { cx: x + TOGGLE_D / 2, cy: y + ROW_H / 2, d: TOGGLE_D };
    const left = x + TOGGLE_D + 16;
    const avail = w - TOGGLE_D - 16;
    if (avail >= 300) {
      const each = (avail - 20) / 2;
      const sw = each - LABEL_W;
      return {
        toggle,
        sliders: [
          { id: "music", label: "Music", x: left + LABEL_W, y: y + ROW_H / 2, w: sw },
          { id: "sfx", label: "Effects", x: left + each + 20 + LABEL_W, y: y + ROW_H / 2, w: sw },
        ],
        h: ROW_H,
      };
    }
    const sw = avail - LABEL_W;
    return {
      toggle,
      sliders: [
        { id: "music", label: "Music", x: left + LABEL_W, y: y + ROW_H / 2, w: sw },
        { id: "sfx", label: "Effects", x: left + LABEL_W, y: y + ROW_H * 1.5, w: sw },
      ],
      h: ROW_H * 2,
    };
  }

  get busy(): boolean {
    return this.dragging !== null;
  }

  /** Handle this step's input. Returns true when the pointer did something here, so the caller skips its own hit tests. */
  update(ctx: GameContext, L: SoundLayout): boolean {
    const inp = ctx.input;
    const audio = ctx.audio;
    if (inp.pressed) {
      this.dragging = null;
      for (const sl of L.sliders) if (inp.inRect(sl.x - 12, sl.y - 16, sl.w + 24, 32)) this.dragging = sl.id;
    }
    if ((inp.down || inp.pressed) && this.dragging) {
      const sl = L.sliders.find((q) => q.id === this.dragging)!;
      const v = Math.max(0, Math.min(1, (inp.x - sl.x) / sl.w));
      if (sl.id === "music") {
        ctx.save.music = v;
        audio.setMusicVolume(v);
      } else {
        ctx.save.sfx = v;
        audio.setSfxVolume(v);
      }
      return true;
    }
    if (inp.released) {
      if (this.dragging) {
        if (this.dragging === "sfx") audio.play("BlocksSelection_snd");
        this.dragging = null;
        ctx.persist();
        return true;
      }
      if (inp.inCentered(L.toggle.cx, L.toggle.cy, L.toggle.d, L.toggle.d)) {
        ctx.save.muted = audio.toggleMute();
        ctx.persist();
        if (!audio.muted) audio.play("menuselect_snd");
        return true;
      }
    }
    return false;
  }

  render(g: CanvasRenderingContext2D, ctx: GameContext, L: SoundLayout, feel: ButtonFeel): void {
    const pal = ctx.palette;
    const inp = ctx.input;
    const muted = ctx.audio.muted;
    const tg = L.toggle;
    const hover = inp.inCentered(tg.cx, tg.cy, tg.d, tg.d) && inp.x >= 0;
    const scale = feel.scale("sound:toggle", hover, hover && inp.down);
    const d = tg.d * scale;
    fillRoundRect(g, tg.cx - d / 2, tg.cy - d / 2, d, d, d / 2, muted ? pal.ui.secondary : pal.ui.primary, muted ? pal.ui.secondaryEdge : undefined, 1.5);
    drawSpeaker(g, tg.cx, tg.cy, d * 0.22, muted ? pal.ui.secondaryText : pal.ui.primaryText, muted);
    for (const sl of L.sliders) {
      const v = sl.id === "music" ? ctx.save.music : ctx.save.sfx;
      drawText(g, sl.label, sl.x - 8, sl.y, { size: 13, color: pal.overlayText, weight: 700, align: "right" });
      g.save();
      g.globalAlpha = muted ? 0.45 : 1;
      fillRoundRect(g, sl.x, sl.y - 3, sl.w, 6, 3, pal.track);
      fillRoundRect(g, sl.x, sl.y - 3, Math.max(6, sl.w * v), 6, 3, pal.ui.primary);
      const kx = sl.x + sl.w * v;
      const active = this.dragging === sl.id;
      fillRoundRect(g, kx - 8, sl.y - 8, 16, 16, 8, pal.ui.card, pal.ui.primary, active ? 3 : 2);
      g.restore();
    }
  }
}

/** A speaker glyph: body, cone and two sound arcs, or a cross when muted. */
export function drawSpeaker(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, muted: boolean): void {
  g.save();
  g.translate(cx, cy);
  g.fillStyle = color;
  g.strokeStyle = color;
  g.lineWidth = Math.max(1.5, r * 0.28);
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(-r, -r * 0.45);
  g.lineTo(-r * 0.45, -r * 0.45);
  g.lineTo(r * 0.15, -r);
  g.lineTo(r * 0.15, r);
  g.lineTo(-r * 0.45, r * 0.45);
  g.lineTo(-r, r * 0.45);
  g.closePath();
  g.fill();
  if (muted) {
    g.beginPath();
    g.moveTo(r * 0.5, -r * 0.45);
    g.lineTo(r * 1.15, r * 0.45);
    g.moveTo(r * 1.15, -r * 0.45);
    g.lineTo(r * 0.5, r * 0.45);
    g.stroke();
  } else {
    g.beginPath();
    g.arc(r * 0.2, 0, r * 0.6, -Math.PI / 3.2, Math.PI / 3.2);
    g.stroke();
    g.beginPath();
    g.arc(r * 0.2, 0, r * 1.05, -Math.PI / 3.2, Math.PI / 3.2);
    g.stroke();
  }
  g.restore();
}
