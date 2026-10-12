// Music for emotes, heard only near the dancers. People dancing within
// CLUSTER_M of each other share one loop (whoever started first picks it),
// so two dancers side by side never play two songs over each other. Each
// loop comes from where they dance (an HRTF panner, silent past HEAR_M), and
// every loop starts on a bar grid kept by the wall clock (Date.now), the
// one every device shares: two groups in earshot, and the same group heard
// on two screens, keep the same beat, the beat the synced dances move to
// (world/emotes.ts sync). Only the nearest MAX_VOICES groups play.
//
// A loop is a track from public/sounds/manifest.json when there is one, else
// a synth loop (audio/synthLoops.ts).
//
// An emote with a `sound` ("Sangreee...") plays that instead, from the person
// doing it, round after round in time with the clip; walking up halfway
// through, you hear it from where they are. People in step (one anchor) are
// one sound, not a choir a few milliseconds apart. It follows the sound switch
// alone (it isn't music), is louder than the music (SHOT_GAIN), and
// loudest, in both ears, for the one doing it (SELF_SHOT_GAIN).

import type { EmoteKind } from '../world/emotes';
import { emoteOf, EMOTE_SYNC_M } from '../world/emotes';
import { barSeconds, nextBar, SynthLoop, type MusicKind } from './synthLoops';

export const CLUSTER_M = EMOTE_SYNC_M;
/** Heard only near the dancers (m): a step or two round the group, not across the plaza. */
export const HEAR_M = 6;
export const MAX_VOICES = 2;
/** Emote sounds skip the music bus: from someone else, and your own (not placed: it's you). */
export const SHOT_GAIN = 1.1;
export const SELF_SHOT_GAIN = 1.8;

type Vec2 = { x: number; z: number };

/** `since`: when their emote began; `anchor`: the clock its rounds count from (both wall ms; world/emotes.ts). */
export interface Dancer { pk: string; x: number; z: number; kind: EmoteKind | 'train'; since: number; anchor?: number | null }
export interface Cluster { leader: string; music: MusicKind; x: number; z: number; members: string[] }

/** Which music an emote plays, if any ('train': you, training at the park or the gym). */
export function musicFor(kind: EmoteKind | 'train'): MusicKind | null {
  if (kind === 'train') return 'workout';
  if (!emoteOf(kind)?.music) return null;
  if (kind === 'lotus') return 'zen';
  if (kind === 'pushup' || kind === 'jacks') return 'workout';
  if (kind === 'dance') return 'dance2';
  return 'dance';
}

/**
 * Group dancers who are within `radius` of one another (chains count: A near
 * B near C is one group). The group's music is its earliest dancer's; it
 * sounds from the group's middle.
 */
