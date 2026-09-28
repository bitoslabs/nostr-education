import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ASSIGNMENT_STATUS,
  ENROLLMENT,
  ROLE,
  assignmentBadge,
  enrollmentBadge,
  roleSpaceLabel,
  roleSpaceShort,
} from '../src/domain/school.js';

test('role spaces map per role', () => {
  assert.equal(roleSpaceLabel(ROLE.STUDENT), 'Education');
  assert.equal(roleSpaceLabel(ROLE.TEACHER), 'Teaching');
  assert.equal(roleSpaceLabel(ROLE.OWNER), 'Organization');
  assert.equal(roleSpaceShort(ROLE.TEACHER), 'Teach');
});

test('enrollmentBadge reflects state', () => {
  assert.equal(enrollmentBadge(ENROLLMENT.NONE), null);
  assert.equal(enrollmentBadge(ENROLLMENT.PENDING).tone, 'info');
  assert.equal(enrollmentBadge(ENROLLMENT.APPROVED).tone, 'ok');
});

test('assignmentBadge reflects assignment status', () => {
  assert.equal(assignmentBadge({ status: ASSIGNMENT_STATUS.REVISION }).tone, 'warn');
  assert.match(assignmentBadge({ status: ASSIGNMENT_STATUS.FINAL, grade: 78 }).label, /78/);
});
