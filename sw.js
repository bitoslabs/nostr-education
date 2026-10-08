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
const WORKER_VERSION = new URL(self.location.href).searchParams.get('v') || '';
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
      let buildVersion = WORKER_VERSION;
      try {
        const manifestUrl = new URL(MANIFEST_URL, self.registration.scope);
        if (WORKER_VERSION) manifestUrl.searchParams.set('__bitos_build', WORKER_VERSION);
        const response = await fetch(manifestUrl, { cache: 'no-store' });
        if (response.ok) {
          const manifest = await response.json();
          if (Array.isArray(manifest.assets) && manifest.assets.length) assets = manifest.assets;
          if (manifest.version) {
            buildVersion = manifest.version;
            cacheName = `${CACHE_PREFIX}${manifest.version}`;
          }
        }
      } catch {
        /* no manifest yet: cache the shell only */
      }

      const cache = await caches.open(cacheName);
      // Cache each asset on its own. addAll() rejects atomically, so one missing
      // file would abort the whole install and the previous worker would keep
      // serving the old build forever.
      await Promise.allSettled(
        assets.map((asset) => cacheFreshAsset(cache, asset, buildVersion)),
      );

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
  const cacheName = await activeCacheName();
  const cache = await caches.open(cacheName);
  try {
    // Bypass the browser HTTP cache while online. Static dev servers (for
    // example `python3 -m http.server`) send no Cache-Control, so a plain
    // fetch() can return a stale module and edits never reach the running app.
    const version = cacheName.startsWith(CACHE_PREFIX)
      ? cacheName.slice(CACHE_PREFIX.length)
      : '';
    const networkRequest = shouldVersion(request)
      ? versionedRequest(request, version)
      : request;
    const response = await fetch(networkRequest, { cache: 'no-store' });
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

function shouldVersion(request) {
  const { pathname } = new URL(request.url);
  return (
    pathname.startsWith('/src/') ||
    pathname.startsWith('/vendor/') ||
    pathname.startsWith('/assets/') ||
    pathname === '/manifest.webmanifest'
  );
}

function versionedRequest(request, version) {
  if (!version) return request;
  const url = new URL(request.url);
  url.searchParams.set('__bitos_build', version);
  return new Request(url, request);
}

async function cacheFreshAsset(cache, asset, version) {
  const canonicalRequest = new Request(new URL(asset, self.registration.scope));
  const response = await fetch(versionedRequest(canonicalRequest, version), {
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Could not cache ${asset}: ${response.status}`);
  await cache.put(canonicalRequest, response);
}
