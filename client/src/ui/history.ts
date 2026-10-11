// History mode: the panel under the village shows how busy the channels were
// over a span (a day, a week, the month the feed holds), marks the busiest
// stretches, and replays whatever you pick or drag across. Pure helpers here;
// main.ts draws and wires them.

import type { Episode } from '../world/player';

export const SPANS = [
  { id: '24h', label: '24 h', seconds: 86400 },
  { id: '7d', label: '7 days', seconds: 7 * 86400 },
  { id: '30d', label: '30 days', seconds: 30 * 86400 },
] as const;
export type SpanId = (typeof SPANS)[number]['id'];

export const spanSeconds = (id: SpanId): number => SPANS.find((s) => s.id === id)!.seconds;

/** Messages per bin over [from, to). */
export function binCounts(times: readonly number[], from: number, to: number, bins: number): number[] {
  const out = new Array(Math.max(1, bins)).fill(0);
  const span = to - from;
  if (span <= 0) return out;
  for (const t of times) {
    if (t < from || t >= to) continue;
    out[Math.min(out.length - 1, Math.floor(((t - from) / span) * out.length))]++;
  }
  return out;
}

/** The busiest stretches inside [from, to]: most messages first, at most `n`. */
export function topPeaks(episodes: readonly Episode[], from: number, to: number, n = 5): Episode[] {
  return episodes
    .filter((e) => e.end >= from && e.start <= to)
    .sort((a, b) => b.count - a.count || b.end - a.end)
    .slice(0, n);
}

/** Panel x (0..1) → time, and back. */
export const xToTime = (x: number, from: number, to: number): number => from + Math.max(0, Math.min(1, x)) * (to - from);
export const timeToX = (t: number, from: number, to: number): number => (to > from ? (t - from) / (to - from) : 0);

/**
 * A drag from x0 to x1 (0..1) as a time range to replay. A click (a drag
 * shorter than `minX`) starts at that moment and plays the next hour.
 */
export function dragRange(x0: number, x1: number, from: number, to: number, minX = 0.01): { start: number; end: number } {
  const a = Math.min(x0, x1), b = Math.max(x0, x1);
  const start = xToTime(a, from, to);
  if (b - a < minX) return { start, end: Math.min(to, start + 3600) };
  return { start, end: xToTime(b, from, to) };
}

/** "Tue 21:40" for a peak, in the viewer's locale. */
export function peakLabel(start: number, locale?: string): string {
  return new Date(start * 1000).toLocaleString(locale, { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
