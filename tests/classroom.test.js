import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CLASS_STATUS,
  LATE_POLICY,
  SUBMISSION_STATUS,
  assessmentRevisionsFor,
  averagePercent,
  canSubmitLate,
  classStatusBadge,
  isLate,
  lateBadge,
  latePolicyLabel,
  normalizeLatePolicy,
  classroomActivity,
  classroomById,
  classroomsForAcademy,
  classroomsForStudent,
  classroomsForSubject,
  classroomsForTeacher,
  enrolledAccountIds,
  gradingProgress,
  homeworkForStudent,
  homeworkStatusBadge,
  isEnrollable,
  isHomeworkOpen,
  isValidScore,
  latestAssessmentRevision,
  latestVersion,
  publishedClassrooms,
  reviewCounts,
  reviewQueue,
  scorePercent,
  subjectById,
  subjectInUse,
  subjectsForAcademy,
  submissionFor,
  submissionIndex,
  submissionStatusBadge,
  submissionsForClassroom,
  submissionsForHomework,
  versionsFor,
} from '../src/domain/classroom.js';

const SUBJECTS = [
  { id: 'sub-cs', academyId: 'org1', name: 'Computer Science' },
  { id: 'sub-math', academyId: 'org2', name: 'Mathematics' },
];
const CLASSROOMS = [
  { id: 'cls1', academyId: 'org1', subjectId: 'sub-cs', status: 'published', teacherId: 'bob', studentIds: ['alice'] },
  { id: 'cls2', academyId: 'org1', subjectId: 'sub-cs', status: 'draft', teacherId: null, studentIds: [] },
  { id: 'cls3', academyId: 'org2', subjectId: 'sub-math', status: 'published', teacherId: 'zoe', studentIds: ['alice'] },
];
const HOMEWORK = [
  { id: 'hw1', classroomId: 'cls1', status: 'published' },
  { id: 'hw2', classroomId: 'cls2', status: 'published' },
  { id: 'hw3', classroomId: 'cls3', status: 'published' },
  { id: 'hw4', classroomId: 'cls1', status: 'draft' },
];
const SUBMISSIONS = [
  { id: 's1', homeworkId: 'hw1', studentId: 'alice', status: 'graded', score: 72, maxScore: 100 },
  { id: 's2', homeworkId: 'hw1', studentId: 'carol', status: 'submitted', score: null, maxScore: 100 },
];

test('subject and classroom lookups respect academy, subject, teacher, and student scope', () => {
  assert.equal(subjectsForAcademy(SUBJECTS, 'org1').length, 1);
  assert.equal(subjectById(SUBJECTS, 'sub-math').name, 'Mathematics');
  assert.equal(classroomsForAcademy(CLASSROOMS, 'org1').length, 2);
  assert.equal(classroomsForSubject(CLASSROOMS, 'sub-cs').length, 2);
  assert.equal(classroomsForTeacher(CLASSROOMS, 'bob').map((room) => room.id).join(','), 'cls1');
  assert.equal(classroomsForStudent(CLASSROOMS, 'alice').length, 2);
  assert.equal(classroomById(CLASSROOMS, 'cls1').academyId, 'org1');
});

test('homeworkForStudent only returns published work from enrolled classes', () => {
  const ids = homeworkForStudent(HOMEWORK, CLASSROOMS, 'alice').map((item) => item.id);
  assert.deepEqual(ids.sort(), ['hw1', 'hw3']);
});

test('submission lookups find the latest version per student', () => {
  assert.equal(submissionsForHomework(SUBMISSIONS, 'hw1').length, 2);
  assert.equal(submissionFor(SUBMISSIONS, 'hw1', 'alice').id, 's1');
  assert.equal(submissionFor(SUBMISSIONS, 'hw1', 'nobody'), null);
});

