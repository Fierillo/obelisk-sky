// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { keepFieldInView } from './LoginMount';

describe('the login modal on a phone', () => {
  it('keeps a field in view as the keyboard opens, and leaves the rest of the page alone', () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div class="nui-modal"><input id="in"></div><input id="out">';
    const inside = document.getElementById('in')!, outside = document.getElementById('out')!;
    const a = (inside.scrollIntoView = vi.fn()), b = (outside.scrollIntoView = vi.fn());
    keepFieldInView({ target: inside } as unknown as FocusEvent);
    keepFieldInView({ target: outside } as unknown as FocusEvent);
    vi.advanceTimersByTime(400);
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
