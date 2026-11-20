/**
 * The pause card (`STATE_MENU` of the original `PauseUI`, grown): resume,
 * restart and quit with a one-tap confirm, a theme strip with an "all
 * themes" page, the sound controls, the keyboard hints once a key has been
 * used, and a how-to-play page of the tutorial slides. It owns its pages
 * and answers the scene with one action per step.
 */
import type { GameType } from "../../core/constants";
import type { ButtonFeel } from "../../engine/buttonFeel";
import { drawCard, drawPillButton, drawText, fillRoundRect, measureText, pillRadius, type PillButton } from "../../engine/draw";
import { drawKeycaps } from "../../engine/keycaps";
import { drawModeGlyph, MODE_COLOR, modeLabel } from "../../engine/modeGlyph";
import { drawSlides, slideNav, slideRect } from "../../engine/slides";
import { SoundControls, type SoundLayout } from "../../engine/soundControls";
import { THEME_ORDER } from "../../engine/theme";
import { drawSwatch, fitSwatch, gridHeight, layoutGrid, layoutStrip, stripThemes, swatchAt, type Swatch } from "../../engine/themePicker";
import type { GameContext } from "../Scene";

export type PausePage = "main" | "themes" | "help";
export type PauseAction = "none" | "resume" | "restart" | "quit";

/** What the card says about the game under it. */
export interface PauseInfo {
  gameType: GameType;
  world: number;
  level: number;
  score: number;
  /** "9 pops to go" or "12 bricks left". */
  goal: string;
  /** A key has been used this run, so the keycap hints are worth showing. */
  keyboardUsed: boolean;
}

/** Where everything on the pause card sits this frame (already shifted by the slide-in offset). */
export interface PauseLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  resume: PillButton;
  restart: PillButton;
  quit: PillButton;
  keep: PillButton;
  strip: Swatch[];
  all: { cx: number; cy: number; w: number; h: number };
  sound: SoundLayout;
  keycapsY: number;
  help: { cx: number; cy: number; d: number };
}

interface ThemesLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  size: number;
  gap: number;
  rowGap: number;
  back: PillButton;
}

const KEYCAPS = [
  { key: "Q E", label: "rotate" },
  { key: "H", label: "hold" },
  { key: "Space", label: "hurry" },
  { key: "T", label: "theme" },
  { key: "Esc", label: "resume" },
];

export class PauseCard {
  page: PausePage = "main";
  /** Quit was tapped once; the next tap quits. */
  confirmQuit = false;
  private helpSlide = 0;
  private swatches: Swatch[] = [];
  private readonly sound = new SoundControls();

  /** Back to the main page with nothing armed, as the card opens. */
  open(): void {
    this.page = "main";
    this.confirmQuit = false;
  }

  /** Esc: a sub-page steps back to the card. True when the card stays open. */
  back(): boolean {
    this.confirmQuit = false;
    if (this.page === "main") return false;
    this.page = "main";
    return true;
  }

  layout(ctx: GameContext, off: number, keyboardUsed: boolean): PauseLayout {
    const vp = ctx.view;
    const w = Math.min(460, vp.w - 24);
    const x = vp.w / 2 - w / 2;
    const inner = w - 48;
    const probe = this.sound.layout(0, 0, inner);
    const h = 300 + probe.h + (keyboardUsed ? 30 : 0) + 18;
    const y = Math.max(8, vp.h / 2 - h / 2) + off;
    const bw = (inner - 12) / 2;
    const size = 44;
    const count = w >= 440 ? 6 : 5;
    return {
      x,
      y,
      w,
      h,
      resume: { id: "resume", label: "Resume", cx: vp.w / 2, cy: y + 96, w: inner, h: 44, primary: true },
      restart: { id: "restart", label: "Restart level", cx: x + 24 + bw / 2, cy: y + 150, w: bw, h: 40 },
      quit: {
        id: "quit",
        label: this.confirmQuit ? "Yes, quit" : "Quit to title",
        cx: x + 24 + bw + 12 + bw / 2,
        cy: y + 150,
        w: bw,
        h: 40,
        primary: this.confirmQuit,
      },
      keep: { id: "keep", label: "Keep playing", cx: x + 24 + bw / 2, cy: y + 150, w: bw, h: 40 },
      strip: layoutStrip(stripThemes(ctx.palette.name, count), x + 24, y + 212, inner - 72, size, 10),
      all: { cx: x + w - 24 - 30, cy: y + 212 + size / 2, w: 64, h: 30 },
      sound: this.sound.layout(x + 24, y + 300, inner),
      keycapsY: y + 300 + probe.h + 22,
      help: { cx: x + w - 30, cy: y + 30, d: 30 },
    };
  }

