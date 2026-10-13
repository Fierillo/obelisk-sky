import { describe, expect, it } from 'vitest';
import npcs from './npcs.json';
import { ANSWERS, HOUSES, NPCS, THREADS, buildGuestSnapshot, castFor, guestHistory, houseGroupId, playThread } from './script';
import { GYM_RE } from '../world/gym';

const NOW = 1_760_000_000;

describe('the guest villagers (npcs.json)', () => {
  it('are real-looking pubkeys, each once, each with a home house', () => {
    expect(npcs.length).toBeGreaterThanOrEqual(12);
    const pks = npcs.map((n) => n.pubkey);
    for (const pk of pks) expect(pk).toMatch(/^[0-9a-f]{64}$/);
    expect(new Set(pks).size).toBe(pks.length);
    const houses = new Set(HOUSES.map((h) => h.id));
    for (const n of npcs) {
      expect(houses.has(n.home as never), n.name).toBe(true);
      expect(Array.isArray(n.haunts)).toBe(true);
      for (const h of n.haunts) expect(['coffee', 'parrilla', 'nostrwot', 'campfire', 'pond', 'plaza', 'park', 'track', 'gym', 'market', 'home']).toContain(h);
    }
  });
});

describe('the guest script', () => {
  it('says everything in both languages', () => {
    for (const h of HOUSES) { expect(h.name.en && h.name.es).toBeTruthy(); expect(h.about.en && h.about.es).toBeTruthy(); }
    for (const t of THREADS) for (const l of t.lines) { expect(l.t.en.trim()).not.toBe(''); expect(l.t.es.trim()).not.toBe(''); }
    for (const a of ANSWERS) { expect(a.en.trim()).not.toBe(''); expect(a.es.trim()).not.toBe(''); }
  });

  it('answers only earlier lines, and every thread is in a house', () => {
    const houses = new Set(HOUSES.map((h) => h.id));
    for (const t of THREADS) {
      expect(houses.has(t.house)).toBe(true);
      t.lines.forEach((l, i) => { if (l.re !== undefined) expect(l.re).toBeLessThan(i); expect(l.by).toBeLessThan(3); });
    }
  });

  it('has a gym and a campfire among its houses', () => {
    expect(HOUSES.some((h) => GYM_RE.test(h.name.en) && GYM_RE.test(h.name.es))).toBe(true);
    expect(HOUSES.some((h) => h.voice)).toBe(true);
  });

  it('casts three different villagers, the house’s own first, and recasts on a new loop', () => {
    const i = THREADS.findIndex((t) => t.house === 'mate');
    const cast = castFor(THREADS[i], i, 0);
    expect(new Set(cast).size).toBe(3);
    expect(NPCS.find((n) => n.pubkey === cast[0])!.home).toBe('mate');
    const casts = new Set([0, 1, 2, 3].map((c) => castFor(THREADS[i], i, c).join()));
    expect(casts.size).toBeGreaterThan(1);
  });

  it('plays a thread as replies and reactions to its own lines', () => {
    const beats = playThread(0, NOW, 'es', 0, () => 30);
    expect(beats).toHaveLength(THREADS[0].lines.length);
    const ids = new Set(beats.map((b) => b.ev.id));
    for (const b of beats) {
      expect(b.ev.sig).toBe('');
      expect(b.ev.tags).toContainEqual(['h', houseGroupId(THREADS[0].house)]);
      const reply = b.ev.tags.find((t) => t[0] === 'e')?.[1];
      if (reply) expect(ids.has(reply)).toBe(true);
      for (const r of b.reactions) { expect(r.kind).toBe(7); expect(r.tags.find((t) => t[0] === 'e')![1]).toBe(b.ev.id); expect(r.pubkey).not.toBe(b.ev.pubkey); }
    }
    expect(beats[0].ev.content).toBe(THREADS[0].lines[0].t.es);
    // Another loop: other ids.
    expect(playThread(0, NOW, 'es', 1)[0].ev.id).not.toBe(beats[0].ev.id);
  });
});

describe('buildGuestSnapshot', () => {
  it('opens every house with a past of conversations, all in the snapshot', () => {
    const snap = buildGuestSnapshot(NOW, 'en');
    expect(snap.t).toBe('snapshot');
    expect(snap.groups.map((g) => g.id).sort()).toEqual(HOUSES.map((h) => houseGroupId(h.id)).sort());
    expect(snap.groups.find((g) => g.id === houseGroupId('fogon'))!.kind).toBe('voice');
    const groups = new Set(snap.groups.map((g) => g.id));
    const ids = new Set(snap.messages.map((m) => m.id));
    expect(snap.messages.length).toBeGreaterThan(60);
    for (const m of snap.messages) {
      expect(groups.has(m.groupId)).toBe(true);
      expect(m.createdAt).toBeLessThanOrEqual(NOW);
      expect(m.createdAt).toBeGreaterThan(NOW - 7 * 3600);
      if (m.replyToId) expect(ids.has(m.replyToId)).toBe(true);
      expect(NPCS.some((n) => n.pubkey === m.pubkey)).toBe(true);
    }
    for (const r of snap.reactions) expect(ids.has(r.targetId)).toBe(true);
    // The village wakes up mid-conversation: something in the last twenty minutes.
    expect(snap.messages.some((m) => NOW - m.createdAt < 20 * 60)).toBe(true);
  });

  it('is the same for the same moment, and speaks the language asked for', () => {
    const a = buildGuestSnapshot(NOW, 'es');
    const b = buildGuestSnapshot(NOW, 'es');
    expect(a.messages.map((m) => m.id)).toEqual(b.messages.map((m) => m.id));
    const es = new Set(THREADS.flatMap((t) => t.lines.map((l) => l.t.es)));
    for (const m of a.messages) expect(es.has(m.content!)).toBe(true);
    expect(a.groups.find((g) => g.id === houseGroupId('mate'))!.name).toBe('Mate y charla');
  });

  it('never signs anything', () => {
    for (const e of guestHistory(NOW, 'en')) expect(e.sig).toBe('');
  });
});
