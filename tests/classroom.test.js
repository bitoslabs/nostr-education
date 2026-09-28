import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CLASS_STATUS,
  SUBMISSION_STATUS,
  averagePercent,
  classStatusBadge,
  classroomActivity,
  classroomById,
  classroomsForAcademy,
  classroomsForStudent,
  classroomsForSubject,
  classroomsForTeacher,
  gradingProgress,
  homeworkForStudent,
  homeworkStatusBadge,
  isEnrollable,
  isHomeworkOpen,
  isValidScore,
  publishedClassrooms,
  reviewCounts,
  reviewQueue,
  scorePercent,
  subjectById,
  subjectInUse,
  subjectsForAcademy,
  submissionFor,
  submissionStatusBadge,
  submissionsForClassroom,
  submissionsForHomework,
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
