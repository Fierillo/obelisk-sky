// Synthesized ambience — no audio files. Wind always, birds by day,
// crickets by night, a soft voice blip per message (pitch from the
// speaker's pubkey), a coin shimmer for zaps. Muted until the viewer opts in.

import { hashStr } from './world/layout';

export class Soundscape {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private wind: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  enabled = false;
  night = false;

  volume = 0.6;

  /** Turn ambience on or off (must follow a user gesture the first time). */
  setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    this.toggle();
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.ctx && this.master && this.enabled) this.master.gain.setTargetAtTime(v * 0.8, this.ctx.currentTime, 0.2);
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    if (this.enabled) this.start();
    else this.stop();
    return this.enabled;
  }

  private start(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume * 0.8;
      this.master.connect(this.ctx.destination);
      this.startWind();
    }
    void this.ctx.resume();
    this.master!.gain.setTargetAtTime(this.volume * 0.8, this.ctx.currentTime, 0.4);
    this.timer = setInterval(() => this.ambient(), 900);
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
  }

  private startWind(): void {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { last = (last + (Math.random() * 2 - 1) * 0.02) * 0.995; d[i] = last * 6; }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    this.wind = ctx.createGain();
    this.wind.gain.value = 0.18;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 0.08;
    lfo.connect(lfoGain).connect(this.wind.gain);
    src.connect(filter).connect(this.wind).connect(this.master!);
    src.start();
    lfo.start();
  }

  private ambient(): void {
    if (!this.enabled || !this.ctx) return;
    if (this.night) { if (Math.random() < 0.5) this.cricket(); }
    else if (Math.random() < 0.18) this.bird();
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, glide?: number, delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private bird(): void {
    const base = 2200 + Math.random() * 1600;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) this.tone(base * (1 + Math.random() * 0.2), 0.09, 'sine', 0.05, base * 1.4, i * 0.12);
  }

  private cricket(): void {
    for (let i = 0; i < 3; i++) this.tone(4400, 0.03, 'triangle', 0.02, undefined, i * 0.06);
  }

  blip(pk: string): void {
    if (!this.enabled || !this.ctx) return;
    const base = 260 + (hashStr(pk) % 12) * 30;
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) this.tone(base * (0.9 + Math.random() * 0.35), 0.07, 'square', 0.035, undefined, i * 0.085);
  }

  coin(): void {
    if (!this.enabled || !this.ctx) return;
    this.tone(1318, 0.12, 'square', 0.05);
    this.tone(1975, 0.35, 'square', 0.05, undefined, 0.09);
  }

  whoosh(): void {
    if (!this.enabled || !this.ctx) return;
    this.tone(180, 0.8, 'sine', 0.06, 520);
  }
}
