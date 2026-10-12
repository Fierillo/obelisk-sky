// The left drawer, the chat panel's twin on the other side: the relay's
// channels (go there, see who's around) or a channel's members grouped by
// standing and presence (memberGroups.ts), as obelisk-dex lists them.

import type { Presence } from '../nostr/presence';
import { groupMembers, type Rank } from './memberGroups';

export type SideTab = 'channels' | 'members';

export interface ChannelRow { id: string; name: string; kind: string; unread: number; mention: boolean; here: number }

export interface SidePanelDeps {
  channels(): ChannelRow[];
  /** The channel the members list starts on (where you stand), else the first. */
  defaultChannel(): string | null;
  loadMembers(groupId: string): Promise<{ admins: string[]; members: string[] }>;
  /** People seen writing in the channel (open channels may publish no member list). */
  posters(groupId: string): string[];
  loadRanks(): Promise<Record<string, readonly Rank[]>>;
  presenceOf(pk: string): Presence;
  profile(pk: string): { name: string; avatar: string | null; nip05: string | null };
  colorOf(pk: string): string;
  me(): string | null;
  onChannel(id: string): void;
  onMember(pk: string): void;
}

export class SidePanel {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private title: HTMLElement;
  /** The members tab's channel picker: built once, so a redraw never closes it while open. */
  private pick: HTMLSelectElement;
  private list: HTMLElement;
  tab: SideTab | null = null;
  private channel: string | null = null;
  private offlineOpen = false;
  private ranks: Record<string, readonly Rank[]> = {};
  private token = 0;
  /** What the list and picker last showed: a redraw with nothing new is skipped. */
  private shown = '';
  private options = '';

  constructor(parent: HTMLElement, private deps: SidePanelDeps) {
    this.el = div('side');
    this.el.hidden = true;
    const head = div('side-head');
    this.title = div('side-title');
    const x = document.createElement('button');
    x.className = 'chat-min';
    x.title = 'Close';
    x.textContent = '×';
    x.addEventListener('click', () => this.close());
    head.append(this.title, x);
    this.body = div('side-body');
    this.pick = document.createElement('select');
    this.pick.className = 'themes-select side-pick';
    this.pick.addEventListener('change', () => this.choose(this.pick.value));
    this.list = div('side-list');
    this.body.append(this.pick, this.list);
    this.el.append(head, this.body);
    parent.appendChild(this.el);
  }

  /** Open on a tab (or close it, if that tab is already showing). */
  toggle(tab: SideTab): void {
    if (this.tab === tab && !this.el.hidden) { this.close(); return; }
    this.tab = tab;
    this.el.hidden = false;
    this.shown = '';
    document.body.classList.add('side-open');
    if (tab === 'members') this.channel = this.channel && this.deps.channels().some((c) => c.id === this.channel) ? this.channel : this.deps.defaultChannel();
    this.render();
  }

  close(): void {
    this.tab = null;
    this.el.hidden = true;
    document.body.classList.remove('side-open');
  }

  /** Show `groupId`'s members. */
  showMembers(groupId: string): void {
    if (this.tab !== 'members' || this.el.hidden) { this.channel = groupId; this.toggle('members'); }
    else this.choose(groupId);
  }

  /** Data changed (presence, unread, profiles): redraw what's showing. */
  refresh(): void {
    // A picker that's open (focused) keeps its list: rebuilding it would close it.
    if (this.el.hidden || document.activeElement === this.pick) return;
    this.render();
  }

  private choose(id: string): void {
    if (id === this.channel) return;
    this.channel = id;
    this.shown = '';
    this.list.replaceChildren(div('side-empty', 'Loading members…'));
    void this.renderMembers();
  }

  private render(): void {
    if (this.tab === 'channels') this.renderChannels();
    else if (this.tab === 'members') void this.renderMembers();
  }

  /** Swap the list's rows in, unless they'd look just like what's there. */
  private show(sig: string, rows: () => HTMLElement[]): void {
    if (sig === this.shown) return;
    this.shown = sig;
    this.list.replaceChildren(...rows());
  }

  private renderChannels(): void {
    const rows = this.deps.channels();
    this.title.textContent = `Channels · ${rows.length}`;
    this.pick.hidden = true;
    this.show(`c|${JSON.stringify(rows)}`, () => {
      if (!rows.length) return [div('side-empty', 'No channels on this relay yet.')];
      return rows.map((c) => {
        const b = document.createElement('button');
        b.className = `side-row${c.unread ? ' unread' : ''}`;
        const icon = span('side-ico', c.kind.startsWith('voice') ? '🔊' : c.kind === 'forum' ? '📰' : '#');
        const name = span('side-name', c.name);
        b.append(icon, name);
        if (c.here) b.append(span('side-here', `${c.here} here`));
        if (c.unread || c.mention) b.append(span(`side-badge${c.mention ? ' ping' : ''}`, c.mention ? '@' : String(c.unread)));
        b.addEventListener('click', () => this.deps.onChannel(c.id));
        const members = document.createElement('button');
        members.className = 'side-mini';
        members.title = 'Members';
        members.textContent = '👥';
        members.addEventListener('click', (e) => { e.stopPropagation(); this.showMembers(c.id); });
        b.append(members);
        return b;
      });
    });
  }

