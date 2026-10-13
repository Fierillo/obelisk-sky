// The member list's sections, as obelisk-dex draws them (its
// utils/chat/members/member-groups.ts): people online grouped by standing
// (channel admins, then each relay rank by tier, then everyone else), and
// the rest in one list. Sky also knows who stepped away: AFK sits between.

import type { Presence } from '../nostr/presence';
import { vw } from '../i18n/village';

export interface Rank { id: string; name: string; tier: number; color: string; emoji: string }

export interface MemberRow {
  pk: string;
  admin: boolean;
  presence: Presence;
  /** Their top relay rank, if any (the badge). */
  rank: Rank | null;
}

export interface MemberSection {
  key: string;
  label: string;
  rows: MemberRow[];
}

export function groupMembers(
  pks: readonly string[],
  admins: ReadonlySet<string>,
  ranksOf: (pk: string) => readonly Rank[] | undefined,
  presenceOf: (pk: string) => Presence,
  nameOf: (pk: string) => string,
): MemberSection[] {
  const rows: MemberRow[] = pks.map((pk) => ({ pk, admin: admins.has(pk), presence: presenceOf(pk), rank: ranksOf(pk)?.[0] ?? null }));
  const byName = (a: MemberRow, b: MemberRow) => nameOf(a.pk).localeCompare(nameOf(b.pk));
  const online = rows.filter((r) => r.presence === 'online');
  const sections: MemberSection[] = [];
  sections.push({ key: 'admin', label: vw.admins, rows: online.filter((r) => r.admin).sort(byName) });
  const ranked = new Map<string, { rank: Rank; rows: MemberRow[] }>();
  for (const r of online) {
    if (r.admin || !r.rank) continue;
    const b = ranked.get(r.rank.id) ?? { rank: r.rank, rows: [] };
    b.rows.push(r);
    ranked.set(r.rank.id, b);
  }
  for (const { rank, rows: rs } of [...ranked.values()].sort((a, b) => b.rank.tier - a.rank.tier || a.rank.id.localeCompare(b.rank.id))) {
    sections.push({ key: `rank:${rank.id}`, label: rank.emoji ? `${rank.emoji} ${rank.name}` : rank.name, rows: rs.sort(byName) });
  }
  sections.push({ key: 'member', label: vw.presence.online, rows: online.filter((r) => !r.admin && !r.rank).sort(byName) });
  sections.push({ key: 'afk', label: vw.afk, rows: rows.filter((r) => r.presence === 'afk').sort(byName) });
  sections.push({ key: 'offline', label: vw.presence.offline, rows: rows.filter((r) => r.presence === 'offline').sort(byName) });
  return sections.filter((s) => s.rows.length > 0);
}
