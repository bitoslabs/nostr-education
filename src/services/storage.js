const STATE_KEY = 'bitos.education.state.v1';
const SECRET_KEY = 'bitos.education.secret.v1';
const ORG_SECRET_KEY = 'bitos.education.orgsecrets.v1';
const FEED_CACHE_KEY = 'bitos.education.feed.v1';
// Only the newest notes are cached, for an instant first paint before relays
// answer. Enough to fill the first screen; stale entries fall off the tail.
const FEED_CACHE_LIMIT = 20;

const PERSISTED_FIELDS = [
  'session',
  'locale',
  'mode',
  'prefs',
  'relayConfig',
  'profiles',
  'blossomServer',
  'academies',
  'invites',
  'subjects',
  'classrooms',
  'homework',
  'submissions',
  'submissionVersions',
  'assessmentRevisions',
  'memberships',
  'academyMemberships',
  'joinRequests',
  'enrollRequests',
  'recommendations',
  'signQueue',
  'credentials',
  'privateNames',
  'following',
  'capabilities',
  'zapsByAccount',
  'conversationsByAccount',
  'walletConnectedByAccount',
  'notificationReads',
  'socialNotificationsByAccount',
];

function storage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadState() {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveState(state) {
  const store = storage();
  if (!store) return;
  try {
    const snapshot = {};
    for (const field of PERSISTED_FIELDS) {
      if (state[field] !== undefined) snapshot[field] = state[field];
    }
    store.setItem(STATE_KEY, JSON.stringify(snapshot));
  } catch {
    /* storage may be unavailable or full */
  }
}

// Wipe only the cached feed page, keeping keys and records intact. Used by the
// Settings → Network "Clear cache" control.
export function clearFeedCache() {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(FEED_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

export function clearState() {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(STATE_KEY);
    store.removeItem(SECRET_KEY);
    store.removeItem(ORG_SECRET_KEY);
    store.removeItem(FEED_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

// Cached notes for an instant feed paint. Store the signed source event only,
// so the caller re-projects it (fresh relative times, no stale flags) on load.
export function loadFeedCache() {
  const store = storage();
  if (!store) return [];
  try {
    const raw = store.getItem(FEED_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveFeedCache(events) {
  const store = storage();
  if (!store) return;
  try {
    const notes = (Array.isArray(events) ? events : [])
      .filter((event) => event?.type === 'social' && event?.raw)
      .slice(0, FEED_CACHE_LIMIT)
      .map((event) => event.raw);
    store.setItem(FEED_CACHE_KEY, JSON.stringify(notes));
  } catch {
    /* storage may be unavailable or full */
  }
}

function readOrgSecrets(store) {
  try {
    const raw = store.getItem(ORG_SECRET_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveOrgSecret(academyId, secretKey, encode) {
  const store = storage();
  if (!store || !academyId) return;
  try {
    const secrets = readOrgSecrets(store);
    secrets[academyId] = encode(secretKey);
    store.setItem(ORG_SECRET_KEY, JSON.stringify(secrets));
  } catch {
    /* ignore */
  }
}

export function loadOrgSecret(academyId, decode) {
  const store = storage();
  if (!store || !academyId) return null;
  try {
    const raw = readOrgSecrets(store)[academyId];
    if (!raw) return null;
    const decoded = decode(raw);
    return decoded?.type === 'nsec' ? decoded.secretKey : null;
  } catch {
    return null;
  }
}

export function saveSecretKey(secretKey, encode) {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(SECRET_KEY, encode(secretKey));
  } catch {
    /* ignore */
  }
}

export function loadSecretKey(decode) {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(SECRET_KEY);
    if (!raw) return null;
    const decoded = decode(raw);
    return decoded?.type === 'nsec' ? decoded.secretKey : null;
  } catch {
    return null;
  }
}

export function hasSecretKey() {
  const store = storage();
  if (!store) return false;
  try {
    return Boolean(store.getItem(SECRET_KEY));
  } catch {
    return false;
  }
}
