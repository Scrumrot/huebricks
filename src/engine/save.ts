import type { ArcadeMode } from "../core/arcade";
import type { ThemeName } from "./theme";

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
 */
const SAVE_VERSION = 6;

const DEFAULTS: SaveData = {
  hiscore: 0,
  worldProgress: 1,
  tutorialDone: false,
  muted: true,
  sfx: 0.6,
  music: 0.35,
  theme: "pigment",
  arcadeBest: {},
  v: SAVE_VERSION,
};

const THEMES: readonly string[] = [
  "classic",
  "pigment",
  "delicious",
  "crystals",
  "halloween",
  "winter",
  "christmas",
  "gooey",
  "vintage",
  "nature",
  "blocky",
  "spectra",
];

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
    if (!THEMES.includes(parsed.theme as string)) parsed.theme = DEFAULTS.theme;
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
