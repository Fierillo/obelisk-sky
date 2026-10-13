// Screen-space layer over the canvas: speech bubbles, channel signs, emoji
// pops. Everything is textContent — relay text never becomes HTML.

import * as THREE from 'three';
import { vw } from '../i18n/village';

interface Anchor { get(): THREE.Vector3 | null }

interface Bubble {
  el: HTMLDivElement;
  anchor: Anchor;
  until: number;
  born: number;
  x: number;
  y: number;
  h: number;
  w: number;
  key: string;
  /** Re-draw the header, reply line and body (a name may have arrived). */
  repaint?: () => void;
}

interface Sign {
  el: HTMLDivElement;
  pos: THREE.Vector3;
  pip: HTMLSpanElement;
  count: HTMLSpanElement;
  ping?: boolean;
  /** "Ana mentioned you in #general": on the sign's tooltip and beside its compass arrow. */
  pingLabel?: string | null;
  unread?: number;
  arrow?: HTMLDivElement;
}

interface Pop { el: HTMLDivElement; anchor: Anchor; born: number; life: number; dx: number }

export class Overlay {
  private bubbles: Bubble[] = [];
  private signs = new Map<string, Sign>();
  private pops: Pop[] = [];
  private v = new THREE.Vector3();
  showSigns = true;
  showBubbles = true;

  constructor(private root: HTMLElement, private camera: THREE.PerspectiveCamera) {}

  /** The overlay's size, read once per update (reading it per item forces layout). */
  private W = 1;
  private H = 1;

  private project(p: THREE.Vector3): { x: number; y: number; visible: boolean } {
    this.v.copy(p).project(this.camera);
    const w = this.W, h = this.H;
    return { x: (this.v.x * 0.5 + 0.5) * w, y: (-this.v.y * 0.5 + 0.5) * h, visible: this.v.z < 1 && Math.abs(this.v.x) < 1.2 && Math.abs(this.v.y) < 1.2 };
  }

  /** A speech bubble. `key` replaces any bubble already shown for that key. */
  say(key: string, anchor: Anchor, header: string, text: string, opts: { accent: string; quote?: boolean; seconds: number; reply?: string | null; render?: (el: HTMLElement) => void; onClick?: () => void; headerOf?: () => string; replyOf?: () => string | null; ping?: boolean }): void {
    if (!this.showBubbles) return;
    const existing = this.bubbles.find((b) => b.key === key);
    if (existing) this.removeBubble(existing);
    const el = document.createElement('div');
    el.className = opts.ping ? 'bubble ping' : 'bubble';
    const hd = document.createElement('div');
    hd.className = 'bubble-h';
    hd.style.color = opts.accent;
    hd.textContent = header;
    const body = document.createElement('div');
    body.className = 'bubble-t';
    if (opts.render) opts.render(body);
    else body.textContent = opts.quote === false ? text : `“${text}”`;
    if (opts.onClick) {
      el.classList.add('clickable');
      el.title = vw.reply;
      el.addEventListener('click', opts.onClick);
    }
    if (opts.reply) {
      const r = document.createElement('div');
      r.className = 'bubble-r';
      r.textContent = `↪ ${opts.reply}`;
      el.append(hd, r, body);
    } else {
      el.append(hd, body);
    }
    this.root.appendChild(el);
    const now = performance.now() / 1000;
    const bubble: Bubble = { el, anchor, until: now + opts.seconds, born: now, x: 0, y: 0, h: el.offsetHeight, w: el.offsetWidth, key };
    bubble.repaint = () => {
      if (opts.headerOf) hd.textContent = opts.headerOf();
      const r = el.querySelector('.bubble-r');
      const reply = opts.replyOf?.();
      if (r && reply) r.textContent = `↪ ${reply}`;
      if (opts.render) { body.replaceChildren(); opts.render(body); }
      bubble.h = el.offsetHeight;
      bubble.w = el.offsetWidth;
    };
    this.bubbles.push(bubble);
    // Cap simultaneous bubbles: oldest go first.
    while (this.bubbles.length > 7) this.removeBubble(this.bubbles[0]);
  }

  private removeBubble(b: Bubble): void {
    b.el.remove();
    this.bubbles = this.bubbles.filter((x) => x !== b);
  }

  /** Names resolve after a bubble is up: draw the live ones again. */
  repaintBubbles(): void {
    for (const b of this.bubbles) b.repaint?.();
  }

