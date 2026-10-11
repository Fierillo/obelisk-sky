import { describe, it, expect } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey, type EventTemplate } from 'nostr-tools';
import { GameBook, createTable, joinTable, startTable, moveOnTable } from './book';
import { loadGameDef } from '@/lib/games/core/registry';

const a = generateSecretKey(), b = generateSecretKey();
let t = 1_800_000_000;
const sign = (tpl: EventTemplate, sk: Uint8Array) => finalizeEvent({ ...tpl, created_at: t++ }, sk);

describe('GameBook (Chain Reaction, app wire format)', () => {
  it('creates, joins, starts and plays a table', async () => {
    await loadGameDef('chain-reaction');
    const book = new GameBook();
    const create = sign(createTable('ch', 'chain-reaction', { size: 'small' }, 0), a);
    expect(create.tags).toEqual(expect.arrayContaining([['h', 'ch'], ['t', 'obelisk-game'], ['op', 'create'], ['game', 'chain-reaction']]));
    book.ingest(create);
    let s = book.session(create.id, t)!;
    expect(s.status).toBe('waiting');
    book.ingest(sign(joinTable(s), a));
    book.ingest(sign(joinTable(s), b));
    s = book.session(create.id, t)!;
    expect(s.joined.sort()).toEqual([getPublicKey(a), getPublicKey(b)].sort());
    book.ingest(sign(startTable(s), a));
    s = book.session(create.id, t)!;
    expect(s.status).toBe('in_progress');
    const first = s.currentTurn === getPublicKey(a) ? a : b;
    book.ingest(sign(moveOnTable(s, { cell: 0 }), first));
    const after = book.session(create.id, t)!;
    expect(after.turnIndex).toBe(s.turnIndex + 1);
    expect((after.state as { cells: { count: number }[] }).cells[0].count).toBe(1);
    expect(book.liveTables('ch', t)).toHaveLength(1);
    expect(book.liveTables('other', t)).toHaveLength(0);
  });
  it('ignores events that are not game ops and duplicates', () => {
    const book = new GameBook();
    const ev = sign({ kind: 9, content: 'hi', tags: [['h', 'ch']], created_at: 0 }, a);
    book.ingest(ev);
    expect(book.tables('ch')).toHaveLength(0);
  });
});
