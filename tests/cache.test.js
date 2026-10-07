import assert from 'node:assert/strict';
import test from 'node:test';

// Minimal localStorage so the storage service and Giphy cache have a backing
// store in Node.
const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key),
};

const { loadFeedCache, saveFeedCache, clearState } = await import('../src/services/storage.js');
const { gifCacheKey } = await import('../src/services/giphy.js');

test('feed cache keeps only the newest raw notes, capped at 20', () => {
  memory.clear();
  const events = Array.from({ length: 25 }, (_, index) => ({
    id: `n${index}`,
    type: 'social',
    raw: { id: `n${index}`, pubkey: 'pk', kind: 1, created_at: index, tags: [], content: `c${index}` },
  }));
  events.push({ id: 'record', type: 'completion' });
  saveFeedCache(events);

  const cached = loadFeedCache();
  assert.equal(cached.length, 20);
  assert.equal(cached[0].id, 'n0');
  assert.ok(cached.every((note) => note.pubkey === 'pk'));

  clearState();
  assert.deepEqual(loadFeedCache(), []);
});

test('gifCacheKey normalizes the query and names trending', () => {
  assert.equal(gifCacheKey('  Bitcoin '), 'bitcoin');
  assert.equal(gifCacheKey('APP'), 'app');
  assert.equal(gifCacheKey(''), '__trending__');
  assert.equal(gifCacheKey(null), '__trending__');
});
