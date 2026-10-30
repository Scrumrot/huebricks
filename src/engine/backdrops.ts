import type { Layout } from "../core/layout";
import { drawBlockyBackdrop } from "./blockySkin";
import { drawChristmasBackdrop, drawChristmasTray, drawChristmasWell } from "./christmasSkin";
import { drawCrystalsBackdrop, drawCrystalTray, drawCrystalWell } from "./crystalsSkin";
import { drawDeliciousBackdrop } from "./deliciousSkin";
import { drawGooeyBackdrop, drawGooeyTray, drawGooeyWell } from "./gooeySkin";
import { drawNatureBackdrop, drawNatureTray, drawNatureWell } from "./natureSkin";
import { drawStainedGlassBackdrop, drawStainedGlassTray, drawStainedGlassWell } from "./stainedGlassSkin";
import { drawLanternBackdrop, drawLanternTray, drawLanternWell } from "./lanternSkin";
import { drawOrigamiBackdrop, drawOrigamiTray, drawOrigamiWell } from "./origamiSkin";
import { drawVintageBackdrop, drawVintageTray, drawVintageWell } from "./vintageSkin";
import { drawHalloweenBackdrop, drawHalloweenTray, drawHalloweenWell } from "./halloweenSkin";
import { drawCellWell, drawPaper, drawTray, type Ctx } from "./modernSkin";
import { drawSpectraBackdrop } from "./spectraSkin";
import type { Palette } from "./theme";
import { drawWinterBackdrop, drawWinterTray, drawWinterWell } from "./winterSkin";

/**
 * Paints the whole screen behind the board; with a layout, also the board
 * furniture. `flare` runs 1 -> 0 after a level clear for backdrops that
 * want to react (lights flaring, snow bursting, the moon brightening).
 * `fx` is the title screen's cursor and recent taps, for decorations that
 * play along (snow swirling, bats scattering, a wave along the bulbs).
 */
export type Pointer = { x: number; y: number } | null;
/** A recent tap on the title backdrop. */
export interface Tap {
  x: number;
  y: number;
  t: number;
}
/** Title-screen input the backdrop can play with: the cursor and the last few taps. */
export interface TitleFx {
  pointer: Pointer;
  taps: readonly Tap[];
}
export type Backdrop = (g: Ctx, t: number, l?: Layout, flare?: number, fx?: TitleFx | null) => void;

/** Replenish-line furniture for themes whose timer fills the tray's next well. */
export interface Furniture {
  well: (g: Ctx, x: number, y: number, w: number, h: number) => void;
  tray: (g: Ctx, x: number, y: number, w: number, h: number) => void;
}

export type BackdropName = Exclude<Palette["backdrop"], "sprites">;

export const BACKDROPS: Record<BackdropName, Backdrop> = {
  paper: (g, t) => drawPaper(g, t),
  blocky: drawBlockyBackdrop,
  spectra: drawSpectraBackdrop,
  delicious: drawDeliciousBackdrop,
  crystals: drawCrystalsBackdrop,
  halloween: drawHalloweenBackdrop,
  winter: drawWinterBackdrop,
  christmas: drawChristmasBackdrop,
  gooey: drawGooeyBackdrop,
  vintage: drawVintageBackdrop,
  nature: drawNatureBackdrop,
  stainedglass: drawStainedGlassBackdrop,
  lantern: drawLanternBackdrop,
  origami: drawOrigamiBackdrop,
};

export const FURNITURE: Partial<Record<BackdropName, Furniture>> = {
  paper: { well: drawCellWell, tray: drawTray },
  crystals: { well: drawCrystalWell, tray: drawCrystalTray },
  halloween: { well: drawHalloweenWell, tray: drawHalloweenTray },
  winter: { well: drawWinterWell, tray: drawWinterTray },
  christmas: { well: drawChristmasWell, tray: drawChristmasTray },
  gooey: { well: drawGooeyWell, tray: drawGooeyTray },
  vintage: { well: drawVintageWell, tray: drawVintageTray },
  nature: { well: drawNatureWell, tray: drawNatureTray },
  stainedglass: { well: drawStainedGlassWell, tray: drawStainedGlassTray },
  lantern: { well: drawLanternWell, tray: drawLanternTray },
  origami: { well: drawOrigamiWell, tray: drawOrigamiTray },
};
