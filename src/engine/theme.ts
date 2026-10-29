/**
 * Visual themes. Sprites are swapped wholesale (see `modernSkin.ts` and
 * `blockySkin.ts`); the palette covers everything the scenes draw directly
 * (text, lines, overlays, cards, buttons, brick shadows and extrusions).
 */
import type { Color } from "../core/color";

export type ThemeName = "classic" | "pigment" | "delicious" | "blocky" | "spectra";

/** Order the theme toggle cycles through. */
export const THEME_ORDER: readonly ThemeName[] = ["pigment", "delicious", "spectra", "blocky", "classic"];

export function nextTheme(current: ThemeName): ThemeName {
  const i = THEME_ORDER.indexOf(current);
  return THEME_ORDER[(i + 1) % THEME_ORDER.length];
}

export const THEME_LABELS: Record<ThemeName, string> = { classic: "Classic", pigment: "Pigment", delicious: "Delicious", blocky: "Blocky", spectra: "Spectra" };

export interface UiPalette {
  /** Overlay card fill, edge and hard shadow / extrusion. */
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
  /** Classic uses the original art and layout; generated themes share the modern layout. */
  kind: "classic" | "generated";
  /** How the board backdrop is painted. */
  backdrop: "sprites" | "paper" | "delicious" | "blocky" | "spectra";
  /** How bricks are drawn around their face sprite. */
  brickStyle: "flat" | "chip" | "extruded" | "gel";
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
  /** Hard offset shadow under every chip (chip style), or null. */
  brickShadow: string | null;
  /** Side-face colour per brick colour (extruded style), or null. */
  brickSide: Record<Color, string> | null;
  /** Faint rounded square drawn in each empty board cell, or null. */
  emptyCell: string | null;
  /** Shelf strip under the replenish line, or null. */
  ledge: string | null;
  /** Flash over the board on a multiplier pop. */
  flash: string;
  flashAlpha: number;
  /** Score / callout text colour and its shadow. */
  callout: string;
  calloutShadow: string;
  /** Chain multiplier colours, indexed by multiplier. */
  multColors: string[];
  /** Flat brick colours by colour bits, for particles and other effects. */
  brickColors: Record<Color, string>;
  /** Hold-slot well colours. */
  well: string;
  wellEdge: string;
  wellActive: string;
  wellActiveEdge: string;
  /** Faint "H" in the empty hold slot. */
  wellHint: string;
  /** Pill behind the level label. */
  pill: string;
  pillEdge: string;
  /** Chain meter track and progress bar track / max fill. */
  track: string;
  trackMax: string;
  /** Flash colour over the progress bar on a push. */
  barFlash: string;
  /** Subtract-goal accent. */
  goalAccent: string;
  /** Bar flash + ring colour for combine. */
  ring: string;
  dust: [string, string];
  /** Glow treatment on score, chain meter and rings. */
  glow: boolean;
  /** Pop flash takes the popped colour instead of `flash`. */
  flashFromBrick: boolean;
  /** Particles blend additively. */
  particlesAdditive: boolean;
  /** Pops leave a fading paint stain on the board. */
  stains: boolean;
}

export const CLASSIC: Palette = {
  name: "classic",
  kind: "classic",
  backdrop: "sprites",
  brickStyle: "flat",
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
  brickSide: null,
  emptyCell: null,
  ledge: null,
  flash: "#ffffff",
  flashAlpha: 0.18,
  callout: "#ffffff",
  calloutShadow: "rgba(0,0,0,0.85)",
  multColors: ["", "#f8fafc", "#ffc12b", "#ff8a2a", "#ef3f4f", "#9b5de5"],
  brickColors: { 1: "#e02828", 2: "#2048e0", 3: "#8a2be2", 4: "#f0d020", 5: "#f08020", 6: "#30c030", 7: "#404040" },
  well: "rgba(255,255,255,0)",
  wellEdge: "rgba(0,0,0,0)",
  wellActive: "rgba(255,255,255,0.18)",
  wellActiveEdge: "rgba(0,0,0,0)",
  wellHint: "rgba(0,0,0,0.18)",
  pill: "rgba(0,0,0,0)",
  pillEdge: "rgba(0,0,0,0)",
  track: "rgba(0,0,0,0.15)",
  trackMax: "rgba(0,0,0,0.25)",
  barFlash: "#ffffff",
  goalAccent: "#2E6FD8",
  ring: "#ffffff",
  dust: ["rgba(255,255,255,0.5)", "rgba(255,255,255,0.3)"],
  glow: false,
  flashFromBrick: false,
  particlesAdditive: false,
  stains: false,
};

