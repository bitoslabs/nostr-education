import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CLASS_STATUS,
  SUBMISSION_STATUS,
  classStatusBadge,
  classroomActivity,
  classroomById,
  classroomsForAcademy,
  classroomsForStudent,
  classroomsForSubject,
  classroomsForTeacher,
  gradingProgress,
  homeworkForStudent,
  isEnrollable,
  isValidScore,
  publishedClassrooms,
  scorePercent,
  subjectById,
  subjectInUse,
  subjectsForAcademy,
  submissionFor,
  submissionStatusBadge,
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
