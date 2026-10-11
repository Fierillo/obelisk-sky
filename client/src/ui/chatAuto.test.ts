import { describe, it, expect } from 'vitest';
import { onPlaceChange, type PanelState } from './chatAuto';

const closed: PanelState = { open: null, openedBy: null };
const auto = (id: string): PanelState => ({ open: id, openedBy: 'auto' });
const user = (id: string): PanelState => ({ open: id, openedBy: 'user' });

describe('onPlaceChange', () => {
  it('opens the chat of the yard you settle in when set to open automatically', () => {
    expect(onPlaceChange('a', closed, 'auto')).toEqual({ kind: 'open', id: 'a' });
    expect(onPlaceChange('b', auto('a'), 'auto')).toEqual({ kind: 'open', id: 'b' });
  });

  it('offers a button instead when set to ask', () => {
    expect(onPlaceChange('a', closed, 'ask')).toEqual({ kind: 'hint', id: 'a' });
  });

  it('does nothing when set to never', () => {
    expect(onPlaceChange('a', closed, 'off')).toEqual({ kind: 'none' });
    expect(onPlaceChange(null, closed, 'off')).toEqual({ kind: 'none' });
  });

  it('never swaps a chat you opened yourself for the yard you walk into', () => {
    expect(onPlaceChange('b', user('a'), 'auto')).toEqual({ kind: 'hint', id: 'b' });
  });

  it('leaves the panel alone when you are already reading that channel', () => {
    expect(onPlaceChange('a', user('a'), 'auto')).toEqual({ kind: 'none' });
    expect(onPlaceChange('a', auto('a'), 'ask')).toEqual({ kind: 'none' });
  });

  it('closes on leaving only what walking in opened', () => {
    expect(onPlaceChange(null, auto('a'), 'auto')).toEqual({ kind: 'close' });
    expect(onPlaceChange(null, user('a'), 'auto')).toEqual({ kind: 'none' });
    expect(onPlaceChange(null, closed, 'ask')).toEqual({ kind: 'none' });
  });
});
