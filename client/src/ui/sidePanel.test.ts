// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { SidePanel, type SidePanelDeps } from './sidePanel';

const flush = () => new Promise((r) => setTimeout(r, 0));

function panel(over: Partial<SidePanelDeps> = {}) {
  const deps: SidePanelDeps = {
    channels: () => [
      { id: 'a', name: 'general', kind: 'chat', unread: 0, mention: false, here: 0 },
      { id: 'b', name: 'gym', kind: 'chat', unread: 0, mention: false, here: 0 },
    ],
    defaultChannel: () => 'a',
    loadMembers: vi.fn(async (id: string) => ({ admins: [], members: id === 'a' ? ['p1'] : ['p2', 'p3'] })),
    posters: () => [],
    loadRanks: async () => ({}),
    presenceOf: () => 'online',
    profile: (pk) => ({ name: pk, avatar: null, nip05: null }),
    colorOf: () => '#fff',
    me: () => null,
    onChannel: () => {},
    onMember: () => {},
    ...over,
  };
  const host = document.createElement('div');
  document.body.append(host);
  return { side: new SidePanel(host, deps), deps, host };
}

describe('the members panel', () => {
  it('keeps the same channel picker across refreshes', async () => {
    const { side, host } = panel();
    side.toggle('members');
    await flush();
    const pick = host.querySelector('select')!;
    const rows = host.querySelector('.side-list')!.firstElementChild;
    for (let i = 0; i < 3; i++) { side.refresh(); await flush(); }
    expect(host.querySelector('select')).toBe(pick);
    // Nothing changed: the rows weren't redrawn either.
    expect(host.querySelector('.side-list')!.firstElementChild).toBe(rows);
  });

  it('does not touch the picker while it is open', async () => {
    const { side, host, deps } = panel();
    side.toggle('members');
    await flush();
    const pick = host.querySelector('select')!;
    pick.focus();
    (deps.loadMembers as ReturnType<typeof vi.fn>).mockClear();
    side.refresh();
    await flush();
    expect(deps.loadMembers).not.toHaveBeenCalled();
  });

  it('loads the channel picked', async () => {
    const { side, host } = panel();
    side.toggle('members');
    await flush();
    const pick = host.querySelector('select')!;
    pick.value = 'b';
    pick.dispatchEvent(new Event('change'));
    expect(host.querySelector('.side-list')!.textContent).toContain('Loading');
    await flush();
    expect(host.querySelector('.side-title')!.textContent).toBe('Members · 2');
    expect(pick.value).toBe('b');
  });
});
