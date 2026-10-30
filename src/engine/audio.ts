import { audioUrl, SOUND_NAMES, type MusicName, type SoundName } from "./assets";
import { playCue, type CueName } from "./synth";

/**
 * Sound effects through Web Audio (low latency, overlapping plays) and
 * looping background music through an HTMLAudioElement (streams, no decode).
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
  playMusic(name: MusicName): void;
  stopMusic(): void;
  toggleMute(): boolean;
  setSfxVolume(v: number): void;
  setMusicVolume(v: number): void;
}

export class AudioSystem implements AudioPort {
  private ctx: AudioContext | null = null;
  private buffers = new Map<SoundName, AudioBuffer>();
  private pending = new Map<SoundName, Promise<void>>();
  private music: HTMLAudioElement | null = null;
  private musicName: MusicName | null = null;
  private unlocked = false;

  muted = false;
  sfxVolume = 0.6;
  musicVolume = 0.35;

  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    try {
      this.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
    for (const name of SOUND_NAMES) void this.load(name);
    if (this.music && this.music.paused && !this.muted) void this.music.play().catch(() => undefined);
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
    if (this.muted || !this.ctx) return;
    const buf = this.buffers.get(name);
    if (!buf) {
      void this.load(name);
      return;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const gain = this.ctx.createGain();
    gain.gain.value = volume * this.sfxVolume;
    src.connect(gain).connect(this.ctx.destination);
    src.start();
  }

  cue(name: CueName, volume = 1, rate = 1): void {
    if (this.muted || !this.ctx) return;
    playCue(this.ctx, name, volume * this.sfxVolume, rate);
  }

  playMusic(name: MusicName): void {
    if (this.musicName === name && this.music) return;
    this.stopMusic();
    const el = new Audio(audioUrl(name));
    el.loop = true;
    el.volume = this.muted ? 0 : this.musicVolume;
    this.music = el;
    this.musicName = name;
    if (this.unlocked && !this.muted) void el.play().catch(() => undefined);
  }

  stopMusic(): void {
    if (this.music) {
      this.music.pause();
      this.music.src = "";
      this.music = null;
      this.musicName = null;
    }
  }

  setSfxVolume(v: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, v));
  }

  setMusicVolume(v: number): void {
    this.musicVolume = Math.max(0, Math.min(1, v));
    if (this.music) this.music.volume = this.muted ? 0 : this.musicVolume;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.music) {
      this.music.volume = this.muted ? 0 : this.musicVolume;
      if (!this.muted && this.unlocked) void this.music.play().catch(() => undefined);
    }
    return this.muted;
  }
}
