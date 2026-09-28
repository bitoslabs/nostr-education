import assert from 'node:assert/strict';
import test from 'node:test';

import { isUsable, statusLabel, statusTone } from '../src/domain/credential.js';
import { staleCopy } from '../src/domain/delivery.js';
import {
  findLookalikes,
  isConfusable,
  levenshtein,
  normalizeHandle,
  validateHandle,
} from '../src/domain/handle.js';
import { truncateNpub } from '../src/domain/identity.js';

test('truncateNpub keeps the npub prefix and tail', () => {
  const npub = 'npub1fjvzq4nd7xz2m9p8c3rk6t0w5yvhsagl4euxdt2qf8n3z7m8xk3';
  assert.equal(truncateNpub(npub), 'npub1fjvz…8xk3');
  assert.equal(truncateNpub('npub1short'), 'npub1short');
});

test('validateHandle rejects reserved, short, and charset violations', () => {
  assert.equal(validateHandle('alice').valid, true);
  assert.equal(validateHandle('admin').reason, 'reserved');
  assert.equal(validateHandle('ab').reason, 'length');
  assert.equal(validateHandle('Alice!').reason, 'charset');
});

test('normalizeHandle trims and lowercases', () => {
  assert.equal(normalizeHandle('  Alice '), 'alice');
});

test('levenshtein measures edit distance', () => {
  assert.equal(levenshtein('alice', 'a1ice'), 1);
  assert.equal(levenshtein('alice', 'alice'), 0);
});

test('findLookalikes flags edit-distance and confusable near misses', () => {
  assert.deepEqual(findLookalikes('alice', ['a1ice', 'bob']), ['a1ice']);
  assert.equal(isConfusable('alice', 'a1ice'), true);
  assert.equal(isConfusable('alice', 'bob'), false);
});

test('credential status helpers are pure', () => {
  assert.equal(isUsable({ status: 'active' }), true);
  assert.equal(isUsable({ status: 'revoked' }), false);
  assert.equal(statusLabel('superseded'), 'Superseded');
  assert.equal(statusTone('revoked'), 'err');
});

test('staleCopy frames uncertainty, not failure', () => {
  assert.match(staleCopy(6), /Last confirmed 6 days ago/);
  assert.match(staleCopy(1), /1 day ago/);
});
