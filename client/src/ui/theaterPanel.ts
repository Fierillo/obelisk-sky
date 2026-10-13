// The theater's panel, shown while you're in the hall (in the dock, over the
// call bar). With nothing screening: pick a channel and start one. The host
// shares their screen, answers raised hands (allow the mic or the screen,
// take it back), hands the hall over or ends it. Viewers raise a hand. Anyone
// can make the film full screen and set its volume.
//
// `theaterView` is pure (what to show); `TheaterPanel` draws it, redrawing
// only when that changes so a slider being dragged isn't rebuilt under you.

import type { HandWant, Screening } from '../nostr/theater';
import { vw } from '../i18n/village';

export interface TheaterChannel { id: string; name: string; kind: string }

export interface TheaterInput {
  me: string;
  /** Every channel on the relay; the theater shows voice ones. */
  channels: readonly TheaterChannel[];
  /** The channel picked here while nothing screens. */
  picked: string | null;
  screening: Screening | null;
  /** You host it (or are about to: your screening isn't back from the relay yet). */
  hosting: boolean;
  inCall: string | null;
  sharing: boolean;
  /** A screen is playing (anyone's, the gate allowing). */
  playing: boolean;
  /** A channel admin may take the hall over. */
  admin: boolean;
  hands: readonly { pk: string; want: Exclude<HandWant, 'down'> }[];
  myHand: Exclude<HandWant, 'down'> | null;
  /** People in the call (for the host's grants and hand-over). */
  participants: readonly string[];
  /** People sharing a screen the host hasn't allowed. */
  refused?: readonly string[];
  /** The shown channel's call is on right now (people in it, who shares a screen), seen from outside it. */
  live?: { count: number; screens: readonly string[] } | null;
  nameOf: (pk: string) => string;
}

export type TheaterMode = 'pick' | 'host' | 'viewer';

export interface TheaterView {
  mode: TheaterMode;
  title: string;
  status: string;
  channels: { id: string; name: string; selected: boolean }[];
  /** The channel picker is usable (nothing screens, or you host). */
  canPick: boolean;
  canStart: boolean;
  /** Join the screening's call (you're in the hall but not in it). */
  canJoin: boolean;
  canShare: boolean;
  sharing: boolean;
  canTakeOver: boolean;
  canFullscreen: boolean;
  /** Raise-hand buttons (viewers in the call). */
  raise: { mic: boolean; screen: boolean; mine: Exclude<HandWant, 'down'> | null } | null;
  /** The host's list: raised hands first, then everyone in the call. */
  people: { pk: string; name: string; hand: Exclude<HandWant, 'down'> | null; mic: boolean; screen: boolean }[];
  /** For the host: people sharing a screen that isn't up yet (one click puts it on). */
  pending: { pk: string; name: string }[];
}

export const isVoiceKind = (kind: string): boolean => kind.startsWith('voice');

export function theaterView(i: TheaterInput): TheaterView {
  const s = i.screening;
  const voice = i.channels.filter((c) => isVoiceKind(c.kind));
  const showing = s?.channel ?? i.picked;
  const name = (id: string | null) => (id ? i.channels.find((c) => c.id === id)?.name ?? vw.aChannel : '');
  const mode: TheaterMode = i.hosting ? 'host' : s ? 'viewer' : 'pick';
  const inThisCall = !!showing && i.inCall === showing;
  const canSpeakMe = !s || s.host === i.me || s.mic.includes(i.me);
  const canShareMe = !s || s.host === i.me || s.screen.includes(i.me);
  const liveNote = i.live && !inThisCall
    ? vw.liveNote(i.live.count, i.live.screens.length ? i.nameOf(i.live.screens[0]) : null)
    : '';
  const status = liveNote + (mode === 'pick'
    ? voice.length ? (i.picked ? vw.readyToShow(name(i.picked)) : vw.nothingShowing) : vw.noVoice
    : mode === 'host'
      ? i.sharing ? vw.hostingSharing : vw.hostingIdle
      : `${vw.isHosting(i.nameOf(s!.host))}${i.playing ? '' : (i.refused ?? []).length ? vw.refusedNote(i.nameOf(i.refused![0])) : vw.nothingOnScreen}.${inThisCall ? canSpeakMe ? vw.mayTalk : vw.micOffUntil : ''}`);
  const handPks = new Map(i.hands.map((h) => [h.pk, h.want]));
  const peoplePks = [...new Set([...i.hands.map((h) => h.pk), ...i.participants])].filter((pk) => pk !== i.me);
  return {
    mode,
    title: showing ? name(showing) : vw.theater,
    status,
    channels: voice.map((c) => ({ id: c.id, name: c.name, selected: c.id === showing })),
    canPick: (mode === 'pick' || mode === 'host') && voice.length > 0,
    canStart: mode === 'pick' && !!i.picked && voice.some((c) => c.id === i.picked),
    // Joining is for an audience: with nothing screening, hosting is the one thing to do.
    // …unless a call is already on there: then you can join it and watch.
    canJoin: (mode !== 'pick' || !!i.live) && !!showing && !inThisCall,
    canShare: inThisCall && canShareMe,
    sharing: i.sharing,
    canTakeOver: mode === 'viewer' && i.admin,
    canFullscreen: i.playing,
    raise: mode === 'viewer' && inThisCall ? { mic: !canSpeakMe, screen: !canShareMe, mine: i.myHand } : null,
    pending: mode === 'host' ? (i.refused ?? []).filter((pk) => pk !== i.me).map((pk) => ({ pk, name: i.nameOf(pk) })) : [],
    people: mode === 'host'
      ? peoplePks.map((pk) => ({ pk, name: i.nameOf(pk), hand: handPks.get(pk) ?? null, mic: !!s?.mic.includes(pk), screen: !!s?.screen.includes(pk) }))
        .sort((a, b) => Number(!!b.hand) - Number(!!a.hand))
      : [],
  };
}

