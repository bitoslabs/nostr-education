// Giphy GIF search for the note composer.
//
// The public beta key is embedded here so the prototype works without an
// account. Move it behind a config value (or a proxy that hides the key and
// rate-limits per user) before any production release.

export const GIPHY_API_KEY = 'Gc7131jiJuvI7IdN0HZ1D7nh0ow5BU6g';

const ENDPOINT = 'https://api.giphy.com/v1/gifs';
const RATING = 'pg-13';

// Empty query returns trending, matching the endpoint Giphy expects. Keeping
// the URL builder pure makes it testable without hitting the network.
export function giphySearchUrl(query, { apiKey = GIPHY_API_KEY, limit = 24, rating = RATING } = {}) {
  const params = new URLSearchParams({ api_key: apiKey, limit: String(limit), rating });
  const trimmed = String(query ?? '').trim();
  if (trimmed) {
    params.set('q', trimmed);
    return `${ENDPOINT}/search?${params.toString()}`;
  }
  return `${ENDPOINT}/trending?${params.toString()}`;
}

// Giphy exposes several renditions. `original` can be tens of MB, so a feed
// GIF is capped around 200px: prefer the fixed-height (h≈200) rendition over
// `downsized`, and only fall back to `original` when neither exists.
export function mapGif(gif) {
  if (!gif?.images) return null;
  const images = gif.images;
  const url = images.fixed_height?.url ?? images.downsized?.url ?? images.original?.url ?? null;
  if (!url) return null;
  return {
    id: gif.id ?? url,
    url,
    previewUrl: images.fixed_height_small?.url ?? images.fixed_height?.url ?? url,
    title: gif.title || 'GIF',
    type: 'image/gif',
  };
}

export async function searchGifs(query, { signal, limit = 24, apiKey } = {}) {
  const response = await fetch(giphySearchUrl(query, { apiKey, limit }), { signal });
  if (!response.ok) throw new Error(`Giphy request failed (${response.status}).`);
  const data = await response.json().catch(() => null);
  const items = (Array.isArray(data?.data) ? data.data : []).map(mapGif).filter(Boolean);
  cacheGifs(query, items);
  return items;
}

// ---- cache -----------------------------------------------------------------
// Trending/search results change slowly, so a short-lived cache makes reopening
// the picker instant and lets it work offline. Memory first, then localStorage.

const CACHE_KEY = 'bitos.education.giphy.v1';
const CACHE_TTL = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 20;
const memory = new Map();

export function gifCacheKey(query) {
  return String(query ?? '').trim().toLowerCase() || '__trending__';
}

function readStore() {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(CACHE_KEY, JSON.stringify(store));
  } catch {
    /* quota or unavailable */
  }
}

// Clear the in-memory and persisted Giphy cache (Settings → Network).
export function clearGifCache() {
  memory.clear();
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

export function getCachedGifs(query) {
  const key = gifCacheKey(query);
  if (memory.has(key)) return memory.get(key);
  const entry = readStore()[key];
  if (!entry || Date.now() - (entry.at ?? 0) > CACHE_TTL || !Array.isArray(entry.items)) return null;
  memory.set(key, entry.items);
  return entry.items;
}

function cacheGifs(query, items) {
  const key = gifCacheKey(query);
  memory.set(key, items);
  const store = readStore();
  store[key] = { at: Date.now(), items };
  const keys = Object.keys(store);
  if (keys.length > CACHE_MAX_ENTRIES) {
    for (const stale of keys.slice(0, keys.length - CACHE_MAX_ENTRIES)) delete store[stale];
  }
  writeStore(store);
}
