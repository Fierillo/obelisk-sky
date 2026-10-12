// obelisk-dex's own login modal (src/app/[locale]/app/login/LoginModal.tsx),
// re-hosted as a React island: same SDK props, copy, icons, signer-app link,
// pasted-key warning, generated-profile step and La Crypta styling. The app
// modules it reaches for (session actions, next-intl, routing, clipboard,
// Blossom) are sky shims, see client/vite.config.ts.

import { createRoot, type Root } from 'react-dom/client';
import LoginModal from '@/app/[locale]/app/login/LoginModal';
import { loginSignerStorage } from '@/services/session/signer-storage';
import { SIGNER_STORAGE_KEY_NIP46 } from '@nostr-wot/ui';
import '@nostr-wot/ui/styles.css';
import '../obelisk.generated.css';

let root: Root | null = null;

export function openLogin(onDone?: () => void): void {
  // The SDK modal portals to <body>, which carries the theme like the app's.
  document.body.setAttribute('data-nui-root', '');
  document.body.setAttribute('data-nui-theme', 'la-crypta');
  if (!root) {
    const host = document.createElement('div');
    host.className = 'login-host';
    document.body.appendChild(host);
    root = createRoot(host);
  }
  const close = () => root?.render(null);
  root.render(<LoginModal onClose={close} onSuccess={() => { close(); onDone?.(); }} />);
}

/**
 * After logging out: close a modal left open and forget the remote-signer
 * pairing. The SDK keeps the NIP-46 client key in memory for its QR retry;
 * reused after a logout, a signer app that already knows that key ignores
 * the new connect, and the modal just waits until the page is reloaded.
 */
export function resetLogin(): void {
  root?.render(null);
  loginSignerStorage.removeItem(SIGNER_STORAGE_KEY_NIP46);
}
