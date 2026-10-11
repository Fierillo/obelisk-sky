import { describe, it, expect } from 'vitest';
import { Director } from './director';
import { Player, findEpisodes, paceDelay, type Ev, LIVE_IDLE_BEFORE_STORY } from './player';

let n = 0;
const m = (pubkey: string, at: number, groupId = 'g'): Ev =>
  ({ k: 'msg', at, m: { id: `e${n++}`, pubkey, groupId, text: 'hello there', replyTo: null, replyToId: null, createdAt: at } });

describe('findEpisodes', () => {
  it('splits on long gaps and drops tiny clusters', () => {
    const evs = [m('A', 0), m('B', 60), m('A', 120), m('C', 5000), m('A', 20000), m('B', 20030), m('C', 20090), m('A', 20100)];
    const eps = findEpisodes(evs);
    expect(eps.map((e) => e.count)).toEqual([3, 4]);
    expect(eps[1]).toMatchObject({ start: 20000, end: 20100, groupId: 'g' });
  });
});

describe('paceDelay', () => {
  it('leaves time to read but compresses long gaps', () => {
    expect(paceDelay(m('A', 0), m('B', 3600))).toBeLessThanOrEqual(7);
    expect(paceDelay(m('A', 0), m('B', 3600))).toBeGreaterThanOrEqual(2);
  });
});

describe('Player', () => {
  const NOW = 100_000;
  const history = () => [m('A', NOW - 7200), m('B', NOW - 7150), m('A', NOW - 7100), m('C', NOW - 7050)];

  it('starts a replay when the village is quiet, then returns live', () => {
    const d = new Director();
    const p = new Player(d);
    p.load(history(), NOW);
    expect(p.mode).toBe('replay');
    for (let i = 0; i < 80; i++) p.update(0.5, NOW);
    expect(p.mode).toBe('live');
    expect(d.people.size).toBe(3);
  });

  it('a live event interrupts a replay', () => {
    const d = new Director();
    const p = new Player(d);
    p.load(history(), NOW);
    expect(p.mode).toBe('replay');
    p.push(m('D', NOW + 1), NOW + 1);
    expect(p.mode).toBe('live');
    expect(d.people.has('D')).toBe(true);
  });

  it('stays live when recent, and drifts into story after quiet', () => {
    const d = new Director();
    const p = new Player(d);
    p.load([m('A', NOW - 60), m('B', NOW - 50), m('A', NOW - 40)], NOW);
    expect(p.mode).toBe('live');
    p.update(LIVE_IDLE_BEFORE_STORY + 1, NOW);
    expect(p.mode).toBe('replay');
  });

  it('ignores duplicates', () => {
    const d = new Director();
    const p = new Player(d);
    const e = m('A', NOW - 5);
    p.load([e], NOW);
    const before = p.events.length;
    p.push(e, NOW);
    expect(p.events.length).toBe(before);
  });
});