test('submissionIndex matches submissionFor, latest record wins', () => {
  const withRegrade = [
    ...SUBMISSIONS,
    { id: 's3', homeworkId: 'hw1', studentId: 'alice', status: 'graded', score: 90, maxScore: 100 },
    { id: 's4', homeworkId: 'hw3', studentId: 'alice', status: 'submitted', score: null, maxScore: 100 },
  ];
  const lookup = submissionIndex(withRegrade);
  assert.equal(lookup('hw1', 'alice').id, 's3');
  assert.equal(lookup('hw3', 'alice').id, 's4');
  assert.equal(lookup('hw1', 'carol').id, 's2');
  for (const homeworkId of ['hw1', 'hw3']) {
    for (const studentId of ['alice', 'carol', 'nobody']) {
      assert.equal(
        lookup(homeworkId, studentId),
        submissionFor(withRegrade, homeworkId, studentId),
        `${homeworkId}/${studentId} should resolve identically`,
      );
    }
  }
  assert.equal(submissionIndex([])('hw1', 'alice'), null);
});

test('isValidScore bounds a numeric score to the maximum', () => {
  assert.equal(isValidScore(0, 100), true);
  assert.equal(isValidScore(100, 100), true);
  assert.equal(isValidScore('85', 100), true);
  assert.equal(isValidScore(101, 100), false);
  assert.equal(isValidScore(-1, 100), false);
  assert.equal(isValidScore('abc', 100), false);
});

test('scorePercent and gradingProgress summarize results', () => {
  assert.equal(scorePercent({ score: 72, maxScore: 100 }), 72);
  assert.equal(scorePercent({ score: null, maxScore: 100 }), null);
  assert.deepEqual(gradingProgress(SUBMISSIONS, ['alice', 'carol']), { graded: 1, total: 2 });
});

test('class, homework, and submission badges describe state', () => {
  assert.equal(classStatusBadge(CLASS_STATUS.PUBLISHED).tone, 'ok');
  assert.equal(classStatusBadge(CLASS_STATUS.DRAFT).tone, 'info');
  assert.equal(submissionStatusBadge(null).tone, 'warn');
  assert.equal(submissionStatusBadge({ status: SUBMISSION_STATUS.SUBMITTED }).tone, 'info');
  assert.equal(submissionStatusBadge({ status: SUBMISSION_STATUS.REVISION }).tone, 'warn');
  assert.equal(
    submissionStatusBadge({ status: SUBMISSION_STATUS.GRADED, score: 90, maxScore: 100 }).tone,
    'ok',
  );
});

test('classroomsForStudent hides draft and archived classes', () => {
  const rooms = [
    { id: 'p', status: CLASS_STATUS.PUBLISHED, studentIds: ['alice'] },
    { id: 'a', status: CLASS_STATUS.ARCHIVED, studentIds: ['alice'] },
    { id: 'd', status: CLASS_STATUS.DRAFT, studentIds: ['alice'] },
  ];
  assert.deepEqual(classroomsForStudent(rooms, 'alice').map((room) => room.id), ['p']);
});

test('subjectInUse and classroomActivity summarize deletion guards', () => {
  assert.equal(subjectInUse(CLASSROOMS, 'sub-cs'), true);
  assert.equal(subjectInUse(CLASSROOMS, 'sub-missing'), false);
  assert.deepEqual(classroomActivity(HOMEWORK, SUBMISSIONS, 'cls1'), { homework: 2, submissions: 2 });
  assert.deepEqual(classroomActivity(HOMEWORK, SUBMISSIONS, 'cls2'), { homework: 1, submissions: 0 });
});

test('publishedClassrooms and isEnrollable gate the catalog', () => {
  assert.deepEqual(publishedClassrooms(CLASSROOMS).map((room) => room.id), ['cls1', 'cls3']);
  assert.equal(isEnrollable({ status: CLASS_STATUS.PUBLISHED, teacherId: 'bob' }), true);
  assert.equal(isEnrollable({ status: CLASS_STATUS.PUBLISHED, teacherId: null }), false);
  assert.equal(isEnrollable({ status: CLASS_STATUS.DRAFT, teacherId: 'bob' }), false);
  assert.equal(isEnrollable(null), false);
});

