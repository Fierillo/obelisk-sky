// Keyboard and touch input for your character. Keys are ignored while
// typing in the chat composer or any other field.

import type { MoveInput } from './controller';

export class InputState {
  private keys = new Set<string>();
  private stick = { x: 0, y: 0 };
  /** performance.now() of the last movement input. */
  lastInput = 0;
  /** Space was pressed since the last read (a jump is edge-triggered). */
  private jumpPressed = false;
  /** Double-tapping a movement key runs until that key is let go. */
  private lastTap = { key: '', at: 0 };
  private runKey: string | null = null;

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (isTyping(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === ' ') {
        e.preventDefault();
        if (!e.repeat) { this.jumpPressed = true; this.lastInput = performance.now(); }
        return;
      }
      if (MOVE_KEYS.has(k)) {
        if (!e.repeat && k !== 'shift') {
          const now = performance.now();
          if (this.lastTap.key === k && now - this.lastTap.at < DOUBLE_TAP_MS) this.runKey = k;
          this.lastTap = { key: k, at: now };
        }
        this.keys.add(k);
        this.lastInput = performance.now();
        if (k.startsWith('arrow')) e.preventDefault();
      }
    });
    target.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      this.keys.delete(k);
      if (k === this.runKey) this.runKey = null;
    });
    target.addEventListener('blur', () => { this.keys.clear(); this.runKey = null; });
  }

  /** The touch jump button. */
  pressJump(): void {
    this.jumpPressed = true;
    this.lastInput = performance.now();
  }

  setStick(x: number, y: number): void {
    this.stick = { x, y };
    if (x || y) this.lastInput = performance.now();
  }

  read(): MoveInput {
    const k = this.keys;
    let x = this.stick.x, y = this.stick.y;
    if (k.has('a') || k.has('arrowleft')) x -= 1;
    if (k.has('d') || k.has('arrowright')) x += 1;
    if (k.has('w') || k.has('arrowup')) y += 1;
    if (k.has('s') || k.has('arrowdown')) y -= 1;
    const jump = this.jumpPressed;
    this.jumpPressed = false;
    const run = k.has('shift') || (!!this.runKey && k.has(this.runKey)) || Math.hypot(this.stick.x, this.stick.y) > 0.9;
    return { x: clamp(x), y: clamp(y), run, jump };
  }
}

/** Two presses of the same movement key within this window start a run. */
export const DOUBLE_TAP_MS = 300;

const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift']);
const clamp = (v: number) => Math.max(-1, Math.min(1, v));

export function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

/** A thumb joystick for touch screens, bottom-left. */
export function mountJoystick(parent: HTMLElement, input: InputState): void {
  if (!matchMedia('(pointer: coarse)').matches) return;
  const base = document.createElement('div');
  base.className = 'joystick';
  const knob = document.createElement('div');
  knob.className = 'joystick-knob';
  base.appendChild(knob);
  parent.appendChild(base);
  let id: number | null = null;
  // How far the knob travels (px): the base is 144 wide (styles.css).
  const R = 58;
  const move = (e: PointerEvent) => {
    const r = base.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const m = Math.hypot(dx, dy);
    if (m > R) { dx *= R / m; dy *= R / m; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    input.setStick(dx / R, -dy / R);
  };
  base.addEventListener('pointerdown', (e) => { id = e.pointerId; base.setPointerCapture(id); move(e); });
  base.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e); });
  const end = () => { id = null; knob.style.transform = ''; input.setStick(0, 0); };
  base.addEventListener('pointerup', end);
  base.addEventListener('pointercancel', end);
  const jump = document.createElement('button');
  jump.type = 'button';
  jump.className = 'jump-btn';
  jump.setAttribute('aria-label', 'Jump');
  jump.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V6M6 11l6-6 6 6"/></svg>';
  jump.addEventListener('pointerdown', (e) => { e.preventDefault(); input.pressJump(); });
  parent.appendChild(jump);
}
