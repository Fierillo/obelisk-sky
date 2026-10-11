// simple-peer (obelisk-dex's mesh WebRTC wrapper) expects a few Node globals
// in the browser, as webpack 4 used to provide. Loaded before the voice code.
import { Buffer } from 'buffer';
import process from 'process';

const g = globalThis as unknown as { Buffer?: typeof Buffer; process?: typeof process; global?: typeof globalThis };
g.Buffer ??= Buffer;
g.process ??= process;
g.global ??= globalThis;
