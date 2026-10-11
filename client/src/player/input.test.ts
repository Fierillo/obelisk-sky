// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { InputState, DOUBLE_TAP_MS } from './input';

const key = (t: EventTarget, type: 'keydown' | 'keyup', k: string) => t.dispatchEvent(new KeyboardEvent(type, { key: k }));

describe('double-tap to run', () => {
  afterEach(() => vi.restoreAllMocks());
  const at = (ms: number) => vi.spyOn(performance, 'now').mockReturnValue(ms);

  it('runs after W, W and walks again once W is let go', () => {
    const t = new EventTarget() as Window;
    const input = new InputState(t);
    at(1000); key(t, 'keydown', 'w'); key(t, 'keyup', 'w');
    at(1000 + DOUBLE_TAP_MS - 50); key(t, 'keydown', 'w');
    expect(input.read()).toMatchObject({ y: 1, run: true });
    key(t, 'keyup', 'w');
    at(5000); key(t, 'keydown', 'w');
    expect(input.read()).toMatchObject({ y: 1, run: false });
  });
  it('does not run when the taps are slow or on different keys', () => {
    const t = new EventTarget() as Window;
    const input = new InputState(t);
    at(1000); key(t, 'keydown', 'w'); key(t, 'keyup', 'w');
    at(1000 + DOUBLE_TAP_MS + 50); key(t, 'keydown', 'w');
    expect(input.read().run).toBe(false);
    key(t, 'keyup', 'w');
    at(3000); key(t, 'keydown', 'a'); key(t, 'keyup', 'a');
    at(3100); key(t, 'keydown', 'w');
    expect(input.read().run).toBe(false);
  });
});