  private themesLayout(ctx: GameContext): ThemesLayout {
    const vp = ctx.view;
    const w = Math.min(600, vp.w - 24);
    const gap = 10;
    const size = fitSwatch(THEME_ORDER.length, w - 48, vp.h - 16 - (62 + 24 + 62), vp.w < 440 ? 50 : 56, gap, 0.64);
    const rowGap = size * 0.64;
    const gridH = gridHeight(THEME_ORDER.length, w - 48, size, gap, rowGap);
    const h = 62 + gridH + 24 + 62;
    const x = vp.w / 2 - w / 2;
    const y = Math.max(8, vp.h / 2 - h / 2);
    return { x, y, w, h, size, gap, rowGap, back: { id: "back", label: "Back", cx: vp.w / 2, cy: y + h - 34, w: 140, h: 38, primary: true } };
  }

  /** Something under the pointer would take a tap. */
  hovering(ctx: GameContext, off: number, info: PauseInfo): boolean {
    const inp = ctx.input;
    if (this.page === "help") return true;
    if (this.page === "themes") {
      const T = this.themesLayout(ctx);
      return swatchAt(this.swatches, inp.x, inp.y) !== null || inp.inCentered(T.back.cx, T.back.cy, T.back.w, T.back.h);
    }
    const L = this.layout(ctx, off, info.keyboardUsed);
    const pills = this.confirmQuit ? [L.resume, L.keep, L.quit] : [L.resume, L.restart, L.quit];
    return (
      pills.some((b) => inp.inCentered(b.cx, b.cy, b.w, b.h)) ||
      swatchAt(L.strip, inp.x, inp.y) !== null ||
      inp.inCentered(L.all.cx, L.all.cy, L.all.w, L.all.h) ||
      inp.inCentered(L.help.cx, L.help.cy, L.help.d, L.help.d) ||
      inp.inCentered(L.sound.toggle.cx, L.sound.toggle.cy, L.sound.toggle.d, L.sound.toggle.d)
    );
  }

  /** One step of input while the card is up. */
  update(ctx: GameContext, off: number, info: PauseInfo): PauseAction {
    if (this.page === "themes") {
      this.updateThemes(ctx);
      return "none";
    }
    if (this.page === "help") {
      this.updateHelp(ctx);
      return "none";
    }
    const inp = ctx.input;
    const L = this.layout(ctx, off, info.keyboardUsed);
    if (this.sound.update(ctx, L.sound)) return "none";
    if (!inp.released) return "none";
    const hit = (b: { cx: number; cy: number; w: number; h: number }) => inp.inCentered(b.cx, b.cy, b.w, b.h);
    const sw = swatchAt(L.strip, inp.x, inp.y);
    if (sw) {
      if (sw.name !== ctx.palette.name) {
        ctx.audio.event("tap");
        ctx.setTheme(sw.name);
      }
      return "none";
    }
    if (hit(L.resume)) {
      ctx.audio.event("tap");
      this.confirmQuit = false;
      return "resume";
    }
    if (this.confirmQuit && hit(L.quit)) {
      ctx.audio.event("tap");
      return "quit";
    }
    if (this.confirmQuit && hit(L.keep)) {
      ctx.audio.event("tap");
      this.confirmQuit = false;
    } else if (!this.confirmQuit && hit(L.quit)) {
      ctx.audio.event("tap");
      this.confirmQuit = true;
    } else if (!this.confirmQuit && hit(L.restart)) {
      ctx.audio.event("tap");
      return "restart";
    } else if (hit(L.all)) {
      ctx.audio.event("tap");
      this.page = "themes";
      const T = this.themesLayout(ctx);
      this.swatches = layoutGrid(THEME_ORDER, T.x + 24, T.y + 62, T.w - 48, T.size, T.gap, T.rowGap);
    } else if (hit({ cx: L.help.cx, cy: L.help.cy, w: L.help.d, h: L.help.d })) {
      ctx.audio.event("tap");
      this.page = "help";
      this.helpSlide = 0;
    }
    return "none";
  }

  private updateThemes(ctx: GameContext): void {
    const inp = ctx.input;
    const T = this.themesLayout(ctx);
    if (inp.keysPressed.has("Enter")) {
      this.page = "main";
      return;
    }
    if (!inp.released) return;
    const sw = swatchAt(this.swatches, inp.x, inp.y);
    if (sw) {
      if (sw.name !== ctx.palette.name) {
        ctx.audio.event("tap");
        ctx.setTheme(sw.name);
      }
      return;
    }
    if (inp.inCentered(T.back.cx, T.back.cy, T.back.w, T.back.h) || !inp.inRect(T.x, T.y, T.w, T.h)) {
      ctx.audio.event("tap");
      this.page = "main";
    }
  }

  /** The how-to-play slides; the last "next" and a "back" on the first return to the card. */
  private updateHelp(ctx: GameContext): void {
    const slides = ctx.sprites.tutorial_intro_sprite;
    const nav = slideNav(ctx.input, slideRect(ctx.view));
    if (!nav) return;
    ctx.audio.event("tap");
    if (nav === "next") {
      if (this.helpSlide < slides.frames.length - 1) this.helpSlide++;
      else this.page = "main";
    } else if (this.helpSlide > 0) this.helpSlide--;
    else this.page = "main";
  }