export interface TheaterActions {
  pick(id: string): void;
  start(): void;
  join(): void;
  end(): void;
  share(on: boolean): void;
  raise(want: HandWant): void;
  grant(pk: string, kind: 'mic' | 'screen', on: boolean): void;
  handOver(pk: string): void;
  takeOver(): void;
  fullscreen(): void;
  /** Just the film, the call and the chat: the village stops drawing. */
  watch(): void;
  volume(v: number): void;
}

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};
const acts0 = (r: HTMLElement, e: HTMLElement) => { e.classList.add('theater-pending'); r.append(e); };

/** A button with a line saying what it does. */
const action = (text: string, explain: string, cls: string, on: () => void): HTMLElement => {
  const row = h('div', 'theater-action');
  row.append(btn(text, cls, on), h('span', 'theater-explain', explain));
  return row;
};

const btn = (text: string, cls: string, on: () => void, title = ''): HTMLButtonElement => {
  const b = h('button', `account-btn ${cls}`.trim(), text);
  b.type = 'button';
  if (title) b.title = title;
  b.addEventListener('click', on);
  return b;
};

export class TheaterPanel {
  private shownKey = '';
  private vol = 1;
  /** Folded to its title, so the film can be seen. */
  private collapsed = false;
  /** The viewer folded or opened it themselves since the film started: leave it so. */
  private chosen = false;
  private wasPlaying = false;

  constructor(private root: HTMLElement, private act: TheaterActions) {}

  hide(): void {
    this.root.hidden = true;
    this.shownKey = '';
  }

  /** Whether it's folded (tests, and the CSS). */
  get isCollapsed(): boolean {
    return this.collapsed;
  }

  show(v: TheaterView): void {
    this.root.hidden = false;
    // A film starts: fold out of the way (unless you chose otherwise); it stops: open again.
    if (v.canFullscreen !== this.wasPlaying) {
      this.wasPlaying = v.canFullscreen;
      this.chosen = false;
      this.collapsed = v.canFullscreen;
    }
    // Someone waiting for the host to put their screen up: the host must see it.
    if (v.pending.length && !this.chosen) this.collapsed = false;
    const key = JSON.stringify(v) + this.collapsed;
    if (key === this.shownKey) return;
    this.shownKey = key;
    const r = this.root;
    r.replaceChildren();
    r.classList.toggle('collapsed', this.collapsed);
    const head = h('button', 'theater-head');
    head.type = 'button';
    head.title = this.collapsed ? vw.openControls : vw.foldControls;
    head.setAttribute('aria-expanded', String(!this.collapsed));
    head.append(h('span', 'theater-badge', '🎬'), h('span', 'theater-title', v.title), h('span', 'theater-fold', this.collapsed ? '▸' : '▾'));
    head.addEventListener('click', () => { this.collapsed = !this.collapsed; this.chosen = true; this.shownKey = ''; this.show(v); });
    r.append(head);
    if (this.collapsed) return;
    r.append(h('div', 'theater-status', v.status));

    for (const p of v.pending) {
      acts0(r, action(vw.showScreen(p.name), vw.showScreenExplain(p.name), 'primary', () => this.act.grant(p.pk, 'screen', true)));
    }

    if (v.canPick) {
      const sel = h('select', 'theater-pick');
      sel.setAttribute('aria-label', vw.channelToShow);
      if (!v.channels.some((c) => c.selected)) {
        const o = h('option', '', vw.pickChannel);
        o.value = '';
        o.disabled = o.selected = true;
        sel.append(o);
      }
      for (const c of v.channels) {
        const o = h('option', '', c.name);
        o.value = c.id;
        o.selected = c.selected;
        sel.append(o);
      }
      sel.addEventListener('change', () => { if (sel.value) this.act.pick(sel.value); });
      r.append(sel);
    }

    const acts = h('div', 'theater-actions');
    if (v.canStart) acts.append(action(vw.hostScreening, vw.hostScreeningExplain, 'primary', () => this.act.start()));
    if (v.canJoin) acts.append(action(vw.joinAudience, vw.joinAudienceExplain, 'primary', () => this.act.join()));
    if (v.canShare) acts.append(v.sharing
      ? action(vw.stopSharing, vw.stopSharingExplain, 'danger', () => this.act.share(false))
      : action(vw.shareScreen, vw.shareScreenExplain, 'primary', () => this.act.share(true)));
    if (v.raise) {
      if (v.raise.mine) acts.append(action(vw.lowerHand, vw.askedTo(v.raise.mine === 'mic'), '', () => this.act.raise('down')));
      else {
        if (v.raise.mic) acts.append(action(vw.askTalk, vw.askTalkExplain, '', () => this.act.raise('mic')));
        if (v.raise.screen) acts.append(action(vw.askShare, vw.askShareExplain, '', () => this.act.raise('screen')));
      }
    }
    if (v.canTakeOver) acts.append(action(vw.takeOver, vw.takeOverExplain, '', () => this.act.takeOver()));
    acts.append(action(vw.watchMode, vw.watchModeExplain, '', () => this.act.watch()));
    if (v.canFullscreen) acts.append(action(vw.fullScreen, vw.fullScreenExplain, '', () => this.act.fullscreen()));
    if (v.mode === 'host') acts.append(action(vw.endScreening, vw.endScreeningExplain, 'danger', () => this.act.end()));
    if (acts.childElementCount) r.append(acts);

    if (v.canFullscreen) {
      const vol = h('input', 'theater-volume');
      vol.type = 'range';
      vol.min = '0';
      vol.max = '1';
      vol.step = '0.05';
      vol.value = String(this.vol);
      vol.setAttribute('aria-label', vw.filmVolume);
      vol.addEventListener('input', () => { this.vol = Number(vol.value); this.act.volume(this.vol); });
      const lab = h('label', 'theater-vol-row');
      lab.append(h('span', '', '🔊'), vol);
      r.append(lab);
    }

    if (v.people.length) {
      const list = h('div', 'theater-people');
      list.append(h('div', 'theater-explain', vw.inCallExplain));
      for (const p of v.people) {
        const line = h('div', 'theater-person');
        line.append(h('span', 'theater-name', `${p.hand ? '✋ ' : ''}${p.name}`));
        line.append(btn(p.mic ? `🎙 ${vw.granted}` : '🎙', p.mic ? 'on' : '', () => this.act.grant(p.pk, 'mic', !p.mic), p.mic ? vw.takeMic : vw.allowTalk));
        line.append(btn(p.screen ? `🖥 ${vw.granted}` : '🖥', p.screen ? 'on' : '', () => this.act.grant(p.pk, 'screen', !p.screen), p.screen ? vw.takeScreen : vw.allowScreen));
        line.append(btn(vw.host, '', () => this.act.handOver(p.pk), vw.handHall));
        list.append(line);
      }
      r.append(list);
    }
  }
}

