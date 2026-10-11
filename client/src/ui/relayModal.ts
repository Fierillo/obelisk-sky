// Relays and their channels, like Obelisk's relay rail: pick the relay the
// village shows (one at a time, the app's single-relay rule), add or remove
// your own, and jump to any channel on the current one, grouped by the
// operator's categories.

import { fetchRelayInfo, faviconFor } from '@/services/relay/relay-info';
import { normalizeRelay } from '../nostr/hub';
import type { WireGroup } from '../nostr/wire';

export interface RelayModalDeps {
  active: () => string;
  relays: () => string[];
  custom: () => string[];
  addRelay: (url: string) => void;
  removeRelay: (url: string) => void;
  switchTo: (url: string) => void;
  groups: () => WireGroup[];
  categories: () => { names: Record<string, string>; of: Record<string, string> };
  unread: (groupId: string) => number;
  goTo: (groupId: string) => void;
}

const host = (u: string) => u.replace(/^wss?:\/\//, '');

export function openRelayModal(parent: HTMLElement, deps: RelayModalDeps): void {
  parent.querySelector('.relays')?.remove();
  const el = document.createElement('div');
  el.className = 'themes relays';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Relays and channels');
  const close = () => { el.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);

  const head = document.createElement('div');
  head.className = 'themes-head relays-head';
  const title = document.createElement('div');
  title.className = 'themes-title';
  title.textContent = 'Relays';
  const sub = document.createElement('div');
  sub.className = 'themes-sub';
  sub.textContent = 'Each relay is its own village. You log in to the one you visit, and only that one.';
  const x = document.createElement('button');
  x.type = 'button';
  x.className = 'game-close relays-x';
  x.setAttribute('aria-label', 'Close');
  x.textContent = '×';
  x.addEventListener('click', close);
  head.append(title, sub, x);

  const cols = document.createElement('div');
  cols.className = 'relays-cols';
  const rail = document.createElement('div');
  rail.className = 'relays-rail';
  const chans = document.createElement('div');
  chans.className = 'relays-channels';
  cols.append(rail, chans);

  const renderRail = () => {
    rail.replaceChildren();
    for (const url of deps.relays()) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `relay-row${url === deps.active() ? ' on' : ''}`;
      const icon = document.createElement('span');
      icon.className = 'relay-icon';
      icon.textContent = (host(url)[0] ?? '?').toUpperCase();
      const text = document.createElement('span');
      text.className = 'relay-text';
      const name = document.createElement('span');
      name.className = 'relay-name';
      name.textContent = host(url);
      const desc = document.createElement('span');
      desc.className = 'relay-desc';
      desc.textContent = url === deps.active() ? 'You are here' : '';
      text.append(name, desc);
      row.append(icon, text);
      if (deps.custom().includes(url)) {
        const rm = document.createElement('span');
        rm.className = 'relay-rm';
        rm.setAttribute('role', 'button');
        rm.setAttribute('aria-label', `Remove ${host(url)}`);
        rm.title = 'Remove';
        rm.textContent = '×';
        rm.addEventListener('click', (e) => { e.stopPropagation(); deps.removeRelay(url); renderRail(); });
        row.append(rm);
      }
      row.addEventListener('click', () => {
        if (url !== deps.active()) { deps.switchTo(url); close(); }
      });
      rail.append(row);
      // NIP-11 name, description and icon (cached by the app's helper).
      void fetchRelayInfo(url).then((info) => {
        if (info?.name) name.textContent = info.name;
        if (info?.description && url !== deps.active()) desc.textContent = info.description.slice(0, 80);
        const src = info?.icon || faviconFor(url);
        if (src && /^https:\/\//.test(src)) {
          const img = document.createElement('img');
          img.alt = '';
          img.referrerPolicy = 'no-referrer';
          img.onload = () => { icon.textContent = ''; icon.append(img); };
          img.src = src;
        }
      }).catch(() => {});
    }
    const add = document.createElement('form');
    add.className = 'relay-add';
    const input = document.createElement('input');
    input.className = 'themes-select';
    input.placeholder = 'Add a relay: wss://…';
    input.setAttribute('aria-label', 'Relay address');
    const btn = document.createElement('button');
    btn.type = 'submit';
    btn.className = 'account-btn';
    btn.textContent = 'Add';
    const err = document.createElement('div');
    err.className = 'relay-err';
    add.append(input, btn, err);
    add.addEventListener('submit', (e) => {
      e.preventDefault();
      const url = normalizeRelay(input.value);
      if (!url) { err.textContent = 'That doesn’t look like a relay address (wss://…).'; return; }
      deps.addRelay(url);
      renderRail();
    });
    rail.append(add);
  };

  const renderChannels = () => {
    chans.replaceChildren();
    const h = document.createElement('div');
    h.className = 'themes-section';
    h.textContent = `Channels on ${host(deps.active())}`;
    chans.append(h);
    const groups = deps.groups();
    if (!groups.length) {
      const p = document.createElement('div');
      p.className = 'game-note';
      p.textContent = 'No channels yet, or this relay hasn’t let you in.';
      chans.append(p);
      return;
    }
    const { names, of } = deps.categories();
    const buckets = new Map<string, WireGroup[]>();
    for (const g of groups) {
      const cat = of[g.id] && names[of[g.id]] !== undefined ? of[g.id] : '';
      buckets.set(cat, [...(buckets.get(cat) ?? []), g]);
    }
    const order = [...Object.keys(names).filter((c) => buckets.has(c)), ...(buckets.has('') ? [''] : [])];
    for (const cat of order) {
      if (cat || order.length > 1) {
        const ch = document.createElement('div');
        ch.className = 'relay-cat';
        ch.textContent = cat ? names[cat] || 'Untitled' : 'Other';
        chans.append(ch);
      }
      for (const g of buckets.get(cat)!) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'relay-chan';
        const n = document.createElement('span');
        n.textContent = g.name;
        const kind = document.createElement('small');
        kind.textContent = g.kind === 'forum' ? 'Publication' : g.kind.startsWith('voice') ? 'Voice' : '';
        row.append(n, kind);
        const u = deps.unread(g.id);
        if (u) {
          const b = document.createElement('span');
          b.className = 'sign-count';
          b.textContent = u > 99 ? '99+' : String(u);
          row.append(b);
        }
        row.addEventListener('click', () => { deps.goTo(g.id); close(); });
        chans.append(row);
      }
    }
  };

  renderRail();
  renderChannels();
  el.append(head, cols);
  parent.append(el);
}
