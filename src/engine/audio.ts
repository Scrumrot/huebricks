import { audioUrl, SOUND_NAMES, type MusicName, type SoundName } from "./assets";
import { playCue, playEvent, type CueName } from "./synth";
import { SAMPLE_FOR, type EventOptions, type SoundEvent, type SoundProfile } from "./soundProfile";

/**
 * Sound effects through Web Audio (low latency, overlapping plays) and
 * looping background music through HTMLAudioElements (streams, no decode),
 * all through one small mixer:
 *
 *   samples / cues -> sfx bus -+
 *                              +-> master -> limiter -> speakers
 *   music A / music B -> music bus -> pause filter -+
 *
 * The music bus ducks under big moments and dulls behind the pause card;
 * tracks crossfade instead of cutting; a sample asked for twice inside a
 * few milliseconds (two groups popping on one frame) plays once.
 *
 * Browsers block audio until the first user gesture, so `unlock()` is called
 * from the first pointer event.
 */

/** What scenes need from audio; `AudioSystem` is the browser implementation, tests use a silent one. */
export interface AudioPort {
  muted: boolean;
  play(name: SoundName, volume?: number, rate?: number): void;
  /** A synthesised cue (see `synth.ts`); no asset, so it never waits on a load. */
  cue(name: CueName, volume?: number, rate?: number): void;
  /** A game event: synthesised on the theme's material, or Classic's original recording. */
  event(name: SoundEvent, opts?: EventOptions): void;
  /** The material the modern themes synthesise on; null plays the original recordings. */
  setProfile(profile: SoundProfile | null): void;
  playMusic(name: MusicName): void;
  stopMusic(): void;
  /** Pull the music down by `amount` (0..1) for a moment, recovering over `ms`. */
  duck(amount: number, ms: number): void;
  /** Dull and quieten the music while a pause card is up. */
  setPaused(on: boolean): void;
  toggleMute(): boolean;
  setSfxVolume(v: number): void;
  setMusicVolume(v: number): void;
}

/** Two plays of one sample closer than this collapse into one. */
export const COALESCE_MS = 28;
/** Music crossfade length. */
const CROSSFADE_S = 0.7;
/** Music level and tone behind the pause card. */
const PAUSE_GAIN = 0.45;
const PAUSE_CUTOFF = 700;
const OPEN_CUTOFF = 20000;

/** True when a sample that last played at `last` should not play again at `now`. Pure. */
export function shouldCoalesce(last: number | undefined, now: number, windowMs = COALESCE_MS): boolean {
  return last !== undefined && now - last < windowMs;
}

interface MusicVoice {
  el: HTMLAudioElement;
  src: MediaElementAudioSourceNode | null;
  gain: GainNode | null;
}

export class AudioSystem implements AudioPort {
  private ctx: AudioContext | null = null;
  private buffers = new Map<SoundName, AudioBuffer>();
  private pending = new Map<SoundName, Promise<void>>();
  private lastPlay = new Map<string, number>();
  private profile: SoundProfile | null = null;
  /** Where the music filter sits when not paused: the material's tone. */
  private openCutoff = OPEN_CUTOFF;
  private spaceIn: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private musicFilter: BiquadFilterNode | null = null;
  private master: GainNode | null = null;
  private music: MusicVoice | null = null;
  private musicName: MusicName | null = null;
  private unlocked = false;
  private paused = false;