test('homework visibility keeps closed work and hides drafts', () => {
  const rooms = [{ id: 'c1', status: CLASS_STATUS.PUBLISHED, studentIds: ['alice'] }];
  const items = [
    { id: 'h1', classroomId: 'c1', status: 'published' },
    { id: 'h2', classroomId: 'c1', status: 'closed' },
    { id: 'h3', classroomId: 'c1', status: 'draft' },
  ];
  assert.deepEqual(homeworkForStudent(items, rooms, 'alice').map((item) => item.id), ['h1', 'h2']);
  assert.equal(isHomeworkOpen(items[0]), true);
  assert.equal(isHomeworkOpen(items[1]), false);
  assert.equal(isHomeworkOpen(null), false);
  assert.equal(homeworkStatusBadge('closed').tone, 'muted');
});

test('reviewQueue joins submissions to scoped homework and classrooms', () => {
  const homework = [{ id: 'hw1', classroomId: 'cls1', title: 'A1' }];
  const classrooms = [{ id: 'cls1', name: 'Algebra' }];
  const submissions = [
    { id: 's1', homeworkId: 'hw1', classroomId: 'cls1', status: 'submitted' },
    { id: 's2', homeworkId: 'hw1', classroomId: 'cls1', status: 'graded' },
    { id: 's3', homeworkId: 'hwX', classroomId: 'cls1', status: 'submitted' },
    { id: 's4', homeworkId: 'hw1', classroomId: 'cls2', status: 'submitted' },
  ];
  const queue = reviewQueue(submissions, homework, classrooms);
  assert.deepEqual(queue.map((entry) => entry.submission.id), ['s1', 's2']);
  assert.deepEqual(reviewCounts(queue), { pending: 1, graded: 1 });
});

test('gradebook helpers average graded work per class', () => {
  const submissions = [
    { id: 's1', classroomId: 'c1', status: 'graded', score: 80, maxScore: 100 },
    { id: 's2', classroomId: 'c1', status: 'graded', score: 90, maxScore: 100 },
    { id: 's3', classroomId: 'c1', status: 'submitted', score: null, maxScore: 100 },
    { id: 's4', classroomId: 'c2', status: 'graded', score: 50, maxScore: 100 },
  ];
  assert.equal(submissionsForClassroom(submissions, 'c1').length, 3);
  assert.equal(averagePercent(submissions), 73);
  assert.equal(averagePercent([{ status: 'submitted', score: null, maxScore: 100 }]), null);
  assert.equal(averagePercent([]), null);
});

test('signed capabilities extend the student and teacher roster', () => {
  const rooms = [
    { id: 'r1', academyId: 'org1', status: 'published', teacherId: null, studentIds: [] },
    { id: 'r2', academyId: 'org1', status: 'published', teacherId: 'bob', studentIds: [] },
  ];
  const caps = [
    { id: 'e1', kind: 'enrollment', academyId: 'org1', accountId: 'alice', classroomId: 'r1', status: 'active' },
    { id: 't1', kind: 'teacher-assignment', academyId: 'org1', accountId: 'zoe', classroomId: 'r2', status: 'active' },
    { id: 'e2', kind: 'enrollment', academyId: 'org1', accountId: 'carol', classroomId: 'r2', status: 'revoked' },
  ];
  assert.deepEqual(classroomsForStudent(rooms, 'alice', caps).map((room) => room.id), ['r1']);
  assert.deepEqual(classroomsForStudent(rooms, 'carol', caps).map((room) => room.id), []);
  assert.deepEqual(classroomsForTeacher(rooms, 'zoe', caps).map((room) => room.id), ['r2']);
  assert.deepEqual(classroomsForTeacher(rooms, 'bob', caps).map((room) => room.id), ['r2']);

  const homework = [{ id: 'h1', classroomId: 'r1', status: 'published' }];
  assert.deepEqual(homeworkForStudent(homework, rooms, 'alice', caps).map((item) => item.id), ['h1']);
  assert.deepEqual(homeworkForStudent(homework, rooms, 'nobody', caps), []);
});

