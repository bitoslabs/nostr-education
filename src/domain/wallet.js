// Wallet / zap history model.
//
// The prototype has no custodial balance and no Lightning connection: the
// history is a projection over NIP-57 zap receipts (kind 9735) read from
// relays, and `zapFromReceipt` turns one into a display entry. The product plan
// (docs/product-roadmap.md, R4) keeps the wallet external, so this module only
// derives a display balance and never authorizes anything.

export const ZAP_RECEIPT_KIND = 9735;
export const ZAP_REQUEST_KIND = 9734;

// NIP-57 zap request tags. The amount is millisats; `relays` tells the
// recipient's server where to publish the receipt; `lnurl` records the endpoint.
export function zapRequestTags({ recipient, eventId = null, amountSats, relays = [], lnurl = null } = {}) {
  const amountMsat = Math.max(1, Math.round((Number(amountSats) || 0) * 1000));
  const tags = [
    ['relays', ...(Array.isArray(relays) ? relays : [])],
    ['amount', String(amountMsat)],
    ['p', recipient],
  ];
  if (lnurl) tags.push(['lnurl', lnurl]);
  if (eventId) tags.push(['e', eventId]);
  return tags;
}

export const ZAP_DIRECTION = Object.freeze({ IN: 'in', OUT: 'out' });

export const ZAP_STATUS = Object.freeze({
  SETTLED: 'settled',
  PENDING: 'pending',
  FAILED: 'failed',
});

const STATUSES = new Set(Object.values(ZAP_STATUS));

export function normalizeZap(entry = {}) {
  const amountSats = Math.max(0, Math.round(Number(entry.amountSats) || 0));
  const direction = entry.direction === ZAP_DIRECTION.OUT ? ZAP_DIRECTION.OUT : ZAP_DIRECTION.IN;
  const status = STATUSES.has(entry.status) ? entry.status : ZAP_STATUS.SETTLED;
  return {
    id: String(entry.id ?? ''),
    direction,
    amountSats,
    status,
    peerId: entry.peerId ?? null,
    note: String(entry.note ?? ''),
    createdAt: entry.createdAt ?? null,
    // NIP-57 correlation. `requestId` is the signed kind:9734 id we authored;
    // `eventId` is the zapped note (the receipt's `e` tag). Both let a live
    // receipt replace the optimistic entry instead of double-counting it.
    requestId: entry.requestId ?? null,
    eventId: entry.eventId ?? null,
  };
}

function tagValue(tags, name) {
  const tag = (tags ?? []).find(
    (entry) => Array.isArray(entry) && entry[0] === name && entry[1] != null,
  );
  return tag ? tag[1] : null;
}

function parseZapRequest(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

// The amount lives in the zap request's `amount` tag in millisats (NIP-57).
// Receipts have no standardized amount tag, so fall back to one only if present.
function zapRequestAmountSats(request, tags) {
  const msat = Number(tagValue(request?.tags, 'amount') ?? tagValue(tags, 'amount') ?? 0);
  return Number.isFinite(msat) && msat > 0 ? Math.round(msat / 1000) : 0;
}

// The signed kind:9734 zap request embedded in a receipt's `description` tag.
export function zapRequestFromReceipt(event) {
  if (!event || event.kind !== ZAP_RECEIPT_KIND) return null;
  return parseZapRequest(tagValue(event.tags ?? [], 'description'));
}

// Turn a NIP-57 zap receipt (kind 9735) into a normalized entry for `meId`, or
// null when it is not a usable receipt involving this account. Direction is
// decided by the `p` recipient tag (incoming) or `P` sender tag (our own copy).
// A `P` tag is optional in the wild, so the embedded request's `pubkey` is used
// as the sender fallback; that is what lets an outgoing zap settle when the
// recipient's server omits `P`. Pass `requestId` to accept only the receipt for
// one specific signed request (used by the live "auto-detect" watcher).
export function zapFromReceipt(event, meId, { requestId = null } = {}) {
  if (!event || event.kind !== ZAP_RECEIPT_KIND || !meId) return null;
  const tags = event.tags ?? [];
  const recipient = tagValue(tags, 'p');
  const request = parseZapRequest(tagValue(tags, 'description'));
  const sender = tagValue(tags, 'P') ?? request?.pubkey ?? null;
  let direction;
  if (recipient === meId) direction = ZAP_DIRECTION.IN;
  else if (sender === meId) direction = ZAP_DIRECTION.OUT;
  else return null;
  if (requestId && request?.id !== requestId) return null;

  const amountSats = zapRequestAmountSats(request, tags);
  if (!amountSats) return null;

  const counterparty =
    direction === ZAP_DIRECTION.IN ? sender ?? request?.pubkey ?? null : recipient;
  const createdAt = Number(event.created_at);

  return normalizeZap({
    id: String(event.id ?? ''),
    direction,
    amountSats,
    status: ZAP_STATUS.SETTLED,
    peerId: counterparty,
    note: String(request?.content ?? '').trim(),
    createdAt: Number.isFinite(createdAt) && createdAt > 0 ? new Date(createdAt * 1000).toISOString() : null,
    requestId: request?.id ?? null,
    eventId: tagValue(tags, 'e'),
  });
}

// Dedupe by receipt id so a relay replay and a live delivery cannot double-count.
export function mergeZap(list = [], zap) {
  if (!zap?.id) return list;
  if (list.some((entry) => entry.id === zap.id)) return list;
  return sortZaps([zap, ...list]);
}

// Insert or replace by id and by NIP-57 request id. Used for the optimistic
// record written the moment a wallet reports payment, so re-recording the same
// zap does not append a duplicate.
export function upsertZap(list = [], zap) {
  if (!zap?.id) return list;
  const without = list.filter(
    (entry) => entry.id !== zap.id && (!zap.requestId || entry.requestId !== zap.requestId),
  );
  return sortZaps([zap, ...without]);
}

// Merge a settled receipt. Returns the original list unchanged when that exact
// receipt is already present (so callers can detect a no-op). When the receipt
// carries a request id, any optimistic entry for the same request is evicted so
// the settled receipt supersedes it instead of double-counting the balance.
export function mergeZapReceipt(list = [], zap) {
  if (!zap?.id) return list;
  if (list.some((entry) => entry.id === zap.id)) return list;
  const withoutOptimistic = zap.requestId
    ? list.filter((entry) => entry.requestId !== zap.requestId)
    : list;
  return sortZaps([zap, ...withoutOptimistic]);
}

export function zapsForAccount(state, accountId) {
  if (!accountId) return [];
  return state?.zapsByAccount?.[accountId] ?? [];
}

// Settled entries only: a pending outgoing tip has not left the wallet yet, so
// it must not reduce the displayed balance.
export function walletBalance(zaps = []) {
  return zaps.reduce((total, zap) => {
    if (zap.status !== ZAP_STATUS.SETTLED) return total;
    return total + (zap.direction === ZAP_DIRECTION.OUT ? -zap.amountSats : zap.amountSats);
  }, 0);
}

export function sortZaps(zaps = []) {
  return [...zaps].sort(
    (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
  );
}

export function formatSats(value) {
  const amount = Math.round(Number(value) || 0);
  return amount.toLocaleString('en-US');
}
