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
  theme: ThemeName;
  /** Save format version; bumped when a stored field should be reset. */
  v: number;
}

const KEY = "huebricks.save.v1";

/**
 * 2: Modern became the default theme (older saves drop their stored theme once).
 * 3: themes renamed; "modern" is now "pigment" and "blocky" is the default.
 * 4: "spectra" added and made the default.
 * 5: "pigment" is the default.
 */
const SAVE_VERSION = 5;

const DEFAULTS: SaveData = { hiscore: 0, worldProgress: 1, tutorialDone: false, muted: false, theme: "pigment", v: SAVE_VERSION };

const THEMES: readonly string[] = ["classic", "pigment", "blocky", "spectra"];

export function loadGame(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    const v = parsed.v ?? 1;
    if (v < 5) parsed.theme = DEFAULTS.theme;
    if (!THEMES.includes(parsed.theme as string)) parsed.theme = DEFAULTS.theme;
    return { ...DEFAULTS, ...parsed, v: SAVE_VERSION };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveGame(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage may be unavailable (private mode); the game still works.
  }
}
