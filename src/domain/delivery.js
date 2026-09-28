export const DELIVERY_STATE = Object.freeze({
  PENDING: 'pending',
  DELIVERED: 'delivered',
  FAILED: 'failed',
  STALE: 'stale',
});

const DELIVERY_COPY = Object.freeze({
  [DELIVERY_STATE.PENDING]: 'Pending',
  [DELIVERY_STATE.DELIVERED]: 'Delivered',
  [DELIVERY_STATE.FAILED]: 'Failed',
  [DELIVERY_STATE.STALE]: 'Stale',
});

export const RELAY_HEALTH = Object.freeze({
  CONNECTED: 'connected',
  CONNECTING: 'connecting',
  OFFLINE: 'offline',
});

const DELIVERY_TONE = Object.freeze({
  [DELIVERY_STATE.PENDING]: 'info',
  [DELIVERY_STATE.DELIVERED]: 'ok',
  [DELIVERY_STATE.FAILED]: 'err',
  [DELIVERY_STATE.STALE]: 'warn',
});

export function deliveryCopy(state) {
  return DELIVERY_COPY[state] ?? state;
}

export function deliveryTone(state) {
  return DELIVERY_TONE[state] ?? 'muted';
}

export function isDeliverySettled(state) {
  return state === DELIVERY_STATE.DELIVERED || state === DELIVERY_STATE.PENDING;
}

export function staleCopy(daysAgo) {
  const days = Number.isFinite(daysAgo) ? daysAgo : 0;
  return `Last confirmed ${days} day${days === 1 ? '' : 's'} ago — this may not reflect the issuer's latest update.`;
}
