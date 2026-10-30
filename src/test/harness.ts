import type { ArcadeMode } from "../core/arcade";
import { SPRITE_FRAMES, type MusicName, type SoundName, type Sprite, type SpriteMap, type SpriteName } from "../engine/assets";
import type { AudioPort } from "../engine/audio";
import type { CueName } from "../engine/synth";
import { Clock } from "../engine/clock";
import type { InputState } from "../engine/input";
import type { SaveData } from "../engine/save";
import { PALETTES, type ThemeName } from "../engine/theme";
import type { Tweens } from "../engine/tween";
import type { View } from "../engine/view";
import type { GameContext, Scene } from "../scenes/Scene";

/**
 * A game context for driving scenes in tests without a browser: scripted
 * input, a clock you advance by hand, silent audio and no canvas. Scenes are
 * stepped with `update()` only; anything that happens in `render()` (tweens,
 * particles) is advanced through `tweensOf` when a test needs it.
 */

export const STEP_MS = 1000 / 30;

export class FakeInput implements InputState {
  x = -1;
  y = -1;
  down = false;
  pressed = false;
  released = false;
  keysPressed = new Set<string>();
  keysDown = new Set<string>();
  minHit = 0;

  /** Pointer goes down at (x, y) this step. */
  press(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.down = true;
    this.pressed = true;
  }

  moveTo(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  /** Pointer comes up this step, where it is or at (x, y). */
  release(x = this.x, y = this.y): void {
    this.x = x;
    this.y = y;
    if (this.down) this.released = true;
    this.down = false;
  }

  /** Key goes down this step and stays down until `unhold`. */
  hold(key: string): void {
    this.keysPressed.add(key);
    this.keysDown.add(key);
  }

  unhold(key: string): void {
    this.keysDown.delete(key);
  }

  /** Key pressed and released within this step. */
  tap(key: string): void {
    this.keysPressed.add(key);
  }

  /** Clear the per-step edges once a scene has seen them. */
  endStep(): void {
    this.pressed = false;
    this.released = false;
    this.keysPressed.clear();
  }

  inRect(x: number, y: number, w: number, h: number): boolean {
    return this.x >= x && this.x <= x + w && this.y >= y && this.y <= y + h;
  }

  inCentered(cx: number, cy: number, w: number, h: number): boolean {
    const hw = Math.max(w, this.minHit);
    const hh = Math.max(h, this.minHit);
    return this.inRect(cx - hw / 2, cy - hh / 2, hw, hh);
  }
}

export class SilentAudio implements AudioPort {
  muted = false;
  readonly played: SoundName[] = [];
  readonly cues: CueName[] = [];
  music: MusicName | null = null;
  play(name: SoundName): void {
    this.played.push(name);
  }
  cue(name: CueName): void {
    this.cues.push(name);
  }
  playMusic(name: MusicName): void {
    this.music = name;
  }
  stopMusic(): void {
    this.music = null;
  }
  toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }
  setSfxVolume(): void {}
  setMusicVolume(): void {}
}

export function freshSave(over: Partial<SaveData> = {}): SaveData {
  return {
    hiscore: 0,
    worldProgress: 1,
    tutorialDone: true,
    muted: true,
    sfx: 0.6,
    music: 0.35,
    theme: "pigment",
    reduceMotion: false,
    leftHanded: false,
    arcadeBest: {},
    v: 99,
    ...over,
  };
}

/** Sprites with no images; enough for layout and update, never drawn. */
export function stubSprites(): SpriteMap {
  const entries = (Object.keys(SPRITE_FRAMES) as SpriteName[]).map((name): [SpriteName, Sprite] => [name, { name, frames: [], width: 64, height: 64 }]);
  return Object.fromEntries(entries) as SpriteMap;
}

export interface Harness {
  ctx: GameContext;
  input: FakeInput;
  audio: SilentAudio;
  clock: Clock;
  /** The scene most recently handed to `setScene`, if any. */
  next: Scene | null;
  persisted: number;
  /** Advance `n` sim steps: update the scene, run its tweens, clear input edges. */
  step(scene: Scene, n?: number): void;
}

export function makeHarness(opts: { theme?: ThemeName; view?: Partial<View>; arcade?: ArcadeMode | null; save?: Partial<SaveData> } = {}): Harness {
  const input = new FakeInput();
  const audio = new SilentAudio();
  const clock = new Clock();
  let now = 1000;
  clock.advance(now);
  const view: View = { scale: 1, w: 900, h: 506.67, portrait: false, ...opts.view };
  const h: Harness = {
    input,
    audio,
    clock,
    next: null,
    persisted: 0,
    ctx: {
      sprites: stubSprites(),
      palette: PALETTES[opts.theme ?? "pigment"],
      audio,
      input,
      clock,
      view,
      fullscreen: { supported: false, active: false, toggle() {} },
      save: freshSave(opts.save),
      session: { gameType: "normal", world: 1, level: 0, score: 0 },
      setScene(scene) {
        h.next = scene;
      },
      setTheme(theme) {
        h.ctx.palette = PALETTES[theme];
        h.ctx.save.theme = theme;
      },
      persist() {
        h.persisted++;
      },
    },
    step(scene, n = 1) {
      for (let i = 0; i < n; i++) {
        now += STEP_MS;
        clock.advance(now);
        scene.update();
        tweensOf(scene)?.update(clock.t);
        input.endStep();
      }
    },
  };
  return h;
}

/** A scene's tween runner, if it keeps one under the usual name. */
export function tweensOf(scene: Scene): Tweens | undefined {
  return (scene as unknown as { tweens?: Tweens }).tweens;
}

/** Reach into a scene's private state from a test. */
export function internals<T>(scene: Scene): T {
  return scene as unknown as T;
}
