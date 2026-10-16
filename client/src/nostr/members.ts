// Who belongs to a channel, and their standing, read the way obelisk-dex
// reads them: NIP-29 kind 39001 (admins, with their roles) and 39002
// (members) for the channel, and the relay's ranks (kind 30078
// `obelisk:roles:<relay>` catalog + `obelisk:role:<relay>:<id>` holders,
// trusted only from the relay operator). The parsing is obelisk-dex's own
// (vendor relay-roles-model).

import type { Event as NostrEvent } from 'nostr-tools';
import type { RelayHub } from '@nostr-wot/relay/hub';
import {
  EMPTY_RELAY_ROLES, parseRoleCatalog, parseRoleHolders, roleCatalogDTag, roleHoldersDTag, rolesByPubkey,
  type RelayRole, type RelayRoles,
} from '@/utils/relay/relay-roles-model';
import { activeRelay } from './hub';

export type { RelayRole };

export interface ChannelMembers {
  admins: string[];
  members: string[];
  /** When it was fetched (ms); re-fetched after a minute. */
  at: number;
}

/** No ranks came (the relay may not have let us in yet): ask again after this. */
const ROLES_RETRY_MS = 30_000;

const PK = /^[0-9a-f]{64}$/;

/** The newest 39001/39002 for a channel, as pubkey lists (admins also count as members). */
export function parseChannelMembers(events: readonly NostrEvent[], groupId: string): { admins: string[]; members: string[] } {
  const latest = (kind: number) => events
    .filter((e) => e.kind === kind && e.tags.some((t) => t[0] === 'd' && t[1] === groupId))
    .sort((a, b) => b.created_at - a.created_at)[0];
  const pks = (e: NostrEvent | undefined) => [...new Set((e?.tags ?? []).filter((t) => t[0] === 'p' && PK.test(t[1] ?? '')).map((t) => t[1]))];
  const admins = pks(latest(39001));
  const members = [...new Set([...admins, ...pks(latest(39002))])];
  return { admins, members };
}

export class MembersStore {
  private byGroup = new Map<string, ChannelMembers>();
  private pending = new Map<string, Promise<ChannelMembers>>();
  roles: RelayRoles = EMPTY_RELAY_ROLES;
  rolesOf: Record<string, RelayRole[]> = {};
  /** The relay the ranks were read for, and when: re-read on a switch, or after a while when none came. */
  private rolesFor: string | null = null;
  private rolesAt = 0;

  constructor(private hub: RelayHub, private operator: () => string | null) {}

  cached(groupId: string): ChannelMembers | null {
    return this.byGroup.get(groupId) ?? null;
  }

  /** A channel's admins and members (cached for a minute). */
  async load(groupId: string): Promise<ChannelMembers> {
    const c = this.byGroup.get(groupId);
    if (c && Date.now() - c.at < 60_000) return c;
    const inflight = this.pending.get(groupId);
    if (inflight) return inflight;
    const p = this.hub.query({ relays: [activeRelay()], filters: [{ kinds: [39001, 39002], '#d': [groupId] }], maxWaitMs: 4000, label: 'sky-members' })
      .then((r) => ({ ...parseChannelMembers(r.events, groupId), at: Date.now() }))
      .catch(() => ({ admins: [], members: [], at: Date.now() }))
      .then((m) => { this.byGroup.set(groupId, m); this.pending.delete(groupId); return m; });
    this.pending.set(groupId, p);
    return p;
  }

  /** The relay's ranks, from its operator (once per relay). */
  async loadRoles(): Promise<Record<string, RelayRole[]>> {
    const op = this.operator();
    const relay = activeRelay();
    if (!op) return this.rolesOf;
    if (this.rolesFor === relay && (this.roles.roles.length || Date.now() - this.rolesAt < ROLES_RETRY_MS)) return this.rolesOf;
    if (this.rolesFor !== relay) { this.roles = EMPTY_RELAY_ROLES; this.rolesOf = {}; }
    this.rolesFor = relay;
    this.rolesAt = Date.now();
    // The operator's tags name the relay as their client spelled it: with or without the trailing slash.
    const key = relay.replace(/\/+$/, '');
    const spellings = [key, `${key}/`];
    try {
      const cat = await this.hub.query({ relays: [relay], filters: [{ kinds: [30078], authors: [op], '#d': spellings.map(roleCatalogDTag) }], maxWaitMs: 4000, label: 'sky-roles' });
      const ev = cat.events.filter((e) => e.pubkey === op).sort((a, b) => b.created_at - a.created_at)[0];
      if (!ev) return this.rolesOf;
      const spelled = spellings.find((r) => ev.tags.some((t) => t[0] === 'd' && t[1] === roleCatalogDTag(r))) ?? key;
      let state: RelayRoles = parseRoleCatalog(ev);
      if (state.roles.length) {
        const h = await this.hub.query({ relays: [relay], filters: [{ kinds: [30078], authors: [op], '#d': state.roles.map((r) => roleHoldersDTag(spelled, r.id)) }], maxWaitMs: 4000, label: 'sky-role-holders' });
        const newest = new Map<string, { at: number; pubkeys: readonly string[] }>();
        for (const e of h.events) {
          if (e.pubkey !== op) continue;
          const parsed = parseRoleHolders(e, spelled);
          if (parsed && parsed.updatedAt > (newest.get(parsed.roleId)?.at ?? 0)) newest.set(parsed.roleId, { at: parsed.updatedAt, pubkeys: parsed.pubkeys });
        }
        state = { ...state, holders: Object.fromEntries([...newest].map(([id, v]) => [id, v.pubkeys])) };
      }
      this.roles = state;
      this.rolesOf = rolesByPubkey(state);
    } catch {
      // Ask again next time rather than showing no ranks for good.
      this.rolesAt = 0;
    }
    return this.rolesOf;
  }
}
