/* BitOS offline shell. Generated asset list lives in vendor/precache.json
   (written by scripts/vendor.mjs). Same-origin GETs are network-first so
   development stays fresh, and fall back to the cache when offline.

   The worker script itself never changes between builds, so the build version
   is read from the manifest at install time and recorded in a small meta cache.
   That keeps the active cache name stable across worker restarts, and install
   never fails as a whole when one asset cannot be cached. */

const MANIFEST_URL = './vendor/precache.json';
const CACHE_PREFIX = 'bitos-offline-';
const META_CACHE = `${CACHE_PREFIX}meta`;
const VERSION_KEY = './__bitos_version__';
const SHELL_CACHE = `${CACHE_PREFIX}shell`;
const FALLBACK = [
  './',
  './index.html',
  './src/styles/tokens.css',
  './src/styles/base.css',
  './src/styles/layout.css',
  './src/styles/components.css',
  './src/styles/auth.css',
];

// The cache name written during install. Falls back to the shell cache when no
// build has been recorded yet (for example, offline during the first boot).
async function activeCacheName() {
  try {
    const meta = await caches.open(META_CACHE);
    const hit = await meta.match(VERSION_KEY);
    if (hit) {
      const name = (await hit.text()).trim();
      if (name) return name;
    }
  } catch {
    /* no marker yet */
  }
  return SHELL_CACHE;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      let assets = FALLBACK;
      let cacheName = SHELL_CACHE;
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
      // Cache each asset on its own. addAll() rejects atomically, so one missing
      // file would abort the whole install and the previous worker would keep
      // serving the old build forever.
      await Promise.allSettled(assets.map((asset) => cache.add(asset)));

      // Record the current cache so fetch events keep using it even after the
      // browser restarts this worker (module state does not survive).
      const meta = await caches.open(META_CACHE);
      await meta.put(VERSION_KEY, new Response(cacheName));

      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheName = await activeCacheName();
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== cacheName && key !== META_CACHE)
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
  const cache = await caches.open(await activeCacheName());
  try {
    // Bypass the browser HTTP cache while online. Static dev servers (for
    // example `python3 -m http.server`) send no Cache-Control, so a plain
    // fetch() can return a stale module and edits never reach the running app.
    const response = await fetch(request, { cache: 'no-store' });
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
