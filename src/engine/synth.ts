/**
 * Procedural sound cues for the effects layer, built from oscillators and a
 * shared noise buffer so no new audio files are needed. Each cue is a short
 * one-shot: the whoosh under a colour mix, the crunch under flying
 * fragments, the thump on a hit-stop, the tick of the score counter and the
 * sparkle of a light flare.
 */
import { BLACK, type Color } from "../core/color";
import { chainLift, isSubtract, notesFor, transpose } from "./colorNotes";
import type { EventOptions, SoundEvent, SoundProfile } from "./soundProfile";

export const CUE_NAMES = ["whoosh", "crunch", "thump", "tick", "sparkle"] as const;
export type CueName = (typeof CUE_NAMES)[number];

let noise: AudioBuffer | null = null;

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noise && noise.sampleRate === ctx.sampleRate) return noise;
  const len = Math.floor(ctx.sampleRate * 1);
  noise = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return noise;
}

/** Gain node with an attack/decay envelope, connected to `out`. */
function envelope(ctx: AudioContext, t0: number, peak: number, attack: number, decay: number, out: AudioNode): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  g.connect(out);
  return g;
}

function noiseSource(ctx: AudioContext, t0: number, dur: number): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  src.start(t0);
  src.stop(t0 + dur + 0.05);
  return src;
}

