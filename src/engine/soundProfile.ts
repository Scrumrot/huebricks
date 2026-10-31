import type { Color } from "../core/color";
import type { SoundName } from "./assets";

/**
 * How a theme sounds. The modern themes play no samples at all: every game
 * sound is synthesised on the spot from the same small set of gestures, and
 * the profile is the material those gestures are played on. Classic has no
 * profile and keeps the original recordings.
 */
export interface SoundProfile {
  /** Oscillator for pitched notes. */
  wave: OscillatorType;
  /** Seconds a note takes to open, and to die away. */
  attack: number;
  decay: number;
  /** Lowpass cutoff as a multiple of the note (2 is dull, 10 is bright). */
  brightness: number;
  /** Noise mixed into hits and pops, 0..1. */
  grit: number;
  /** Cents between a note's two oscillators (0 is pure, 12 is thick). */
  spread: number;
  /** Pitch glide on hits in semitones; negative drops. */
  bend: number;
  /** Send into the short echo, 0..1. */
  space: number;
  /** Semitones added to every pitch. */
  transpose: number;
  /** Extra partials for bell-like materials, as [multiple, gain]; empty for a plain tone. */
  partials: readonly (readonly [number, number])[];
  /** Lowpass on the music bus in Hz: 20000 leaves the track open, lower sits it back into a soft material. */
  tone: number;
}

export type Material = "paint" | "glass" | "paper" | "wood" | "dark" | "gel" | "toy" | "synth" | "bells" | "snow" | "felt";

const base: SoundProfile = {
  wave: "triangle",
  attack: 0.005,
  decay: 0.28,
  brightness: 4,
  grit: 0.35,
  spread: 6,
  bend: -2,
  space: 0.15,
  transpose: 0,
  partials: [],
  tone: 20000,
};

const material = (over: Partial<SoundProfile>): SoundProfile => ({ ...base, ...over });

export const MATERIALS: Readonly<Record<Material, SoundProfile>> = {
  /** Wet paint: soft, a little splat in every hit. */
  paint: material({}),
  /** Struck glass: pure, bright, inharmonic partials, long ring. */
  glass: material({
    wave: "sine",
    attack: 0.002,
    decay: 0.9,
    brightness: 10,
    grit: 0.15,
    spread: 3,
    bend: 0,
    space: 0.35,
    partials: [
      [2.76, 0.35],
      [5.4, 0.15],
    ],
  }),
  /** Folded paper: mostly noise, short and muted. */
  paper: material({ attack: 0.004, decay: 0.14, brightness: 2.5, grit: 0.8, spread: 0, bend: -1, space: 0.05, tone: 9000 }),
  /** Knocked wood: warm and short, a low thud under everything. */
  wood: material({ attack: 0.003, decay: 0.18, brightness: 3, grit: 0.45, spread: 2, bend: -4, space: 0.12, transpose: -12, tone: 7000 }),
  /** Wood after dark: lower and longer, for the haunted theme. */
  dark: material({ attack: 0.003, decay: 0.32, brightness: 2.5, grit: 0.4, spread: 5, bend: -5, space: 0.3, transpose: -7, tone: 4500 }),
  /** Gel: round sine with a wobble and a drop. */
  gel: material({ wave: "sine", attack: 0.01, decay: 0.4, brightness: 2, grit: 0.1, spread: 9, bend: -7, space: 0.2, transpose: -5, tone: 11000 }),
  /** Toy plastic: square waves, short, no room. */
  toy: material({ wave: "square", attack: 0.002, decay: 0.12, brightness: 6, grit: 0.05, spread: 0, bend: 0, space: 0, tone: 9000 }),
  /** Light and synth: saw with a filter, chorus-thick, plenty of space. */
  synth: material({ wave: "sawtooth", attack: 0.005, decay: 0.35, brightness: 5, grit: 0.05, spread: 10, bend: 2, space: 0.4 }),
  /** Little bells: harmonic partials, long decay, an octave up. */
  bells: material({
    wave: "sine",
    attack: 0.002,
    decay: 1.2,
    brightness: 8,
    grit: 0.05,
    spread: 2,
    bend: 0,
    space: 0.45,
    transpose: 12,
    partials: [
      [2, 0.5],
      [3, 0.25],
      [4.2, 0.12],
    ],
  }),
  /** Felt and yarn: soft, short, no ring at all. */
  felt: material({ attack: 0.006, decay: 0.2, brightness: 2.2, grit: 0.3, spread: 4, bend: -2, space: 0.04, tone: 6500 }),
  /** Snow: soft glass, hushed, lots of room. */
  snow: material({ wave: "sine", attack: 0.01, decay: 0.6, brightness: 6, grit: 0.2, spread: 4, bend: 0, space: 0.5, transpose: 7, tone: 6000 }),
};

/** Everything a scene can ask the sound system for. */
export type SoundEvent =
  | "select"
  | "combine"
  | "noadd"
  | "landing"
  | "pop"
  | "push"
  | "fill"
  | "rotate"
  | "fall"
  | "tap"
  | "achieve"
  | "lose"
  | "toggleOn"
  | "toggleOff"
  | "cardIn"
  | "cardOut"
  | "toast"
  | "star"
  | "charge";

export interface EventOptions {
  volume?: number;
  /** Pitch multiplier (1.0595 per semitone); the synth also reads `chain`. */
  rate?: number;
  /** The colour involved (pops, selects). */
  color?: Color;
  /** A combine's colours before and after. */
  from?: Color;
  to?: Color;
  /** Chain multiplier behind a pop. */
  chain?: number;
}

/** The original recording Classic plays for each event; null means Classic stays silent there. */
export const SAMPLE_FOR: Readonly<Record<SoundEvent, SoundName | null>> = {
  select: "BlocksSelection_snd",
  combine: "BlocksCombine_snd",
  noadd: "BlocksIncorrect_snd",
  landing: "BlocksLanding_snd",
  pop: "BlocksPopping_snd",
  push: "BlocksRepMoveUp_snd",
  fill: "BlocksFillRepLine_snd",
  rotate: "BoardRotation_snd",
  fall: "block_fall_snd",
  tap: "menuselect_snd",
  achieve: "achievment_snd",
  lose: "tryagain_snd",
  toggleOn: "menuselect_snd",
  toggleOff: null,
  cardIn: null,
  cardOut: null,
  toast: null,
  star: null,
  charge: null,
};

/** Every event, in the order of the sample map. */
export const SOUND_EVENTS = Object.keys(SAMPLE_FOR) as SoundEvent[];
