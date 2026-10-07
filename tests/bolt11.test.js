import assert from 'node:assert/strict';
import test from 'node:test';

import { invoiceExpiry } from '../src/services/bolt11.js';

// BOLT11 specification test vector #1 (2500u, description "1 cup coffee",
// expiry tag of 60 seconds).
const VECTOR =
  'lnbc2500u1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jsxqzpuaztrnwngzn3kdzw5hydlzf03qdgm2hdq27cqv3agm2awhz5se903vruatfhq77w3ls4evs3ch9zw97j25emudupq63nyw24cg27h2rspfj9srp';

test('invoiceExpiry reads the timestamp and expiry tag from a BOLT11 invoice', () => {
  assert.deepEqual(invoiceExpiry(VECTOR), {
    timestampMs: 1496314658000,
    expirySeconds: 60,
    expiresAtMs: 1496314718000,
  });
});

test('invoiceExpiry falls back to the 1-hour default when the expiry tag is absent', () => {
  const withoutExpiry = VECTOR.replace('xqzpu', '');
  assert.deepEqual(invoiceExpiry(withoutExpiry), {
    timestampMs: 1496314658000,
    expirySeconds: 3600,
    expiresAtMs: 1496318258000,
  });
});

test('invoiceExpiry rejects non-invoice input instead of throwing', () => {
  assert.equal(invoiceExpiry('notaninvoice'), null);
  assert.equal(invoiceExpiry(''), null);
  assert.equal(invoiceExpiry(null), null);
});
