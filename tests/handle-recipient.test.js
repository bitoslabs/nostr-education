import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveRecipient } from '../src/domain/handle.js';

const contacts = {
  'bob@bitos.id': { name: 'Bob', verified: true },
  'recruiter.hires.example': { name: 'Recruiter', verified: true },
};

test('resolveRecipient recognizes known handles case-insensitively', () => {
  const result = resolveRecipient('@Bob@Bitos.id', contacts);
  assert.equal(result.kind, 'known');
  assert.equal(result.contact.name, 'Bob');
});

test('resolveRecipient flags edit-distance lookalikes', () => {
  const result = resolveRecipient('recru1ter.hires.example', contacts);
  assert.equal(result.kind, 'lookalike');
  assert.equal(result.near, 'recruiter.hires.example');
});

test('resolveRecipient detects raw npub values', () => {
  const npub = 'npub1fjvzq4nd7xz2m9p8c3rk6t0w5yvhsagl4euxdt2qf8n3z7m8xk3';
  const result = resolveRecipient(npub, contacts, { truncate: (value) => value.slice(0, 9) });
  assert.equal(result.kind, 'npub');
  assert.equal(result.display, 'npub1fjvz');
});

test('resolveRecipient returns unknown for unrecognized handles', () => {
  assert.equal(resolveRecipient('nobody', contacts).kind, 'unknown');
  assert.equal(resolveRecipient('', contacts).kind, 'empty');
});