  /** The picker's options, rebuilt only when the channels themselves change. */
  private fillPicker(): void {
    const channels = this.deps.channels();
    const sig = channels.map((c) => `${c.id}\u0000${c.name}`).join('\u0001');
    if (sig !== this.options) {
      this.options = sig;
      this.pick.replaceChildren(...channels.map((c) => {
        const o = document.createElement('option');
        o.value = c.id;
        o.textContent = c.name;
        return o;
      }));
    }
    if (this.channel && this.pick.value !== this.channel) this.pick.value = this.channel;
  }

  private async renderMembers(): Promise<void> {
    const token = ++this.token;
    const id = this.channel;
    this.pick.hidden = false;
    this.fillPicker();
    if (!id) { this.title.textContent = 'Members'; this.show('m|none', () => [div('side-empty', 'No channels yet.')]); return; }
    if (!this.shown.startsWith(`m|${id}|`)) { this.title.textContent = 'Members'; if (!this.list.querySelector('.side-empty')) this.list.replaceChildren(div('side-empty', 'Loading members…')); }
    const [m, ranks] = await Promise.all([this.deps.loadMembers(id), this.deps.loadRanks()]);
    if (token !== this.token || this.tab !== 'members') return;
    this.ranks = ranks;
    const pks = [...new Set([...m.members, ...this.deps.posters(id), ...(this.deps.me() ? [this.deps.me()!] : [])])];
    const sections = groupMembers(pks, new Set(m.admins), (pk) => this.ranks[pk], (pk) => this.deps.presenceOf(pk), (pk) => this.deps.profile(pk).name);
    this.title.textContent = `Members · ${pks.length}`;
    const sig = `m|${id}|${this.offlineOpen}|${JSON.stringify(sections.map((s) => [s.key, s.rows.map((r) => [r.pk, r.admin, r.presence, r.rank?.name ?? '', this.deps.profile(r.pk)])]))}`;
    this.show(sig, () => {
      const out: HTMLElement[] = [];
      for (const s of sections) {
        const offline = s.key === 'offline';
        const h = document.createElement('button');
        h.className = 'side-section';
        h.textContent = `${offline ? (this.offlineOpen ? '▾ ' : '▸ ') : ''}${s.label} — ${s.rows.length}`;
        if (offline) h.addEventListener('click', () => { this.offlineOpen = !this.offlineOpen; void this.renderMembers(); });
        out.push(h);
        if (offline && !this.offlineOpen) continue;
        for (const r of s.rows) out.push(this.memberRow(r.pk, r.admin, r.presence, r.rank));
      }
      return out;
    });
  }

  private memberRow(pk: string, admin: boolean, presence: Presence, rank: Rank | null): HTMLElement {
    const p = this.deps.profile(pk);
    const b = document.createElement('button');
    b.className = `side-row member ${presence}`;
    const av = div('side-avatar');
    if (p.avatar) {
      const img = document.createElement('img');
      img.src = p.avatar;
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      av.append(img);
    } else {
      av.textContent = ([...p.name][0] ?? '?').toUpperCase();
      av.style.background = this.deps.colorOf(pk);
    }
    const dot = span(`side-dot ${presence}`, '');
    dot.title = presence === 'online' ? 'Online' : presence === 'afk' ? 'Away (AFK)' : 'Offline';
    av.append(dot);
    const names = div('side-names');
    names.append(span('side-name', `${admin ? '🛡️ ' : ''}${p.name}${pk === this.deps.me() ? ' (you)' : ''}`));
    if (p.nip05) names.append(span('side-nip', p.nip05.replace(/^_@/, '')));
    b.append(av, names);
    if (rank) {
      const badge = span('side-rank', rank.emoji ? `${rank.emoji} ${rank.name}` : rank.name);
      badge.style.borderColor = rank.color;
      badge.style.color = rank.color;
      b.append(badge);
    }
    if (presence === 'afk') b.append(span('side-afk', 'AFK'));
    b.addEventListener('click', () => this.deps.onMember(pk));
    return b;
  }
}

function div(cls: string, text?: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  if (text !== undefined) d.textContent = text;
  return d;
}
function span(cls: string, text: string): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = cls;
  s.textContent = text;
  return s;
}
