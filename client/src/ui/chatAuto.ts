// What the chat panel does when your character's place changes (you settle
// in a channel's yard, or leave it). Pure, so the rules are easy to test.

export const CHAT_OPEN_PREFS = ['auto', 'ask', 'off'] as const;
export type ChatOpenPref = (typeof CHAT_OPEN_PREFS)[number];

export interface PanelState {
  /** The channel whose chat is showing, or null. */
  open: string | null;
  /** Who opened it: walking in ('auto') or the viewer (a click, a key). */
  openedBy: 'auto' | 'user' | null;
}

export type PanelAction =
  | { kind: 'open'; id: string }
  | { kind: 'hint'; id: string }
  | { kind: 'close' }
  | { kind: 'none' };

/**
 * - Walking into a yard opens its chat ('auto'), offers a button ('ask') or
 *   does nothing ('off'). A chat you opened yourself is never swapped for
 *   another one under you: you get the button instead.
 * - Walking out closes a chat only if walking in opened it.
 */
export function onPlaceChange(place: string | null, panel: PanelState, pref: ChatOpenPref): PanelAction {
  if (place) {
    if (panel.open === place) return { kind: 'none' };
    if (pref === 'off') return { kind: 'none' };
    if (pref === 'auto' && !(panel.open && panel.openedBy === 'user')) return { kind: 'open', id: place };
    return { kind: 'hint', id: place };
  }
  return panel.open && panel.openedBy === 'auto' ? { kind: 'close' } : { kind: 'none' };
}

/** Seconds you linger in a yard while walking before it counts as entering
 *  (stopping counts at once). Long enough that walking past doesn't. */
export const SETTLE_WALKING = 1.2;
