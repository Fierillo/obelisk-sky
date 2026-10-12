// The slash commands sky's message bar offers before the bots' own: the
// app's built-ins. `/zap` opens sky's zap sheet (ui/zapSheet.ts), `/play`
// its game table, like the app's zap modal and NewGameModal.

import { SLASH_COMMANDS } from '@/constants/chat/slash';
import type { SlashCommand } from '@/utils/chat/slash/slash-commands';

export const SKY_SLASH_COMMANDS: SlashCommand[] = [...SLASH_COMMANDS];

/** The built-in command a draft starts with (`/play` is `play`), if any: draft-text's builtinCommandOf over sky's list. */
export function skyBuiltinOf(value: string): SlashCommand | null {
  const m = /^\/([a-zA-Z]+)(?:\s|$)/.exec(value);
  if (!m) return null;
  return SKY_SLASH_COMMANDS.find((c) => c.name === m[1].toLowerCase()) ?? null;
}

/** App-only commands sky can't run: kept off the wire instead of posted as text. None left. */
export function unsupportedCommandOf(_value: string): string | null {
  return null;
}