test('late policy normalizes, labels, and gates late submissions', () => {
  assert.equal(normalizeLatePolicy('block'), LATE_POLICY.BLOCK);
  assert.equal(normalizeLatePolicy('accept'), LATE_POLICY.ACCEPT);
  assert.equal(normalizeLatePolicy(undefined), LATE_POLICY.FLAG);
  assert.equal(normalizeLatePolicy('nonsense'), LATE_POLICY.FLAG);
  assert.equal(latePolicyLabel('block'), 'late work is refused');

  const homework = { dueAt: '2026-09-30T12:00:00Z' };
  const before = Date.parse('2026-09-30T11:00:00Z');
  const after = Date.parse('2026-09-30T13:00:00Z');
  assert.equal(isLate(homework, before), false);
  assert.equal(isLate(homework, after), true);
  assert.equal(isLate({}, after), false);
  assert.equal(isLate({ dueAt: 'not-a-date' }, after), false);

  assert.equal(canSubmitLate({ latePolicy: 'block' }, homework, after), false);
  assert.equal(canSubmitLate({ latePolicy: 'flag' }, homework, after), true);
  assert.equal(canSubmitLate({ latePolicy: 'accept' }, homework, after), true);
  assert.equal(canSubmitLate({ latePolicy: 'block' }, homework, before), true);
});

test('lateBadge marks late submissions only', () => {
  assert.equal(lateBadge(null), null);
  assert.equal(lateBadge({ late: false }), null);
  assert.deepEqual(lateBadge({ late: true }), { label: 'late', tone: 'warn' });
});

test('versionsFor returns submission versions in order', () => {
  const versions = [
    { id: 'v3', submissionId: 's1', version: 3 },
    { id: 'v1', submissionId: 's1', version: 1 },
    { id: 'v2', submissionId: 's1', version: 2 },
    { id: 'other', submissionId: 's2', version: 1 },
  ];
  assert.deepEqual(versionsFor(versions, 's1').map((entry) => entry.id), ['v1', 'v2', 'v3']);
  assert.equal(latestVersion(versions, 's1').id, 'v3');
  assert.equal(latestVersion(versions, 'missing'), null);
});

test('assessmentRevisionsFor orders revisions and finds the latest', () => {
  const revisions = [
    { id: 'a2', submissionId: 's1', version: 2, status: 'finalized' },
    { id: 'a1', submissionId: 's1', version: 1, status: 'finalized' },
  ];
  assert.deepEqual(assessmentRevisionsFor(revisions, 's1').map((entry) => entry.id), ['a1', 'a2']);
  assert.equal(latestAssessmentRevision(revisions, 's1').id, 'a2');
  assert.equal(latestAssessmentRevision(revisions, 'missing'), null);
});

test('a scored submission without a max still reports its value', () => {
  const partial = submissionStatusBadge({ status: 'graded', score: 12, maxScore: null });
  assert.equal(partial.key, 'common.badge.scoredNoMax');
  assert.equal(partial.params.score, 12);
  const full = submissionStatusBadge({ status: 'graded', score: 12, maxScore: 20 });
  assert.equal(full.key, 'common.badge.scored');
  assert.equal(full.params.maxScore, 20);
});

test('enrolledAccountIds lists active enrollment capability holders for a class', () => {
  const capabilities = [
    { kind: 'enrollment', academyId: 'org1', classroomId: 'cls1', accountId: 'alice', status: 'active' },
    { kind: 'enrollment', academyId: 'org1', classroomId: 'cls1', accountId: 'bob', status: 'revoked' },
    { kind: 'enrollment', academyId: 'org1', classroomId: 'cls2', accountId: 'carol', status: 'active' },
    { kind: 'teacher-assignment', academyId: 'org1', classroomId: 'cls1', accountId: 'dave', status: 'active' },
  ];
  assert.deepEqual(enrolledAccountIds(capabilities, 'cls1'), ['alice']);
  assert.deepEqual(enrolledAccountIds(capabilities, 'cls2'), ['carol']);
  assert.deepEqual(enrolledAccountIds([], 'cls1'), []);
});
