// Accepts an ISO string, a millisecond timestamp, or a Nostr `created_at`
// (unix seconds) so raw event times and local ISO times format the same way.
function toDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number' || /^\d+$/.test(String(value))) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    // Nostr created_at is seconds; anything smaller than 1e12 is seconds.
    const date = new Date(numeric < 1e12 ? numeric * 1000 : numeric);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

// Compact relative time for lists: "now", "5m", "3h", "2d", then a date.
export function formatRelative(value, now = Date.now()) {
  const date = toDate(value);
  if (!date) return null;
  const delta = now - date.getTime();
  const abs = Math.abs(delta);
  const MIN = 60_000;
  const HOUR = 3_600_000;
  const DAY = 86_400_000;
  const WEEK = 604_800_000;
  const future = delta < 0;
  if (abs < MIN) return 'now';
  const unit = (n, suffix) => (future ? `in ${n}${suffix}` : `${n}${suffix}`);
  if (abs < HOUR) return unit(Math.round(abs / MIN), 'm');
  if (abs < DAY) return unit(Math.round(abs / HOUR), 'h');
  if (abs < WEEK) return unit(Math.round(abs / DAY), 'd');
  return formatDate(value);
}

export function formatDate(value) {
  const date = toDate(value);
  if (!date) return null;
  try {
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return null;
  }
}
