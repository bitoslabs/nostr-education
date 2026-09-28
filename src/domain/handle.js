export const HANDLE_MIN = 3;
export const HANDLE_MAX = 24;

const HANDLE_PATTERN = /^[a-z0-9._]+$/;
const RESERVED = new Set(['admin', 'verify', 'support', 'root', 'system', 'bitos']);

const CONFUSABLE_GROUPS = [
  new Set(['0', 'o']),
  new Set(['1', 'l', 'i']),
  new Set(['5', 's']),
  new Set(['2', 'z']),
  new Set(['rn', 'm']),
];

export function normalizeHandle(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function validateHandle(value) {
  const handle = normalizeHandle(value);

  if (handle.length < HANDLE_MIN || handle.length > HANDLE_MAX) {
    return { valid: false, reason: 'length', handle };
  }
  if (!HANDLE_PATTERN.test(handle)) {
    return { valid: false, reason: 'charset', handle };
  }
  if (RESERVED.has(handle)) {
    return { valid: false, reason: 'reserved', handle };
  }
  return { valid: true, handle };
}

export function levenshtein(left, right) {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const distance = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => (row === 0 ? col : col === 0 ? row : 0)),
  );

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1;
      distance[row][col] = Math.min(
        distance[row - 1][col] + 1,
        distance[row][col - 1] + 1,
        distance[row - 1][col - 1] + cost,
      );
    }
  }

  return distance[rows - 1][cols - 1];
}

export function isConfusable(left, right) {
  const a = normalizeHandle(left);
  const b = normalizeHandle(right);
  if (a === b || a.length !== b.length) return false;

  let confusable = false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] === b[index]) continue;
    const sharesGroup = CONFUSABLE_GROUPS.some(
      (group) => group.has(a[index]) && group.has(b[index]),
    );
    if (!sharesGroup) return false;
    confusable = true;
  }

  return confusable;
}

export function findLookalikes(value, candidates = []) {
  const handle = normalizeHandle(value);
  if (!handle) return [];

  return candidates.filter((candidate) => {
    const other = normalizeHandle(candidate);
    if (!other || other === handle) return false;
    return levenshtein(handle, other) <= 1 || isConfusable(handle, other);
  });
}

export function resolveRecipient(raw, contacts = {}, { truncate = (key) => key } = {}) {
  const value = String(raw ?? '').trim();
  if (!value) return { kind: 'empty' };

  if (/^npub1[0-9a-z]{20,}$/.test(value)) {
    return { kind: 'npub', display: truncate(value), value };
  }

  const handle = normalizeHandle(value.replace(/^@/, ''));
  const contact = contacts[handle];
  if (contact) return { kind: 'known', handle, contact, display: `@${handle}` };

  const near = Object.keys(contacts).find(
    (candidate) => levenshtein(normalizeHandle(candidate), handle) === 1,
  );
  if (near) return { kind: 'lookalike', handle, near, display: `@${handle}` };

  return { kind: 'unknown', handle, display: `@${handle}` };
}
