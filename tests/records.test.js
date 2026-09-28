import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PRIVATE_RECORD_FIELDS,
  PRIVATE_RECORD_TYPES,
  PUBLIC_RECORD_TYPES,
  RECORD_TYPES,
  applyRecord,
  isPublicRecord,
  toPublicRecord,
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

test('applyRecord applies a revision request to the submission', () => {
  const base = { ...EMPTY, submissions: [{ id: 's1', status: 'graded', score: 80, feedback: 'ok' }] };
  const patch = applyRecord(base, {
    type: 'revision',
    id: 'rev1',
    submissionId: 's1',
    feedback: 'Please expand',
  });
  assert.equal(patch.submissions[0].status, 'revision');
  assert.equal(patch.submissions[0].score, null);
  assert.equal(patch.submissions[0].feedback, 'Please expand');
});

test('applyRecord stores a public join link invite without wrapper fields', () => {
  const patch = applyRecord(EMPTY, {
    v: 1,
    type: 'joinlink',
    id: 'inv1',
    code: 'abcd1234',
    academyId: 'org1',
    role: 'student',
    status: 'pending',
    target: '',
  });
  assert.equal(patch.invites.length, 1);
  assert.equal(patch.invites[0].code, 'abcd1234');
  assert.equal('type' in patch.invites[0], false);
  assert.equal('v' in patch.invites[0], false);

  const merged = applyRecord({ ...EMPTY, invites: patch.invites }, {
    v: 1,
    type: 'joinlink',
    id: 'inv1',
    code: 'abcd1234',
    academyId: 'org1',
    role: 'student',
    status: 'revoked',
    target: '',
  });
  assert.equal(merged.invites.length, 1);
  assert.equal(merged.invites[0].status, 'revoked');
});

test('applyRecord adds a recommendation and a sign-queue entry', () => {
  const patch = applyRecord(EMPTY, {
    type: 'recommendation',
    id: 'rec1',
    studentId: 'pk1',
    learnerName: 'Alice',
    course: 'Maths',
    grade: 88,
  });
  assert.equal(patch.recommendations[0].id, 'rec1');
  assert.equal(patch.signQueue[0].id, 'sign-rec1');
  assert.equal(patch.signQueue[0].status, 'pending');
});

test('record type groupings cover public and private data', () => {
  assert.equal(PUBLIC_RECORD_TYPES.includes(RECORD_TYPES.ACADEMY), true);
  assert.equal(PRIVATE_RECORD_TYPES.includes(RECORD_TYPES.GRADE), true);
  assert.equal(PRIVATE_RECORD_TYPES.includes(RECORD_TYPES.ACADEMY), false);
});

test('toPublicRecord strips roster fields without mutating the source', () => {
  const classroom = { type: 'classroom', id: 'cls1', name: 'Algebra', studentIds: ['alice'] };
  const published = toPublicRecord(classroom);
  assert.equal('studentIds' in published, false);
  assert.equal(published.name, 'Algebra');
  assert.deepEqual(classroom.studentIds, ['alice']);
});

test('the public record set is exactly academy, subject, classroom, joinlink', () => {
  assert.deepEqual([...PUBLIC_RECORD_TYPES].sort(), ['academy', 'classroom', 'joinlink', 'subject']);
});

test('private record types never overlap the public set', () => {
  const overlap = PUBLIC_RECORD_TYPES.filter((type) => PRIVATE_RECORD_TYPES.includes(type));
  assert.deepEqual(overlap, []);
  for (const type of [
    RECORD_TYPES.HOMEWORK,
    RECORD_TYPES.SUBMISSION,
    RECORD_TYPES.GRADE,
    RECORD_TYPES.REVISION,
    RECORD_TYPES.RECOMMENDATION,
    RECORD_TYPES.INVITE,
    RECORD_TYPES.JOIN_REQUEST,
    RECORD_TYPES.MEMBER,
  ]) {
    assert.equal(PRIVATE_RECORD_TYPES.includes(type), true);
    assert.equal(PUBLIC_RECORD_TYPES.includes(type), false);
  }
});

test('toPublicRecord strips every declared private field', () => {
  const record = { type: 'classroom', id: 'cls1', name: 'Algebra', studentIds: ['alice'], extra: 1 };
  const published = toPublicRecord(record);
  for (const field of PRIVATE_RECORD_FIELDS) {
    assert.equal(field in published, false);
  }
  assert.equal(published.extra, 1);
  assert.deepEqual(record.studentIds, ['alice']);
});

test('isPublicRecord only accepts catalog record types', () => {
  assert.equal(isPublicRecord({ type: RECORD_TYPES.CLASSROOM }), true);
  assert.equal(isPublicRecord({ type: RECORD_TYPES.GRADE }), false);
  assert.equal(isPublicRecord(null), false);
});