export function clusterDancers(dancers: readonly Dancer[], radius = CLUSTER_M): Cluster[] {
  const ds = dancers.filter((d) => musicFor(d.kind));
  const parent = ds.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < ds.length; i++) {
    for (let j = i + 1; j < ds.length; j++) {
      if (Math.hypot(ds[i].x - ds[j].x, ds[i].z - ds[j].z) <= radius) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, Dancer[]>();
  ds.forEach((d, i) => { const r = find(i); groups.set(r, [...(groups.get(r) ?? []), d]); });
  return [...groups.values()].map((g) => {
    const lead = g.reduce((a, b) => (b.since < a.since || (b.since === a.since && b.pk < a.pk) ? b : a));
    return {
      leader: lead.pk,
      music: musicFor(lead.kind)!,
      x: g.reduce((s, d) => s + d.x, 0) / g.length,
      z: g.reduce((s, d) => s + d.z, 0) / g.length,
      members: g.map((d) => d.pk).sort(),
    };
  });
}

/** The groups that should be playing for a listener at `at`: in earshot, nearest first, at most `max`. */
export function audible(clusters: readonly Cluster[], at: Vec2, max = MAX_VOICES, hear = HEAR_M): Cluster[] {
  return clusters
    .map((c) => ({ c, d: Math.hypot(c.x - at.x, c.z - at.z) }))
    .filter((e) => e.d < hear)
    .sort((a, b) => a.d - b.d)
    .slice(0, max)
    .map((e) => e.c);
}

export interface EmoteSound { key: string; pks: string[]; file: string; x: number; z: number; every: number; offset: number }

/**
 * The emote sounds a listener at `at` should hear (`now`: wall ms): in
 * earshot, and how far into the current round they are (seconds). People
 * counting from one anchor are one sound, from the nearest of them.
 */
export function emoteSounds(dancers: readonly Dancer[], at: Vec2, now: number, hear = HEAR_M): EmoteSound[] {
  const out = new Map<string, EmoteSound & { d: number }>();
  for (const d of dancers) {
    const snd = emoteOf(d.kind)?.sound;
    const far = Math.hypot(d.x - at.x, d.z - at.z);
    if (!snd || far >= hear) continue;
    const from = d.anchor ?? d.since;
    const key = d.anchor != null ? `${snd.file}@${from}` : `${snd.file}:${d.pk}:${d.since}`;
    const t = Math.max(0, (now - from) / 1000);
    const had = out.get(key);
    if (had) {
      had.pks.push(d.pk);
      if (far < had.d) Object.assign(had, { x: d.x, z: d.z, d: far });
      continue;
    }
    out.set(key, { key, pks: [d.pk], file: snd.file, x: d.x, z: d.z, every: snd.every, offset: t % snd.every, d: far });
  }
  return [...out.values()].map(({ d: _d, ...s }) => s);
}

interface Voice { music: MusicKind; gain: GainNode; panner: PannerNode; stop: () => void; synth: boolean }

/** How much of a track loops: whole bars only, so the beat stays on the grid round after round. */
export function loopBars(music: MusicKind, duration: number): number {
  const bar = barSeconds(music);
  return Math.max(bar, Math.floor(duration / bar + 1e-6) * bar);
}

const EAR_Y = 1.6;

export class EmoteMusic {
  private voices = new Map<string, Voice>();
  private tracks = new Map<MusicKind, AudioBuffer | null>();
  private manifest: Promise<Partial<Record<MusicKind, string>>> | null = null;
  private bus: GainNode | null = null;
  private shots = new Map<string, { gain: GainNode; panner: PannerNode | null; stop: () => void }>();
  private sounds = new Map<string, AudioBuffer | null>();
  enabled = true;

  constructor(private audio: () => { ctx: AudioContext; out: AudioNode } | null) {}

  /** Called a few times a second: who is dancing, and where the listener stands and looks. */
  update(dancers: readonly Dancer[], listener: Vec2 & { yaw: number }, self: string | null = null): void {
    const a = this.audio();
    if (!a) { this.silence(); return; }
    const { ctx } = a;
    if (!this.bus) { this.bus = ctx.createGain(); this.bus.gain.value = 0.45; this.bus.connect(a.out); }
    const l = ctx.listener;
    const fx = Math.sin(listener.yaw), fz = Math.cos(listener.yaw);
    if (l.positionX) {
      l.positionX.value = listener.x; l.positionY.value = EAR_Y; l.positionZ.value = listener.z;
      l.forwardX.value = fx; l.forwardY.value = 0; l.forwardZ.value = fz;
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else {
      l.setPosition(listener.x, EAR_Y, listener.z);
      l.setOrientation(fx, 0, fz, 0, 1, 0);
    }
    // Emote sounds (a scream) follow the sound switch alone; music has its own.
    this.updateShots(ctx, a.out, dancers, listener, self);
    const want = this.enabled ? audible(clusterDancers(dancers), listener) : [];
    const keep = new Set<string>();
    for (const c of want) {
      keep.add(c.leader);
      let v = this.voices.get(c.leader);
      if (v && v.music !== c.music) { this.fade(c.leader, v); v = undefined; }
      if (!v) { v = this.voice(ctx, c.music); this.voices.set(c.leader, v); }
      const p = v.panner;
      if (p.positionX) {
        p.positionX.setTargetAtTime(c.x, ctx.currentTime, 0.3);
        p.positionY.value = 1.2;
        p.positionZ.setTargetAtTime(c.z, ctx.currentTime, 0.3);
      } else p.setPosition(c.x, 1.2, c.z);
    }
    for (const [k, v] of this.voices) if (!keep.has(k)) this.fade(k, v);
  }

  /** Start the emote sounds that came into earshot (a little way into the round, if it began earlier); fade the ones that left. */
  private updateShots(ctx: AudioContext, out: AudioNode, dancers: readonly Dancer[], listener: Vec2, self: string | null): void {
    const want = emoteSounds(dancers, listener, Date.now());
    const keep = new Set(want.map((w) => w.key));
    for (const [k, v] of this.shots) if (!keep.has(k)) this.fade(k, v, this.shots);
    for (const w of want) {
      const had = this.shots.get(w.key);
      if (had) {
        // One of a group in step may have left: it sounds from the nearest still there.
        const p = had.panner;
        if (p?.positionX) { p.positionX.value = w.x; p.positionZ.value = w.z; } else p?.setPosition(w.x, 1.2, w.z);
        continue;
      }
      const buf = this.sounds.get(w.file);
      if (buf === undefined) { void this.loadSound(ctx, w.file); continue; }
      if (!buf) continue;
      const mine = self !== null && w.pks.includes(self);
      const gain = ctx.createGain();
      gain.gain.value = mine ? SELF_SHOT_GAIN : SHOT_GAIN;
      let panner: PannerNode | null = null;
      if (mine) gain.connect(out);
      else {
        panner = this.panner(ctx);
        if (panner.positionX) { panner.positionX.value = w.x; panner.positionY.value = 1.2; panner.positionZ.value = w.z; } else panner.setPosition(w.x, 1.2, w.z);
        gain.connect(panner).connect(out);
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      // Round after round, the clip's length each (a sound a little longer is cut there).
      src.loop = true;
      src.loopEnd = Math.min(w.every, buf.duration);
      src.connect(gain);
      src.start(ctx.currentTime + 0.02, Math.min(w.offset, src.loopEnd - 0.01));
      this.shots.set(w.key, { gain, panner, stop: () => { try { src.stop(); } catch { /* ended */ } } });
    }
  }

  /** Fetch an emote sound once; until it's here (or if it fails) it is skipped. */
  private async loadSound(ctx: AudioContext, file: string): Promise<void> {
    this.sounds.set(file, null);
    if (!/^[\w.-]+\.(mp3|ogg|m4a|wav)$/.test(file)) return;
    try {
      const r = await fetch(`/sounds/${file}`);
      if (r.ok) this.sounds.set(file, await ctx.decodeAudioData(await r.arrayBuffer()));
    } catch { /* stays silent */ }
  }

  /** Stop everything (sound off, logged out). */
  silence(): void {
    for (const [k, v] of this.voices) this.fade(k, v);
    for (const [k, v] of this.shots) this.fade(k, v, this.shots);
  }

  private fade(key: string, v: { gain: GainNode; stop: () => void }, from: Map<string, unknown> = this.voices): void {
    from.delete(key);
    const ctx = v.gain.context;
    v.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
    setTimeout(() => { v.stop(); v.gain.disconnect(); }, 1500);
  }

  /** Sound from a place: HRTF, fading to silence at HEAR_M. */
  private panner(ctx: AudioContext): PannerNode {
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'linear';
    panner.refDistance = 1.5;
    panner.maxDistance = HEAR_M;
    panner.rolloffFactor = 1;
    return panner;
  }

  private voice(ctx: AudioContext, music: MusicKind): Voice {
    const panner = this.panner(ctx);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(1, ctx.currentTime, 0.3);
    gain.connect(panner).connect(this.bus!);
    // Start on the next bar of the wall-clock grid: every loop, on every screen, keeps one beat.
    const wallNow = Date.now() / 1000;
    const wallAt = nextBar(music, wallNow + 0.05);
    const at = ctx.currentTime + (wallAt - wallNow);
    let stopped = false;
    let stopSrc: () => void = () => {};
    const synth = () => { const s = new SynthLoop(ctx, gain, music, at, Math.round(wallAt / barSeconds(music))); stopSrc = () => s.stop(); };
    const buf = this.tracks.get(music);
    if (buf) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.loopEnd = loopBars(music, buf.duration);
      src.connect(gain);
      // As far into the track as the wall clock is: the same bar on every screen.
      src.start(at, wallAt % src.loopEnd);
      stopSrc = () => { try { src.stop(); } catch { /* not started */ } };
    } else {
      synth();
      // A track may be on its way: the next voice for this music uses it.
      if (!this.tracks.has(music)) void this.loadTrack(ctx, music);
    }
    return { music, gain, panner, synth: !buf, stop: () => { if (!stopped) { stopped = true; stopSrc(); } } };
  }

  private async loadTrack(ctx: AudioContext, music: MusicKind): Promise<void> {
    this.tracks.set(music, null);
    this.manifest ??= fetch('/sounds/manifest.json').then((r) => (r.ok ? r.json() : {})).then((j: { tracks?: Partial<Record<MusicKind, string>> }) => j?.tracks ?? {}).catch(() => ({}));
    const file = (await this.manifest)[music];
    if (!file || !/^[\w.-]+\.(mp3|ogg|m4a|wav)$/.test(file)) return;
    try {
      const r = await fetch(`/sounds/${file}`);
      if (r.ok) {
        this.tracks.set(music, await ctx.decodeAudioData(await r.arrayBuffer()));
        // The synth stood in while it loaded: it fades, and the next update starts the track.
        for (const [k, v] of this.voices) if (v.music === music && v.synth) this.fade(k, v);
      }
    } catch { /* keep the synth */ }
  }
}
