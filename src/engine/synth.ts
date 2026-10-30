/**
 * Procedural sound cues for the effects layer, built from oscillators and a
 * shared noise buffer so no new audio files are needed. Each cue is a short
 * one-shot: the whoosh under a colour mix, the crunch under flying
 * fragments, the thump on a hit-stop, the tick of the score counter and the
 * sparkle of a light flare.
 */
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

/** Gain node with an attack/decay envelope, connected to the destination. */
function envelope(ctx: AudioContext, t0: number, peak: number, attack: number, decay: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  g.connect(ctx.destination);
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

/** Play one cue now. `rate` shifts the pitch centre; `volume` is the peak gain. */
export function playCue(ctx: AudioContext, name: CueName, volume = 1, rate = 1): void {
  const t0 = ctx.currentTime;
  switch (name) {
    case "whoosh": {
      const src = noiseSource(ctx, t0, 0.22);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.Q.value = 1.2;
      bp.frequency.setValueAtTime(500 * rate, t0);
      bp.frequency.exponentialRampToValueAtTime(2600 * rate, t0 + 0.2);
      src.connect(bp).connect(envelope(ctx, t0, 0.5 * volume, 0.03, 0.19));
      break;
    }
    case "crunch": {
      const src = noiseSource(ctx, t0, 0.12);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(2400 * rate, t0);
      lp.frequency.exponentialRampToValueAtTime(400 * rate, t0 + 0.11);
      src.connect(lp).connect(envelope(ctx, t0, 0.7 * volume, 0.005, 0.11));
      break;
    }
    case "thump": {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(130 * rate, t0);
      osc.frequency.exponentialRampToValueAtTime(42 * rate, t0 + 0.13);
      osc.connect(envelope(ctx, t0, 0.9 * volume, 0.004, 0.15));
      osc.start(t0);
      osc.stop(t0 + 0.2);
      break;
    }
    case "tick": {
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.value = 1700 * rate;
      osc.connect(envelope(ctx, t0, 0.12 * volume, 0.002, 0.02));
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
        osc.connect(envelope(ctx, t0, 0.18 * volume, 0.006, d));
        osc.start(t0);
        osc.stop(t0 + d + 0.05);
      }
      break;
    }
  }
}
