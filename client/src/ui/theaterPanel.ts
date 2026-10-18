// The theater's watch mode. The hall's controls are the call bar's (main.ts
// renderCall): pick a voice channel, join its call, share your screen, watch,
// chat. Everyone in the call is equal, as in obelisk-dex's voice channels.

import { vw } from '../i18n/village';

export const isVoiceKind = (kind: string): boolean => kind.startsWith('voice');

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

const btn = (text: string, cls: string, on: () => void, title = ''): HTMLButtonElement => {
  const b = h('button', `account-btn ${cls}`.trim(), text);
  b.type = 'button';
  if (title) b.title = title;
  b.addEventListener('click', on);
  return b;
};

/**
 * Watch mode: the film fills the page under the chat and the call bar; the 3D village isn't drawn (main.ts skips the frame) until
 * you come back. `show` swaps the stream (or a card's words when nothing
 * plays). Given a `page` instead (the totem monitor, world/totemMonitor.ts),
 * it holds that page in an iframe, made here and gone on `close`.
 */
export class WatchView {
  readonly el: HTMLElement;
  private video: HTMLVideoElement;
  private card: HTMLElement;
  private stream: MediaStream | null = null;
  private key = (e: KeyboardEvent) => { if (e.key === 'Escape') this.onClose(); };

  /** `parent` is the village's own layer (#app), so the chat and the call bar stay over the film. */
  constructor(private onClose: () => void, parent: HTMLElement = document.body, page?: string) {
    this.el = h('div', page ? 'theater-watch theater-watch-page' : 'theater-watch');
    this.video = h('video');
    this.video.muted = true; // the sound plays through the call
    this.video.autoplay = true;
    this.video.playsInline = true;
    this.card = h('div', 'theater-watch-card');
    const back = btn(vw.backToVillage, 'theater-watch-back', () => this.onClose(), 'Esc');
    if (page) {
      // Looked at, not clicked (its QR is the way in): no pointer, no focus, so Esc stays with the village.
      const f = h('iframe');
      f.src = page;
      f.title = 'Totem LABITCONF';
      f.setAttribute('sandbox', 'allow-scripts allow-same-origin');
      f.allow = 'autoplay';
      f.tabIndex = -1;
      f.style.pointerEvents = 'none';
      this.el.append(f, back);
    } else this.el.append(this.video, this.card, back);
    parent.prepend(this.el);
    document.body.classList.add('watching');
    window.addEventListener('keydown', this.key);
  }

  show(stream: MediaStream | null, words: [string, string]): void {
    if (stream !== this.stream) {
      this.stream = stream;
      this.video.srcObject = stream;
      if (stream) void this.video.play().catch(() => {});
    }
    this.video.hidden = !stream;
    this.card.hidden = !!stream;
    this.card.replaceChildren(h('div', 'theater-watch-title', words[0]), h('div', 'theater-watch-line', words[1]));
  }

  close(): void {
    window.removeEventListener('keydown', this.key);
    this.video.srcObject = null;
    this.el.remove();
    document.body.classList.remove('watching');
  }
}
