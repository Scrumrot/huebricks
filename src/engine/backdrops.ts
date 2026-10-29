import type { Layout } from "../core/layout";
import { drawBlockyBackdrop } from "./blockySkin";
import { drawChristmasBackdrop, drawChristmasTray, drawChristmasWell } from "./christmasSkin";
import { drawCrystalsBackdrop, drawCrystalTray, drawCrystalWell } from "./crystalsSkin";
import { drawDeliciousBackdrop } from "./deliciousSkin";
import { drawHalloweenBackdrop, drawHalloweenTray, drawHalloweenWell } from "./halloweenSkin";
import { drawCellWell, drawPaper, drawTray, type Ctx } from "./modernSkin";
import { drawSpectraBackdrop } from "./spectraSkin";
import type { Palette } from "./theme";
import { drawWinterBackdrop, drawWinterTray, drawWinterWell } from "./winterSkin";

/**
 * Paints the whole screen behind the board; with a layout, also the board
 * furniture. `flare` runs 1 -> 0 after a level clear for backdrops that
 * want to react (lights flaring, snow bursting, the moon brightening).
 */
export type Backdrop = (g: Ctx, t: number, l?: Layout, flare?: number) => void;

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
};

export const FURNITURE: Partial<Record<BackdropName, Furniture>> = {
  paper: { well: drawCellWell, tray: drawTray },
  crystals: { well: drawCrystalWell, tray: drawCrystalTray },
  halloween: { well: drawHalloweenWell, tray: drawHalloweenTray },
  winter: { well: drawWinterWell, tray: drawWinterTray },
  christmas: { well: drawChristmasWell, tray: drawChristmasTray },
};
