// How the client sources authority and storage. See docs/architecture/nostr-native.md.
//   nostr  — relays + signed capabilities only; no application API.
//   server — the private API is authoritative; capabilities are cached.
//   hybrid — relays and the API are both allowed (the default for a real academy).
export const MODE = Object.freeze({
  NOSTR: 'nostr',
  SERVER: 'server',
  HYBRID: 'hybrid',
});

export const DEFAULT_MODE = MODE.HYBRID;

export function normalizeMode(value) {
  const raw = String(value ?? '').toLowerCase();
  if (raw === MODE.NOSTR) return MODE.NOSTR;
  if (raw === MODE.SERVER) return MODE.SERVER;
  return DEFAULT_MODE;
}

export function modeLabel(mode) {
  const normalized = normalizeMode(mode);
  if (normalized === MODE.NOSTR) return 'Nostr only — no application server';
  if (normalized === MODE.SERVER) return 'Server — private API is authoritative';
  return 'Hybrid — relays and server';
}

export function modeDescription(mode) {
  const normalized = normalizeMode(mode);
  if (normalized === MODE.NOSTR) return 'Classes and authority come from signed capability events on relays.';
  if (normalized === MODE.SERVER) return 'The private API resolves rosters and permissions; relays carry public records only.';
  return 'Rosters and permissions can come from the API when configured, else from signed capabilities.';
}

export function usesServer(mode) {
  return normalizeMode(mode) !== MODE.NOSTR;
}

export function usesRelays(mode) {
  return normalizeMode(mode) !== MODE.SERVER;
}

export function authoritySource(mode) {
  const normalized = normalizeMode(mode);
  if (normalized === MODE.NOSTR) return 'attested';
  if (normalized === MODE.SERVER) return 'server';
  return 'either';
}
