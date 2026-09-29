import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_MODE,
  MODE,
  authoritySource,
  modeDescription,
  modeLabel,
  normalizeMode,
  usesRelays,
  usesServer,
} from '../src/domain/mode.js';

test('normalizeMode accepts known modes and defaults otherwise', () => {
  assert.equal(normalizeMode('nostr'), MODE.NOSTR);
  assert.equal(normalizeMode('SERVER'), MODE.SERVER);
  assert.equal(normalizeMode('hybrid'), MODE.HYBRID);
  assert.equal(normalizeMode('nonsense'), DEFAULT_MODE);
  assert.equal(normalizeMode(undefined), DEFAULT_MODE);
});

test('mode helpers describe the transport and authority', () => {
  assert.equal(usesServer(MODE.NOSTR), false);
  assert.equal(usesServer(MODE.SERVER), true);
  assert.equal(usesServer(MODE.HYBRID), true);
  assert.equal(usesRelays(MODE.SERVER), false);
  assert.equal(usesRelays(MODE.NOSTR), true);
  assert.equal(authoritySource(MODE.NOSTR), 'attested');
  assert.equal(authoritySource(MODE.SERVER), 'server');
  assert.equal(authoritySource(MODE.HYBRID), 'either');
  assert.match(modeLabel(MODE.NOSTR), /Nostr/i);
  assert.match(modeDescription(MODE.SERVER), /API/i);
});
