// The channel you're standing in: recent messages, reactions and a composer.
// Opens when your character walks into a building's yard, minimises when you
// walk out. Text is rendered through content.ts (textContent only; images
// as <img>, never relay HTML).

import type { WireGroup, WireMessage, WireReaction } from '../nostr/wire';
import { pubkeyColor } from '../world/character';
import { renderContent } from './content';

export const QUICK_REACTIONS = ['❤️', '👍', '😂', '🔥', '🤙', '⚡', '👀', '🎉'];
const MAX_SHOWN = 60;

export interface ChatPanelDeps {
  me: () => string | null;
  nameOf: (pk: string) => string;
  avatarOf: (pk: string) => string | null;
  messages: (groupId: string) => WireMessage[];
  reactions: (msgId: string) => WireReaction[];
  send: (groupId: string, text: string, replyTo: WireMessage | null) => Promise<string | null>;
  react: (msg: WireMessage, emoji: string) => void;
  unreact: (r: WireReaction) => void;
  remove: (msg: WireMessage) => void;
  join: (groupId: string) => Promise<string | null>;
  onReplyPick?: (msg: WireMessage) => void;
  onGame?: (gameId: string) => void;
  /** A mention chip in a message was clicked. */
  onProfile?: (pubkey: string) => void;
  newGame?: (groupId: string) => void;
}

type Bodies = typeof import('../chat/messageBody');

export class ChatPanel {
  readonly el: HTMLElement;
  private list: HTMLElement;
  private title: HTMLElement;
  private sub: HTMLElement;
  private input: HTMLTextAreaElement;
  private replyChip: HTMLElement;
  private error: HTMLElement;
  private group: WireGroup | null = null;
  private replyTo: WireMessage | null = null;
  private pickerFor: string | null = null;
  minimised = false;

