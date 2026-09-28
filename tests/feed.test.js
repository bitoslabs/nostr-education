import assert from 'node:assert/strict';
import test from 'node:test';

import { filterFeed, isActionNeededFor, isVisible } from '../src/domain/feed.js';

const events = [
  { id: 'a', author: 'bob', audience: ['alice'], actionNeeded: true, time: 'now' },
  { id: 'b', author: 'mia', audience: 'all', time: '1d' },
  { id: 'c', author: 'carol', audience: ['bob'], time: '2d' },
  { id: 'd', author: 'alice', audience: 'all', time: '3d' },
];

test('isVisible respects audience and broadcast', () => {
  assert.equal(isVisible(events[0], 'alice'), true);
  assert.equal(isVisible(events[0], 'bob'), false);
  assert.equal(isVisible(events[1], 'nadia'), true);
});

test('isActionNeededFor is persona-scoped', () => {
  assert.equal(isActionNeededFor(events[0], 'alice'), true);
  assert.equal(isActionNeededFor(events[0], 'bob'), false);
});

test('filterFeed sorts action-needed items first for "for you"', () => {
  const result = filterFeed(events, { personaId: 'alice', tab: 'foryou' });
  assert.deepEqual(
    result.map((event) => event.id),
    ['a', 'b', 'd'],
  );
});

test('filterFeed "following" limits to followed authors and self', () => {
  const result = filterFeed(events, {
    personaId: 'alice',
    tab: 'following',
    following: ['mia'],
  });
  assert.deepEqual(
    result.map((event) => event.id),
    ['b', 'd'],
  );
});
