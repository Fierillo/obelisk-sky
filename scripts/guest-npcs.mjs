#!/usr/bin/env node
// The guest island's villagers: well-known Nostr accounts, resolved and
// checked by hand, written to client/src/guest/npcs.json.
//
//   node scripts/guest-npcs.mjs
//
// Read only: NIP-05 lookups over HTTPS and a plain REQ for each kind 0 on a
// few public relays. It never sends an EVENT and holds no key. Anyone whose
// NIP-05 and npub both fail, or who has no kind 0 with a name, is dropped.

import { writeFileSync } from 'node:fs';
import { nip19 } from 'nostr-tools';

const OUT = new URL('../client/src/guest/npcs.json', import.meta.url);
const RELAYS = ['wss://purplepag.es', 'wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net'];
const HEX = /^[0-9a-f]{64}$/;

// home: the guest house they live by (client/src/guest/script.ts HOUSES).
// haunts: where they like to wander (coffee, parrilla, nostrwot, campfire,
// pond, plaza, park, track, gym, market, home).
const CANDIDATES = [
  { hint: 'fiatjaf', nip05: '_@fiatjaf.com', home: 'nostr-dev', haunts: ['coffee', 'nostrwot', 'pond'] },
  { hint: 'jb55', nip05: 'jb55@jb55.com', home: 'nostr-dev', haunts: ['coffee', 'campfire', 'plaza'] },
  { hint: 'jack', npub: 'npub1sg6plzptd64u62a878hep2kev88swjh3tw00gjsfl8f237lmu63q0uf63m', home: 'bitcoin', haunts: ['pond', 'plaza', 'campfire'] },
  { hint: 'ODELL', npub: 'npub1qny3tkh0acurzla8x3zy4nhrjz5zd8l9sy9jys09umwng00manysew95gx', home: 'bitcoin', haunts: ['parrilla', 'campfire', 'plaza'] },
  { hint: 'Gigi', npub: 'npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc', home: 'art-memes', haunts: ['pond', 'coffee', 'park'] },
  { hint: 'pablof7z', nip05: 'pablo@f7z.io', npub: 'npub1l2vyh47mk2p0qlsku7hg0vn29faehy9hy34ygaclpn66ukqp3afqutajft', home: 'nostr-dev', haunts: ['coffee', 'gym', 'plaza'] },
  { hint: 'hodlbod', nip05: 'hodlbod@coracle.social', npub: 'npub1jlrs53pkdfjnts29kveljul2sm0actt6n8dxrrzqcersttvcuv3qdjynqn', home: 'nostr-dev', haunts: ['coffee', 'track', 'park'] },
  { hint: 'Vitor Pamplona', nip05: 'vitor@vitorpamplona.com', npub: 'npub1gcxzte5zlkncx26j68ez60fzkvtkm9e0vrwdcvsjakxf9mu9qewqlfnj5z', home: 'nostr-dev', haunts: ['coffee', 'gym', 'nostrwot'] },
  { hint: 'Derek Ross', nip05: 'derekross@nostrplebs.com', npub: 'npub18ams6ewn5aj2n3wt2qawzglx9mr4nzksxhvrdc4gzrecw7n5tvjqctp424', home: 'art-memes', haunts: ['plaza', 'parrilla', 'campfire'] },
  { hint: 'Kieran', nip05: 'kieran@snort.social', npub: 'npub1v0lxxxxutpvrelsksy8cdhgfux9l6a42hsj2qzquu2zk7vc9qnkszrqj49', home: 'nostr-dev', haunts: ['coffee', 'market', 'track'] },
  { hint: 'Lyn Alden', npub: 'npub1a2cww4kn9wqte4ry70vyfwqyqvpswksna27rtxd8vty6c74era8sdcw83a', home: 'bitcoin', haunts: ['coffee', 'pond', 'market'] },
  { hint: 'Snowden', npub: 'npub1sn0wdenkukak0d9dfczzeacvhkrgz92ak56egt7vdgzn8pv2wfqqhrjdv9', home: 'bitcoin', haunts: ['pond', 'campfire'] },
  { hint: 'Karnage', npub: 'npub1r0rs5q2gk0e3dk3nlc7gnu378ec6cnlenqp8a3cjhyzu6f8k5sgs4sq9ac', home: 'fitness', haunts: ['gym', 'track', 'park'] },
  { hint: 'rabble', npub: 'npub1wmr34t36fy03m8hvgl96zl3znndyzyaqhwmwdtshwmtkg03fetaqhjg240', home: 'art-memes', haunts: ['campfire', 'plaza', 'pond'] },
  { hint: 'calle', npub: 'npub12rv5lskctqxxs2c8rf2zlzc7xx3qpvzs3w4etgemauy9thegr43sf485vg', home: 'bitcoin', haunts: ['coffee', 'market'] },
  { hint: 'miljan', npub: 'npub16c0nh3dnadzqpm76uctf5hqhe2lny344zsmpm6feee9p5rdxaa9q586nvr', home: 'nostr-dev', haunts: ['coffee', 'plaza'] },
  { hint: 'utxo', npub: 'npub1utx00neqgqln72j22kej3ux7803c2k986henvvha4thuwfkper4s7r50e8', home: 'art-memes', haunts: ['parrilla', 'campfire', 'track'] },
  { hint: 'verbiricha', npub: 'npub107jk7htfv243u0x5ynn43scq9wrxtaasmrwwa8lfu2ydwag6cx2quqncxg', home: 'mate', haunts: ['coffee', 'nostrwot', 'pond'] },
  { hint: 'Damus', npub: 'npub18m76awca3y37hkvuneavuw6pjj4525fw90necxmadrvjg0sdy6qsngq955', home: 'nostr-dev', haunts: ['plaza'] },
  // La Crypta (Buenos Aires): its own NIP-05 list.
  { hint: 'La Crypta', nip05: '_@lacrypta.ar', home: 'mate', haunts: ['parrilla', 'plaza', 'campfire'] },
  { hint: 'agustin', nip05: 'agustin@lacrypta.ar', home: 'mate', haunts: ['parrilla', 'coffee', 'gym'] },
  { hint: 'fer', nip05: 'fer@lacrypta.ar', home: 'mate', haunts: ['parrilla', 'campfire', 'track'] },
  { hint: 'claudio', nip05: 'claudio@lacrypta.ar', home: 'fitness', haunts: ['gym', 'park', 'parrilla'] },
  { hint: 'naranja', nip05: 'naranja@lacrypta.ar', home: 'mate', haunts: ['plaza', 'parrilla', 'pond'] },
  { hint: 'cami', nip05: 'cami@lacrypta.ar', home: 'art-memes', haunts: ['coffee', 'park', 'campfire'] },
  { hint: 'LaWallet', nip05: 'lawallet@lacrypta.ar', home: 'bitcoin', haunts: ['market', 'parrilla'] },
];

