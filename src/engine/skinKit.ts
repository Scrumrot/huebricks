import { BLACK, BLUE, GREEN, ORANGE, PURPLE, RED, YELLOW, type Color } from "../core/color";
import { SPRITE_FRAMES, type Sprite, type SpriteMap, type SpriteName } from "./assets";
import { chevronUp, gearIcon, polygon, rgba, rotateIcon, roundRect, speakerIcon, sprite, text, type Ctx } from "./modernSkin";
import { buildTutorialSlides, type SlideStyle } from "./modernSlides";

/**
 * Shared scaffolding for generated themes. A theme supplies its tile, glyph
 * and button drawers plus a few colours and the kit builds the whole sprite
 * set from them: bricks, selector, side buttons, progress bar, cards, logo,
 * menu, mode and world buttons, credits and tutorial slides.
 */

export type Glyph = "octagon" | "diamond" | "circle";

export const GLYPHS: Record<Color, Glyph[]> = {
  1: ["octagon"],
  2: ["diamond"],
  3: ["diamond", "octagon"],
  4: ["circle"],
  5: ["octagon", "circle"],
  6: ["circle", "diamond"],
  7: ["octagon", "diamond", "circle"],
};

export function glyphPath(g: Ctx, glyph: Glyph, cx: number, cy: number, r: number): void {
  switch (glyph) {
    case "octagon":
      polygon(g, cx, cy, r, 8, Math.PI / 8);
      break;
    case "diamond":
      polygon(g, cx, cy, r, 4, 0);
      break;
    case "circle":
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      break;
  }
}

