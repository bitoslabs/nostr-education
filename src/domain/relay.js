export const RELAY_MODE = Object.freeze({
  READ: 'read',
  WRITE: 'write',
  READ_WRITE: 'read+write',
});

const MODES = new Set(Object.values(RELAY_MODE));
const MODE_ORDER = [RELAY_MODE.READ_WRITE, RELAY_MODE.READ, RELAY_MODE.WRITE];

export function normalizeRelayUrl(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return '';

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `wss://${raw}`;

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

export function relaysForKind(list, kind) {
  const wanted = kind === 'write' ? RELAY_MODE.WRITE : RELAY_MODE.READ;
  return (list ?? [])
    .filter((relay) => relay.mode === RELAY_MODE.READ_WRITE || relay.mode === wanted)
    .map((relay) => relay.url);
}
