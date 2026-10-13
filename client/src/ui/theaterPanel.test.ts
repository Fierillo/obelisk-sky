// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { TheaterPanel, theaterView, type TheaterInput } from './theaterPanel';
import type { Screening } from '../nostr/theater';

const ME = 'a'.repeat(64), HOST = 'b'.repeat(64), BOB = 'c'.repeat(64);
const channels = [
  { id: 'cine', name: 'Cine', kind: 'voice' },
  { id: 'big', name: 'Big room', kind: 'voice-sfu' },
  { id: 'general', name: 'General', kind: 'text' },
];
const screening = (o: Partial<Screening> = {}): Screening => ({ channel: 'cine', since: 1, mic: [], screen: [], host: HOST, id: 'x', at: 1, exp: 9e9, ended: false, ...o });
const input = (o: Partial<TheaterInput> = {}): TheaterInput => ({
  me: ME, channels, picked: null, screening: null, hosting: false, inCall: null, sharing: false, playing: false,
  admin: false, hands: [], myHand: null, participants: [], nameOf: (pk) => (pk === HOST ? 'Hostess' : pk === BOB ? 'Bob' : 'Me'), ...o,
});

describe('what the theater panel shows', () => {
  it('nothing screening: pick a voice channel, then start', () => {
    const v = theaterView(input());
    expect(v.mode).toBe('pick');
    expect(v.channels.map((c) => c.id)).toEqual(['cine', 'big']);
    expect(v.canStart).toBe(false);
    const p = theaterView(input({ picked: 'big' }));
    expect(p.canStart).toBe(true);
    // No "join" with nothing screening: hosting is the one thing to do.
    expect(p.canJoin).toBe(false);
    expect(p.title).toBe('Big room');
  });

  it('a viewer joins, then asks to talk or share; the picker is the host’s', () => {
    const out = theaterView(input({ screening: screening() }));
    expect(out).toMatchObject({ mode: 'viewer', canPick: false, canJoin: true, canShare: false, raise: null });
    const inCall = theaterView(input({ screening: screening(), inCall: 'cine' }));
    expect(inCall.canJoin).toBe(false);
    expect(inCall.raise).toEqual({ mic: true, screen: true, mine: null });
    const granted = theaterView(input({ screening: screening({ mic: [ME], screen: [ME] }), inCall: 'cine' }));
    expect(granted.raise).toEqual({ mic: false, screen: false, mine: null });
    expect(granted.canShare).toBe(true);
  });

  it('only an admin may take over', () => {
    expect(theaterView(input({ screening: screening() })).canTakeOver).toBe(false);
    expect(theaterView(input({ screening: screening(), admin: true })).canTakeOver).toBe(true);
  });

  it('the host sees raised hands first, then the call, with their grants', () => {
    const v = theaterView(input({
      hosting: true, screening: screening({ host: ME, mic: [BOB] }), inCall: 'cine',
      participants: [ME, BOB, HOST], hands: [{ pk: HOST, want: 'screen' }],
    }));
    expect(v.mode).toBe('host');
    expect(v.canShare).toBe(true);
    expect(v.people.map((p) => [p.name, p.hand, p.mic])).toEqual([['Hostess', 'screen', false], ['Bob', null, true]]);
  });
});

