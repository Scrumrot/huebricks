/**
 * Loads the original GameMaker sprite frames and audio clips.
 * Sprites are stored as `assets/sprites/<name>_<frame>.png`.
 */

export const SPRITE_FRAMES = {
  achieve_button_sprite: 2,
  arcade_button_sprite: 2,
  back_button_sprite: 4,
  black_expand_sprite: 5,
  blue_expand_sprite: 5,
  brick_border_sprite: 1,
  brick_noicon_sprite: 8,
  brick_pop_sprite: 15,
  brick_shadow_sprite: 1,
  brick_glow_sprite: 7,
  brick_sprite: 7,
  color_wheel_sprite: 1,
  credits_sprite: 1,
  facebook_button_sprite: 2,
  green_expand_sprite: 5,
  info_button_sprite: 2,
  item_button_sprite: 7,
  level_complete_sprite: 1,
  level_select_sprite: 1,
  logo_sprite: 2,
  menu_button_sprite: 2,
  menu_frame_sprite: 1,
  normal_button_sprite: 2,
  orange_expand_sprite: 5,
  pause_button_sprite: 1,
  progressbar_sprite: 3,
  purple_expand_sprite: 5,
  puzzle_button_sprite: 2,
  red_expand_sprite: 5,
  replenish_frame_sprite: 1,
  replenish_selector_sprite: 8,
  rotate_button_sprite: 4,
  settings_button_sprite: 2,
  sidebar_sprite: 2,
  sound_button_sprite: 4,
  speedup_button_sprite: 2,
  store_button_sprite: 2,
  tutorial_intro_sprite: 7,
  tutorial_outro_sprite: 3,
  world0_sprite: 2,
  world1_sprite: 2,
  world2_sprite: 2,
  world3_sprite: 2,
  world4_sprite: 2,
  world5_sprite: 2,
  world6_sprite: 2,
  world7_sprite: 2,
  worldbg_sprite: 8,
  yellow_expand_sprite: 5,
  zen_button_sprite: 2,
} as const;

export type SpriteName = keyof typeof SPRITE_FRAMES;

/** Sprites with no PNG on disk; both themes build them in code (see classicExtras.ts). */
export const GENERATED_SPRITES: ReadonlySet<SpriteName> = new Set<SpriteName>([
  "sound_button_sprite",
  "brick_shadow_sprite",
  "brick_glow_sprite",
  "arcade_button_sprite",
]);

export const SOUND_NAMES = [
  "BlocksCombine_snd",
  "BlocksFillRepLine_snd",
  "BlocksIncorrect_snd",
  "BlocksLanding_snd",
  "BlocksPopping_snd",
  "BlocksRepMoveUp_snd",
  "BlocksSelection_snd",
  "BoardRotation_snd",
  "achievment_snd",
  "block_fall_snd",
  "menuselect_snd",
  "tryagain_snd",
] as const;
export type SoundName = (typeof SOUND_NAMES)[number];

export const MUSIC_NAMES = [
  "title_bgm",
  "tutorial_bgm",
  ...Array.from({ length: 7 }, (_, i) => `normal${i + 1}_bgm`),
  ...Array.from({ length: 7 }, (_, i) => `puzzle${i + 1}_bgm`),
  ...Array.from({ length: 7 }, (_, i) => `zen${i + 1}_bgm`),
] as const;
export type MusicName = (typeof MUSIC_NAMES)[number] | `${"normal" | "puzzle" | "zen"}${number}_bgm`;

export interface Sprite {
  name: SpriteName;
  /** One image per frame; loaded PNGs for the classic art, canvases for generated art. */
  frames: Array<HTMLImageElement | HTMLCanvasElement>;
  width: number;
  height: number;
}

export type SpriteMap = Record<SpriteName, Sprite>;

const BASE = `${import.meta.env.BASE_URL}assets/`;

export function spriteUrl(name: string, frame: number): string {
  return `${BASE}sprites/${name}_${frame}.png`;
}

export function audioUrl(name: string): string {
  const ext = preferredAudioExt();
  return `${BASE}audio/${name}.${ext}`;
}

let audioExt: "ogg" | "mp3" | null = null;
export function preferredAudioExt(): "ogg" | "mp3" {
  if (audioExt) return audioExt;
  const probe = typeof Audio !== "undefined" ? new Audio() : null;
  const ogg = probe?.canPlayType('audio/ogg; codecs="vorbis"') ?? "";
  audioExt = ogg === "probably" || ogg === "maybe" ? "ogg" : "mp3";
  return audioExt;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${url}`));
    img.src = url;
  });
}

export async function loadSprites(onProgress?: (done: number, total: number) => void): Promise<SpriteMap> {
  const names = (Object.keys(SPRITE_FRAMES) as SpriteName[]).filter((n) => !GENERATED_SPRITES.has(n));
  const total = names.reduce((n, k) => n + SPRITE_FRAMES[k], 0);
  let done = 0;
  const entries = await Promise.all(
    names.map(async (name) => {
      const frames = await Promise.all(
        Array.from({ length: SPRITE_FRAMES[name] }, async (_, i) => {
          const img = await loadImage(spriteUrl(name, i));
          done++;
          onProgress?.(done, total);
          return img;
        }),
      );
      const sprite: Sprite = { name, frames, width: frames[0].naturalWidth, height: frames[0].naturalHeight };
      return [name, sprite] as const;
    }),
  );
  return Object.fromEntries(entries) as SpriteMap;
}
