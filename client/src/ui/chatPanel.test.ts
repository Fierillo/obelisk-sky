// @vitest-environment jsdom
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { fireEvent, waitFor } from '@testing-library/react';
import type { RelayHub } from '@nostr-wot/relay/hub';
import { ChatPanel, type ChatPanelDeps } from './chatPanel';
import type { WireGroup, WireMessage } from '../nostr/wire';
import { registerHost } from '../shims/host';
import { installVoiceBridge } from '../shims/bridge';

const ALICE = 'a'.repeat(64);

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
  registerHost({ login: async () => {}, sign: async () => { throw new Error('no signer'); }, pubkey: () => null });
  const hub = {
    subscribe: () => ({ release: () => {} }),
    acquireAuthLease: () => ({ release: () => {} }),
  } as unknown as RelayHub;
  installVoiceBridge({ hub, relay: () => 'wss://relay.test', pubkey: () => null, sign: async () => { throw new Error('no signer'); } });
});

const group = { id: 'g1', name: 'plaza', kind: 'chat' } as unknown as WireGroup;
const msg = { id: 'e'.repeat(64), pubkey: ALICE, groupId: 'g1', text: 'asado?', content: 'asado?', createdAt: 1 } as unknown as WireMessage;

function panel(send: ChatPanelDeps['send'], over: Partial<ChatPanelDeps> = {}, onBack?: () => void) {
  const deps: ChatPanelDeps = {
    me: () => 'f'.repeat(64),
    nameOf: () => 'Alice',
    avatarOf: () => null,
    messages: () => [msg],
    reactions: () => [],
    send,
    react: () => {},
    unreact: () => {},
    remove: () => {},
    join: async () => null,
    people: () => [{ pubkey: ALICE, name: 'Alice' }],
    relay: () => 'wss://relay.test',
    ...over,
  };
  const p = new ChatPanel(document.body, deps);
  p.onBack = onBack;
  p.open(group);
  return p;
}

async function bar(p: ChatPanel): Promise<HTMLTextAreaElement> {
  return waitFor(() => {
    const el = p.el.querySelector<HTMLTextAreaElement>('.chat-bar textarea');
    if (!el) throw new Error('message bar not loaded yet');
    return el;
  }, { timeout: 15_000 });
}

describe('ChatPanel message bar', { timeout: 30_000 }, () => {
  it("sends through deps.send with the reply and the bar's tags", async () => {
    const send = vi.fn<ChatPanelDeps['send']>(async () => null);
    const p = panel(send);
    p.setReply(msg);
    const input = await bar(p);
    await waitFor(() => expect(p.el.textContent).toContain('Replying to'));
    fireEvent.change(input, { target: { value: 'at nine' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(send).toHaveBeenCalledWith('g1', 'at nine', msg, []));
    expect(p.replyingTo).toBeNull();
    p.close();
  });

  it('a members-only refusal offers to join and keeps the draft', async () => {
    const p = panel(async () => 'restricted: you must be a member');
    const input = await bar(p);
    fireEvent.change(input, { target: { value: 'hola' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(p.el.querySelector('.chat-join')).toBeTruthy());
    await waitFor(() => expect(input.value).toBe('hola'));
    p.close();
  });
});

describe('ChatPanel header and authors', { timeout: 30_000 }, () => {
  it('goes back to the channel list from the header, when a list is there to go to', async () => {
    const back = vi.fn();
    const p = panel(async () => null, {}, back);
    const btn = p.el.querySelector<HTMLButtonElement>('.chat-back')!;
    expect(btn.hidden).toBe(false);
    btn.click();
    expect(back).toHaveBeenCalledOnce();
    const plain = panel(async () => null);
    expect(plain.el.querySelector<HTMLButtonElement>('.chat-back')!.hidden).toBe(true);
    // Let the message bars finish mounting before the page goes away.
    await bar(p);
    await bar(plain);
  });

  it("opens the author's profile from their avatar or name, and shows their rank", async () => {
    const onProfile = vi.fn();
    const p = panel(async () => null, { onProfile, roleOf: () => ({ id: 'mod', name: 'Mod', tier: 5, color: '#00ff00', emoji: '🛡' }) });
    (p.el.querySelector('.chat-av') as HTMLElement).click();
    (p.el.querySelector('.chat-who') as HTMLElement).click();
    expect(onProfile).toHaveBeenCalledTimes(2);
    expect(onProfile).toHaveBeenCalledWith(ALICE);
    expect(p.el.querySelector('.chat-meta .side-rank')!.textContent).toBe('🛡 Mod');
    await bar(p);
  });
});

