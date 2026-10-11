// The signed-in user's follows, as a store for the re-hosted components
// (`useMyFollowSet`). Sky doesn't load the kind 3 list yet, so it stays
// empty; message bodies are rendered without the remote-media gate.

let follows: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();

export function getFollows(): ReadonlySet<string> {
  return follows;
}

export function setFollows(pubkeys: Iterable<string>): void {
  follows = new Set(pubkeys);
  for (const l of listeners) l();
}

export function subscribeFollows(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
