import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACTION,
  academyById,
  academyForClassroom,
  authorize,
  isActiveStudent,
  isAssignedTeacher,
} from '../src/domain/authorization.js';
import { CAPABILITY, createCapability } from '../src/domain/capability.js';

const academy = { id: 'org1', ownerId: 'owner' };
const classroom = { id: 'cls1', academyId: 'org1', teacherId: 'teacher' };
const enrolledClassroom = { ...classroom, studentIds: ['student'] };

test('academyById and academyForClassroom resolve from a map or list', () => {
  assert.equal(academyById([academy], 'org1'), academy);
  assert.equal(academyById({ o: academy }, 'org1'), academy);
  assert.equal(academyById(null, 'org1'), null);
  assert.equal(academyForClassroom([academy], classroom), academy);
  assert.equal(academyForClassroom([academy], null), null);
});

test('authorize allows the class teacher and academy owner for shared actions', () => {
  const shared = [
    ACTION.MANAGE_CLASSROOM,
    ACTION.POST_HOMEWORK,
    ACTION.EDIT_HOMEWORK,
    ACTION.GRADE,
    ACTION.RECOMMEND_COMPLETION,
    ACTION.DECIDE_ENROLLMENT,
  ];
  for (const action of shared) {
    assert.equal(authorize(action, { actor: 'teacher', classroom, academy }), true);
    assert.equal(authorize(action, { actor: 'owner', classroom, academy }), true);
    assert.equal(authorize(action, { actor: 'student', classroom, academy }), false);
  }
});

test('authorize restricts owner-only actions', () => {
  for (const action of [ACTION.SET_POLICY, ACTION.ISSUE_CREDENTIAL, ACTION.REVOKE_CREDENTIAL]) {
    assert.equal(authorize(action, { actor: 'owner', classroom, academy }), true);
    assert.equal(authorize(action, { actor: 'teacher', classroom, academy }), false);
  }
});

test('authorize denies a missing actor, unknown action, or missing academy', () => {
  assert.equal(authorize(ACTION.SET_POLICY, {}), false);
  assert.equal(authorize(ACTION.SET_POLICY, { actor: 'owner' }), false);
  assert.equal(authorize('nope', { actor: 'owner', classroom, academy }), false);
  assert.equal(authorize(ACTION.SET_POLICY, { actor: 'owner', academy: { id: 'org1' } }), false);
});

test('authorize restricts submission to the enrolled student', () => {
  assert.equal(isActiveStudent(enrolledClassroom, 'student'), true);
  assert.equal(isActiveStudent(classroom, 'student'), false);
  assert.equal(authorize(ACTION.SUBMIT, { actor: 'student', classroom: enrolledClassroom, academy }), true);
  assert.equal(authorize(ACTION.SUBMIT, { actor: 'teacher', classroom: enrolledClassroom, academy }), false);
  assert.equal(authorize(ACTION.SUBMIT, { actor: 'owner', classroom: enrolledClassroom, academy }), false);
  assert.equal(authorize(ACTION.SUBMIT, { actor: 'student', classroom, academy }), false);
});

test('authorize falls back to signed capabilities without a server roster', () => {
  const bare = { id: 'cls9', academyId: 'org1' };
  const enrollment = createCapability({
    kind: CAPABILITY.ENROLLMENT,
    academyId: 'org1',
    accountId: 'student',
    classroomId: 'cls9',
  });
  const teacherGrant = createCapability({
    kind: CAPABILITY.TEACHER_ASSIGNMENT,
    academyId: 'org1',
    accountId: 'teacher',
    classroomId: 'cls9',
  });
  const ownerGrant = createCapability({
    kind: CAPABILITY.MEMBERSHIP,
    academyId: 'org1',
    accountId: 'owner',
    role: 'owner',
  });

  assert.equal(isActiveStudent(bare, 'student'), false);
  assert.equal(isActiveStudent(bare, 'student', [enrollment]), true);
  assert.equal(isAssignedTeacher(bare, 'teacher', [teacherGrant]), true);

  assert.equal(
    authorize(ACTION.SUBMIT, { actor: 'student', classroom: bare, academy, capabilities: [enrollment] }),
    true,
  );
  assert.equal(
    authorize(ACTION.FINALIZE_ASSESSMENT, {
      actor: 'teacher',
      classroom: bare,
      academy,
      capabilities: [teacherGrant],
    }),
    true,
  );
  assert.equal(
    authorize(ACTION.FINALIZE_ASSESSMENT, {
      actor: 'student',
      classroom: bare,
      academy,
      capabilities: [enrollment],
    }),
    false,
  );
  assert.equal(
    authorize(ACTION.SET_POLICY, { actor: 'owner', academy: { id: 'org1' }, capabilities: [ownerGrant] }),
    true,
  );
});

test('authorize restricts finalize and correction to teacher or owner', () => {
  for (const action of [ACTION.FINALIZE_ASSESSMENT, ACTION.CORRECT_ASSESSMENT]) {
    assert.equal(authorize(action, { actor: 'teacher', classroom, academy }), true);
    assert.equal(authorize(action, { actor: 'owner', classroom, academy }), true);
    assert.equal(authorize(action, { actor: 'student', classroom: enrolledClassroom, academy }), false);
  }
});
