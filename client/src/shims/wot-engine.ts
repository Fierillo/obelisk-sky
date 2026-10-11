// `@/services/wot/engine` for the re-hosted voice and message code. Obelisk's
// WoT filter is off by default and fails open; sky doesn't run it, so
// everything the relay delivers is allowed (the relay applies its own WoT
// admission), no verdicts ever change, and nobody has a known distance.
export const wotEngine = {
  isAllowed: (_pubkey: string, _kind?: number) => true,
  on: (_event: 'verdicts-changed', _cb: () => void): (() => void) => () => {},
  getDistance: (_pubkey: string): number | null => null,
};