  clearBubbles(): void {
    for (const b of [...this.bubbles]) this.removeBubble(b);
  }

  pop(anchor: Anchor, text: string, cls = 'pop'): void {
    const el = document.createElement('div');
    el.className = cls;
    el.textContent = text;
    this.root.appendChild(el);
    this.pops.push({ el, anchor, born: performance.now() / 1000, life: 1.8, dx: (Math.random() - 0.5) * 30 });
  }

  setSign(id: string, pos: THREE.Vector3, name: string, kind: string, onClick: () => void): void {
    let s = this.signs.get(id);
    if (!s) {
      const el = document.createElement('div');
      el.className = 'sign';
      const pip = document.createElement('span');
      pip.className = 'pip';
      const label = document.createElement('span');
      label.className = 'sign-name';
      const count = document.createElement('span');
      count.className = 'sign-count';
      el.append(pip, label, count);
      el.addEventListener('click', onClick);
      this.root.appendChild(el);
      s = { el, pos: pos.clone(), pip, count };
      this.signs.set(id, s);
    }
    s.pos.copy(pos);
    (s.el.children[1] as HTMLElement).textContent = name;
    s.el.dataset.kind = kind;
  }

  /** Unread (red count) and ping (a mention or reply for you) on a sign; `label` says who and where. */
  setSignUnread(id: string, unread: number, ping: boolean, label: string | null = null): void {
    const s = this.signs.get(id);
    if (!s) return;
    s.pingLabel = ping ? label : null;
    s.el.title = s.pingLabel ?? '';
    s.count.textContent = unread > 0 ? (unread > 99 ? '99+' : String(unread)) : '';
    s.count.style.display = unread > 0 ? '' : 'none';
    s.el.classList.toggle('ping', ping);
    s.ping = ping;
    s.unread = unread;
  }

  setSignActivity(id: string, active: boolean, recent: number): void {
    const s = this.signs.get(id);
    if (!s) return;
    s.pip.classList.toggle('on', active);
    s.count.textContent = recent > 0 ? String(recent) : '';
    s.count.style.display = recent > 0 ? '' : 'none';
  }

  removeSign(id: string): void {
    this.signs.get(id)?.el.remove();
    this.signs.delete(id);
  }

