import { describe, it, expect } from 'vitest';
import { carrierOf, cebadorOf, nextHolder, reachOf, stepRound, PASS_TIME, SIP_TIME, type Round } from './mateRound';

/** Run a bench for `seconds`, recording each change of hands. */
function run(seated: string[], seconds: number, start: Round | null = null) {
  let r = start;
  const carriers: string[] = [];
  for (let t = 0; t < seconds; t += 1 / 30) {
    r = stepRound(r, seated, 1 / 30);
    if (!r) break;
    const c = carrierOf(r);
    if (carriers[carriers.length - 1] !== c) carriers.push(c);
  }
  return { r, carriers };
}

describe('a ronda de mate', () => {
  it('needs two people: alone, you keep your own mate', () => {
    expect(stepRound(null, ['a'], 1)).toBeNull();
    expect(stepRound(null, [], 1)).toBeNull();
  });

  it('the cebador sits in the middle and serves each guest in turn, getting it back between them', () => {
    expect(cebadorOf(['a', 'b', 'c'])).toBe('b');
    const { carriers } = run(['a', 'b', 'c'], (SIP_TIME + PASS_TIME) * 6 + 0.5);
    expect(carriers.slice(0, 6)).toEqual(['b', 'a', 'b', 'c', 'b', 'a']);
  });

  it('passes back and forth between two', () => {
    const { carriers } = run(['a', 'b'], (SIP_TIME + PASS_TIME) * 3 + 0.5);
    expect(carriers).toEqual(['a', 'b', 'a', 'b']);
  });

  it('only ever passes between neighbours on a bench of three', () => {
    const seated = ['a', 'b', 'c'];
    const { carriers } = run(seated, 60);
    for (let i = 1; i < carriers.length; i++) {
      expect(Math.abs(seated.indexOf(carriers[i]) - seated.indexOf(carriers[i - 1]))).toBe(1);
    }
  });

  it('changes hands halfway through a pass, with both arms reaching then', () => {
    const r: Round = { cebador: 'b', holder: 'b', lastGuest: null, phase: 'pass', t: PASS_TIME * 0.4, to: 'a' };
    expect(carrierOf(r)).toBe('b');
    expect(carrierOf({ ...r, t: PASS_TIME * 0.6 })).toBe('a');
    expect(reachOf({ ...r, t: PASS_TIME / 2 })).toBeCloseTo(1, 6);
    expect(reachOf({ ...r, phase: 'sip' })).toBe(0);
  });

  it('copes with people getting up', () => {
    // The holder leaves with it: the cebador starts again.
    let r = stepRound({ cebador: 'b', holder: 'a', lastGuest: 'a', phase: 'sip', t: 1, to: null }, ['b', 'c'], 0.1)!;
    expect(r.cebador).toBe(cebadorOf(['b', 'c']));
    expect(r.holder).toBe(r.cebador);
    // The one it was being passed to leaves before taking it: it goes to the next.
    r = stepRound({ cebador: 'b', holder: 'b', lastGuest: null, phase: 'pass', t: 0.1, to: 'a' }, ['b', 'c', 'd'], 0.1)!;
    expect(r.to).not.toBe('a');
    // The giver leaves right after handing it over: the taker has it.
    r = stepRound({ cebador: 'b', holder: 'b', lastGuest: null, phase: 'pass', t: PASS_TIME * 0.7, to: 'a' }, ['a', 'c'], 0.01)!;
    expect(carrierOf(r)).toBe('a');
    // Down to one: the round ends.
    expect(stepRound(r, ['a'], 0.1)).toBeNull();
  });

  it('serves guests after the last one, wrapping around', () => {
    expect(nextHolder({ cebador: 'c', holder: 'c', lastGuest: null }, ['a', 'b', 'c', 'd'])).toBe('a');
    expect(nextHolder({ cebador: 'c', holder: 'c', lastGuest: 'd' }, ['a', 'b', 'c', 'd'])).toBe('a');
    expect(nextHolder({ cebador: 'c', holder: 'a', lastGuest: 'a' }, ['a', 'b', 'c', 'd'])).toBe('c');
  });
});
