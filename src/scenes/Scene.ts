import type { GameType } from "../core/constants";
import type { FullscreenControl, View } from "../engine/view";
import type { SpriteMap } from "../engine/assets";
import type { AudioPort } from "../engine/audio";
import type { Clock } from "../engine/clock";
import type { InputState } from "../engine/input";
import type { SaveData } from "../engine/save";
import type { Palette, ThemeName } from "../engine/theme";

/** State that outlives a single scene (the GML globals). */
export interface Session {
  gameType: GameType;
  /** 0 = tutorial, 1..7 = real worlds. */
  world: number;
  /** 0..5 within a world. */
  level: number;
  score: number;
}

export interface GameContext {
  /** Active sprite set; swapped when the theme changes. */
  sprites: SpriteMap;
  /** Colours and fonts for everything drawn directly by the scenes. */
  palette: Palette;
  audio: AudioPort;
  input: InputState;
  /** Frame clock: wall time, game time (pauses in hit-stop) and sim interpolation. */
  clock: Clock;
  /** Logical viewport size and scale for the current window. */
  view: View;
  /** Browser fullscreen toggle (unsupported on iPhone Safari). */
  fullscreen: FullscreenControl;
  save: SaveData;
  session: Session;
  setScene(scene: Scene): void;
  setTheme(theme: ThemeName): void;
  persist(): void;
}

export interface Scene {
  /** Advance one 30 Hz step. */
  update(): void;
  render(ctx: CanvasRenderingContext2D): void;
  /** Called once when the scene becomes active. */
  enter?(): void;
  /** CSS cursor to show over the canvas this frame. */
  cursor?(): string;
}
