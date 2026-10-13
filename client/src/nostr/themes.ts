// Themed districts: which part of the island a channel lives in.
//
// A sky-only setting: replaceable kind 30078, d=`obelisk-sky:themes:<relay>`,
// published by the relay's NIP-11 operator alone, the same authority rule
// obelisk-dex uses for its channel layout and roles
// (docs/features/relay-layout-and-branding.md). Nothing here is read or
// written by obelisk-dex, so the app is untouched.
//
// Whole categories can be themed: category ids come from the app's existing
// `obelisk:layout:<relay>` (read only).
//
//   ["channel", <groupId>, <themeId>]
//   ["category", <categoryId>, <themeId>]

import type { Event as NostrEvent, EventTemplate } from 'nostr-tools';
import type { RelayHub } from '@nostr-wot/relay/hub';
import { fetchRelayInfo, operatorPubkeyFromRelayInfo } from '@/services/relay/relay-info';
import type { ChannelKind } from './groups';
import { vw } from '../i18n/village';

export const THEMES = ['plaza', 'sports', 'gaming', 'library', 'stage'] as const;
export type ThemeId = (typeof THEMES)[number];

export const THEME_LABEL: Record<ThemeId, string> = vw.themes;

export interface ThemeConfig {
  channels: Record<string, ThemeId>;
  categories: Record<string, ThemeId>;
  updatedAt: number;
}

export const EMPTY_THEMES: ThemeConfig = { channels: {}, categories: {}, updatedAt: 0 };

export const themesDTag = (relay: string) => `obelisk-sky:themes:${relay}`;
export const layoutDTag = (relay: string) => `obelisk:layout:${relay}`;

const isTheme = (v: unknown): v is ThemeId => typeof v === 'string' && (THEMES as readonly string[]).includes(v);

export function parseThemes(ev: NostrEvent, relay: string): ThemeConfig | null {
  if (ev.kind !== 30078 || !ev.tags.some((t) => t[0] === 'd' && t[1] === themesDTag(relay))) return null;
  const out: ThemeConfig = { channels: {}, categories: {}, updatedAt: ev.created_at };
  for (const t of ev.tags) {
    if (!t[1] || !isTheme(t[2])) continue;
    if (t[0] === 'channel' && !(t[1] in out.channels)) out.channels[t[1]] = t[2];
    else if (t[0] === 'category' && !(t[1] in out.categories)) out.categories[t[1]] = t[2];
  }
  return out;
}

export function themesTemplate(relay: string, cfg: ThemeConfig, prevCreatedAt = 0): EventTemplate {
  const tags: string[][] = [['d', themesDTag(relay)]];
  for (const [id, th] of Object.entries(cfg.categories)) tags.push(['category', id, th]);
  for (const [id, th] of Object.entries(cfg.channels)) tags.push(['channel', id, th]);
  // Same-second edits must still win (obelisk-dex publishRoleEvent does this).
  return { kind: 30078, content: '', tags, created_at: Math.max(Math.floor(Date.now() / 1000), prevCreatedAt + 1) };
}

/** channel id → category id, from the app's `obelisk:layout` event. */
export function parseLayoutCategories(ev: NostrEvent, relay: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!ev.tags.some((t) => t[0] === 'd' && t[1] === layoutDTag(relay))) return out;
  for (const t of ev.tags) if (t[0] === 'channel' && t[1] && t[2]) out[t[1]] = t[2];
  return out;
}

export function layoutCategoryNames(ev: NostrEvent): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of ev.tags) if (t[0] === 'category' && t[1]) out[t[1]] = t[2] ?? '';
  return out;
}

const SPORTS = /run|gym|fit|sport|calist|train|workout|deporte|futbol|fútbol|soccer|bike|bici|yoga|crossfit|runstr/i;
const GAMING = /game|gaming|play|arcade|juego|chess|ajedrez|esport/i;

/** Day-one guess from the channel's name and kind, before any config exists. */
export function heuristicTheme(name: string, kind: ChannelKind): ThemeId {
  if (SPORTS.test(name)) return 'sports';
  if (GAMING.test(name)) return 'gaming';
  if (kind === 'forum') return 'library';
  if (kind === 'voice' || kind === 'voice-sfu') return 'stage';
  return 'plaza';
}

export function resolveTheme(
  group: { id: string; name: string; kind: ChannelKind },
  cfg: ThemeConfig,
  categoryOf: Record<string, string>,
): ThemeId {
  const explicit = cfg.channels[group.id];
  if (explicit) return explicit;
  const cat = categoryOf[group.id];
  if (cat && cfg.categories[cat]) return cfg.categories[cat];
  return heuristicTheme(group.name, group.kind);
}

/** Live theme config + layout categories for one relay, operator-authored. */
export class ThemeStore {
  config: ThemeConfig = EMPTY_THEMES;
  categoryOf: Record<string, string> = {};
  categoryNames: Record<string, string> = {};
  operator: string | null = null;
  private layoutAt = 0;
  private release: (() => void) | null = null;
  private listeners = new Set<() => void>();

  constructor(private hub: RelayHub, private relay: string) {}

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  async start(): Promise<void> {
    const info = await fetchRelayInfo(this.relay).catch(() => null);
    this.operator = operatorPubkeyFromRelayInfo(info);
    if (!this.operator) { this.emit(); return; }
    const relayKey = this.relay.replace(/\/+$/, '');
    const dTags = [themesDTag(relayKey), themesDTag(`${relayKey}/`), layoutDTag(relayKey), layoutDTag(`${relayKey}/`)];
    const sub = this.hub.subscribe({
      relays: [this.relay],
      filters: [{ kinds: [30078], authors: [this.operator], '#d': dTags }],
      priority: 'background',
      label: 'sky-themes',
      onEvent: (ev) => this.ingest(ev, relayKey),
    });
    this.release = () => sub.release();
    this.emit();
  }

  stop(): void {
    this.release?.();
  }

  private ingest(ev: NostrEvent, relayKey: string): void {
    if (ev.pubkey !== this.operator) return;
    for (const r of [relayKey, `${relayKey}/`]) {
      const th = parseThemes(ev, r);
      if (th && th.updatedAt >= this.config.updatedAt) { this.config = th; this.emit(); return; }
      if (ev.tags.some((t) => t[0] === 'd' && t[1] === layoutDTag(r)) && ev.created_at >= this.layoutAt) {
        this.layoutAt = ev.created_at;
        this.categoryOf = parseLayoutCategories(ev, r);
        this.categoryNames = layoutCategoryNames(ev);
        this.emit();
        return;
      }
    }
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}