  constructor(parent: HTMLElement, private deps: ChatPanelDeps) {
    this.el = div('chat');
    this.el.hidden = true;
    const head = div('chat-head');
    const titles = div('chat-titles');
    this.title = div('chat-title');
    this.sub = div('chat-sub');
    titles.append(this.title, this.sub);
    const min = button('chat-min', 'Minimise');
    min.textContent = '–';
    min.addEventListener('click', () => this.setMinimised(!this.minimised));
    const games = button('chat-min chat-games', 'Start a game here');
    games.textContent = 'Game';
    games.addEventListener('click', () => { if (this.group) this.deps.newGame?.(this.group.id); });
    head.append(titles, games, min);
    head.addEventListener('dblclick', () => this.setMinimised(!this.minimised));
    this.list = div('chat-list');
    this.replyChip = div('chat-reply');
    this.replyChip.hidden = true;
    this.error = div('chat-error');
    this.error.hidden = true;
    const composer = div('chat-composer');
    this.input = document.createElement('textarea');
    this.input.rows = 1;
    this.input.placeholder = 'Say something…';
    this.input.className = 'chat-input';
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void this.submit(); }
      if (e.key === 'Escape') { this.setReply(null); this.input.blur(); }
    });
    const send = button('chat-send', 'Send');
    send.textContent = 'Send';
    send.addEventListener('click', () => void this.submit());
    composer.append(this.input, send);
    this.el.append(head, this.list, this.replyChip, this.error, composer);
    parent.appendChild(this.el);
  }

  get groupId(): string | null {
    return this.group?.id ?? null;
  }

  open(g: WireGroup): void {
    const changed = this.group?.id !== g.id;
    this.group = g;
    this.el.hidden = false;
    document.body.classList.add('chat-open');
    this.title.textContent = g.name;
    this.sub.textContent = g.kind === 'forum' ? 'Publication' : g.kind.startsWith('voice') ? 'Voice channel' : 'Text channel';
    if (changed) { this.setReply(null); this.error.hidden = true; this.setMinimised(false); }
    this.render();
  }

  close(): void {
    this.group = null;
    this.el.hidden = true;
    this.bodies?.pruneBodies(new Set());
    document.body.classList.remove('chat-open');
    this.setReply(null);
  }

  setMinimised(m: boolean): void {
    this.minimised = m;
    this.el.classList.toggle('min', m);
  }

  focusComposer(): void {
    if (this.group && !this.el.hidden) { this.setMinimised(false); this.input.focus(); }
  }

  setReply(m: WireMessage | null): void {
    this.replyTo = m;
    this.replyChip.hidden = !m;
    this.replyChip.replaceChildren();
    if (!m) return;
    const label = document.createElement('span');
    label.textContent = `Replying to ${this.deps.nameOf(m.pubkey)}`;
    const x = button('chat-reply-x', 'Cancel reply');
    x.textContent = '×';
    x.addEventListener('click', () => this.setReply(null));
    this.replyChip.append(label, x);
    this.input.focus();
  }

  /** Re-render if the panel shows `groupId` (or always, with no argument). */
  refresh(groupId?: string): void {
    if (!this.group || (groupId && groupId !== this.group.id)) return;
    this.render();
  }

  private async submit(): Promise<void> {
    const text = this.input.value.trim();
    if (!text || !this.group) return;
    this.input.value = '';
    const reply = this.replyTo;
    this.setReply(null);
    const err = await this.deps.send(this.group.id, text, reply);
    if (err) this.showError(err, text);
  }

  private showError(reason: string, text: string): void {
    this.error.hidden = false;
    this.error.replaceChildren();
    const msg = document.createElement('span');
    const needsJoin = /member/i.test(reason);
    msg.textContent = needsJoin ? 'This channel is members-only.' : `Not sent: ${reason}`;
    this.error.append(msg);
    if (needsJoin && this.group) {
      const g = this.group;
      const join = button('chat-join', 'Request to join');
      join.textContent = 'Request to join';
      join.addEventListener('click', async () => {
        const e = await this.deps.join(g.id);
        msg.textContent = e ? `Join request failed: ${e}` : 'Join requested. An admin has to approve it.';
        join.remove();
      });
      this.error.append(join);
    }
    if (!this.input.value) this.input.value = text;
  }

  /** obelisk-dex's message renderer, loaded on the first open (React, markdown). */
  private bodies: Bodies | null = null;
  private bodiesLoading = false;

  private loadBodies(): void {
    if (this.bodies || this.bodiesLoading) return;
    this.bodiesLoading = true;
    void import('../chat/messageBody').then((b) => {
      b.setBodyHandlers({ onGame: (id) => this.deps.onGame?.(id), onProfile: (pk) => this.deps.onProfile?.(pk) });
      this.bodies = b;
      this.render();
    }).catch((e) => {
      // Stay on the plain renderer.
      console.warn('[sky] message renderer failed to load', e);
    });
  }

  private render(): void {
    if (!this.group) return;
    this.loadBodies();
    const atBottom = this.list.scrollHeight - this.list.scrollTop - this.list.clientHeight < 40;
    const msgs = this.deps.messages(this.group.id).slice(-MAX_SHOWN);
    this.list.replaceChildren();
    if (!msgs.length) {
      const empty = div('chat-empty');
      empty.textContent = 'Nobody has said anything here in the last 30 days. Be the first.';
      this.list.append(empty);
    }
    const me = this.deps.me();
    for (const m of msgs) this.list.append(this.row(m, me));
    this.bodies?.pruneBodies(new Set(msgs.map((m) => m.id)));
    if (atBottom || msgs.length < 8) this.list.scrollTop = this.list.scrollHeight;
  }

  private row(m: WireMessage, me: string | null): HTMLElement {
    const row = div('chat-msg');
    row.dataset.msgId = m.id;
    const av = this.avatar(m.pubkey);
    const body = div('chat-body');
    const meta = div('chat-meta');
    const who = document.createElement('span');
    who.className = 'chat-who';
    who.style.color = pubkeyColor(m.pubkey);
    who.textContent = this.deps.nameOf(m.pubkey);
    const when = document.createElement('span');
    when.className = 'chat-when';
    when.textContent = new Date(m.createdAt * 1000).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    meta.append(who, when);
    if (m.replyTo) {
      const r = document.createElement('span');
      r.className = 'chat-to';
      r.textContent = `↪ ${this.deps.nameOf(m.replyTo)}`;
      meta.append(r);
    }
    let content: HTMLElement;
    if (this.bodies) {
      content = this.bodies.messageBodyEl({ id: m.id, content: m.content ?? m.text, groupId: m.groupId, images: m.images ?? [], emojis: m.emojis ?? {} });
    } else {
      content = div('chat-text');
      renderContent(content, m.content ?? m.text, { nameOf: this.deps.nameOf, images: m.images ?? [], emojis: m.emojis, onGame: this.deps.onGame });
    }
    body.append(meta, content, this.reactionsRow(m, me));

    const actions = div('chat-actions');
    if (me) {
      const reply = button('chat-act', 'Reply');
      reply.textContent = 'Reply';
      reply.addEventListener('click', () => { this.setReply(m); this.deps.onReplyPick?.(m); });
      const react = button('chat-act', 'React');
      react.textContent = 'React';
      react.addEventListener('click', () => { this.pickerFor = this.pickerFor === m.id ? null : m.id; this.render(); });
      actions.append(reply, react);
      if (m.pubkey === me) {
        const del = button('chat-act danger', 'Delete');
        del.textContent = 'Delete';
        del.addEventListener('click', () => { if (confirm('Delete this message for everyone?')) this.deps.remove(m); });
        actions.append(del);
      }
    }
    row.append(av, body, actions);
    if (this.pickerFor === m.id) row.append(this.picker(m));
    return row;
  }

  private reactionsRow(m: WireMessage, me: string | null): HTMLElement {
    const wrap = div('chat-reactions');
    const groups = new Map<string, WireReaction[]>();
    for (const r of this.deps.reactions(m.id)) {
      const list = groups.get(r.emoji) ?? [];
      list.push(r);
      groups.set(r.emoji, list);
    }
    for (const [emoji, list] of groups) {
      const mine = me ? list.find((r) => r.pubkey === me) : undefined;
      const chip = button(`chat-chip${mine ? ' mine' : ''}`, list.map((r) => this.deps.nameOf(r.pubkey)).join(', '));
      chip.textContent = `${emoji} ${list.length}`;
      chip.disabled = !me;
      chip.addEventListener('click', () => (mine ? this.deps.unreact(mine) : this.deps.react(m, emoji)));
      wrap.append(chip);
    }
    return wrap;
  }

  private picker(m: WireMessage): HTMLElement {
    const p = div('chat-picker');
    for (const e of QUICK_REACTIONS) {
      const b = button('chat-pick', `React ${e}`);
      b.textContent = e;
      b.addEventListener('click', () => { this.pickerFor = null; this.deps.react(m, e); this.render(); });
      p.append(b);
    }
    return p;
  }

  private avatar(pk: string): HTMLElement {
    const url = this.deps.avatarOf(pk);
    if (url) {
      const img = document.createElement('img');
      img.className = 'chat-av';
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.loading = 'lazy';
      img.src = url;
      img.onerror = () => img.replaceWith(this.initial(pk));
      return img;
    }
    return this.initial(pk);
  }

  private initial(pk: string): HTMLElement {
    const d = div('chat-av');
    d.style.background = pubkeyColor(pk);
    d.textContent = ([...this.deps.nameOf(pk).replace(/^@/, '')][0] ?? '?').toUpperCase();
    return d;
  }
}

function div(cls: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  return d;
}

function button(cls: string, label: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = cls;
  b.type = 'button';
  b.setAttribute('aria-label', label);
  b.title = label;
  return b;
}
