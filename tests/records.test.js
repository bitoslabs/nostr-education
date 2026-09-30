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
  reconcileAssessmentHeads,
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

test('decodeRecord carries the raw event created_at as eventCreatedAt', () => {
  const encoded = encodeRecord('homework', 'hw1', { title: 'Vectors' });
  const withTime = decodeRecord(encoded, [['type', 'homework']], 1_752_000_000);
  assert.equal(withTime.eventCreatedAt, 1_752_000_000);
  assert.equal(withTime.title, 'Vectors');

  // No raw time (a locally decoded payload) leaves the field absent.
  assert.equal('eventCreatedAt' in decodeRecord(encoded), false);
  assert.equal('eventCreatedAt' in decodeRecord(encoded, [], 0), false);
});

test('applyRecord keeps the earliest event time as created and the latest as updated', () => {
  let state = { ...EMPTY, homework: [] };
  const first = applyRecord(state, {
    type: 'homework',
    id: 'hw1',
    title: 'Vectors',
    eventCreatedAt: 1_700_000_000,
  });
  state = { ...state, ...first };
  assert.equal(state.homework[0].eventCreatedAt, 1_700_000_000);
  assert.equal(state.homework[0].eventUpdatedAt, 1_700_000_000);

  const edited = applyRecord(state, {
    type: 'homework',
    id: 'hw1',
    title: 'Vectors v2',
    eventCreatedAt: 1_700_600_000,
  });
  state = { ...state, ...edited };
  assert.equal(state.homework[0].eventCreatedAt, 1_700_000_000);
  assert.equal(state.homework[0].eventUpdatedAt, 1_700_600_000);

  // A stale replay of the original event must not move the created time forward.
  const replay = applyRecord(state, {
    type: 'homework',
    id: 'hw1',
    title: 'Vectors',
    eventCreatedAt: 1_700_000_000,
  });
  state = { ...state, ...replay };
  assert.equal(state.homework[0].eventCreatedAt, 1_700_000_000);
  assert.equal(state.homework[0].eventUpdatedAt, 1_700_600_000);
});

test('a stale published replay cannot re-open a closed homework', () => {
  const closed = { id: 'hw1', classroomId: 'c1', status: 'closed', updatedAt: '2026-09-30T10:00:00.000Z' };
  const state = { ...EMPTY, homework: [closed] };

  // A leftover copy of the original publish (no updatedAt) must be ignored.
  const stale = applyRecord(state, { type: 'homework', id: 'hw1', classroomId: 'c1', status: 'published' });
  assert.equal(stale, null, 'stale replay should not change state');
  assert.equal(state.homework[0].status, 'closed');

  // An older stamped edit is also refused.
  const older = applyRecord(state, {
    type: 'homework',
    id: 'hw1',
    classroomId: 'c1',
    status: 'published',
    updatedAt: '2026-09-30T09:00:00.000Z',
  });
  assert.equal(older, null);

  // A genuine reopen is newer, so it applies.
  const reopened = applyRecord(state, {
    type: 'homework',
    id: 'hw1',
    classroomId: 'c1',
    status: 'published',
    updatedAt: '2026-09-30T11:00:00.000Z',
  });
  assert.equal(reopened.homework[0].status, 'published');
});

test('the submission head follows the latest assessment revision, not arrival order', () => {
  const base = { ...EMPTY, submissions: [{ id: 's1', homeworkId: 'h1', status: 'submitted', assessmentVersion: 0 }] };
  const first = applyRecord(base, {
    type: 'assessment-rev',
    id: 'a1',
    submissionId: 's1',
    studentId: 'stu',
    homeworkId: 'h1',
    version: 1,
    status: 'finalized',
    score: 60,
    maxScore: 100,
    gradedAt: '2026-09-30T09:00:00.000Z',
  });
  let state = { ...base, ...first };
  assert.equal(state.submissions[0].score, 60);

  const second = applyRecord(state, {
    type: 'assessment-rev',
    id: 'a2',
    submissionId: 's1',
    studentId: 'stu',
    homeworkId: 'h1',
    version: 2,
    status: 'finalized',
    score: 90,
    maxScore: 100,
    gradedAt: '2026-09-30T10:00:00.000Z',
  });
  state = { ...state, ...second };
  assert.equal(state.submissions[0].score, 90);

  // A late replay of the older grade must not downgrade the head.
  const replay = applyRecord(state, {
    type: 'assessment-rev',
    id: 'a1',
    submissionId: 's1',
    studentId: 'stu',
    homeworkId: 'h1',
    version: 1,
    status: 'finalized',
    score: 60,
    maxScore: 100,
    gradedAt: '2026-09-30T09:00:00.000Z',
  });
  if (replay) state = { ...state, ...replay };
  assert.equal(state.submissions[0].score, 90);
});

