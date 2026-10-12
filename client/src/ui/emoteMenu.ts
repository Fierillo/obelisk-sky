// The emote menu: dance, the lotus pose, a nod… Opens from the bottom bar or
// with G; while it's open, 1–6 pick. Picking the emote you're already doing
// stops it. What an emote does is world/emotes.ts.

import { EMOTES, type EmoteKind } from '../world/emotes';

export class EmoteMenu {
  readonly el: HTMLDivElement;
  private buttons = new Map<EmoteKind, HTMLButtonElement>();

  constructor(parent: HTMLElement, private deps: { pick: (kind: EmoteKind) => void; current: () => EmoteKind | null }) {
    this.el = document.createElement('div');
    this.el.className = 'emote-menu';
    this.el.hidden = true;
    this.el.setAttribute('role', 'menu');
    this.el.setAttribute('aria-label', 'Emotes');
    EMOTES.forEach((e, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'emote-btn';
      b.setAttribute('role', 'menuitem');
      b.dataset.kind = e.kind;
      b.title = `${e.label} (${i + 1})`;
      b.innerHTML = `<span class="emote-icon" aria-hidden="true"></span><span class="emote-label"></span><kbd></kbd>`;
      (b.querySelector('.emote-icon') as HTMLElement).textContent = e.icon;
      (b.querySelector('.emote-label') as HTMLElement).textContent = e.label;
      (b.querySelector('kbd') as HTMLElement).textContent = String(i + 1);
      b.addEventListener('click', () => this.choose(e.kind));
      this.buttons.set(e.kind, b);
      this.el.append(b);
    });
    parent.append(this.el);
  }

  get open(): boolean {
    return !this.el.hidden;
  }

  toggle(open = !this.open): void {
    this.el.hidden = !open;
    if (open) this.render();
  }

  /** A key while open: 1–6 pick, Escape closes. Returns true when it was handled. */
  key(k: string): boolean {
    if (!this.open) return false;
    if (k === 'Escape') { this.toggle(false); return true; }
    const n = Number(k);
    if (Number.isInteger(n) && n >= 1 && n <= EMOTES.length) { this.choose(EMOTES[n - 1].kind); return true; }
    return false;
  }

  render(): void {
    const now = this.deps.current();
    for (const [kind, b] of this.buttons) b.classList.toggle('on', kind === now);
  }

  private choose(kind: EmoteKind): void {
    this.deps.pick(kind);
    this.toggle(false);
  }
}
