import assert from 'node:assert/strict';
import test from 'node:test';

import { matchesNip05, nip05Url, splitNip05 } from '../src/domain/nip05.js';
import { resolveNip05 } from '../src/services/nip05.js';

test('splitNip05 validates and normalises identifiers', () => {
  assert.deepEqual(splitNip05('Alice@Example.COM'), {
    name: 'Alice',
    domain: 'example.com',
    identifier: 'Alice@example.com',
  });
  assert.deepEqual(splitNip05('@alice@example.com').name, 'alice');
  assert.equal(splitNip05('alice'), null);
  assert.equal(splitNip05('alice@localhost'), null);
  assert.equal(splitNip05('alice@'), null);
  assert.equal(splitNip05(''), null);
});

test('nip05Url builds the well-known lookup URL', () => {
  assert.equal(nip05Url('alice@example.com'), 'https://example.com/.well-known/nostr.json?name=alice');
  assert.equal(nip05Url('bad'), null);
});

test('matchesNip05 compares the published name to a pubkey', () => {
  const data = { names: { alice: 'abc' } };
  assert.equal(matchesNip05(data, 'alice@example.com', 'abc'), true);
  assert.equal(matchesNip05(data, 'alice@example.com', 'other'), false);
  assert.equal(matchesNip05(data, 'bob@example.com', 'abc'), false);
});

test('resolveNip05 returns the npub for a matching name and null on failure', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ names: { alice: '0'.repeat(64) } }),
  });
  const resolved = await resolveNip05('alice@example.com', { fetchImpl });
  assert.equal(resolved.identifier, 'alice@example.com');
  assert.equal(resolved.pubkey, '0'.repeat(64));
  assert.match(resolved.npub, /^npub1/);

  const missing = await resolveNip05('bob@example.com', { fetchImpl });
  assert.equal(missing, null);

  const offline = await resolveNip05('alice@example.com', {
    fetchImpl: async () => {
      throw new Error('offline');
    },
  });
  assert.equal(offline, null);
});