/** "Pigment": paint chips on warm paper. */
export const PIGMENT: Palette = {
  name: "pigment",
  kind: "generated",
  backdrop: "paper",
  brickStyle: "chip",
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
  brickSide: null,
  emptyCell: "#E9E3D7",
  ledge: "#DCD4C6",
  flash: "#FFF8EC",
  flashAlpha: 0.18,
  callout: "#1F1C18",
  calloutShadow: "rgba(255,255,255,0.9)",
  multColors: ["", "#1F1C18", "#F2C230", "#F28B2B", "#E04A3F", "#7D4FC2"],
  brickColors: { 1: "#E04A3F", 2: "#2E6FD8", 3: "#7D4FC2", 4: "#F2C230", 5: "#F28B2B", 6: "#3FB26A", 7: "#2B2B30" },
  well: "#E9E3D7",
  wellEdge: "rgba(31,28,24,0.14)",
  wellActive: "rgba(31,28,24,0.10)",
  wellActiveEdge: "rgba(31,28,24,0.45)",
  wellHint: "rgba(31,28,24,0.18)",
  pill: "rgba(31,28,24,0.06)",
  pillEdge: "rgba(31,28,24,0.14)",
  track: "rgba(31,28,24,0.10)",
  trackMax: "rgba(31,28,24,0.22)",
  barFlash: "#1F1C18",
  goalAccent: "#2E6FD8",
  ring: "#FFFFFF",
  dust: ["rgba(60,40,20,0.35)", "rgba(60,40,20,0.2)"],
  glow: false,
  flashFromBrick: false,
  particlesAdditive: false,
  stains: true,
};

/** "Blocky": soft 3D toy bricks, one light from the top-left, cel shaded. */
export const BLOCKY: Palette = {
  name: "blocky",
  kind: "generated",
  backdrop: "blocky",
  brickStyle: "extruded",
  background: "#121826",
  hudText: "#F8FAFC",
  hudMuted: "#8B96AD",
  gridLine: "#ffffff",
  gridAlpha: 0,
  crosshair: "rgba(248,250,252,0.6)",
  titleText: "#F8FAFC",
  titleMuted: "#8B96AD",
  overlayText: "#F8FAFC",
  overlayAccent: "#FFC83D",
  tutorialText: "#F8FAFC",
  tutorialShadow: "rgba(0,0,0,0)",
  font: 'Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  display: 'Outfit, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  ui: {
    card: "#1A2234",
    cardEdge: "rgba(255,255,255,0.08)",
    cardShadow: "#0D121F",
    dim: "rgba(5,8,16,0.62)",
    primary: "#4A86FF",
    primaryHover: "#6A9CFF",
    primaryText: "#F8FAFC",
    secondary: "rgba(255,255,255,0.08)",
    secondaryHover: "rgba(255,255,255,0.16)",
    secondaryEdge: "rgba(255,255,255,0.14)",
    secondaryText: "#F8FAFC",
  },
  brickShadow: null,
  brickSide: { 1: "#9C333C", 2: "#3057A6", 3: "#66429C", 4: "#A68228", 5: "#A65D26", 6: "#26884F", 7: "#262933" },
  emptyCell: null,
  ledge: null,
  flash: "#ffffff",
  flashAlpha: 0.12,
  callout: "#F8FAFC",
  calloutShadow: "rgba(0,0,0,0.7)",
  multColors: ["", "#F8FAFC", "#FFC83D", "#FF8F3A", "#F04E5C", "#9D66F0"],
  brickColors: { 1: "#F04E5C", 2: "#4A86FF", 3: "#9D66F0", 4: "#FFC83D", 5: "#FF8F3A", 6: "#3BD17A", 7: "#3A3F4F" },
  well: "rgba(0,0,0,0.28)",
  wellEdge: "rgba(255,255,255,0.10)",
  wellActive: "rgba(255,255,255,0.10)",
  wellActiveEdge: "rgba(255,255,255,0.5)",
  wellHint: "rgba(255,255,255,0.18)",
  pill: "rgba(255,255,255,0.08)",
  pillEdge: "rgba(255,255,255,0.08)",
  track: "rgba(255,255,255,0.12)",
  trackMax: "rgba(255,255,255,0.3)",
  barFlash: "#ffffff",
  goalAccent: "#4A86FF",
  ring: "#ffffff",
  dust: ["rgba(255,255,255,0.45)", "rgba(255,255,255,0.25)"],
  glow: false,
  flashFromBrick: false,
  particlesAdditive: false,
  stains: false,
};

