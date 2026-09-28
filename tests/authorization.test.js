import assert from 'node:assert/strict';
import test from 'node:test';

import { ACTION, academyById, academyForClassroom, authorize } from '../src/domain/authorization.js';

const academy = { id: 'org1', ownerId: 'owner' };
const classroom = { id: 'cls1', academyId: 'org1', teacherId: 'teacher' };

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