  /** The card, over an already dimmed screen. */
  render(g: CanvasRenderingContext2D, ctx: GameContext, feel: ButtonFeel, off: number, info: PauseInfo): void {
    if (this.page === "help") {
      drawSlides(g, ctx.sprites, ctx.input, feel, slideRect(ctx.view), ctx.sprites.tutorial_intro_sprite, this.helpSlide, true);
      return;
    }
    if (this.page === "themes") {
      this.renderThemes(g, ctx, feel);
      return;
    }
    const pal = ctx.palette;
    const inp = ctx.input;
    const vp = ctx.view;
    const L = this.layout(ctx, off, info.keyboardUsed);
    const pill = (b: PillButton, feelId: string) => {
      const hover = inp.inCentered(b.cx, b.cy, b.w, b.h) && inp.x >= 0;
      const pressed = hover && inp.down;
      b.scale = feel.scale(feelId, hover, pressed);
      drawPillButton(g, pal.ui, b, hover, pressed, pal.font);
    };
    drawCard(g, pal.ui, L.x, L.y, L.w, L.h, 20);
    drawText(g, "Paused", vp.w / 2, L.y + 36, { size: 28, color: pal.overlayText, weight: 600, font: pal.display });
    // mode glyph, level, score and what is left
    const sub = `${modeLabel(info.gameType)} ${info.world}-${info.level + 1}   ·   ${info.score}   ·   ${info.goal}`;
    const subStyle = { size: 13, color: pal.hudMuted, weight: 500, tabular: true };
    const tw = measureText(g, sub, subStyle);
    drawModeGlyph(g, info.gameType, vp.w / 2 - tw / 2 - 4, L.y + 62, 5, pal.brickColors[MODE_COLOR[info.gameType]], 1.8);
    drawText(g, sub, vp.w / 2 + 8, L.y + 62, subStyle);
    // help
    {
      const hv = inp.inCentered(L.help.cx, L.help.cy, L.help.d, L.help.d) && inp.x >= 0;
      const sc = feel.scale("menu:help", hv, hv && inp.down);
      const d = L.help.d * sc;
      fillRoundRect(
        g,
        L.help.cx - d / 2,
        L.help.cy - d / 2,
        d,
        d,
        pillRadius(pal.ui, d),
        hv ? pal.ui.secondaryHover : pal.ui.secondary,
        pal.ui.secondaryEdge,
        1.5,
      );
      drawText(g, "?", L.help.cx, L.help.cy + 1, { size: 15 * sc, color: pal.ui.secondaryText, weight: 800 });
    }
    pill(L.resume, "menu:resume");
    if (this.confirmQuit) {
      pill(L.keep, "menu:keep");
      pill(L.quit, "menu:quit");
      drawText(g, "Progress on this level is lost", vp.w / 2, L.y + 180, { size: 11, color: pal.overlayAccent, weight: 600 });
    } else {
      pill(L.restart, "menu:restart");
      pill(L.quit, "menu:quit");
    }
    fillRoundRect(g, L.x + 24, L.y + 189, L.w - 48, 1, 0, pal.ui.secondaryEdge);
    const caption = (txt: string, x: number, y: number) => drawText(g, txt, x, y, { size: 10, color: pal.hudMuted, weight: 700, align: "left" });
    caption("THEME", L.x + 24, L.y + 200);
    {
      const hv = inp.inCentered(L.all.cx, L.all.cy, L.all.w, L.all.h) && inp.x >= 0;
      drawText(g, `All ${THEME_ORDER.length}  ›`, L.x + L.w - 24, L.all.cy, {
        size: 12,
        color: hv ? pal.overlayText : pal.hudMuted,
        weight: 700,
        align: "right",
      });
    }
    for (const sw of L.strip) {
      const hv = swatchAt([sw], inp.x, inp.y) !== null && inp.x >= 0;
      drawSwatch(g, sw, pal, sw.name === pal.name, hv, feel.scale(`menu:sw:${sw.name}`, hv, hv && inp.down));
    }
    caption("SOUND", L.x + 24, L.y + 288);
    this.sound.render(g, ctx, L.sound, feel);
    if (info.keyboardUsed) drawKeycaps(g, pal, KEYCAPS, vp.w / 2, L.keycapsY);
  }

  private renderThemes(g: CanvasRenderingContext2D, ctx: GameContext, feel: ButtonFeel): void {
    const pal = ctx.palette;
    const inp = ctx.input;
    const T = this.themesLayout(ctx);
    drawCard(g, pal.ui, T.x, T.y, T.w, T.h, 20);
    drawText(g, "Theme", ctx.view.w / 2, T.y + 32, { size: 24, color: pal.overlayText, weight: 600, font: pal.display });
    for (const sw of this.swatches) {
      const hv = swatchAt([sw], inp.x, inp.y) !== null && inp.x >= 0;
      drawSwatch(g, sw, pal, sw.name === pal.name, hv, feel.scale(`menu:grid:${sw.name}`, hv, hv && inp.down));
    }
    const hover = inp.inCentered(T.back.cx, T.back.cy, T.back.w, T.back.h);
    T.back.scale = feel.scale("menu:back", hover, hover && inp.down);
    drawPillButton(g, pal.ui, T.back, hover, hover && inp.down, pal.font);
  }
}