/** Play one cue now into `out`. `rate` shifts the pitch centre; `volume` is the peak gain. */
export function playCue(ctx: AudioContext, name: CueName, volume = 1, rate = 1, out: AudioNode = ctx.destination): void {
  const t0 = ctx.currentTime;
  const env = (peak: number, attack: number, decay: number) => envelope(ctx, t0, peak, attack, decay, out);
  switch (name) {
    case "whoosh": {
      const src = noiseSource(ctx, t0, 0.22);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.Q.value = 1.2;
      bp.frequency.setValueAtTime(500 * rate, t0);
      bp.frequency.exponentialRampToValueAtTime(2600 * rate, t0 + 0.2);
      src.connect(bp).connect(env(0.5 * volume, 0.03, 0.19));
      break;
    }
    case "crunch": {
      const src = noiseSource(ctx, t0, 0.12);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(2400 * rate, t0);
      lp.frequency.exponentialRampToValueAtTime(400 * rate, t0 + 0.11);
      src.connect(lp).connect(env(0.7 * volume, 0.005, 0.11));
      break;
    }
    case "thump": {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(130 * rate, t0);
      osc.frequency.exponentialRampToValueAtTime(42 * rate, t0 + 0.13);
      osc.connect(env(0.9 * volume, 0.004, 0.15));
      osc.start(t0);
      osc.stop(t0 + 0.2);
      break;
    }
    case "tick": {
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.value = 1700 * rate;
      osc.connect(env(0.12 * volume, 0.002, 0.02));
      osc.start(t0);
      osc.stop(t0 + 0.04);
      break;
    }
    case "sparkle": {
      for (const [f, d] of [
        [1480, 0.18],
        [2220, 0.24],
        [2960, 0.14],
      ] as const) {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = f * rate;
        osc.connect(env(0.18 * volume, 0.006, d));
        osc.start(t0);
        osc.stop(t0 + d + 0.05);
      }
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Game events on a material
// ---------------------------------------------------------------------------

/** Where an event's sound goes: straight out, and a send into the short echo. */
export interface SynthOut {
  dry: AudioNode;
  wet: AudioNode;
}

/** The notes a combine plays, before and after; without colours, a neutral rising figure. Pure. */
export function combineNotes(from: Color | undefined, to: Color | undefined): { before: number[]; after: number[]; subtract: boolean } {
  if (from === undefined || to === undefined) return { before: [261.63], after: [329.63, 392.0], subtract: false };
  return { before: notesFor(from), after: notesFor(to), subtract: isSubtract(from, to) };
}

/** The chord a pop plays: the colour's notes lifted by the chain. Pure. */
export function popNotes(color: Color | undefined, chain: number): number[] {
  const lift = chainLift(chain);
  const notes = color === undefined ? [261.63, 329.63, 392.0] : notesFor(color);
  return notes.map((f) => transpose(f, lift));
}

/**
 * Play one game event on a material. `rate` scales every pitch (for scenes
 * that already pitch by hand); the synth also reads colours and the chain.
 */
export function playEvent(ctx: AudioContext, out: SynthOut, p: SoundProfile, ev: SoundEvent, o: EventOptions = {}): void {
  const t0 = ctx.currentTime;
  const vol = o.volume ?? 1;
  const rate = (o.rate ?? 1) * 2 ** (p.transpose / 12);

  const send = (node: AudioNode, amount: number): void => {
    node.connect(out.dry);
    if (p.space > 0 && amount > 0) {
      const g = ctx.createGain();
      g.gain.value = p.space * amount;
      node.connect(g).connect(out.wet);
    }
  };
  /** A pitched note: two detuned oscillators plus the material's partials, under a lowpass and an envelope. */
  const note = (freq: number, at: number, dur: number, gain: number, bend = 0, wave = p.wave): void => {
    const f = freq * rate;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain * vol), at + p.attack);
    env.gain.exponentialRampToValueAtTime(0.0001, at + p.attack + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = Math.min(18000, Math.max(300, f * p.brightness));
    lp.connect(env);
    send(env, 1);
    const voices: [number, number, number][] = [
      [1, 1, -p.spread / 2],
      [1, p.spread > 0 ? 0.7 : 0, p.spread / 2],
      ...p.partials.map(([m, g]) => [m, g, 0] as [number, number, number]),
    ];
    for (const [mult, g, cents] of voices) {
      if (g <= 0) continue;
      const osc = ctx.createOscillator();
      osc.type = mult === 1 ? wave : "sine";
      osc.frequency.setValueAtTime(f * mult, at);
      if (bend !== 0) osc.frequency.exponentialRampToValueAtTime(f * mult * 2 ** (bend / 12), at + dur * 0.6);
      osc.detune.value = cents;
      const vg = ctx.createGain();
      vg.gain.value = g;
      osc.connect(vg).connect(lp);
      osc.start(at);
      osc.stop(at + p.attack + dur + 0.05);
    }
  };
  /** A burst of filtered noise, the material's grit. */
  const hit = (at: number, gain: number, dur: number, from: number, to: number, type: BiquadFilterType = "lowpass"): void => {
    if (gain <= 0.001) return;
    const src = noiseSource(ctx, at, dur);
    const flt = ctx.createBiquadFilter();
    flt.type = type;
    flt.Q.value = type === "bandpass" ? 1.1 : 0.7;
    flt.frequency.setValueAtTime(Math.max(60, from * rate), at);
    flt.frequency.exponentialRampToValueAtTime(Math.max(60, to * rate), at + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain * vol), at + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(flt).connect(env);
    send(env, 0.6);
  };
  /** A low sine drop, the body of a landing. */
  const thump = (at: number, f0: number, f1: number, gain: number, dur: number): void => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(f0 * rate, at);
    osc.frequency.exponentialRampToValueAtTime(f1 * rate, at + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain * vol), at + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(env);
    send(env, 0.3);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  };
  const chord = (freqs: number[], at: number, dur: number, gain: number, bend = 0): void => {
    freqs.forEach((f, i) => note(f, at + i * 0.012, dur, gain / Math.sqrt(freqs.length), bend));
  };

  switch (ev) {
    case "select":
      note(o.color !== undefined ? notesFor(o.color)[0] * 2 : 880, t0, 0.07, 0.22);
      break;
    case "combine": {
      const c = combineNotes(o.from, o.to);
      const shift = c.subtract ? -12 : 0;
      chord(c.before, t0, 0.1, 0.3);
      chord(
        c.after.map((f) => transpose(f, shift)),
        t0 + 0.09,
        p.decay * 1.1,
        0.4,
        p.bend * 0.3,
      );
      hit(t0, p.grit * 0.35, 0.12, 2000, 500);
      break;
    }
    case "noadd":
      note(220, t0, 0.16, 0.3, -1);
      note(233, t0, 0.16, 0.3, -1);
      hit(t0, p.grit * 0.5, 0.1, 900, 300);
      break;
    case "landing":
      thump(t0, 150, 55, 0.55, 0.12);
      hit(t0, p.grit * 0.6, 0.08, 2400, 400);
      break;
    case "pop": {
      const chain = o.chain ?? 1;
      const notes = popNotes(o.color, chain);
      chord(notes, t0, p.decay * 1.2, 0.5, p.bend * 0.5);
      if (chain >= 3) note(notes[notes.length - 1] * 2, t0 + 0.03, p.decay, 0.2);
      hit(t0, p.grit * (0.5 + 0.1 * Math.min(5, chain)), 0.1, 3000, 500);
      if (o.color === BLACK) thump(t0, 90, 40, 0.5, 0.18);
      break;
    }
    case "push":
      hit(t0, 0.35 + p.grit * 0.2, 0.26, 300, 1800, "bandpass");
      note(130.8, t0 + 0.05, 0.18, 0.25, 7);
      break;
    case "fill":
      note(1760, t0, 0.04, 0.12);
      break;
    case "rotate":
      hit(t0, 0.3 + p.grit * 0.2, 0.22, 1400, 300, "bandpass");
      note(392, t0, 0.1, 0.15, p.bend);
      break;
    case "fall":
      thump(t0, 110, 50, 0.35, 0.1);
      hit(t0, p.grit * 0.3, 0.06, 1200, 300);
      break;
    case "tap":
      note(1320, t0, 0.045, 0.2);
      break;
    case "achieve":
      [261.63, 329.63, 392.0, 523.25].forEach((f, i) => note(f, t0 + i * 0.09, 0.4, 0.3));
      break;
    case "lose":
      [329.63, 261.63, 207.65].forEach((f, i) => note(f / 2, t0 + i * 0.22, 0.5, 0.35, -2));
      break;
    case "toggleOn":
      note(660, t0, 0.06, 0.22);
      note(880, t0 + 0.07, 0.12, 0.22);
      break;
    case "toggleOff":
      note(880, t0, 0.06, 0.22);
      note(660, t0 + 0.07, 0.12, 0.22);
      break;
    case "cardIn":
      hit(t0, 0.2, 0.18, 500, 3000, "bandpass");
      break;
    case "cardOut":
      hit(t0, 0.2, 0.18, 3000, 500, "bandpass");
      break;
    case "toast":
      note(1046.5, t0, 0.3, 0.28);
      note(1318.5, t0 + 0.09, 0.35, 0.28);
      break;
    case "star":
      note(1046.5, t0, 0.35, 0.3);
      note(2093, t0 + 0.02, 0.25, 0.12);
      break;
    case "charge":
      note(440, t0, 0.05, 0.14);
      break;
  }
}
