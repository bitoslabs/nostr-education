import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PRIVATE_RECORD_FIELDS,
  PRIVATE_RECORD_TYPES,
  PUBLIC_RECORD_TYPES,
  RECORD_TYPES,
  applyRecord,
  isPublicRecord,
  migrateSubmissionHistory,
  toPublicRecord,
} from '../src/domain/records.js';
import {
  headAddress,
  isHistoryRecord,
  recordEvent,
  recordKind,
  recordTags,
  decodeRecord,
  encodeRecord,
} from '../src/services/records.js';

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

test('recordTags makes a public invite directly searchable by code', () => {
  assert.deepEqual(recordTags('joinlink', 'inv1', { code: 'ABCD1234' }), [
    ['d', 'joinlink:inv1'],
    ['t', 'bitos-education'],
    ['type', 'joinlink'],
    ['code', 'abcd1234'],
  ]);
});

test('history record types publish as regular kind:78 with a head link', () => {
  assert.equal(recordKind('submission-ver'), 78);
  assert.equal(recordKind('assessment-rev'), 78);
  assert.equal(recordKind('homework-rev'), 78);
  assert.equal(recordKind('submission'), 30078);
  assert.equal(isHistoryRecord('submission-ver'), true);
  assert.equal(isHistoryRecord('grade'), false);

  assert.equal(headAddress('submission', 'sub1', 'stu'), '30078:stu:submission:sub1');
  assert.equal(headAddress('submission', 'sub1', null), null);

  const tags = recordTags('submission-ver', 'ver1', {
    head: headAddress('submission', 'sub1', 'stu'),
    recipients: ['teacher'],
  });
  assert.deepEqual(tags[0], ['d', 'submission-ver:ver1']);
  assert.deepEqual(tags.find((tag) => tag[0] === 'a'), ['a', '30078:stu:submission:sub1']);
  assert.deepEqual(tags.find((tag) => tag[0] === 'p'), ['p', 'teacher']);
});

test('recordEvent uses the regular kind only for history records', () => {
  assert.equal(recordEvent({ type: 'assessment-rev', id: 'a1', payload: {} }).kind, 78);
  assert.equal(recordEvent({ type: 'submission-ver', id: 'v1', payload: {} }).kind, 78);
  assert.equal(recordEvent({ type: 'grade', id: 'g1', payload: {} }).kind, 30078);
  assert.equal(recordEvent({ type: 'submission', id: 's1', payload: {} }).kind, 30078);
});

test('record envelope fields cannot be overwritten by its payload', () => {
  const encoded = encodeRecord('academy', 'org1', { type: 'school', id: 'wrong', name: 'Northgate' });
  assert.deepEqual(decodeRecord(encoded), {
    type: 'academy',
    id: 'org1',
    name: 'Northgate',
    academyType: 'school',
    v: 1,
  });
});

test('decodeRecord repairs legacy envelope fields from signed tags', () => {
  const content = JSON.stringify({ v: 1, type: 'school', id: 'org1', name: 'Northgate' });
  assert.deepEqual(decodeRecord(content, [
    ['d', 'academy:org1'],
    ['t', 'bitos-education'],
    ['type', 'academy'],
  ]), {
    v: 1,
    type: 'academy',
    id: 'org1',
    name: 'Northgate',
  });
});

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
  const patch = applyRecord(EMPTY, {
    type: 'member',
    id: 'm1',
    academyId: 'org1',
    memberId: 'pk1',
    role: 'student',
    status: 'active',
  });
  assert.equal(patch.memberships.pk1, 'active');
  assert.deepEqual(patch.academyMemberships, [
    { academyId: 'org1', accountId: 'pk1', role: 'student', status: 'active' },
  ]);
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

