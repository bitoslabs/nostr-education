import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ASSIGNMENT_STATUS,
  ENROLLMENT,
  ROLE,
  assignmentBadge,
  enrollmentBadge,
  enrollmentStateFor,
  normalizeRole,
  roleSpaceLabel,
  roleSpaceShort,
} from '../src/domain/school.js';

test('role spaces map per role', () => {
  assert.equal(roleSpaceLabel(ROLE.STUDENT), 'Education');
  assert.equal(roleSpaceLabel(ROLE.TEACHER), 'Teaching');
  assert.equal(roleSpaceLabel(ROLE.OWNER), 'Organization');
  assert.equal(roleSpaceShort(ROLE.TEACHER), 'Teach');
});

test('normalizeRole falls back to the learner workspace', () => {
  assert.equal(normalizeRole(ROLE.TEACHER), ROLE.TEACHER);
  assert.equal(normalizeRole(ROLE.OWNER), ROLE.OWNER);
  assert.equal(normalizeRole(ROLE.STUDENT), ROLE.STUDENT);
  assert.equal(normalizeRole(null), ROLE.STUDENT);
  assert.equal(normalizeRole(undefined), ROLE.STUDENT);
  assert.equal(normalizeRole('principal'), ROLE.STUDENT);
});

test('enrollmentBadge reflects state', () => {
  assert.equal(enrollmentBadge(ENROLLMENT.NONE), null);
  assert.equal(enrollmentBadge(ENROLLMENT.PENDING).tone, 'info');
  assert.equal(enrollmentBadge(ENROLLMENT.APPROVED).tone, 'ok');
});

test('enrollmentStateFor reads the latest request per learner and course', () => {
  const requests = [
    { learnerId: 'alice', courseId: 'c1', status: 'declined' },
    { learnerId: 'alice', courseId: 'c1', status: 'pending' },
    { learnerId: 'bob', courseId: 'c1', status: 'approved' },
  ];
  assert.equal(enrollmentStateFor(requests, 'alice', 'c1'), ENROLLMENT.PENDING);
  assert.equal(enrollmentStateFor(requests, 'bob', 'c1'), ENROLLMENT.APPROVED);
  assert.equal(enrollmentStateFor(requests, 'carol', 'c1'), ENROLLMENT.NONE);
});

test('assignmentBadge reflects assignment status', () => {
  assert.equal(assignmentBadge({ status: ASSIGNMENT_STATUS.REVISION }).tone, 'warn');
  assert.match(assignmentBadge({ status: ASSIGNMENT_STATUS.FINAL, grade: 78 }).label, /78/);
});