test('same-version revisions resolve to the later authored time', () => {
  const base = { ...EMPTY, submissions: [{ id: 's2', homeworkId: 'h1', status: 'submitted', assessmentVersion: 0 }] };
  const revision = (id, score, gradedAt) => ({
    type: 'assessment-rev',
    id,
    submissionId: 's2',
    studentId: 'stu',
    homeworkId: 'h1',
    version: 2,
    status: 'finalized',
    score,
    maxScore: 100,
    gradedAt,
  });

  let state = { ...base, ...applyRecord(base, revision('b1', 70, '2026-09-30T10:00:00.000Z')) };
  state = { ...state, ...applyRecord(state, revision('b2', 80, '2026-09-30T11:00:00.000Z')) };
  assert.equal(state.submissions[0].score, 80);

  // A colliding version with an earlier time must not win.
  const late = applyRecord(state, revision('b3', 50, '2026-09-30T09:00:00.000Z'));
  if (late) state = { ...state, ...late };
  assert.equal(state.submissions[0].score, 80);
});

test('a finalized grade beats a same-version revision request', () => {
  const base = { ...EMPTY, submissions: [{ id: 's3', homeworkId: 'h1', status: 'revision', assessmentVersion: 0 }] };
  const requested = applyRecord(base, {
    type: 'assessment-rev',
    id: 'r2',
    submissionId: 's3',
    studentId: 'stu',
    homeworkId: 'h1',
    version: 2,
    status: 'revision',
    score: null,
    maxScore: 100,
    requestedAt: '2026-09-30T10:00:00.000Z',
    // A misleading randomized wrap time must not decide the winner.
    eventCreatedAt: 9_999_999_999,
  });
  let state = { ...base, ...requested };
  assert.equal(state.submissions[0].status, 'revision');

  const graded = applyRecord(state, {
    type: 'assessment-rev',
    id: 'g2',
    submissionId: 's3',
    studentId: 'stu',
    homeworkId: 'h1',
    version: 2,
    status: 'finalized',
    score: 15,
    maxScore: 100,
    gradedAt: '2026-09-30T09:00:00.000Z',
    eventCreatedAt: 1,
  });
  state = { ...state, ...graded };
  assert.equal(state.submissions[0].status, 'graded');
  assert.equal(state.submissions[0].score, 15);
});

