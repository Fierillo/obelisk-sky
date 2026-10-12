// The emote music made in the browser, until real tracks are dropped into
// public/sounds/ (docs/sounds.md lists them and their Suno prompts). Each
// piece is one bar of a pattern scheduled ahead on the AudioContext clock,
// so two loops of one piece started on the same bar grid beat together.

export type MusicKind = 'dance' | 'dance2' | 'workout' | 'zen';

/** Beats per minute; the groove clip (anim/exercises.ts GROOVE) is two bars at DANCE_BPM. */
export const DANCE_BPM = 120;
export const BPM: Record<MusicKind, number> = { dance: DANCE_BPM, dance2: DANCE_BPM, workout: 128, zen: 60 };

/** One bar (four beats) in seconds. */
export const barSeconds = (k: MusicKind): number => (4 * 60) / BPM[k];

/** The next bar line at or after `t` on the shared grid (bars counted from time 0). */
export function nextBar(k: MusicKind, t: number): number {
  const b = barSeconds(k);
  return Math.ceil(t / b - 1e-6) * b;
}

type Note = { at: number; dur: number; freq: number; type: OscillatorType; vol: number; glide?: number };

const A = 55; // A1
const hz = (semi: number) => A * 2 ** (semi / 12);

/** The notes of bar `n` (seconds from the bar's start). Kicks and hats are noise-free tones: short and cheap. */
export function barNotes(k: MusicKind, n: number): Note[] {
  const beat = 60 / BPM[k];
  const out: Note[] = [];
  if (k === 'dance') {
    // Four on the floor, open hats on the off-beats, a bass that walks A–A–C–G per bar.
    const root = [0, 0, 3, -2][n % 4];
    for (let i = 0; i < 4; i++) {
      out.push({ at: i * beat, dur: 0.18, freq: 150, glide: 45, type: 'sine', vol: 0.5 });
      out.push({ at: i * beat + beat / 2, dur: 0.05, freq: 7000, type: 'square', vol: 0.025 });
      out.push({ at: i * beat + beat / 2, dur: beat * 0.4, freq: hz(12 + root), type: 'sawtooth', vol: 0.07 });
    }
    // A stab on beat 2 and 4 every other bar.
    if (n % 2 === 1) for (const i of [1, 3]) for (const s of [24, 28, 31]) out.push({ at: i * beat, dur: 0.12, freq: hz(s + root), type: 'triangle', vol: 0.04 });
  } else if (k === 'dance2') {
    // Funkier, in D minor: a clap on 2 and 4, a bass that skips on the
    // sixteenths, a minor chord pecking on every off-beat.
    const root = [5, 5, 8, 3][n % 4];
    for (let i = 0; i < 4; i++) {
      out.push({ at: i * beat, dur: 0.18, freq: 140, glide: 45, type: 'sine', vol: 0.5 });
      if (i % 2 === 1) out.push({ at: i * beat, dur: 0.07, freq: 1500, glide: 800, type: 'square', vol: 0.035 });
      out.push({ at: i * beat, dur: beat * 0.2, freq: hz(12 + root), type: 'sawtooth', vol: 0.07 });
      out.push({ at: i * beat + (beat * 3) / 4, dur: beat * 0.15, freq: hz(24 + root), type: 'sawtooth', vol: 0.05 });
      for (const s of [24, 27, 31]) out.push({ at: i * beat + beat / 2, dur: 0.08, freq: hz(s + root), type: 'triangle', vol: 0.03 });
    }
  } else if (k === 'workout') {
    // Driving: kick on every beat, a clap on 2 and 4, sixteenth hats, a pumping bass.
    for (let i = 0; i < 4; i++) {
      out.push({ at: i * beat, dur: 0.16, freq: 160, glide: 50, type: 'sine', vol: 0.55 });
      if (i % 2 === 1) out.push({ at: i * beat, dur: 0.08, freq: 1800, glide: 900, type: 'square', vol: 0.04 });
      for (let j = 0; j < 4; j++) out.push({ at: i * beat + (j * beat) / 4, dur: 0.03, freq: 8000, type: 'square', vol: j % 2 ? 0.012 : 0.02 });
      out.push({ at: i * beat + beat / 2, dur: beat * 0.35, freq: hz(7 + (n % 2 ? 5 : 0)), type: 'sawtooth', vol: 0.08 });
    }
  } else {
    // Zen: a slow pad (root and fifth) with a bell now and then.
    const root = [0, -5, -3, -5][n % 4];
    for (const s of [24, 31, 36]) out.push({ at: 0, dur: barSeconds(k) * 1.05, freq: hz(s + root), type: 'sine', vol: 0.05 });
    out.push({ at: beat * (n % 2 ? 2 : 0), dur: 2.5, freq: hz(48 + root + (n % 3) * 7), type: 'sine', vol: 0.035 });
  }
  return out;
}

/** A synth loop on the shared bar grid; stop() lets the notes already scheduled ring out. */
export class SynthLoop {
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextAt: number;
  private bar: number;

  /** `bar`: which bar of the pattern `startAt` is (the wall-clock grid's count, so every screen plays the same one). */
  constructor(private ctx: AudioContext, private out: AudioNode, private kind: MusicKind, startAt: number, bar = Math.round(startAt / barSeconds(kind))) {
    this.nextAt = startAt;
    this.bar = bar;
    this.pump();
    this.timer = setInterval(() => this.pump(), 200);
  }

  private pump(): void {
    // Keep a bar and a half scheduled ahead.
    while (this.nextAt < this.ctx.currentTime + barSeconds(this.kind) * 1.5) {
      for (const n of barNotes(this.kind, this.bar)) this.play(n, this.nextAt + n.at);
      this.nextAt += barSeconds(this.kind);
      this.bar++;
    }
  }

  private play(n: Note, t: number): void {
    if (t < this.ctx.currentTime) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = n.type;
    o.frequency.setValueAtTime(n.freq, t);
    if (n.glide) o.frequency.exponentialRampToValueAtTime(n.glide, t + n.dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(n.vol, t + Math.min(0.01, n.dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + n.dur);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + n.dur + 0.05);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
