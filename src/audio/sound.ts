// Web Audio sound board: music, looping ambience beds and one-shot effects.
// Nothing loads or plays until the first user gesture calls unlock().

import type { AmbienceMix } from "./mix";

export type Sfx =
  | "step-1"
  | "step-2"
  | "step-3"
  | "take"
  | "release"
  | "blocked"
  | "discover"
  | "finish"
  | "restore"
  | "book-open"
  | "book-close"
  | "page"
  | "click"
  | "hint"
  | "toggle";

const SFX: readonly Sfx[] = [
  "step-1",
  "step-2",
  "step-3",
  "take",
  "release",
  "blocked",
  "discover",
  "finish",
  "restore",
  "book-open",
  "book-close",
  "page",
  "click",
  "hint",
  "toggle",
];
const BEDS = ["birds", "river", "rain", "wind"] as const;
type Bed = (typeof BEDS)[number];
const MUTE_KEY = "borrowed-weather:muted";
const url = (name: string) => `${import.meta.env.BASE_URL}audio/${name}.ogg`;

export class SoundBoard {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private music: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private readonly beds = new Map<Bed, GainNode>();
  private readonly buffers = new Map<string, AudioBuffer>();
  private mix: AmbienceMix | null = null;
  private duck = 1;
  muted: boolean;

  constructor() {
    let stored = false;
    try {
      stored = localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      stored = false;
    }
    this.muted = stored;
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (!this.ctx) return;
        if (document.hidden) void this.ctx.suspend();
        else void this.ctx.resume();
      });
    }
  }

  /** Create the audio graph and start loading on the first user gesture. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended" && !document.hidden) void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.7;
    this.sfxBus.connect(this.master);
    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 16000;
    this.filter.connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = 0;
    this.music.connect(this.master);
    for (const bed of BEDS) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.filter);
      this.beds.set(bed, g);
    }
    void this.load();
  }

  private async fetchBuffer(name: string): Promise<AudioBuffer | null> {
    if (!this.ctx) return null;
    try {
      const res = await fetch(url(name));
      const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
      this.buffers.set(name, buf);
      return buf;
    } catch {
      return null;
    }
  }

  private async load(): Promise<void> {
    await Promise.all(SFX.map((s) => this.fetchBuffer(s)));
    await Promise.all(
      BEDS.map(async (bed) => {
        const buf = await this.fetchBuffer(`amb-${bed}`);
        const out = this.beds.get(bed);
        if (buf && out) this.loop(buf, out, Math.random() * buf.duration);
      }),
    );
    const music = await this.fetchBuffer("music");
    if (music && this.music) this.loop(music, this.music, 0);
    if (this.mix) this.setMix(this.mix);
  }

  private loop(buf: AudioBuffer, out: AudioNode, offset: number): void {
    if (!this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(out);
    src.start(0, offset);
  }

  play(name: Sfx, opts: { delay?: number; rate?: number; gain?: number } = {}): void {
    const ctx = this.ctx;
    const buf = this.buffers.get(name);
    if (!ctx || !buf || !this.sfxBus || ctx.state !== "running") return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate ?? 1;
    const g = ctx.createGain();
    g.gain.value = opts.gain ?? 1;
    src.connect(g).connect(this.sfxBus);
    src.start(ctx.currentTime + (opts.delay ?? 0));
  }

  /** Glide ambience and music towards the mix for where the hiker now stands. */
  setMix(mix: AmbienceMix): void {
    this.mix = mix;
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const bed of BEDS) this.beds.get(bed)?.gain.setTargetAtTime(mix[bed], t, 0.8);
    this.filter?.frequency.setTargetAtTime(mix.cutoff, t, 0.6);
    this.music?.gain.setTargetAtTime(mix.music * this.duck, t, 1.2);
  }

  /** Lower the music while a panel is open. */
  setDucked(ducked: boolean): void {
    this.duck = ducked ? 0.45 : 1;
    if (this.mix) this.setMix(this.mix);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch {
      // Storage unavailable (private mode): mute still applies for this visit.
    }
    if (this.ctx && this.master)
      this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.05);
  }
}