test('reconcileAssessmentHeads repairs a head resolved with the old ordering', () => {
  const patch = reconcileAssessmentHeads({
    submissions: [{ id: 's4', homeworkId: 'h1', status: 'revision', score: null, assessmentVersion: 2 }],
    assessmentRevisions: [
      { id: 'r2', submissionId: 's4', homeworkId: 'h1', version: 2, status: 'revision', feedback: 'redo', requestedAt: '2026-09-30T10:00:00.000Z' },
      { id: 'g2', submissionId: 's4', homeworkId: 'h1', version: 2, status: 'finalized', score: 42, maxScore: 100, gradedAt: '2026-09-30T11:00:00.000Z' },
    ],
  });
  assert.ok(patch, 'expected the stale head to be reconciled');
  assert.equal(patch.submissions[0].status, 'graded');
  assert.equal(patch.submissions[0].score, 42);
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

test('a member record resolves the learner pending request and adds a receipt', () => {
  const base = {
    ...EMPTY,
    events: [],
    academies: { owner1: { id: 'org1', ownerId: 'owner1', name: 'Northgate' } },
    joinRequests: [
      { id: 'jr1', accountId: 'pk1', academyId: 'org1', academy: 'Northgate', status: 'pending' },
      { id: 'jr2', accountId: 'pk2', academyId: 'org1', academy: 'Northgate', status: 'pending' },
    ],
  };
  const patch = applyRecord(base, {
    type: 'member',
    id: 'm1',
    academyId: 'org1',
    memberId: 'pk1',
    role: 'student',
    status: 'active',
  });
  const statuses = Object.fromEntries(patch.joinRequests.map((entry) => [entry.id, entry.status]));
  assert.equal(statuses.jr1, 'approved');
  assert.equal(statuses.jr2, 'pending');
  assert.equal(patch.events.length, 1);
  assert.equal(patch.events[0].type, 'member');
  assert.deepEqual(patch.events[0].audience, ['pk1']);
  assert.equal(patch.events[0].context, 'Northgate');

  const delivered = applyRecord({ ...base, ...patch }, {
    type: 'member',
    id: 'm1',
    academyId: 'org1',
    memberId: 'pk1',
    status: 'active',
  });
  assert.equal(delivered.events.filter((entry) => entry.type === 'member').length, 1);
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

test('an older assessment revision arriving late does not overwrite the last score', () => {
  const base = { ...EMPTY, homework: [{ id: 'hw1', classroomId: 'c1' }] };
  const first = applyRecord(base, {
    type: 'assessment-rev',
    id: 'a1',
    submissionId: 's1',
    homeworkId: 'hw1',
    studentId: 'stu',
    version: 1,
    status: 'finalized',
    score: 60,
    maxScore: 100,
  });
  let state = { ...base, ...first };
  const second = applyRecord(state, {
    type: 'assessment-rev',
    id: 'a2',
    submissionId: 's1',
    homeworkId: 'hw1',
    studentId: 'stu',
    version: 2,
    status: 'finalized',
    score: 90,
    maxScore: 100,
  });
  state = { ...state, ...second };
  assert.equal(state.submissions.find((entry) => entry.id === 's1').score, 90);

  // The version-1 record is re-delivered after version 2.
  const late = applyRecord(state, {
    type: 'assessment-rev',
    id: 'a1',
    submissionId: 's1',
    homeworkId: 'hw1',
    studentId: 'stu',
    version: 1,
    status: 'finalized',
    score: 60,
    maxScore: 100,
  });
  const after = { ...state, ...late };
  assert.equal(after.submissions.find((entry) => entry.id === 's1').score, 90);
});

test('a finalized assessment materializes a submission when it is missing', () => {
  const patch = applyRecord(
    { ...EMPTY, homework: [{ id: 'hw1', classroomId: 'c1' }] },
    {
      type: 'assessment-rev',
      id: 'a1',
      submissionId: 's9',
      homeworkId: 'hw1',
      studentId: 'stu1',
      version: 1,
      status: 'finalized',
      score: 42,
      maxScore: 50,
      feedback: 'Good',
    },
  );
  const submission = patch.submissions.find((entry) => entry.id === 's9');
  assert.ok(submission, 'expected a materialized submission');
  assert.equal(submission.status, 'graded');
  assert.equal(submission.score, 42);
  assert.equal(submission.maxScore, 50);
  assert.equal(submission.classroomId, 'c1');
});

test('a submission version carries max score, link, and attachments', () => {
  const patch = applyRecord(EMPTY, {
    type: 'submission-ver',
    id: 'v1',
    submissionId: 's1',
    homeworkId: 'hw1',
    classroomId: 'c1',
    studentId: 'stu1',
    version: 1,
    text: '',
    link: 'https://example.com/answer',
    files: [{ name: 'answer.pdf', url: 'https://cdn/answer.pdf' }],
    maxScore: 80,
  });
  const submission = patch.submissions[0];
  assert.equal(submission.maxScore, 80);
  assert.equal(submission.link, 'https://example.com/answer');
  assert.equal(submission.files[0].name, 'answer.pdf');
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

test('a submission version carries the raw event created_at as submittedEventAt', () => {
  const patch = applyRecord(EMPTY, {
    type: RECORD_TYPES.SUBMISSION_VERSION,
    id: 'ver1',
    submissionId: 'sub1',
    homeworkId: 'hw1',
    classroomId: 'c1',
    studentId: 'stu',
    version: 1,
    text: 'answer',
    eventCreatedAt: 1_700_000_000,
  });
  const submission = patch.submissions[0];
  assert.equal(submission.submittedEventAt, 1_700_000_000);
  assert.equal(patch.submissionVersions[0].eventCreatedAt, 1_700_000_000);
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
