import assert from 'node:assert/strict';
import test from 'node:test';

import { createIconifyLoader, iconUrl, normalizeIconName } from '../src/services/iconify.js';

test('normalizeIconName defaults to the ph collection', () => {
  assert.equal(normalizeIconName('address-book-duotone'), 'ph:address-book-duotone');
  assert.equal(normalizeIconName('ph:key'), 'ph:key');
  assert.equal(normalizeIconName('  key  '), 'ph:key');
  assert.equal(normalizeIconName('lucide:house'), 'lucide:house');
  assert.equal(normalizeIconName(''), '');
  assert.equal(normalizeIconName(null), '');
  assert.equal(normalizeIconName('ph:'), '');
});

test('iconUrl builds Iconify API urls', () => {
  assert.equal(iconUrl('key'), 'https://api.iconify.design/ph:key.svg');
  assert.equal(iconUrl('ph:key'), 'https://api.iconify.design/ph:key.svg');
  assert.equal(
    iconUrl('ph:key', { color: '#a78bfa', width: 24, height: 24 }),
    'https://api.iconify.design/ph:key.svg?color=%23a78bfa&width=24&height=24',
  );
  assert.equal(iconUrl('key', { baseUrl: 'https://example.test/icons/' }), 'https://example.test/icons/ph:key.svg');
  assert.equal(iconUrl(''), '');
});

test('loader fetches once per icon and shares the cached promise', async () => {
  const calls = [];
  const fetcher = async (url) => {
    calls.push(url);
    return { ok: true, status: 200, text: async () => '<svg></svg>' };
  };

  const loader = createIconifyLoader({ fetcher });
  const [first, second] = await Promise.all([loader.load('key'), loader.load('ph:key')]);

  assert.equal(first, '<svg></svg>');
  assert.equal(second, '<svg></svg>');
  assert.equal(calls.length, 1);
  assert.equal(calls[0], 'https://api.iconify.design/ph:key.svg');
});

test('loader evicts the cache on failure so a retry can succeed', async () => {
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return { ok: false, status: 404, text: async () => '' };
  };

  const loader = createIconifyLoader({ fetcher });
  await assert.rejects(() => loader.load('missing'), /status 404/);
  await assert.rejects(() => loader.load('missing'), /status 404/);
  assert.equal(calls, 2);
});

test('loader bounds the in-memory cache with least-recently-used eviction', async () => {
  const fetcher = async (url) => ({ ok: true, status: 200, text: async () => `<svg>${url}</svg>` });

  const loader = createIconifyLoader({ fetcher, maxEntries: 2, persistent: null });
  await loader.load('a');
  await loader.load('b');
  await loader.load('a');
  await loader.load('c');

  assert.equal(loader.cache.has('ph:b'), false);
  assert.equal(loader.cache.has('ph:a'), true);
  assert.equal(loader.cache.has('ph:c'), true);
});

test('loader serves from the persistent cache without a network call', async () => {
  const store = new Map([['ph:key', '<svg>cached</svg>']]);
  const persistent = {
    get: async (name) => store.get(name) ?? null,
    set: async (name, value) => void store.set(name, value),
  };
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return { ok: true, status: 200, text: async () => '<svg>fresh</svg>' };
  };

  const loader = createIconifyLoader({ fetcher, persistent });
  assert.equal(await loader.load('key'), '<svg>cached</svg>');
  assert.equal(calls, 0);
});

test('loader writes fetched icons through to the persistent cache', async () => {
  const store = new Map();
  const persistent = {
    get: async (name) => store.get(name) ?? null,
    set: async (name, value) => void store.set(name, value),
  };
  const fetcher = async () => ({ ok: true, status: 200, text: async () => '<svg>fresh</svg>' });

  const loader = createIconifyLoader({ fetcher, persistent });
  assert.equal(await loader.load('key'), '<svg>fresh</svg>');
  assert.equal(store.get('ph:key'), '<svg>fresh</svg>');
});
