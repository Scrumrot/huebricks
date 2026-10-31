import type { ArcadeMode } from "../core/arcade";
import { THEME_ORDER, type ThemeName } from "./theme";

/**
 * Persistent player data (`save_game.gml` / `load_game.gml`), stored in
 * localStorage instead of `dat.ini`.
 */
export interface SaveData {
  hiscore: number;
  /** Highest world the player has reached (0 = only the tutorial). */
  worldProgress: number;
  tutorialDone: boolean;
  muted: boolean;
  /** Effects and music volume, 0..1. */
  sfx: number;
  music: number;
  theme: ThemeName;
  /** Halve shake, hit-stop and debris and skip slow motion. */
  reduceMotion: boolean;
  /** Mirror the in-game HUD and controls for the other thumb. */
  leftHanded: boolean;
  /** Best score per arcade mode. */
  arcadeBest: Partial<Record<ArcadeMode, number>>;
  /** Save format version; bumped when a stored field should be reset. */
  v: number;
}

const KEY = "huebricks.save.v1";

/**
 * 2: Modern became the default theme (older saves drop their stored theme once).
 * 3: themes renamed; "modern" is now "pigment" and "blocky" is the default.
 * 4: "spectra" added and made the default.
 * 5: "pigment" is the default.
 * 6: sound off by default, with separate effects and music volumes.
 * 7: reduce-motion preference.
 * 8: left-handed rails.
 */
const SAVE_VERSION = 8;

const DEFAULTS: SaveData = {
  hiscore: 0,
  worldProgress: 1,
  tutorialDone: false,
  muted: true,
  sfx: 0.6,
  music: 0.35,
  theme: "pigment",
  reduceMotion: false,
  leftHanded: false,
  arcadeBest: {},
  v: SAVE_VERSION,
};

export function loadGame(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS, arcadeBest: {} };
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    const v = parsed.v ?? 1;
    if (v < 5) parsed.theme = DEFAULTS.theme;
    if (v < 6) {
      parsed.muted = true;
      parsed.sfx = DEFAULTS.sfx;
      parsed.music = DEFAULTS.music;
    }
    if (!THEME_ORDER.includes(parsed.theme as ThemeName)) parsed.theme = DEFAULTS.theme;
    return { ...DEFAULTS, ...parsed, arcadeBest: { ...(parsed.arcadeBest ?? {}) }, v: SAVE_VERSION };
  } catch {
    return { ...DEFAULTS, arcadeBest: {} };
  }
}

export function saveGame(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage may be unavailable (private mode); the game still works.
  }
}
