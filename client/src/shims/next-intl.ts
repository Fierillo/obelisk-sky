// next-intl, as far as the re-hosted obelisk-dex components use it: English
// messages from the vendored src/i18n/messages/en, ICU `{name}` arguments,
// and `t.rich` with tag callbacks.

import { createElement, Fragment, type ReactNode } from 'react';

const modules = import.meta.glob('@/i18n/messages/en/*.json', { eager: true, import: 'default' }) as Record<string, Record<string, unknown>>;
const messages: Record<string, unknown> = {};
for (const [path, mod] of Object.entries(modules)) {
  const name = path.split('/').pop()!.replace(/\.json$/, '');
  messages[name] = mod;
}

function lookup(key: string): string | null {
  let cur: unknown = messages;
  for (const part of key.split('.')) {
    if (!cur || typeof cur !== 'object') return null;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string' ? cur : null;
}

type Values = Record<string, unknown>;

function format(msg: string, values?: Values): string {
  if (!values) return msg;
  // {count, plural, one {...} other {...}}: pick the branch, then substitute.
  msg = msg.replace(/\{(\w+), plural,((?:[^{}]|\{[^{}]*\})*)\}/g, (_m, name: string, body: string) => {
    const n = Number(values[name]);
    const branch = (sel: string) => body.match(new RegExp(`${sel}\\s*\\{([^{}]*)\\}`))?.[1];
    const pick = (n === 0 && branch('=0')) || (n === 1 && (branch('=1') ?? branch('one'))) || branch('other') || '';
    return pick.replace(/#/g, String(n));
  });
  return msg.replace(/\{(\w+)\}/g, (_m, name: string) => (values[name] === undefined ? `{${name}}` : String(values[name])));
}

export interface Translator {
  (key: string, values?: Values): string;
  rich(key: string, values?: Record<string, unknown>): ReactNode;
  markup(key: string, values?: Values): string;
  raw(key: string): unknown;
  has(key: string): boolean;
}

export function translator(namespace?: string): Translator {
  const full = (k: string) => (namespace ? `${namespace}.${k}` : k);
  const t = ((key: string, values?: Values) => format(lookup(full(key)) ?? full(key), values)) as Translator;
  t.has = (key) => lookup(full(key)) !== null;
  t.raw = (key) => lookup(full(key));
  t.markup = (key, values) => format(lookup(full(key)) ?? full(key), values);
  t.rich = (key, values = {}) => {
    const plain: Values = {};
    for (const [k, v] of Object.entries(values)) if (typeof v !== 'function') plain[k] = v;
    const text = format(lookup(full(key)) ?? full(key), plain);
    const parts: ReactNode[] = [];
    const re = /<(\w+)>(.*?)<\/\1>/g;
    let last = 0;
    let i = 0;
    for (const m of text.matchAll(re)) {
      if (m.index! > last) parts.push(text.slice(last, m.index));
      const fn = values[m[1]];
      parts.push(typeof fn === 'function' ? createElement(Fragment, { key: i++ }, (fn as (c: ReactNode) => ReactNode)(m[2])) : m[2]);
      last = m.index! + m[0].length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return createElement(Fragment, null, ...parts);
  };
  return t;
}

export function useTranslations(namespace?: string): Translator {
  return translator(namespace);
}

export function useLocale(): 'en' {
  return 'en';
}

export function useFormatter() {
  return {
    dateTime: (d: Date | number, o?: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en', o).format(d),
    number: (n: number, o?: Intl.NumberFormatOptions) => new Intl.NumberFormat('en', o).format(n),
    relativeTime: (d: Date | number) => new Intl.DateTimeFormat('en').format(d),
  };
}

// Type surface the app's src/i18n/keys.ts imports. Sky's translator is
// untyped at the key level, so these are deliberately loose.
export type Messages = Record<string, unknown>;
export type NestedKeyOf<_T> = string;
export type MessageKeys<_T, _K> = string;
export type TranslationValues = Record<string, unknown>;