/** Deterministic RNG so baked art looks the same every build. */
export function seeded(seed: number): () => number {
  let s = (seed * 9301 + 49297) % 233280;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export interface GlyphLook {
  stroke: string;
  /** Fill of the innermost shape on mixed colours. */
  fill: string;
  /** Offset shadow pass under the strokes, or null. */
  shadow?: string | null;
  glow?: string | null;
  width?: number;
}

/** A glyph drawer in the house style: outlined shapes, innermost filled on mixes. */
export function makeGlyphs(look: GlyphLook): (g: Ctx, color: Color, cx: number, cy: number, size: number) => void {
  return (g, color, cx, cy, size) => {
    const glyphs = GLYPHS[color];
    const radii = glyphs.length === 1 ? [0.25] : glyphs.length === 2 ? [0.28, 0.16] : [0.3, 0.19, 0.1];
    g.save();
    g.lineJoin = "round";
    g.lineCap = "round";
    g.lineWidth = size * (look.width ?? 0.04);
    if (look.shadow) {
      g.strokeStyle = look.shadow;
      glyphs.forEach((gl, i) => {
        glyphPath(g, gl, cx + size * 0.01, cy + size * 0.014, size * radii[i]);
        g.stroke();
      });
    }
    g.strokeStyle = look.stroke;
    g.fillStyle = look.fill;
    if (look.glow) {
      g.shadowColor = look.glow;
      g.shadowBlur = size * 0.08;
    }
    glyphs.forEach((gl, i) => {
      glyphPath(g, gl, cx, cy, size * radii[i]);
      if (glyphs.length > 1 && i === glyphs.length - 1) g.fill();
      g.stroke();
    });
    g.restore();
  };
}

export type TileFn = (g: Ctx, x: number, y: number, w: number, h: number, base: string, opts?: { radius?: number; lift?: number; plain?: boolean; seed?: number }) => void;
export type IconFn = (g: Ctx, cx: number, cy: number, r: number) => void;
export type ButtonFn = (g: Ctx, w: number, h: number, pressed: boolean, icon: IconFn) => void;

export interface SkinSpec {
  colors: Record<Color, string>;
  /** Eighth no-icon frame and the tutorial world tile. */
  neutral: string;
  bg: string;
  text: string;
  muted: string;
  font: string;
  display: string;
  tile: TileFn;
  glyphs: (g: Ctx, color: Color, cx: number, cy: number, size: number) => void;
  button: ButtonFn;
  /** Card / panel used for level complete, level select and credits. */
  panel: (g: Ctx, x: number, y: number, w: number, h: number, r: number) => void;
  logo: (g: Ctx, frame: number, w: number, h: number) => void;
  menuFrame: (g: Ctx, w: number, h: number) => void;
  /** Mode button; the default is a tile pill with a glyph and label. */
  modeButton?: (g: Ctx, frame: number, w: number, h: number, label: string, base: string, glyph: Glyph) => void;
  /** Text on world tiles. */
  worldText: string;
  worldTextShadow: string;
  /** Soft shadow sprite colour (chip-style themes), or null for none. */
  shadow: string | null;
  /** Coloured glow sprite under bricks (gel-style themes). */
  glow: boolean;
  /** Selector ring: glowing colour ring, or an ink ring with a white edge. */
  selector: "glow" | "ink";
  /** Ring colour for the white (any colour) selector frame. */
  selectorNeutral: string;
  progress: [string, string];
  /** Pop sprite frame; `t` runs 0..1 over the animation. */
  pop: (g: Ctx, t: number, w: number, h: number) => void;
  /** Colour of the cross on the muted speaker. */
  mute: string;
  /** Empty replenish slot. */
  well: (g: Ctx, x: number, y: number, w: number, h: number) => void;
  slides: SlideStyle;
}

const S = 256;
const PAD = 0.04;

function blank(name: SpriteName): Sprite {
  return sprite(name, 8, 8, () => undefined);
}

function flat(name: SpriteName, color: string): Sprite {
  return sprite(name, 16, 16, (g, _i, w, h) => {
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
  });
}

function modeGlyphDefault(g: Ctx, glyph: Glyph, cx: number, cy: number, r: number): void {
  g.save();
  g.lineWidth = r * 0.2;
  g.lineJoin = "round";
  g.strokeStyle = "rgba(0,0,0,0.2)";
  glyphPath(g, glyph, cx + r * 0.05, cy + r * 0.07, r);
  g.stroke();
  g.strokeStyle = "#FFFFFF";
  glyphPath(g, glyph, cx, cy, r);
  g.stroke();
  g.restore();
}

/** Build a theme's whole sprite set from its spec, falling back to classic sprites where no art exists. */
export function buildSkin(classic: SpriteMap, spec: SkinSpec): SpriteMap {
  const C = spec.colors;
  const noicon = [C[1], C[2], C[3], C[4], C[5], C[6], C[7], spec.neutral];
  const round = (name: SpriteName, draw: (g: Ctx, i: number, w: number, h: number) => void) => sprite(name, S, S, draw);

  const skin: Partial<SpriteMap> = {
    brick_sprite: round("brick_sprite", (g, i, w, h) => {
      const pad = w * PAD;
      spec.tile(g, pad, pad, w - pad * 2, h - pad * 2, C[(i + 1) as Color], { seed: 11 + i * 7 });
      spec.glyphs(g, (i + 1) as Color, w / 2, h / 2, w);
    }),
    brick_noicon_sprite: round("brick_noicon_sprite", (g, i, w, h) => {
      const pad = w * PAD;
      spec.tile(g, pad, pad, w - pad * 2, h - pad * 2, noicon[i], { seed: 31 + i * 5 });
    }),
    brick_glow_sprite: spec.glow
      ? round("brick_glow_sprite", (g, i, w, h) => {
          const pad = w * 0.26;
          const c = C[(i + 1) as Color];
          g.shadowColor = c;
          g.shadowBlur = w * 0.16;
          g.shadowOffsetX = w * 4;
          g.fillStyle = c;
          roundRect(g, pad - w * 4, pad, w - pad * 2, h - pad * 2, w * 0.14);
          g.fill();
        })
      : blank("brick_glow_sprite"),
    brick_shadow_sprite: spec.shadow
      ? round("brick_shadow_sprite", (g, _i, w, h) => {
          const pad = w * 0.14;
          g.shadowColor = spec.shadow!;
          g.shadowBlur = w * 0.12;
          g.shadowOffsetX = w * 4;
          g.fillStyle = "#000";
          roundRect(g, pad - w * 4, pad, w - pad * 2, h - pad * 2, w * 0.18);
          g.fill();
        })
      : blank("brick_shadow_sprite"),
    brick_border_sprite: round("brick_border_sprite", (g, _i, w, h) => {
      const pad = w * 0.05;
      g.lineWidth = w * 0.05;
      g.strokeStyle = "#FFFFFF";
      roundRect(g, pad, pad, w - pad * 2, h - pad * 2, w * 0.2);
      g.stroke();
    }),
    brick_pop_sprite: sprite("brick_pop_sprite", 64, 64, (g, i, w, h) => spec.pop(g, i / (SPRITE_FRAMES.brick_pop_sprite - 1), w, h)),
    red_expand_sprite: blank("red_expand_sprite"),
    blue_expand_sprite: blank("blue_expand_sprite"),
    yellow_expand_sprite: blank("yellow_expand_sprite"),
    purple_expand_sprite: blank("purple_expand_sprite"),
    orange_expand_sprite: blank("orange_expand_sprite"),
    green_expand_sprite: blank("green_expand_sprite"),
    black_expand_sprite: blank("black_expand_sprite"),
    replenish_selector_sprite: round("replenish_selector_sprite", (g, i, w, h) => {
      const colour = i < 7 ? C[(i + 1) as Color] : spec.selectorNeutral;
      const pad = w * 0.03;
      const lw = w * 0.05;
      g.lineJoin = "round";
      if (spec.selector === "glow") {
        g.save();
        g.shadowColor = colour;
        g.shadowBlur = w * 0.08;
        g.lineWidth = lw * 0.8;
        g.strokeStyle = colour;
        roundRect(g, pad + lw / 2, pad + lw / 2, w - pad * 2 - lw, h - pad * 2 - lw, w * 0.2);
        g.stroke();
        g.stroke();
        g.restore();
      } else {
        g.lineWidth = lw * 1.6;
        g.strokeStyle = "#FFFFFF";
        roundRect(g, pad + lw / 2, pad + lw / 2, w - pad * 2 - lw, h - pad * 2 - lw, w * 0.2);
        g.stroke();
        g.lineWidth = lw;
        g.strokeStyle = colour;
        g.stroke();
      }
      if (i < 7) {
        g.fillStyle = rgba(colour, 0.12);
        g.fill();
      }
    }),
    replenish_frame_sprite: round("replenish_frame_sprite", (g, _i, w, h) => {
      const pad = w * 0.06;
      spec.well(g, pad, pad, w - pad * 2, h - pad * 2);
    }),
    worldbg_sprite: flat("worldbg_sprite", spec.bg),
    sidebar_sprite: flat("sidebar_sprite", spec.bg),
    rotate_button_sprite: round("rotate_button_sprite", (g, i, w, h) => spec.button(g, w, h, i % 2 === 1, (gg, cx, cy, r) => rotateIcon(gg, cx, cy, r, i >= 2))),
    pause_button_sprite: round("pause_button_sprite", (g, _i, w, h) =>
      spec.button(g, w, h, false, (gg, cx, cy, r) => {
        const bw = r * 0.16;
        const bh = r * 0.6;
        roundRect(gg, cx - bw * 1.6, cy - bh / 2, bw, bh, bw / 3);
        gg.fill();
        roundRect(gg, cx + bw * 0.6, cy - bh / 2, bw, bh, bw / 3);
        gg.fill();
      }),
    ),
    speedup_button_sprite: round("speedup_button_sprite", (g, i, w, h) => spec.button(g, w, h, i === 1, chevronUp)),
    sound_button_sprite: round("sound_button_sprite", (g, i, w, h) => {
      const muted = i >= 2;
      spec.button(g, w, h, i % 2 === 1, (gg, cx, cy, r) => {
        if (muted) {
          gg.globalAlpha = 0.5;
        }
        speakerIcon(gg, cx, cy, r, muted);
        if (muted) {
          gg.globalAlpha = 1;
          gg.strokeStyle = spec.mute;
          gg.lineWidth = r * 0.16;
          gg.beginPath();
          gg.moveTo(cx - r * 0.5, cy - r * 0.5);
          gg.lineTo(cx + r * 0.5, cy + r * 0.5);
          gg.stroke();
        }
      });
    }),
    settings_button_sprite: round("settings_button_sprite", (g, i, w, h) => spec.button(g, w, h, i === 1, gearIcon)),
    back_button_sprite: round("back_button_sprite", (g, i, w, h) => {
      const right = i >= 2;
      spec.button(g, w, h, i % 2 === 1, (gg, cx, cy, r) => {
        const d = right ? 1 : -1;
        const s = r * 0.42;
        gg.beginPath();
        gg.moveTo(cx - d * s * 0.9, cy);
        gg.lineTo(cx + d * s * 0.9, cy);
        gg.stroke();
        gg.beginPath();
        gg.moveTo(cx + d * s * 0.1, cy - s * 0.8);
        gg.lineTo(cx + d * s * 0.9, cy);
        gg.lineTo(cx + d * s * 0.1, cy + s * 0.8);
        gg.stroke();
      });
    }),
    info_button_sprite: round("info_button_sprite", (g, i, w, h) =>
      spec.button(g, w, h, i === 1, (gg, cx, cy, r) => {
        const c = gg.fillStyle as string;
        text(gg, "i", cx, cy + r * 0.04, r * 1.2, c, 700, "center", spec.display);
      }),
    ),
    progressbar_sprite: sprite("progressbar_sprite", 256, 8, (g, i, w, h) => {
      if (i === 2) {
        g.fillStyle = rgba(spec.text, 0.12);
        g.fillRect(0, 0, w, h);
      } else if (i === 1) {
        g.fillStyle = rgba(spec.text, 0.3);
        g.fillRect(0, 0, w, h);
      } else {
        const grad = g.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, spec.progress[0]);
        grad.addColorStop(1, spec.progress[1]);
        g.fillStyle = grad;
        g.fillRect(0, 0, w, h);
      }
    }),
    level_complete_sprite: sprite("level_complete_sprite", 640, 160, (g, _i, w, h) => {
      spec.panel(g, 6, 6, w - 12, h - 12, h * 0.2);
      text(g, "Level complete", w / 2, h / 2, h * 0.4, spec.text, 700, "center", spec.display);
    }),
    logo_sprite: sprite("logo_sprite", 768, 400, (g, i, w, h) => spec.logo(g, i, w, h)),
    menu_button_sprite: round("menu_button_sprite", (g, i, w, h) => {
      const pad = w * 0.08;
      spec.tile(g, pad, pad, w - pad * 2, h - pad * 2, spec.neutral, { lift: i === 1 ? 0.15 : 0, plain: true, seed: 0 });
      const cx = w / 2;
      const cy = h / 2;
      g.fillStyle = spec.worldText;
      g.beginPath();
      g.moveTo(cx, cy - h * 0.2);
      g.lineTo(cx + w * 0.2, cy - h * 0.02);
      g.lineTo(cx + w * 0.14, cy - h * 0.02);
      g.lineTo(cx + w * 0.14, cy + h * 0.18);
      g.lineTo(cx - w * 0.14, cy + h * 0.18);
      g.lineTo(cx - w * 0.14, cy - h * 0.02);
      g.lineTo(cx - w * 0.2, cy - h * 0.02);
      g.closePath();
      g.fill();
    }),
    menu_frame_sprite: sprite("menu_frame_sprite", 760, 127, (g, _i, w, h) => spec.menuFrame(g, w, h)),
    level_select_sprite: sprite("level_select_sprite", 512, 256, (g, _i, w, h) => spec.panel(g, 4, 4, w - 8, h - 8, h * 0.12)),
    credits_sprite: sprite("credits_sprite", 1024, 512, (g, _i, w, h) => {
      spec.panel(g, 6, 6, w - 12, h - 12, h * 0.1);
      text(g, "Credits", w / 2, h * 0.14, h * 0.12, spec.text, 700, "center", spec.display);
      const rows: [string, string][] = [
        ["Game Design", "Tim Frank, Ben Cochrane"],
        ["Game Concept", "Tim Frank"],
        ["Game Development", "Ben Cochrane"],
        ["UI", "Tim Frank"],
        ["Game Art", "Tim Frank"],
        ["Sound Design", "Nathan Bützer"],
        ["Music", "Nathan Bützer"],
      ];
      const size = h * 0.055;
      rows.forEach(([k, v], i) => {
        const y = h * 0.28 + i * size * 1.35;
        text(g, `${k}:`, w * 0.47, y, size, spec.muted, 500, "right", spec.font);
        text(g, v, w * 0.49, y, size, spec.text, 700, "left", spec.font);
      });
      const y = h * 0.28 + rows.length * size * 1.35 + size * 0.6;
      text(g, "Special Thanks:", w * 0.47, y, size, spec.muted, 500, "right", spec.font);
      text(g, "Connor McCarthy, Ajani Thomas,", w * 0.49, y, size, spec.text, 700, "left", spec.font);
      text(g, "Chris Dodson, Pat Frank, Kris Klink", w * 0.49, y + size * 1.3, size, spec.text, 700, "left", spec.font);
      text(g, "Browser remake in TypeScript", w / 2, h * 0.92, size * 0.85, spec.muted, 500, "center", spec.font);
    }),
  };

  const mode = (name: SpriteName, label: string, base: string, glyph: Glyph) =>
    sprite(name, 512, 256, (g, i, w, h) => {
      if (spec.modeButton) {
        spec.modeButton(g, i, w, h, label, base, glyph);
        return;
      }
      const pad = h * 0.1;
      spec.tile(g, pad, pad, w - pad * 2, h - pad * 2, base, { radius: (h - pad * 2) / 2, lift: i === 1 ? 0.15 : 0, plain: true, seed: 0 });
      modeGlyphDefault(g, glyph, w * 0.2, h / 2, h * 0.15);
      g.save();
      g.shadowColor = spec.worldTextShadow;
      g.shadowBlur = 4;
      g.shadowOffsetY = 2;
      text(g, label, w * 0.6, h / 2 + 1, h * 0.3, spec.worldText, 700, "center", spec.display);
      g.restore();
    });
  skin.normal_button_sprite = mode("normal_button_sprite", "Normal", C[YELLOW], "diamond");
  skin.puzzle_button_sprite = mode("puzzle_button_sprite", "Puzzle", C[RED], "octagon");
  skin.zen_button_sprite = mode("zen_button_sprite", "Zen", C[BLUE], "circle");
  skin.arcade_button_sprite = mode("arcade_button_sprite", "Arcade", C[GREEN], "octagon");

  const colorOf = [null, RED, YELLOW, BLUE, ORANGE, PURPLE, GREEN, BLACK] as const;
  for (let world = 0; world <= 7; world++) {
    const base = world === 0 ? spec.neutral : C[colorOf[world] as Color];
    skin[`world${world}_sprite` as SpriteName] = round(`world${world}_sprite` as SpriteName, (g, i, w, h) => {
      const pad = w * 0.07;
      spec.tile(g, pad, pad, w - pad * 2, h - pad * 2, base, { lift: i === 1 ? 0.15 : 0, seed: 40 + world });
      g.save();
      g.shadowColor = spec.worldTextShadow;
      g.shadowBlur = 5;
      g.shadowOffsetY = 2;
      if (world === 0) {
        text(g, "Tutorial", w / 2, h / 2, w * 0.18, spec.worldText, 700, "center", spec.display);
      } else {
        text(g, "WORLD", w / 2, h * 0.37, w * 0.12, rgba(spec.worldText, 0.9), 700, "center", spec.font);
        text(g, String(world), w / 2, h * 0.61, w * 0.36, spec.worldText, 700, "center", spec.display);
      }
      g.restore();
    });
  }

  const slides = buildTutorialSlides(skin.logo_sprite!, spec.slides);
  skin.tutorial_intro_sprite = slides.intro;
  skin.tutorial_outro_sprite = slides.outro;
  return { ...classic, ...skin } as SpriteMap;
}