/** The film full screen: a video over everything, closed by its button or Escape. */
export function openFullscreenVideo(stream: MediaStream): () => void {
  const wrap = h('div', 'theater-full');
  const v = h('video');
  v.muted = true; // the sound plays through the call
  v.autoplay = true;
  v.playsInline = true;
  v.srcObject = stream;
  const close = btn('✕', 'theater-full-close', () => done(), vw.closeEsc);
  wrap.append(v, close);
  document.body.append(wrap);
  void v.play().catch(() => {});
  const key = (e: KeyboardEvent) => { if (e.key === 'Escape') done(); };
  window.addEventListener('keydown', key);
  let open = true;
  function done() {
    if (!open) return;
    open = false;
    window.removeEventListener('keydown', key);
    v.srcObject = null;
    wrap.remove();
  }
  return done;
}

/**
 * Watch mode: the film fills the page under the chat, the theater panel and
 * the call bar; the 3D village isn't drawn (main.ts skips the frame) until
 * you come back. `show` swaps the stream (or a card's words when nothing
 * plays).
 */
export class WatchView {
  readonly el: HTMLElement;
  private video: HTMLVideoElement;
  private card: HTMLElement;
  private stream: MediaStream | null = null;
  private key = (e: KeyboardEvent) => { if (e.key === 'Escape') this.onClose(); };

  /** `parent` is the village's own layer (#app), so the chat, the theater panel and the call bar stay over the film. */
  constructor(private onClose: () => void, parent: HTMLElement = document.body) {
    this.el = h('div', 'theater-watch');
    this.video = h('video');
    this.video.muted = true; // the sound plays through the call
    this.video.autoplay = true;
    this.video.playsInline = true;
    this.card = h('div', 'theater-watch-card');
    const back = btn(vw.backToVillage, 'theater-watch-back', () => this.onClose(), 'Esc');
    this.el.append(this.video, this.card, back);
    parent.prepend(this.el);
    document.body.classList.add('watching');
    window.addEventListener('keydown', this.key);
  }

  show(stream: MediaStream | null, words: [string, string]): void {
    if (stream !== this.stream) {
      this.stream = stream;
      this.video.srcObject = stream;
      if (stream) void this.video.play().catch(() => {});
    }
    this.video.hidden = !stream;
    this.card.hidden = !!stream;
    this.card.replaceChildren(h('div', 'theater-watch-title', words[0]), h('div', 'theater-watch-line', words[1]));
  }

  close(): void {
    window.removeEventListener('keydown', this.key);
    this.video.srcObject = null;
    this.el.remove();
    document.body.classList.remove('watching');
  }
}
