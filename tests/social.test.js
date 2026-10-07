import assert from 'node:assert/strict';
import test from 'node:test';

import {
  REACTION_LIKE,
  leadingZeroBits,
  nonceTarget,
  powDifficulty,
  reactionTags,
  replyTags,
  repostTags,
} from '../src/domain/social.js';

test('leadingZeroBits counts NIP-13 difficulty from a hex event id', () => {
  assert.equal(leadingZeroBits(''), 0);
  assert.equal(leadingZeroBits('f000'), 0);
  assert.equal(leadingZeroBits('8000'), 0);
  assert.equal(leadingZeroBits('4000'), 1);
  assert.equal(leadingZeroBits('1000'), 3);
  assert.equal(leadingZeroBits('0f00'), 4);
  assert.equal(leadingZeroBits('0010'), 11);
  assert.equal(leadingZeroBits('0000ff'), 16);
});

test('powDifficulty uses the id and reports the nonce target only when tagged', () => {
  assert.equal(powDifficulty({ id: '001f' }), 11);
  assert.equal(powDifficulty({}), 0);
  assert.equal(nonceTarget({ tags: [['nonce', '42', '20']] }), 20);
  assert.equal(nonceTarget({ tags: [['nonce', '42']] }), null);
  assert.equal(nonceTarget({}), null);
});

test('kind:7 reaction tags reference the event, author, and kind', () => {
  const note = { id: 'abc', pubkey: 'pk', kind: 1 };
  assert.equal(REACTION_LIKE, '+');
  assert.deepEqual(reactionTags(note), [
    ['e', 'abc'],
    ['p', 'pk'],
    ['k', '1'],
  ]);
});

test('kind:6 repost and NIP-10 reply tags carry the needed references', () => {
  const note = { id: 'abc', pubkey: 'pk' };
  assert.deepEqual(repostTags(note), [
    ['e', 'abc'],
    ['p', 'pk'],
  ]);
  assert.deepEqual(replyTags(note, { relay: 'wss://r' }), [
    ['e', 'abc', 'wss://r', 'root'],
    ['e', 'abc', 'wss://r', 'reply'],
    ['p', 'pk'],
  ]);
});
