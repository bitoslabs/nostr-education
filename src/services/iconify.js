export const DEFAULT_COLLECTION = 'ph';
export const DEFAULT_BASE_URL = 'https://api.iconify.design';
export const DEFAULT_MAX_ENTRIES = 256;

const CACHE_NAME = 'bitos-icons-v1';
const STORAGE_PREFIX = 'bitos.icon.v1:';
const CACHE_ORIGIN = 'https://icons.local';

export function normalizeIconName(name, defaultCollection = DEFAULT_COLLECTION) {
  const raw = String(name ?? '').trim();
  if (!raw) return '';

  const separator = raw.indexOf(':');
  if (separator === -1) return `${defaultCollection}:${raw}`;

  const collection = raw.slice(0, separator).trim();
  const iconName = raw.slice(separator + 1).trim();
  if (!collection || !iconName) return '';

  return `${collection}:${iconName}`;
}

export function iconUrl(name, { baseUrl = DEFAULT_BASE_URL, color, width, height } = {}) {
  const normalized = normalizeIconName(name);
  if (!normalized) return '';

  const query = new URLSearchParams();
  if (color) query.set('color', color);
  if (width) query.set('width', String(width));
  if (height) query.set('height', String(height));

  const suffix = query.size > 0 ? `?${query}` : '';
  return `${String(baseUrl).replace(/\/$/, '')}/${normalized}.svg${suffix}`;
}

function cacheStorage() {
  try {
    return typeof caches === 'undefined' ? null : caches;
  } catch {
    return null;
  }
}

function localStore() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function iconRequest(normalized) {
  return new Request(`${CACHE_ORIGIN}/${encodeURIComponent(normalized)}`);
}

export function createPersistentIconCache() {
  return {
    async get(normalized) {
      const cache = cacheStorage();
      if (cache) {
        try {
          const hit = await (await cache.open(CACHE_NAME)).match(iconRequest(normalized));
          if (hit) return hit.text();
          return null;
        } catch {
          /* fall through to local storage */
        }
      }

      const store = localStore();
      if (!store) return null;
      try {
        return store.getItem(STORAGE_PREFIX + normalized);
      } catch {
        return null;
      }
    },

    async set(normalized, svgText) {
      const cache = cacheStorage();
      if (cache) {
        try {
          const response = new Response(svgText, {
            headers: { 'content-type': 'image/svg+xml; charset=utf-8' },
          });
          await (await cache.open(CACHE_NAME)).put(iconRequest(normalized), response);
          return true;
        } catch {
          /* fall through to local storage */
        }
      }

      const store = localStore();
      if (!store) return false;
      try {
        store.setItem(STORAGE_PREFIX + normalized, svgText);
        return true;
      } catch {
        return false;
      }
    },
  };
}

export function createIconifyLoader({
  baseUrl = DEFAULT_BASE_URL,
  fetcher = globalThis.fetch,
  cache = new Map(),
  maxEntries = DEFAULT_MAX_ENTRIES,
  persistent = createPersistentIconCache(),
} = {}) {
  function recall(normalized) {
    if (!cache.has(normalized)) return null;
    const value = cache.get(normalized);
    cache.delete(normalized);
    cache.set(normalized, value);
    return value;
  }

  function remember(normalized, value) {
    cache.delete(normalized);
    cache.set(normalized, value);
    while (cache.size > maxEntries) {
      cache.delete(cache.keys().next().value);
    }
  }

  async function fetchIcon(normalized) {
    if (typeof fetcher !== 'function') {
      throw new Error('Icon fetching is unavailable in this environment.');
    }
    const response = await fetcher(iconUrl(normalized, { baseUrl }));
    if (!response.ok) {
      throw new Error(`Icon "${normalized}" failed with status ${response.status}.`);
    }
    return response.text();
  }

  function resolve(normalized) {
    return (async () => {
      if (persistent) {
        try {
          const stored = await persistent.get(normalized);
          if (stored) return stored;
        } catch {
          /* ignore persistent read errors and fall back to the network */
        }
      }

      const svgText = await fetchIcon(normalized);
      if (persistent) persistent.set(normalized, svgText);
      return svgText;
    })();
  }

  async function load(name) {
    const normalized = normalizeIconName(name);
    if (!normalized) return '';

    const cached = recall(normalized);
    if (cached) return cached;

    const promise = resolve(normalized);
    remember(normalized, promise);

    try {
      return await promise;
    } catch (error) {
      if (cache.get(normalized) === promise) cache.delete(normalized);
      throw error;
    }
  }

  return { load, cache };
}
