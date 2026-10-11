// @/i18n/navigation for re-hosted components: sky has one page, so routing
// is a no-op apart from opening absolute links.
import { createElement, type AnchorHTMLAttributes } from 'react';

export function useRouter() {
  return { push: (_href: string) => {}, replace: (_href: string) => {}, back: () => history.back(), refresh: () => {} };
}

export function usePathname(): string {
  return '/';
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href?: string;
  // next-intl's routing props: meaningless on sky's single page.
  locale?: string;
  prefetch?: boolean | null;
  replace?: boolean;
  scroll?: boolean;
  onNavigate?: (e: { preventDefault(): void }) => void;
};

export function Link({ locale: _l, prefetch: _p, replace: _r, scroll: _s, onNavigate: _n, ...props }: LinkProps) {
  return createElement('a', props);
}