describe('the panel', () => {
  it('draws the view and sends what you press', () => {
    const root = document.createElement('div');
    const act = { pick: vi.fn(), start: vi.fn(), join: vi.fn(), end: vi.fn(), share: vi.fn(), raise: vi.fn(), grant: vi.fn(), handOver: vi.fn(), takeOver: vi.fn(), fullscreen: vi.fn(), watch: vi.fn(), volume: vi.fn() };
    const panel = new TheaterPanel(root, act);
    panel.show(theaterView(input({ picked: 'cine' })));
    expect(root.hidden).toBe(false);
    const sel = root.querySelector('select')!;
    sel.value = 'big';
    sel.dispatchEvent(new Event('change'));
    expect(act.pick).toHaveBeenCalledWith('big');
    [...root.querySelectorAll('button')].find((b) => /Host a screening/.test(b.textContent!))!.click();
    expect([...root.querySelectorAll('button')].some((b) => /Join/.test(b.textContent!))).toBe(false);
    expect(act.start).toHaveBeenCalled();
    panel.show(theaterView(input({ hosting: true, screening: screening({ host: ME }), inCall: 'cine', participants: [BOB] })));
    [...root.querySelectorAll('.theater-person button')][0].dispatchEvent(new MouseEvent('click'));
    expect(act.grant).toHaveBeenCalledWith(BOB, 'mic', true);
    panel.hide();
    expect(root.hidden).toBe(true);
  });

  it('does not rebuild while nothing changed (a slider keeps its drag)', () => {
    const root = document.createElement('div');
    const panel = new TheaterPanel(root, { pick() {}, start() {}, join() {}, end() {}, share() {}, raise() {}, grant() {}, handOver() {}, takeOver() {}, fullscreen() {}, watch() {}, volume() {} });
    const v = theaterView(input({ screening: screening(), inCall: 'cine', playing: true }));
    panel.show(v);
    const slider = root.querySelector('input[type=range]');
    panel.show({ ...v });
    expect(root.querySelector('input[type=range]')).toBe(slider);
  });

  it('folds away while the film plays, and opens for a screen waiting on the host', () => {
    const root = document.createElement('div');
    const act = { pick() {}, start() {}, join() {}, end() {}, share() {}, raise() {}, grant: vi.fn(), handOver() {}, takeOver() {}, fullscreen() {}, watch() {}, volume() {} };
    const panel = new TheaterPanel(root, act);
    panel.show(theaterView(input({ screening: screening(), inCall: 'cine', playing: false })));
    expect(panel.isCollapsed).toBe(false);
    panel.show(theaterView(input({ screening: screening(), inCall: 'cine', playing: true })));
    expect(panel.isCollapsed).toBe(true);
    expect(root.querySelector('.theater-status')).toBeNull();
    // A click on the title opens it again.
    (root.querySelector('.theater-head') as HTMLButtonElement).click();
    expect(panel.isCollapsed).toBe(false);
    // The host: someone shares without leave, one click puts it up.
    const host = new TheaterPanel(document.createElement('div'), act);
    const v = theaterView(input({ hosting: true, screening: screening({ host: ME }), inCall: 'cine', playing: true, participants: [BOB], refused: [BOB] }));
    expect(v.pending).toEqual([{ pk: BOB, name: 'Bob' }]);
    host.show(v);
    expect(host.isCollapsed).toBe(false);
    const show = [...(host as unknown as { root: HTMLElement }).root.querySelectorAll('button')].find((b) => /Show Bob/.test(b.textContent!))!;
    show.click();
    expect(act.grant).toHaveBeenCalledWith(BOB, 'screen', true);
  });

  it('tells viewers whose screen waits for the host', () => {
    const v = theaterView(input({ screening: screening(), inCall: 'cine', refused: [BOB] }));
    expect(v.status).toMatch(/Bob is sharing/);
    expect(v.pending).toEqual([]);
  });
});

describe('watch mode', () => {
  it('covers the page with the film (or a card), hides the village’s controls, and closes on Esc', async () => {
    const { WatchView } = await import('./theaterPanel');
    let closed = 0;
    const w = new WatchView(() => { closed++; });
    expect(document.body.classList.contains('watching')).toBe(true);
    w.show(null, ['Cine', 'Waiting for the host']);
    expect(w.el.textContent).toContain('Waiting for the host');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closed).toBe(1);
    w.close();
    expect(document.body.classList.contains('watching')).toBe(false);
    expect(document.querySelector('.theater-watch')).toBeNull();
  });
});
