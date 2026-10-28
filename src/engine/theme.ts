/**
 * Visual themes. Sprites are swapped wholesale (see `modernSkin.ts`); the
 * palette covers everything the scenes draw directly (text, lines, overlays,
 * cards and buttons).
 */
import type { Color } from "../core/color";

export type ThemeName = "classic" | "modern";

export interface UiPalette {
  /** Overlay card fill, edge and hard shadow. */
  card: string;
  cardEdge: string;
  cardShadow: string;
  /** Full-screen dim behind cards. */
  dim: string;
  primary: string;
  primaryHover: string;
  primaryText: string;
  secondary: string;
  secondaryHover: string;
  secondaryEdge: string;
  secondaryText: string;
}

export interface Palette {
  name: ThemeName;
  /** Canvas clear colour behind everything (also the page background). */
  background: string;
  hudText: string;
  hudMuted: string;
  gridLine: string;
  gridAlpha: number;
  /** Replenish-selector crosshair. */
  crosshair: string;
  titleText: string;
  titleMuted: string;
  overlayText: string;
  overlayAccent: string;
  tutorialText: string;
  tutorialShadow: string;
  /** Font stack for HUD and body text drawn by the scenes. */
  font: string;
  /** Font stack for display text (titles, big numbers). */
  display: string;
  ui: UiPalette;
  /** Hard offset shadow under every brick, or null for none. */
  brickShadow: string | null;
  /** Faint rounded square drawn in each empty board cell, or null. */
  emptyCell: string | null;
  /** Shelf strip under the replenish line, or null. */
  ledge: string | null;
  /** Flash colour over the board on a multiplier pop. */
  flash: string;
  /** Score / callout text colour and its shadow. */
  callout: string;
  calloutShadow: string;
  /** Flat brick colours by colour bits, for particles and other effects. */
  brickColors: Record<Color, string>;
}

export const CLASSIC: Palette = {
  name: "classic",
  background: "#000000",
  hudText: "#000000",
  hudMuted: "#333333",
  gridLine: "#c0c0c0",
  gridAlpha: 0.5,
  crosshair: "#c0c0c0",
  titleText: "#111111",
  titleMuted: "#333333",
  overlayText: "#ffffff",
  overlayAccent: "#ffd24a",
  tutorialText: "#ffffff",
  tutorialShadow: "#000000",
  font: "Arial, Helvetica, sans-serif",
  display: "Arial, Helvetica, sans-serif",
  ui: {
    card: "rgba(17,24,39,0.96)",
    cardEdge: "rgba(255,255,255,0.10)",
    cardShadow: "rgba(0,0,0,0.5)",
    dim: "rgba(0,0,0,0.6)",
    primary: "#3b7cff",
    primaryHover: "#5a92ff",
    primaryText: "#f8fafc",
    secondary: "rgba(255,255,255,0.12)",
    secondaryHover: "rgba(255,255,255,0.2)",
    secondaryEdge: "rgba(255,255,255,0.14)",
    secondaryText: "#f8fafc",
  },
  brickShadow: null,
  emptyCell: null,
  ledge: null,
  flash: "#ffffff",
  callout: "#ffffff",
  calloutShadow: "rgba(0,0,0,0.85)",
  brickColors: { 1: "#e02828", 2: "#2048e0", 3: "#8a2be2", 4: "#f0d020", 5: "#f08020", 6: "#30c030", 7: "#404040" },
};

/** "Pigment": paint chips on warm paper. */
export const MODERN: Palette = {
  name: "modern",
  background: "#F3EEE4",
  hudText: "#1F1C18",
  hudMuted: "#8A8378",
  gridLine: "#1F1C18",
  gridAlpha: 0,
  crosshair: "rgba(31,28,24,0.5)",
  titleText: "#1F1C18",
  titleMuted: "#8A8378",
  overlayText: "#1F1C18",
  overlayAccent: "#E04A3F",
  tutorialText: "#1F1C18",
  tutorialShadow: "rgba(255,255,255,0)",
  font: 'Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  display: 'Fredoka, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  ui: {
    card: "#FBF8F2",
    cardEdge: "rgba(60,40,20,0.16)",
    cardShadow: "rgba(60,40,20,0.2)",
    dim: "rgba(60,48,32,0.42)",
    primary: "#1F1C18",
    primaryHover: "#3A342C",
    primaryText: "#F3EEE4",
    secondary: "rgba(31,28,24,0.05)",
    secondaryHover: "rgba(31,28,24,0.11)",
    secondaryEdge: "rgba(31,28,24,0.28)",
    secondaryText: "#1F1C18",
  },
  brickShadow: "rgba(60,40,20,0.18)",
  emptyCell: "#E9E3D7",
  ledge: "#DCD4C6",
  flash: "#FFF8EC",
  callout: "#1F1C18",
  calloutShadow: "rgba(255,255,255,0.9)",
  brickColors: { 1: "#E04A3F", 2: "#2E6FD8", 3: "#7D4FC2", 4: "#F2C230", 5: "#F28B2B", 6: "#3FB26A", 7: "#2B2B30" },
};

export const PALETTES: Record<ThemeName, Palette> = { classic: CLASSIC, modern: MODERN };
