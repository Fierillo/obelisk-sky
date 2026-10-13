// A private conversation (nostr/dm.ts), in the chat panel's place on the
// right: their picture and name, a call button, the thread and a composer.
// Text goes in as textContent only (never markup from a relay).

import type { DirectMessage } from '../nostr/dm';
import { vw } from '../i18n/village';
import { lang } from '../i18n/lang';

export interface DmPanelDeps {
  me(): string | null;
  thread(peer: string): DirectMessage[];
  send(peer: string, text: string): Promise<string | null>;
  profile(pk: string): { name: string; avatar: string | null; nip05: string | null };
  colorOf(pk: string): string;
  call(peer: string): void;
  /** Online / AFK / offline, shown under the name. */
  presence(pk: string): string;
}

export class DmPanel {
  readonly el: HTMLElement;
  peer: string | null = null;
  private head: HTMLElement;
  private list: HTMLElement;
  private input: HTMLTextAreaElement;
  private error: HTMLElement;
  /** Closed (×): main.ts reopens the chat it covered. */
  onClose?: () => void;

  constructor(parent: HTMLElement, private deps: DmPanelDeps) {
    this.el = div('chat dm');
    this.el.hidden = true;
    this.head = div('chat-head');
    this.list = div('chat-list');
    this.error = div('chat-error');
    this.error.hidden = true;
    const composer = div('chat-composer');
    this.input = document.createElement('textarea');
    this.input.rows = 1;
    this.input.className = 'chat-input';
    this.input.placeholder = vw.dmPlaceholder;
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation(); // typing never walks
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void this.submit(); }
      if (e.key === 'Escape') this.input.blur();
    });
    const send = document.createElement('button');
    send.className = 'chat-send';
    send.textContent = vw.dmSend;
    send.addEventListener('click', () => void this.submit());
    composer.append(this.input, send);
    this.el.append(this.head, this.list, this.error, composer);
    parent.appendChild(this.el);
  }

  open(peer: string): void {
    this.peer = peer;
    this.el.hidden = false;
    document.body.classList.add('chat-open');
    this.error.hidden = true;
    this.render();
    setTimeout(() => this.input.focus(), 50);
  }

  close(): void {
    this.peer = null;
    this.el.hidden = true;
    this.onClose?.();
  }

  get isOpen(): boolean {
    return !this.el.hidden && !!this.peer;
  }

  /** New messages, a profile arrived: redraw if it's this conversation. */
  refresh(peer?: string): void {
    if (this.isOpen && (!peer || peer === this.peer)) this.render();
  }

  private render(): void {
    const peer = this.peer;
    if (!peer) return;
    const p = this.deps.profile(peer);
    const av = div('dm-avatar');
    if (p.avatar) {
      const img = document.createElement('img');
      img.src = p.avatar;
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      av.append(img);
    } else {
      av.textContent = ([...p.name][0] ?? '?').toUpperCase();
      av.style.background = this.deps.colorOf(peer);
    }
    const titles = div('chat-titles');
    titles.append(div('chat-title', p.name), div('chat-sub', `${vw.dmSub(this.deps.presence(peer))}${p.nip05 ? ` · ${p.nip05.replace(/^_@/, '')}` : ''}`));
    const call = document.createElement('button');
    call.className = 'chat-min dm-call';
    call.title = vw.dmCall;
    call.textContent = '📞';
    call.addEventListener('click', () => this.deps.call(peer));
    const x = document.createElement('button');
    x.className = 'chat-min';
    x.title = vw.close;
    x.textContent = '×';
    x.addEventListener('click', () => this.close());
    this.head.replaceChildren(av, titles, call, x);
    const me = this.deps.me();
    const msgs = this.deps.thread(peer).slice(-80);
    const rows = msgs.map((m) => {
      const row = div(`dm-msg${m.from === me ? ' mine' : ''}`);
      row.append(div('dm-text', m.text), div('dm-time', new Date(m.at * 1000).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })));
      return row;
    });
    if (!rows.length) rows.push(div('chat-empty', vw.dmEmpty));
    this.list.replaceChildren(...rows);
    this.list.scrollTop = this.list.scrollHeight;
  }

  private async submit(): Promise<void> {
    const peer = this.peer;
    const text = this.input.value.trim();
    if (!peer || !text) return;
    this.input.value = '';
    this.error.hidden = true;
    const err = await this.deps.send(peer, text);
    if (err) {
      this.error.textContent = err;
      this.error.hidden = false;
      this.input.value = text;
    }
    this.render();
  }
}

function div(cls: string, text?: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  if (text !== undefined) d.textContent = text;
  return d;
}
