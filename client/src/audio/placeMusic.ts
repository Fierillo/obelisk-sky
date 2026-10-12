// Music that belongs to a place: cumbia at the parrilla, a guitar by the
// campfires. Only the nearest place in reach plays (an HRTF panner fading to
// silence at its reach), crossfading as you walk from one to another, so
// the parrilla and a campfire never mix and two campfires never play two
// guitars over each other. Where
// in the track it is comes from the wall clock (Date.now), so everyone at
// the parrilla, on every screen, hears the same bar.
//
// Files are named in public/sounds/manifest.json under `places`; a place
// whose file is missing is silent.

export type PlaceKind = 'parrilla' | 'campfire';

export interface Place { kind: PlaceKind; x: number; z: number }

/** How far each is heard (m) and how loud, under the music bus. */
export const PLACE_TRACKS: Record<PlaceKind, { reach: number; gain: number }> = {
  parrilla: { reach: 8, gain: 0.5 },
  campfire: { reach: 5.5, gain: 0.45 },
};

type Vec2 = { x: number; z: number };

/** The place whose music `at` hears: the nearest in its own reach (as a share of the reach, so a big one wins its ground), or none. */
export function nearestPlaces(places: readonly Place[], at: Vec2): Place[] {
  let best: { p: Place; k: number } | null = null;
  for (const p of places) {
    const k = Math.hypot(p.x - at.x, p.z - at.z) / PLACE_TRACKS[p.kind].reach;
    if (k < 1 && (!best || k < best.k)) best = { p, k };
  }
  return best ? [best.p] : [];
}

/** Where in a track of `duration` seconds every screen is at wall time `now` (ms). */
export function trackOffset(now: number, duration: number): number {
  return ((now / 1000) % duration + duration) % duration;
}

interface Voice { gain: GainNode; panner: PannerNode; stop: () => void }

export class PlaceMusic {
  private voices = new Map<PlaceKind, Voice>();
  private buffers = new Map<PlaceKind, AudioBuffer | null>();
  private manifest: Promise<Partial<Record<PlaceKind, string>>> | null = null;
  private bus: GainNode | null = null;
  enabled = true;

  constructor(private audio: () => { ctx: AudioContext; out: AudioNode } | null) {}

  /** A few times a second: the places, and where the listener stands (the ear's pose is emoteMusic's). */
  update(places: readonly Place[], listener: Vec2): void {
    const a = this.enabled ? this.audio() : null;
    if (!a) { this.silence(); return; }
    const { ctx } = a;
    if (!this.bus) { this.bus = ctx.createGain(); this.bus.gain.value = 0.6; this.bus.connect(a.out); }
    const want = nearestPlaces(places, listener);
    const keep = new Set(want.map((p) => p.kind));
    for (const [k, v] of this.voices) if (!keep.has(k)) this.fade(k, v);
    for (const p of want) {
      let v = this.voices.get(p.kind);
      if (!v) {
        const buf = this.buffers.get(p.kind);
        if (buf === undefined) { void this.load(ctx, p.kind); continue; }
        if (!buf) continue;
        v = this.voice(ctx, p.kind, buf);
        this.voices.set(p.kind, v);
      }
      const pn = v.panner;
      if (pn.positionX) {
        pn.positionX.setTargetAtTime(p.x, ctx.currentTime, 0.4);
        pn.positionY.value = 1;
        pn.positionZ.setTargetAtTime(p.z, ctx.currentTime, 0.4);
      } else pn.setPosition(p.x, 1, p.z);
    }
  }

  silence(): void {
    for (const [k, v] of this.voices) this.fade(k, v);
  }

  private fade(kind: PlaceKind, v: Voice): void {
    this.voices.delete(kind);
    v.gain.gain.setTargetAtTime(0, v.gain.context.currentTime, 0.4);
    setTimeout(() => { v.stop(); v.gain.disconnect(); }, 2500);
  }

  private voice(ctx: AudioContext, kind: PlaceKind, buf: AudioBuffer): Voice {
    const t = PLACE_TRACKS[kind];
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'linear';
    panner.refDistance = 1.5;
    panner.maxDistance = t.reach;
    panner.rolloffFactor = 1;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(t.gain, ctx.currentTime, 0.6);
    gain.connect(panner).connect(this.bus!);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(gain);
    const at = ctx.currentTime + 0.05;
    src.start(at, trackOffset(Date.now() + 50, buf.duration));
    return { gain, panner, stop: () => { try { src.stop(); } catch { /* ended */ } } };
  }

  /** Fetch a place's track once; until it's here (or if there is none) the place is silent. */
  private async load(ctx: AudioContext, kind: PlaceKind): Promise<void> {
    this.buffers.set(kind, null);
    this.manifest ??= fetch('/sounds/manifest.json').then((r) => (r.ok ? r.json() : {})).then((j: { places?: Partial<Record<PlaceKind, string>> }) => j?.places ?? {}).catch(() => ({}));
    const file = (await this.manifest)[kind];
    if (!file || !/^[\w.-]+\.(mp3|ogg|m4a|wav)$/.test(file)) return;
    try {
      const r = await fetch(`/sounds/${file}`);
      if (r.ok) this.buffers.set(kind, await ctx.decodeAudioData(await r.arrayBuffer()));
    } catch { /* stays silent */ }
  }
}
