// obelisk-dex's own login modal (src/app/[locale]/app/login/LoginModal.tsx),
// re-hosted as a React island: same SDK props, copy, icons, signer-app link,
// pasted-key warning, generated-profile step and La Crypta styling. The app
// modules it reaches for (session actions, next-intl, routing, clipboard,
// Blossom) are sky shims, see client/vite.config.ts.

import { createRoot, type Root } from 'react-dom/client';
import LoginModal from '@/app/[locale]/app/login/LoginModal';
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
