/* BitOS offline shell. Generated asset list lives in vendor/precache.json
   (written by scripts/vendor.mjs). Same-origin GETs are network-first so
   development stays fresh, and fall back to the cache when offline. */

const MANIFEST_URL = './vendor/precache.json';
const CACHE_PREFIX = 'bitos-offline-';
const FALLBACK = [
  './',
  './index.html',
  './src/styles/tokens.css',
  './src/styles/base.css',
  './src/styles/layout.css',
  './src/styles/components.css',
  './src/styles/auth.css',
];

let cacheName = `${CACHE_PREFIX}shell`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      let assets = FALLBACK;
      try {
        const response = await fetch(MANIFEST_URL, { cache: 'no-cache' });
        if (response.ok) {
          const manifest = await response.json();
          if (Array.isArray(manifest.assets) && manifest.assets.length) assets = manifest.assets;
          if (manifest.version) cacheName = `${CACHE_PREFIX}${manifest.version}`;
        }
      } catch {
        /* no manifest yet: cache the shell only */
      }
      const cache = await caches.open(cacheName);
      await cache.addAll(assets);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== cacheName)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, () => caches.match('./index.html')));
    return;
  }

  event.respondWith(networkFirst(request));
});

async function networkFirst(request, fallback) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') cache.put(request, response.clone());
    return response;
  } catch {
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
    if (fallback) {
      const shell = await fallback();
      if (shell) return shell;
    }
    return Response.error();
  }
}
