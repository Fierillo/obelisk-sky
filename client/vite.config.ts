import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const vendor = here('../vendor/obelisk/src');

// obelisk-dex code is imported from the vendored snapshot as `@/...`. A few
// app modules are swapped for sky's own (they reach the app's bridge,
// next-intl or Next routing); the list is the whole of that seam.
export const SHIMS = [
  { find: /^next-intl$/, replacement: here('src/shims/next-intl.ts') },
  { find: /^@\/i18n\/navigation$/, replacement: here('src/shims/navigation.ts') },
  { find: /^@\/hooks\/session\/useSession$/, replacement: here('src/shims/session/useSession.ts') },
  { find: /^@\/services\/common\/clipboard$/, replacement: here('src/shims/clipboard.ts') },
  { find: /^@\/services\/media\/blossom$/, replacement: here('src/shims/blossom.ts') },
  { find: /^@\/services\/nostr-bridge$/, replacement: here('src/shims/bridge.ts') },
  { find: /^@\/services\/wot\/engine$/, replacement: here('src/shims/wot-engine.ts') },
  { find: /^@\/components\/media\/library\/LazyMediaLibraryModal$/, replacement: here('src/shims/chat/LazyMediaLibraryModal.tsx') },
  { find: /^@\//, replacement: `${vendor}/` },
];

/** NEXT_PUBLIC_TURN_* / FORCE_RELAY from obelisk-dex's build env (they ship
 *  in obelisk.ar's own bundle already); STUN-only if absent. */
function turnDefines(): Record<string, string> {
  const env: Record<string, string> = {};
  try {
    for (const line of readFileSync('/root/obelisk-dex/.env.local', 'utf8').split('\n')) {
      const m = line.match(/^(NEXT_PUBLIC_(?:TURN_URLS|TURN_USERNAME|TURN_CREDENTIAL|FORCE_RELAY))=(.*)$/);
      if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch { /* no TURN */ }
  const out: Record<string, string> = {};
  for (const k of ['NEXT_PUBLIC_TURN_URLS', 'NEXT_PUBLIC_TURN_USERNAME', 'NEXT_PUBLIC_TURN_CREDENTIAL', 'NEXT_PUBLIC_FORCE_RELAY', 'NEXT_PUBLIC_SFU_PUBKEY', 'NEXT_PUBLIC_SFU_URL', 'NEXT_PUBLIC_SFU_TRUSTED_RELAYS', 'NEXT_PUBLIC_SFU_RELAYS']) {
    out[`process.env.${k}`] = JSON.stringify(env[k] ?? '');
  }
  return out;
}

export default defineConfig({
  root: __dirname,
  plugins: [tailwindcss()],
  resolve: { alias: SHIMS },
  esbuild: { jsx: 'automatic' },
  define: {
    // Mesh voice TURN: the same public values obelisk-dex builds with.
    ...turnDefines(),
    'process.env.NEXT_PUBLIC_RECOMMENDED_RELAYS': '""',
    // The message bar's media picker: no GIPHY key, so the built-in GIF and sticker catalog only (as obelisk.ar without one).
    'process.env.NEXT_PUBLIC_GIPHY_API_KEY': '""',
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    // simple-peer's dependencies look for Node's `global`.
    global: 'globalThis',
  },
  server: { port: 5174 },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      // The landing page at /, the village at /app (server/index.ts routes them).
      input: { landing: here('index.html'), app: here('app/index.html') },
      // Next's "use client" directives mean nothing outside Next.
      onwarn(w, warn) {
        if (w.code === 'MODULE_LEVEL_DIRECTIVE' || w.code === 'SOURCEMAP_ERROR') return;
        warn(w);
      },
    },
  },
});
