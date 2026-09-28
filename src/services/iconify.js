export const DEFAULT_COLLECTION = 'ph';
export const DEFAULT_BASE_URL = 'https://api.iconify.design';

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

export function createIconifyLoader({
  baseUrl = DEFAULT_BASE_URL,
  fetcher = globalThis.fetch,
  cache = new Map(),
} = {}) {
  async function load(name) {
    const normalized = normalizeIconName(name);
    if (!normalized) return '';

    if (!cache.has(normalized)) {
      cache.set(
        normalized,
        (async () => {
          if (typeof fetcher !== 'function') {
            throw new Error('Icon fetching is unavailable in this environment.');
          }
          const response = await fetcher(iconUrl(normalized, { baseUrl }));
          if (!response.ok) {
            throw new Error(`Icon "${normalized}" failed with status ${response.status}.`);
          }
          return response.text();
        })(),
      );
    }

    try {
      return await cache.get(normalized);
    } catch (error) {
      cache.delete(normalized);
      throw error;
    }
  }

  return { load, cache };
}
