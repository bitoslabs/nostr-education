import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CONVERSATION_STATUS,
  MESSAGE_STATE,
  clientMessageId,
  conversationPeerId,
  incomingMessageFromEvent,
  mergeIncomingMessage,
} from '../src/domain/messaging.js';

const ME = 'a'.repeat(64);
const PEER = 'b'.repeat(64);

test('an incoming message resolves to the author as the conversation peer', () => {
  const entry = incomingMessageFromEvent(
    { author: PEER, tags: [['p', ME]], content: '  hello  ', createdAt: 1_700_000_000, eventId: 'evt1' },
    ME,
  );
  assert.equal(entry.peerId, PEER);
  assert.equal(entry.request, true);
  assert.equal(entry.message.from, PEER);
  assert.equal(entry.message.text, 'hello');
  assert.equal(entry.message.state, MESSAGE_STATE.SENT);
  assert.equal(entry.message.id, 'evt1');
  assert.equal(entry.message.readAt, null);
  assert.equal(entry.message.createdAt, new Date(1_700_000_000 * 1000).toISOString());
});

test('a self-copy keys the conversation by the p tag and is already read', () => {
  const entry = incomingMessageFromEvent(
    {
      author: ME,
      tags: [
        ['p', PEER],
        ['client', 'm-sent-1'],
      ],
      content: 'outbound',
      createdAt: 1_700_000_100,
      eventId: 'evt2',
    },
    ME,
  );
  assert.equal(entry.peerId, PEER);
  assert.equal(entry.request, false);
  assert.equal(entry.message.from, ME);
  assert.equal(entry.message.id, 'm-sent-1');
  assert.ok(entry.message.readAt);
});

test('a peer message without a p tag still keys on the author', () => {
  const entry = incomingMessageFromEvent({ author: PEER, tags: [], content: 'x', eventId: 'e' }, ME);
  assert.equal(entry.peerId, PEER);
  assert.equal(entry.request, true);
});

test('malformed or peerless events are ignored', () => {
  assert.equal(incomingMessageFromEvent({ author: PEER, tags: [['p', ME]], content: '   ', eventId: 'e' }, ME), null);
  assert.equal(incomingMessageFromEvent({ author: PEER, tags: [['p', ME]], content: 'x' }, ME), null);
  assert.equal(incomingMessageFromEvent({ author: PEER, tags: [['p', ME]], content: 'x' }, null), null);
  assert.equal(incomingMessageFromEvent({ tags: [['p', ME]], content: 'x', eventId: 'e' }, ME), null);
});

test('mergeIncomingMessage creates a request conversation and dedupes repeats', () => {
  const entry = incomingMessageFromEvent(
    { author: PEER, tags: [['p', ME]], content: 'first', createdAt: 1_700_000_000, eventId: 'evt1' },
    ME,
  );
  const created = mergeIncomingMessage([], entry);
  assert.equal(created.changed, true);
  assert.equal(created.list.length, 1);
  assert.equal(created.list[0].status, CONVERSATION_STATUS.REQUEST);
  assert.equal(created.list[0].messages.length, 1);

  const again = mergeIncomingMessage(created.list, entry);
  assert.equal(again.changed, false);
  assert.equal(again.list, created.list);
});

test('mergeIncomingMessage appends in chronological order', () => {
  const later = incomingMessageFromEvent(
    { author: PEER, tags: [['p', ME]], content: 'later', createdAt: 1_700_000_200, eventId: 'evt-late' },
    ME,
  );
  const earlier = incomingMessageFromEvent(
    { author: PEER, tags: [['p', ME]], content: 'earlier', createdAt: 1_700_000_100, eventId: 'evt-early' },
    ME,
  );
  const first = mergeIncomingMessage([], later);
  const second = mergeIncomingMessage(first.list, earlier);
  assert.deepEqual(
    second.list[0].messages.map((message) => message.text),
    ['earlier', 'later'],
  );
});

test('clientMessageId and conversationPeerId read the rumor tags', () => {
  assert.equal(clientMessageId([['client', 'id-1']]), 'id-1');
  assert.equal(clientMessageId([['p', ME]]), null);
  assert.equal(conversationPeerId({ from: PEER, meId: ME, tags: [] }), PEER);
  assert.equal(conversationPeerId({ from: ME, meId: ME, tags: [['p', PEER]] }), PEER);
  assert.equal(conversationPeerId({ from: ME, meId: ME, tags: [['p', ME]] }), null);
});
