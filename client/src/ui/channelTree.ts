// The channel list's sections, as obelisk-dex's sidebar draws them
// (panes/sidebar/ChannelTree.tsx): the operator's categories from the
// relay's `obelisk:layout` event, in its order, each with its channels, then
// the channels no category claims, headed only when categories stand beside
// them. Pure.

import { applyLayout, type ChannelLayout } from '@/services/relay/channel-layout';

export interface ChannelSection<T> {
  /** The category id; null for the uncategorized list. */
  id: string | null;
  /** The operator's name, as given (may be empty: label it when drawing). */
  name: string;
  /** Shown above the rows; false only for the lone uncategorized list. */
  headed: boolean;
  rows: T[];
}

export function channelSections<T extends { id: string }>(rows: readonly T[], layout: ChannelLayout): ChannelSection<T>[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const laid = applyLayout(layout, rows.map((r) => r.id));
  const pick = (ids: readonly string[]) => ids.flatMap((id) => byId.get(id) ?? []);
  const out: ChannelSection<T>[] = laid.categories.map((c) => ({ id: c.id, name: c.name, headed: true, rows: pick(c.channelIds) }));
  const rest = pick(laid.uncategorized);
  if (rest.length) out.push({ id: null, name: '', headed: out.length > 0, rows: rest });
  return out;
}