  muted = false;
  sfxVolume = 0.6;
  musicVolume = 0.35;

  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    try {
      this.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      void this.ctx.resume();
      this.buildMixer(this.ctx);
    } catch {
      this.ctx = null;
    }
    for (const name of SOUND_NAMES) void this.load(name);
    // A track started before the first gesture played on its own; route it through the mixer now.
    if (this.music && !this.music.gain) {
      const voice = this.attach(this.music.el);
      if (voice.gain) {
        voice.gain.gain.value = this.musicVolume;
        voice.el.volume = 1;
        this.music = voice;
      }
    }
    if (this.music && this.music.el.paused && !this.muted) void this.music.el.play().catch(() => undefined);
  }

  private buildMixer(ctx: AudioContext): void {
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 8;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.15;
    limiter.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.connect(limiter);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.sfxVolume;
    this.sfxBus.connect(this.master);
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = "lowpass";
    this.musicFilter.frequency.value = OPEN_CUTOFF;
    this.musicFilter.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 1;
    this.musicBus.connect(this.musicFilter);
    // A short feedback echo the synthesised events send into for a sense of room.
    this.spaceIn = ctx.createGain();
    const delay = ctx.createDelay(0.5);
    delay.delayTime.value = 0.085;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.32;
    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 2600;
    this.spaceIn.connect(delay);
    delay.connect(damp).connect(feedback).connect(delay);
    damp.connect(this.sfxBus);
  }

  setProfile(profile: SoundProfile | null): void {
    this.profile = profile;
    this.openCutoff = profile?.tone ?? OPEN_CUTOFF;
    if (this.paused || !this.ctx || !this.musicFilter) return;
    const t = this.ctx.currentTime;
    this.musicFilter.frequency.cancelScheduledValues(t);
    this.musicFilter.frequency.setValueAtTime(Math.max(1, this.musicFilter.frequency.value), t);
    this.musicFilter.frequency.exponentialRampToValueAtTime(this.openCutoff, t + 0.4);
  }

  event(name: SoundEvent, opts: EventOptions = {}): void {
    if (this.muted || !this.ctx || !this.sfxBus) return;
    if (!this.profile) {
      const sample = SAMPLE_FOR[name];
      if (sample) this.play(sample, opts.volume, opts.rate);
      return;
    }
    const now = performance.now();
    const key = `event:${name}`;
    if (shouldCoalesce(this.lastPlay.get(key), now)) return;
    this.lastPlay.set(key, now);
    playEvent(this.ctx, { dry: this.sfxBus, wet: this.spaceIn ?? this.sfxBus }, this.profile, name, opts);
  }

  private load(name: SoundName): Promise<void> {
    const existing = this.pending.get(name);
    if (existing) return existing;
    const p = (async () => {
      if (!this.ctx) return;
      const res = await fetch(audioUrl(name));
      const data = await res.arrayBuffer();
      const buf = await this.ctx.decodeAudioData(data);
      this.buffers.set(name, buf);
    })().catch(() => undefined);
    this.pending.set(name, p);
    return p;
  }

  /** Play a one-shot; `rate` shifts pitch (1.0595 per semitone). */
  play(name: SoundName, volume = 1, rate = 1): void {
    if (this.muted || !this.ctx || !this.sfxBus) return;
    const buf = this.buffers.get(name);
    if (!buf) {
      void this.load(name);
      return;
    }
    const now = performance.now();
    if (shouldCoalesce(this.lastPlay.get(name), now)) return;
    this.lastPlay.set(name, now);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain).connect(this.sfxBus);
    src.start();
  }

  cue(name: CueName, volume = 1, rate = 1): void {
    if (this.muted || !this.ctx || !this.sfxBus) return;
    playCue(this.ctx, name, volume, rate, this.sfxBus);
  }

  /** Start a track, crossfading out whatever was playing. A new track always starts with the pause lifted. */
  playMusic(name: MusicName): void {
    this.setPaused(false);
    if (this.musicName === name && this.music) return;
    const old = this.music;
    const el = new Audio(audioUrl(name));
    el.loop = true;
    const voice = this.attach(el);
    this.music = voice;
    this.musicName = name;
    if (voice.gain && this.ctx) {
      const t = this.ctx.currentTime;
      voice.gain.gain.setValueAtTime(0.0001, t);
      voice.gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, this.musicVolume), t + CROSSFADE_S);
      el.volume = 1;
    } else {
      el.volume = this.muted ? 0 : this.musicVolume;
    }
    if (this.unlocked && !this.muted) void el.play().catch(() => undefined);
    if (old) this.fadeOut(old);
  }

  stopMusic(): void {
    this.setPaused(false);
    if (this.music) this.fadeOut(this.music);
    this.music = null;
    this.musicName = null;
  }

  /** Route an element through the music bus when the mixer is up; otherwise it plays on its own. */
  private attach(el: HTMLAudioElement): MusicVoice {
    if (!this.ctx || !this.musicBus) return { el, src: null, gain: null };
    try {
      const src = this.ctx.createMediaElementSource(el);
      const gain = this.ctx.createGain();
      src.connect(gain).connect(this.musicBus);
      return { el, src, gain };
    } catch {
      return { el, src: null, gain: null };
    }
  }

  private fadeOut(voice: MusicVoice): void {
    const stop = () => {
      voice.el.pause();
      voice.el.src = "";
      voice.src?.disconnect();
      voice.gain?.disconnect();
    };
    if (voice.gain && this.ctx) {
      const t = this.ctx.currentTime;
      voice.gain.gain.cancelScheduledValues(t);
      voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), t);
      voice.gain.gain.exponentialRampToValueAtTime(0.0001, t + CROSSFADE_S);
      setTimeout(stop, CROSSFADE_S * 1000 + 50);
    } else {
      stop();
    }
  }

  duck(amount: number, ms: number): void {
    if (!this.ctx || !this.musicBus || this.muted) return;
    const t = this.ctx.currentTime;
    const g = this.musicBus.gain;
    const floor = Math.max(0.05, 1 - Math.min(1, amount)) * (this.paused ? PAUSE_GAIN : 1);
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(0.0001, g.value), t);
    g.linearRampToValueAtTime(floor, t + 0.04);
    g.linearRampToValueAtTime(this.paused ? PAUSE_GAIN : 1, t + 0.04 + ms / 1000);
  }

  setPaused(on: boolean): void {
    if (this.paused === on) return;
    this.paused = on;
    if (!this.ctx || !this.musicBus || !this.musicFilter) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.setValueAtTime(Math.max(0.0001, this.musicBus.gain.value), t);
    this.musicBus.gain.linearRampToValueAtTime(on ? PAUSE_GAIN : 1, t + 0.25);
    this.musicFilter.frequency.cancelScheduledValues(t);
    this.musicFilter.frequency.setValueAtTime(Math.max(1, this.musicFilter.frequency.value), t);
    this.musicFilter.frequency.exponentialRampToValueAtTime(on ? PAUSE_CUTOFF : this.openCutoff, t + 0.3);
  }

  setSfxVolume(v: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, v));
    if (this.sfxBus) this.sfxBus.gain.value = this.sfxVolume;
  }

  setMusicVolume(v: number): void {
    this.musicVolume = Math.max(0, Math.min(1, v));
    this.applyMusicVolume();
  }

  private applyMusicVolume(): void {
    const m = this.music;
    if (!m) return;
    if (m.gain) {
      m.gain.gain.value = this.musicVolume;
      m.el.volume = 1;
    } else {
      m.el.volume = this.muted ? 0 : this.musicVolume;
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 1;
    if (this.music) {
      this.applyMusicVolume();
      if (!this.muted && this.unlocked) void this.music.el.play().catch(() => undefined);
    }
    return this.muted;
  }
}
