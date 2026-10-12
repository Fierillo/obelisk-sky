// Phones play the village sideways. Upright, a card over everything asks you
// to turn the phone (CSS shows it: `.rotate`, phones in portrait); its button
// goes full screen and asks the browser to hold landscape, which Android
// allows in full screen and installed apps (the manifest asks too). iOS
// can't be locked: turning the phone is the only way there.

/** A phone held upright: the rotate card shows (the same query as the CSS). */
export const PORTRAIT_PHONE = '(pointer: coarse) and (orientation: portrait) and (max-width: 600px)';

type Lockable = ScreenOrientation & { lock?: (o: 'landscape') => Promise<void> };

/** Full screen, then landscape where the browser allows it. True when it held. */
export async function lockLandscape(doc: Document = document, scr: Screen = screen): Promise<boolean> {
  try {
    if (!doc.fullscreenElement) await doc.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
  } catch { /* not allowed: the card stays until the phone turns */ }
  try {
    const o = scr.orientation as Lockable | undefined;
    if (!o?.lock) return false;
    await o.lock('landscape');
    return true;
  } catch {
    return false;
  }
}

/** Wire the rotate card's button. */
export function initOrientation(card: HTMLElement): void {
  card.querySelector('button')?.addEventListener('click', () => { void lockLandscape(); });
}
