/**
 * Visual themes. Sprites are swapped wholesale (see `modernSkin.ts`); the
 * palette covers everything the scenes draw directly (text, lines, overlays).
 */
export type ThemeName = "classic" | "modern";

export interface Palette {
  name: ThemeName;
  /** Canvas clear colour behind everything. */
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
  /** Font stack for text drawn by the scenes. */
  font: string;
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
};

export const MODERN: Palette = {
  name: "modern",
  background: "#0b1120",
  hudText: "#f8fafc",
  hudMuted: "#94a3b8",
  gridLine: "#ffffff",
  gridAlpha: 0.06,
  crosshair: "#e2e8f0",
  titleText: "#f8fafc",
  titleMuted: "#94a3b8",
  overlayText: "#f8fafc",
  overlayAccent: "#fbbf24",
  tutorialText: "#f8fafc",
  tutorialShadow: "rgba(0,0,0,0.6)",
  font: '"Segoe UI", Inter, Roboto, "Helvetica Neue", Arial, sans-serif',
};

export const PALETTES: Record<ThemeName, Palette> = { classic: CLASSIC, modern: MODERN };