test('applyRecord stores capabilities and applies a revocation', () => {
  const base = { ...EMPTY, capabilities: [] };
  const created = applyRecord(base, {
    type: 'capability',
    id: 'enrollment:org1:cls1:stu',
    academyId: 'org1',
    accountId: 'stu',
    kind: 'enrollment',
    classroomId: 'cls1',
    status: 'active',
  });
  assert.equal(created.capabilities.length, 1);
  assert.equal(created.capabilities[0].status, 'active');

  const revoked = applyRecord({ ...base, ...created }, {
    type: 'capability',
    id: 'enrollment:org1:cls1:stu',
    academyId: 'org1',
    accountId: 'stu',
    kind: 'enrollment',
    classroomId: 'cls1',
    status: 'revoked',
  });
  assert.equal(revoked.capabilities.length, 1);
  assert.equal(revoked.capabilities[0].status, 'revoked');

  assert.equal(applyRecord(base, { type: 'capability', id: 'x', accountId: 'stu' }), null);
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

test('applyRecord appends submission versions and keeps every version', () => {
  const base = { ...EMPTY, submissions: [], submissionVersions: [] };
  const v1 = applyRecord(base, {
    type: RECORD_TYPES.SUBMISSION_VERSION,
    id: 'ver1',
    submissionId: 'sub1',
    homeworkId: 'hw1',
    classroomId: 'c1',
    studentId: 'stu',
    version: 1,
    text: 'first answer',
  });
  assert.equal(v1.submissions.length, 1);
  assert.equal(v1.submissions[0].status, 'submitted');
  assert.equal(v1.submissions[0].version, 1);
  assert.equal(v1.submissionVersions.length, 1);

  const v2 = applyRecord({ ...base, ...v1 }, {
    type: RECORD_TYPES.SUBMISSION_VERSION,
    id: 'ver2',
    submissionId: 'sub1',
    version: 2,
    text: 'second answer',
  });
  assert.equal(v2.submissionVersions.length, 2);
  assert.equal(v2.submissions[0].text, 'second answer');
  assert.equal(v2.submissions[0].version, 2);
  assert.equal(v2.submissionVersions.find((entry) => entry.id === 'ver1').text, 'first answer');
});

test('applyRecord keeps finalized assessment revisions and a correction', () => {
  const base = {
    ...EMPTY,
    submissions: [{ id: 'sub1', status: 'submitted', score: null }],
    assessmentRevisions: [],
  };
  const first = applyRecord(base, {
    type: RECORD_TYPES.ASSESSMENT_REVISION,
    id: 'a1',
    submissionId: 'sub1',
    status: 'finalized',
    score: 80,
    feedback: 'good',
    version: 1,
  });
  assert.equal(first.submissions[0].status, 'graded');
  assert.equal(first.submissions[0].score, 80);

  const second = applyRecord({ ...base, ...first }, {
    type: RECORD_TYPES.ASSESSMENT_REVISION,
    id: 'a2',
    submissionId: 'sub1',
    status: 'finalized',
    score: 92,
    feedback: 'corrected',
    version: 2,
  });
  assert.equal(second.assessmentRevisions.length, 2);
  assert.equal(second.submissions[0].score, 92);
  assert.equal(second.assessmentRevisions.find((entry) => entry.id === 'a1').score, 80);
  assert.equal(second.assessmentRevisions.find((entry) => entry.id === 'a2').feedback, 'corrected');
});

test('applyRecord marks a revision request without dropping revision history', () => {
  const base = {
    ...EMPTY,
    submissions: [{ id: 'sub1', status: 'graded', score: 80 }],
    assessmentRevisions: [],
  };
  const patch = applyRecord(base, {
    type: RECORD_TYPES.ASSESSMENT_REVISION,
    id: 'a1',
    submissionId: 'sub1',
    status: 'revision',
    feedback: 'expand your answer',
  });
  assert.equal(patch.submissions[0].status, 'revision');
  assert.equal(patch.submissions[0].score, null);
  assert.equal(patch.assessmentRevisions[0].status, 'revision');
});

test('migrateSubmissionHistory backfills history from v1 rows', () => {
  const patch = migrateSubmissionHistory({
    submissions: [
      {
        id: 's1',
        homeworkId: 'hw1',
        classroomId: 'c1',
        studentId: 'stu',
        text: 'v1 text',
        version: 1,
        status: 'graded',
        score: 75,
        maxScore: 100,
        feedback: 'nice',
      },
    ],
  });
  assert.equal(patch.submissionVersions.length, 1);
  assert.equal(patch.submissionVersions[0].text, 'v1 text');
  assert.equal(patch.assessmentRevisions.length, 1);
  assert.equal(patch.assessmentRevisions[0].score, 75);
  assert.equal(migrateSubmissionHistory({ submissions: [] }), null);
});
