import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildIssuedTimeline,
  filterIssuedEntries,
  issuedFilterCounts,
  issuedStats,
  normalizeIssued,
} from '../src/domain/credential.js';

const CREDENTIALS = [
  {
    id: 'c2',
    title: 'BitOS Academy Certificate',
    status: 'active',
    delivery: 'delivered',
    issuedAt: 2000,
    recipient: { name: 'Alice', handle: 'alice@bitos.id' },
    course: 'CS-101',
  },
  {
    id: 'c1',
    title: 'BitOS Course Badge',
    status: 'active',
    delivery: 'pending',
    issuedAt: 1000,
    recipient: { name: 'Carol' },
    course: 'CS-204',
  },
];

const SIGN_QUEUE = [
  { id: 's1', learnerName: 'Dave', course: 'CS-101', status: 'pending', time: 'now', grade: 78 },
  { id: 's0', learnerName: 'Erin', course: 'CS-101', status: 'signed' },
];

test('normalizeIssued maps a credential to a timeline row with defaults', () => {
  assert.deepEqual(normalizeIssued({ id: 'x', title: 'Cert' }), {
    kind: 'issued',
    id: 'x',
    title: 'Cert',
    course: '',
    recipientName: 'Learner',
    recipientHandle: null,
    recipientPubkey: null,
    status: 'active',
    delivery: 'delivered',
    issuedAt: null,
    privacyLevel: null,
  });
});

test('buildIssuedTimeline puts awaiting signatures first, newest issued next', () => {
  const timeline = buildIssuedTimeline(CREDENTIALS, SIGN_QUEUE);
  assert.deepEqual(
    timeline.map((entry) => entry.id),
    ['s1', 'c2', 'c1'],
  );
  assert.equal(timeline[1].kind, 'issued');
});

test('filterIssuedEntries filters by tab and query', () => {
  const timeline = buildIssuedTimeline(CREDENTIALS, SIGN_QUEUE);
  assert.equal(filterIssuedEntries(timeline, 'delivered').length, 1);
  assert.equal(filterIssuedEntries(timeline, 'pending').length, 2);
  assert.equal(filterIssuedEntries(timeline, 'all', 'carol').length, 1);
  assert.equal(filterIssuedEntries(timeline, 'all', 'cs-101').length, 2);
  assert.equal(filterIssuedEntries(timeline, 'all', 'nomatch').length, 0);
});

test('issuedFilterCounts and issuedStats summarise the timeline', () => {
  const timeline = buildIssuedTimeline(CREDENTIALS, SIGN_QUEUE);
  assert.deepEqual(issuedFilterCounts(timeline), { all: 3, delivered: 1, pending: 2 });
  assert.deepEqual(issuedStats(timeline), { issued: 2, delivered: 1, pending: 1, learners: 2 });
});
