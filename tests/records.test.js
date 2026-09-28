import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PRIVATE_RECORD_TYPES,
  PUBLIC_RECORD_TYPES,
  RECORD_TYPES,
  applyRecord,
} from '../src/domain/records.js';

const EMPTY = {
  academies: {},
  subjects: [],
  classrooms: [],
  homework: [],
  submissions: [],
  invites: [],
  joinRequests: [],
  memberships: {},
};

test('applyRecord upserts subjects and classrooms without duplicates', () => {
  let state = applyRecord(EMPTY, { type: 'subject', id: 'sub1', name: 'Maths' });
  state = { ...EMPTY, ...state };
  assert.equal(state.subjects.length, 1);

  state = applyRecord(state, { type: 'subject', id: 'sub1', name: 'Mathematics' });
  state = { ...EMPTY, ...state };
  assert.equal(state.subjects.length, 1);
  assert.equal(state.subjects[0].name, 'Mathematics');

  const withClass = applyRecord(state, { type: 'classroom', id: 'cls1', name: 'Algebra' });
  assert.equal(withClass.classrooms.length, 1);
});

test('applyRecord stores an academy by owner', () => {
  const patch = applyRecord(EMPTY, { type: 'academy', id: 'org1', ownerId: 'pk1', name: 'Northgate' });
  assert.equal(patch.academies.pk1.name, 'Northgate');
});

test('applyRecord merges a grade into the existing submission', () => {
  const base = { ...EMPTY, submissions: [{ id: 'sub1', status: 'submitted', score: null }] };
  const patch = applyRecord(base, {
    type: 'grade',
    id: 'g1',
    submissionId: 'sub1',
    score: 88,
    feedback: 'Good',
    gradedAt: 'now',
    gradedBy: 'teacher',
  });
  assert.equal(patch.submissions[0].status, 'graded');
  assert.equal(patch.submissions[0].score, 88);
  assert.equal(patch.submissions[0].feedback, 'Good');
});

test('applyRecord records membership and rejects malformed records', () => {
  const patch = applyRecord(EMPTY, { type: 'member', id: 'm1', memberId: 'pk1', status: 'active' });
  assert.equal(patch.memberships.pk1, 'active');
  assert.equal(applyRecord(EMPTY, { type: 'unknown', id: 'x' }), null);
  assert.equal(applyRecord(EMPTY, { type: 'grade', id: 'g' }), null);
  assert.equal(applyRecord(EMPTY, null), null);
});

test('applyRecord tombstones remove subjects and classrooms', () => {
  const base = {
    ...EMPTY,
    subjects: [{ id: 'sub1', name: 'Maths' }],
    classrooms: [{ id: 'cls1', name: 'Algebra' }],
  };
  assert.deepEqual(applyRecord(base, { type: 'subject', id: 'sub1', deleted: true }).subjects, []);
  assert.deepEqual(applyRecord(base, { type: 'classroom', id: 'cls1', deleted: true }).classrooms, []);
  assert.equal(applyRecord(base, { type: 'subject', id: 'sub2', deleted: true }).subjects.length, 1);
});

test('record type groupings cover public and private data', () => {
  assert.equal(PUBLIC_RECORD_TYPES.includes(RECORD_TYPES.ACADEMY), true);
  assert.equal(PRIVATE_RECORD_TYPES.includes(RECORD_TYPES.GRADE), true);
  assert.equal(PRIVATE_RECORD_TYPES.includes(RECORD_TYPES.ACADEMY), false);
});
