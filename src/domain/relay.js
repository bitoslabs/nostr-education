export const RELAY_MODE = Object.freeze({
  READ: 'read',
  WRITE: 'write',
  READ_WRITE: 'read+write',
});

const MODES = new Set(Object.values(RELAY_MODE));
const MODE_ORDER = [RELAY_MODE.READ_WRITE, RELAY_MODE.READ, RELAY_MODE.WRITE];

const IPV4 =
  /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

// Plaintext ws:// is the sensible default for every localhost and IP-address
// host, where TLS certificates are uncommon (plus mDNS and Tor names).
// Everything else defaults to the secure wss:// scheme. An explicit scheme in
// the input always wins.
export function isPlaintextRelayHost(hostname) {
  const host = String(hostname ?? '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
  if (!host) return false;
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host.endsWith('.local') || host.endsWith('.onion')) return true;
  if (host.includes(':')) return true;
  return IPV4.test(host);
}

export function normalizeRelayUrl(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return '';

  let withScheme = raw;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    let host = raw;
    try {
      host = new URL(`ws://${raw}`).hostname;
    } catch {
      return '';
    }
    withScheme = `${isPlaintextRelayHost(host) ? 'ws' : 'wss'}://${raw}`;
  }

  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'wss:' && url.protocol !== 'ws:') return '';
    if (!url.hostname) return '';
    const base = `${url.protocol}//${url.host}${url.pathname}`;
    return base.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

export function isValidRelayUrl(value) {
  return normalizeRelayUrl(value) !== '';
}

export function relayId(url) {
  const normalized = normalizeRelayUrl(url);
  return normalized ? `relay:${normalized}` : '';
}

export function normalizeRelayMode(value, fallback = RELAY_MODE.READ_WRITE) {
  const raw = String(value ?? '').trim().toLowerCase();
  return MODES.has(raw) ? raw : fallback;
}

export function relayModeLabel(mode) {
  const normalized = normalizeRelayMode(mode);
  if (normalized === RELAY_MODE.READ) return 'read only';
  if (normalized === RELAY_MODE.WRITE) return 'write only';
  return 'read + write';
}

export function nextRelayMode(mode) {
  const current = normalizeRelayMode(mode);
  const index = MODE_ORDER.indexOf(current);
  return MODE_ORDER[(index + 1) % MODE_ORDER.length];
}

export function normalizeRelayList(list, { defaults = [] } = {}) {
  const source = Array.isArray(list) && list.length ? list : defaults;
  const seen = new Set();
  const relays = [];

  for (const entry of source ?? []) {
    const url = normalizeRelayUrl(typeof entry === 'string' ? entry : entry?.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    relays.push({
      id: relayId(url),
      url,
      mode: normalizeRelayMode(entry?.mode),
    });
  }

  return relays;
}

export function addRelay(list, input) {
  const url = normalizeRelayUrl(input);
  if (!url) return { relays: list, error: 'invalid' };
  if ((list ?? []).some((relay) => relay.url === url)) return { relays: list, error: 'duplicate' };
  return {
    relays: [...(list ?? []), { id: relayId(url), url, mode: RELAY_MODE.READ_WRITE }],
    error: null,
  };
}

export function removeRelay(list, id) {
  return (list ?? []).filter((relay) => relay.id !== id);
}

export function setRelayMode(list, id, mode) {
  const normalized = normalizeRelayMode(mode);
  return (list ?? []).map((relay) => (relay.id === id ? { ...relay, mode: normalized } : relay));
}

// The first relay in the list is the primary: reads hit it first and the other
// relays only join afterwards, so promoting a relay simply moves it to the
// front. Unknown or already-primary ids leave the order untouched.
export function promoteRelay(list, id) {
  const relays = [...(list ?? [])];
  const index = relays.findIndex((relay) => relay.id === id);
  if (index <= 0) return relays;
  const [entry] = relays.splice(index, 1);
  return [entry, ...relays];
}

export function relaysForKind(list, kind) {
  const wanted = kind === 'write' ? RELAY_MODE.WRITE : RELAY_MODE.READ;
  return (list ?? [])
    .filter((relay) => relay.mode === RELAY_MODE.READ_WRITE || relay.mode === wanted)
    .map((relay) => relay.url);
}