  update(): void {
    const now = performance.now() / 1000;
    // Signs: nearest first (lowest on screen), farther ones nudged up so
    // labels never sit on top of each other.
    const signBoxes: { x: number; y: number; w: number; h: number }[] = [];
    this.W = this.root.clientWidth;
    this.H = this.root.clientHeight;
    const projected = [...this.signs.values()].map((s) => ({ s, p: this.project(s.pos) })).sort((a, b) => b.p.y - a.p.y);
    // Compass: channels with something for you that are off screen get an
    // arrow on the screen edge pointing their way.
    const W = this.W, H = this.H;
    for (const { s, p } of projected) {
      const onScreen = p.visible && p.x > 0 && p.x < W && p.y > 0 && p.y < H;
      const want = !!(s.ping || (s.unread ?? 0) > 0) && !onScreen;
      if (want) {
        if (!s.arrow) {
          s.arrow = document.createElement('div');
          s.arrow.className = 'compass';
          s.arrow.addEventListener('click', () => s.el.click());
          this.root.appendChild(s.arrow);
        }
        this.v.copy(s.pos).project(this.camera);
        let dx = this.v.x, dy = -this.v.y;
        if (this.v.z > 1) { dx = -dx; dy = -dy; }
        const ang = Math.atan2(dy, dx);
        const m = 36;
        const k = Math.min((W / 2 - m) / Math.abs(Math.cos(ang) || 1e-6), (H / 2 - m) / Math.abs(Math.sin(ang) || 1e-6));
        // Keep clear of the header (top 70px) and the controls (bottom 120px).
        const ax = Math.min(W - m, Math.max(m, W / 2 + Math.cos(ang) * k));
        const ay = Math.min(H - 120, Math.max(78, H / 2 + Math.sin(ang) * k));
        s.arrow.style.transform = `translate(${ax}px, ${ay}px) translate(-50%, -50%)`;
        s.arrow.style.setProperty('--rot', `${ang}rad`);
        s.arrow.classList.toggle('ping', !!s.ping);
        const text = s.ping ? '@' : String(s.unread ?? '');
        if (s.arrow.dataset.text !== text) { s.arrow.dataset.text = text; s.arrow.textContent = text; }
        const name = (s.el.children[1] as HTMLElement).textContent ?? '';
        s.arrow.title = s.ping && s.pingLabel ? s.pingLabel : name;
        s.arrow.setAttribute('aria-label', s.arrow.title);
        // Which channel, beside the arrow (the side away from the screen edge).
        s.arrow.dataset.label = s.ping ? `#${name}` : '';
        s.arrow.classList.toggle('left', ax > W / 2);
      } else if (s.arrow) {
        s.arrow.remove();
        s.arrow = undefined;
      }
    }
    // Measure signs only when their text changed (cached on the element), all before any move.
    for (const { s, p } of projected) {
      const show = p.visible && this.showSigns;
      if (s.el.style.display !== (show ? '' : 'none')) s.el.style.display = show ? '' : 'none';
    }
    for (const { s, p } of projected) {
      if (!(p.visible && this.showSigns)) continue;
      const key = s.el.textContent ?? '';
      if (s.el.dataset.mk !== key) { s.el.dataset.mk = key; s.el.dataset.mw = String(s.el.offsetWidth || 100); s.el.dataset.mh = String(s.el.offsetHeight || 24); }
    }
    for (const { s, p } of projected) {
      if (!(p.visible && this.showSigns)) continue;
      const w = Number(s.el.dataset.mw) || 100, h = Number(s.el.dataset.mh) || 24;
      let y = p.y;
      for (let i = 0; i < 6; i++) {
        const hit = signBoxes.find((o) => Math.abs(o.x - p.x) < (o.w + w) / 2 + 4 && Math.abs(o.y - y) < h + 3);
        if (!hit) break;
        y = hit.y - h - 4;
      }
      signBoxes.push({ x: p.x, y, w, h });
      s.el.style.transform = `translate(${p.x}px, ${y}px) translate(-50%, -100%)`;
    }

    // Bubbles: project, then push apart vertically so none overlap.
    const live: Bubble[] = [];
    const seen: { b: Bubble; visible: boolean }[] = [];
    for (const b of [...this.bubbles]) {
      if (now > b.until) {
        b.el.classList.add('out');
        if (now > b.until + 0.35) this.removeBubble(b);
        continue;
      }
      const a = b.anchor.get();
      if (!a) { this.removeBubble(b); continue; }
      const p = this.project(a);
      seen.push({ b, visible: p.visible });
      if (!p.visible) continue;
      b.x = p.x;
      b.y = p.y;
      // Sizes read together, before this frame's writes.
      b.h = b.el.offsetHeight;
      b.w = b.el.offsetWidth;
      live.push(b);
    }
    for (const { b, visible } of seen) {
      const v = visible ? 'visible' : 'hidden';
      if (b.el.style.visibility !== v) b.el.style.visibility = v;
    }
    live.sort((a, b) => b.y - a.y);
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    for (const b of live) {
      let top = b.y - b.h - 14;
      for (let iter = 0; iter < 8; iter++) {
        const hit = placed.find((o) => Math.abs(o.x - b.x) < (o.w + b.w) / 2 + 6 && top < o.y + o.h + 6 && top + b.h > o.y - 6);
        if (!hit) break;
        top = hit.y - b.h - 8;
      }
      placed.push({ x: b.x, y: top, w: b.w, h: b.h });
      const tail = Math.max(0, b.y - (top + b.h));
      b.el.style.transform = `translate(${b.x}px, ${top}px) translate(-50%, 0)`;
      b.el.style.setProperty('--tail', `${Math.min(tail, 400)}px`);
      b.el.classList.toggle('lifted', tail > 22);
    }

    for (const p of [...this.pops]) {
      const t = (now - p.born) / p.life;
      const a = p.anchor.get();
      if (t >= 1 || !a) { p.el.remove(); this.pops = this.pops.filter((x) => x !== p); continue; }
      const s = this.project(a);
      p.el.style.opacity = String(t < 0.15 ? t / 0.15 : 1 - Math.max(0, (t - 0.6) / 0.4));
      p.el.style.transform = `translate(${s.x + p.dx * t}px, ${s.y - 30 - t * 60}px) translate(-50%, -50%) scale(${0.6 + Math.min(t * 4, 1) * 0.6})`;
    }
  }
}