async function nip05(id) {
  const [name, domain] = id.split('@');
  try {
    const r = await fetch(`https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`, { signal: AbortSignal.timeout(8000), redirect: 'error' });
    if (!r.ok) return null;
    const j = await r.json();
    const pk = j?.names?.[name];
    return typeof pk === 'string' && HEX.test(pk) ? pk : null;
  } catch { return null; }
}

function decodeNpub(npub) {
  try {
    const d = nip19.decode(npub);
    return d.type === 'npub' && HEX.test(d.data) ? d.data : null;
  } catch { return null; }
}

/** Every kind 0 the relays hold for these authors (REQ, then CLOSE at EOSE). */
function kind0s(relay, authors) {
  return new Promise((resolve) => {
    const out = [];
    let ws;
    const done = () => { try { ws?.close(); } catch { /* closed */ } resolve(out); };
    const timer = setTimeout(done, 10_000);
    try { ws = new WebSocket(relay); } catch { clearTimeout(timer); resolve(out); return; }
    ws.onopen = () => ws.send(JSON.stringify(['REQ', 'guest-npcs', { kinds: [0], authors }]));
    ws.onerror = () => { clearTimeout(timer); done(); };
    ws.onmessage = (m) => {
      let msg;
      try { msg = JSON.parse(String(m.data)); } catch { return; }
      if (msg[0] === 'EVENT' && msg[2]?.kind === 0) out.push(msg[2]);
      if (msg[0] === 'EOSE' || msg[0] === 'CLOSED') {
        try { ws.send(JSON.stringify(['CLOSE', 'guest-npcs'])); } catch { /* closed */ }
        clearTimeout(timer);
        done();
      }
    };
  });
}

const resolved = [];
for (const c of CANDIDATES) {
  const fromNip05 = c.nip05 ? await nip05(c.nip05) : null;
  const pubkey = fromNip05 ?? (c.npub ? decodeNpub(c.npub) : null);
  if (!pubkey) { console.warn(`- ${c.hint}: not resolved`); continue; }
  resolved.push({ ...c, pubkey, via: fromNip05 ? 'nip05' : 'npub' });
}

const authors = [...new Set(resolved.map((r) => r.pubkey))];
const events = (await Promise.all(RELAYS.map((r) => kind0s(r, authors)))).flat();
const newest = new Map();
for (const ev of events) if (!newest.has(ev.pubkey) || newest.get(ev.pubkey).created_at < ev.created_at) newest.set(ev.pubkey, ev);

const npcs = [];
const seen = new Set();
for (const r of resolved) {
  if (seen.has(r.pubkey)) continue;
  const ev = newest.get(r.pubkey);
  let profile = null;
  try { profile = ev ? JSON.parse(ev.content) : null; } catch { profile = null; }
  const name = profile?.display_name || profile?.displayName || profile?.name;
  if (!name) { console.warn(`- ${r.hint}: no kind 0 with a name`); continue; }
  const picture = typeof profile.picture === 'string' && profile.picture.startsWith('https://');
  seen.add(r.pubkey);
  console.log(`+ ${r.hint} (${r.via}) → ${name}${picture ? '' : ' [no picture]'}`);
  npcs.push({ pubkey: r.pubkey, name: r.hint, home: r.home, haunts: r.haunts, picture });
}

// Accounts with a picture first; at most 20.
npcs.sort((a, b) => Number(b.picture) - Number(a.picture));
const out = npcs.slice(0, 20).map(({ picture: _p, ...n }) => n);
writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
console.log(`wrote ${out.length} villagers to ${OUT.pathname}`);