/** "Spectra": glowing gel tiles on a deep dark field. */
export const SPECTRA: Palette = {
  name: "spectra",
  kind: "generated",
  backdrop: "spectra",
  brickStyle: "gel",
  background: "#07070C",
  hudText: "#F2F2F7",
  hudMuted: "#8A8AA3",
  gridLine: "#ffffff",
  gridAlpha: 0,
  crosshair: "rgba(242,242,247,0.6)",
  titleText: "#F2F2F7",
  titleMuted: "#8A8AA3",
  overlayText: "#F2F2F7",
  overlayAccent: "#FFD23F",
  tutorialText: "#F2F2F7",
  tutorialShadow: "rgba(0,0,0,0)",
  font: 'Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  display: '"Space Grotesk", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  ui: {
    card: "rgba(17,17,25,0.96)",
    cardEdge: "rgba(255,255,255,0.12)",
    cardShadow: "rgba(0,0,0,0.55)",
    dim: "rgba(3,3,8,0.66)",
    primary: "#3D8BFF",
    primaryHover: "#5EA0FF",
    primaryText: "#F2F2F7",
    secondary: "rgba(255,255,255,0.08)",
    secondaryHover: "rgba(255,255,255,0.16)",
    secondaryEdge: "rgba(255,255,255,0.16)",
    secondaryText: "#F2F2F7",
  },
  brickShadow: null,
  brickSide: null,
  emptyCell: null,
  ledge: null,
  flash: "#ffffff",
  flashAlpha: 0.15,
  callout: "#F2F2F7",
  calloutShadow: "rgba(0,0,0,0.8)",
  multColors: ["", "#F2F2F7", "#FFD23F", "#FF9A3C", "#FF4D5E", "#A66CFF"],
  brickColors: { 1: "#FF4D5E", 2: "#3D8BFF", 3: "#A66CFF", 4: "#FFD23F", 5: "#FF9A3C", 6: "#3EE88A", 7: "#2A2A36" },
  well: "rgba(255,255,255,0.04)",
  wellEdge: "rgba(255,255,255,0.12)",
  wellActive: "rgba(255,255,255,0.12)",
  wellActiveEdge: "rgba(255,255,255,0.5)",
  wellHint: "rgba(255,255,255,0.18)",
  pill: "rgba(255,255,255,0.07)",
  pillEdge: "rgba(255,255,255,0.10)",
  track: "rgba(255,255,255,0.12)",
  trackMax: "rgba(255,255,255,0.3)",
  barFlash: "#ffffff",
  goalAccent: "#3D8BFF",
  ring: "#ffffff",
  dust: ["rgba(255,255,255,0.45)", "rgba(255,255,255,0.25)"],
  glow: true,
  flashFromBrick: true,
  particlesAdditive: true,
  stains: false,
};

/** "Delicious": frosted tarts on a gingham bakery counter. */
export const DELICIOUS: Palette = {
  name: "delicious",
  kind: "generated",
  backdrop: "delicious",
  brickStyle: "chip",
  background: "#FFF4EA",
  hudText: "#4A2E2A",
  hudMuted: "#A07E74",
  gridLine: "#4A2E2A",
  gridAlpha: 0,
  crosshair: "rgba(74,46,42,0.5)",
  titleText: "#4A2E2A",
  titleMuted: "#A07E74",
  overlayText: "#4A2E2A",
  overlayAccent: "#E8445A",
  tutorialText: "#4A2E2A",
  tutorialShadow: "rgba(255,255,255,0)",
  font: 'Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  display: 'Fredoka, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  ui: {
    card: "#FFFBF6",
    cardEdge: "rgba(221,167,108,0.7)",
    cardShadow: "rgba(120,70,40,0.2)",
    dim: "rgba(90,50,40,0.4)",
    primary: "#E8607F",
    primaryHover: "#F07A95",
    primaryText: "#FFFFFF",
    secondary: "rgba(232,96,127,0.10)",
    secondaryHover: "rgba(232,96,127,0.2)",
    secondaryEdge: "rgba(232,96,127,0.45)",
    secondaryText: "#4A2E2A",
  },
  brickShadow: "rgba(120,70,40,0.22)",
  brickSide: null,
  emptyCell: null,
  ledge: null,
  flash: "#FFFFFF",
  flashAlpha: 0.2,
  callout: "#4A2E2A",
  calloutShadow: "rgba(255,255,255,0.9)",
  multColors: ["", "#4A2E2A", "#F5C542", "#F28C3A", "#E8445A", "#8E5BD6"],
  brickColors: { 1: "#E8445A", 2: "#4A7BE0", 3: "#8E5BD6", 4: "#F5C542", 5: "#F28C3A", 6: "#4FBF7A", 7: "#3A2A28" },
  well: "#F7E6D8",
  wellEdge: "rgba(221,167,108,0.6)",
  wellActive: "#F7D9DF",
  wellActiveEdge: "#E8607F",
  wellHint: "rgba(74,46,42,0.2)",
  pill: "rgba(232,96,127,0.12)",
  pillEdge: "rgba(232,96,127,0.3)",
  track: "rgba(74,46,42,0.10)",
  trackMax: "rgba(74,46,42,0.22)",
  barFlash: "#E8607F",
  goalAccent: "#4A7BE0",
  ring: "#FFFFFF",
  dust: ["rgba(255,255,255,0.85)", "rgba(247,169,196,0.85)"],
  glow: false,
  flashFromBrick: false,
  particlesAdditive: false,
  stains: false,
};

export const PALETTES: Record<ThemeName, Palette> = { classic: CLASSIC, pigment: PIGMENT, delicious: DELICIOUS, blocky: BLOCKY, spectra: SPECTRA };
