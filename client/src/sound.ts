// Synthesized ambience — no audio files. Crickets by night (`ambience`), your
// footsteps (`footsteps`: a soft scuff walking, a harder slap running), a soft
// voice blip per message (pitch from the speaker's pubkey), a coin shimmer for zaps. Muted until the viewer opts in.

import { hashStr } from './world/layout';

export class Soundscape {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  enabled = false;
  night = false;
  /** Crickets and the like: their own switch, apart from emotes and music. */
  ambience = true;
  footsteps = true;
  private noise: AudioBuffer | null = null;

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

  /** The audio graph other sounds (emote music) join, while sound is on. */
  audio(): { ctx: AudioContext; out: AudioNode } | null {
    return this.enabled && this.ctx && this.master ? { ctx: this.ctx, out: this.master } : null;
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    if (this.enabled) this.start();
    else this.stop();
    return this.enabled;
  }

  /** Sound is on but the browser holds the audio (created before a gesture
   *  it accepts, or suspended by the phone or a hidden tab): ask again.
   *  Call from a user gesture. */
  wake(): void {
    if (this.enabled && this.ctx && this.ctx.state !== 'running') void this.ctx.resume().catch(() => {});
  }

  private start(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume * 0.8;
      this.master.connect(this.ctx.destination);
    }
    void this.ctx.resume();
    this.master!.gain.setTargetAtTime(this.volume * 0.8, this.ctx.currentTime, 0.4);
    this.timer = setInterval(() => this.ambient(), 900);
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
  }

  private ambient(): void {
    if (!this.enabled || !this.ctx) return;
    if (this.ambience && this.night && Math.random() < 0.5) this.cricket();
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

  private cricket(): void {
    for (let i = 0; i < 3; i++) this.tone(4400, 0.03, 'triangle', 0.02, undefined, i * 0.06);
  }

  /** One of your steps: a soft scuff of low-passed noise, like grass under a shoe; running, a little
   *  brighter and firmer with a faint thump. Kept well under everything else. */
  footstep(running: boolean): void {
    if (!this.enabled || !this.footsteps || !this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    if (!this.noise) {
      this.noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.25), ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = ctx.currentTime;
    const vary = 0.88 + Math.random() * 0.24;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = vary;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = (running ? 1600 : 1000) * vary;
    low.Q.value = 0.3;
    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 180;
    const g = ctx.createGain();
    const vol = running ? 0.07 : 0.045;
    const dur = running ? 0.09 : 0.13;
    // A soft attack (no click), then a quick fall.
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.018);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(high).connect(low).connect(g).connect(this.master!);
    src.start(t, Math.random() * 0.1, dur + 0.02);
    if (running) this.tone(70 * vary, 0.07, 'sine', 0.04, 45);
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
