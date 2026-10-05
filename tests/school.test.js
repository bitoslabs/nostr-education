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
  workspaceRole,
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

test('workspaceRole derives the role the membership screen already shows', () => {
  const student = { id: 'pk1', role: 'student' };
  assert.equal(workspaceRole({ academies: {} }, student), ROLE.STUDENT);

  // Owning an academy opens the organization workspace even if the persona's
  // stored role lagged behind (for example an extension sign-in with no role).
  assert.equal(
    workspaceRole({ academies: { pk1: { id: 'org1', ownerId: 'pk1' } } }, student),
    ROLE.OWNER,
  );

  // A teacher assignment synced onto this device must open the teaching
  // workspace, matching the "Teacher" badge in Settings → Membership.
  assert.equal(
    workspaceRole(
      { classrooms: [{ id: 'room1', teacherId: 'pk1' }] },
      student,
    ),
    ROLE.TEACHER,
  );
  assert.equal(
    workspaceRole(
      {
        capabilities: [
          { kind: 'teacher-assignment', academyId: 'org1', accountId: 'pk1', status: 'active' },
        ],
      },
      student,
    ),
    ROLE.TEACHER,
  );

  // A stored higher role is never downgraded.
  assert.equal(workspaceRole({ academies: {} }, { id: 'pk1', role: 'owner' }), ROLE.OWNER);
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
