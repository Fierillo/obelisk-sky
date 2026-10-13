// Loaded before main.ts (app/index.html): the loader, the gate and the
// rotate card in the visitor's language while the village's code downloads.

import { lang } from './lang';
import { applyAppLang } from './app';

document.documentElement.lang = lang;
applyAppLang(document);
