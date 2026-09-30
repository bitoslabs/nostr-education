import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GENDERS,
  NAME_VIEWER,
  NAME_VISIBILITY,
  canReadPrivateName,
  emptyPrivateName,
  formatPrivateName,
  hasPrivateName,
  normalizePrivateName,
  validatePrivateName,
} from '../src/domain/private-name.js';
import { ROLE } from '../src/domain/school.js';
import { clearRegistry, registerPersona } from '../src/data/personas.js';
import { learnerDisplayName, visiblePrivateName } from '../src/ui/private-name-view.js';

test('default visibility is stricter for students than for teachers', () => {
  assert.equal(emptyPrivateName(ROLE.STUDENT).visibility, NAME_VISIBILITY.SELF_AND_STAFF);
  assert.equal(emptyPrivateName(ROLE.OWNER).visibility, NAME_VISIBILITY.SELF_AND_STAFF);
  assert.equal(emptyPrivateName(ROLE.TEACHER).visibility, NAME_VISIBILITY.CLASS_PARTICIPANTS);
});

test('normalizePrivateName trims names and keeps known gender/visibility values', () => {
  const profile = normalizePrivateName({
    gender: 'female',
    givenName: '  Alex ',
    familyName: ' Sunder ',
    visibility: NAME_VISIBILITY.CLASS_PARTICIPANTS,
  });
  assert.deepEqual(profile, {
    gender: 'female',
    givenName: 'Alex',
    familyName: 'Sunder',
    visibility: NAME_VISIBILITY.CLASS_PARTICIPANTS,
  });
});

test('normalizePrivateName drops unknown gender and falls back to the role default visibility', () => {
  const profile = normalizePrivateName(
    { gender: 'unknown', visibility: 'everyone', givenName: 'A', familyName: 'B' },
    { role: ROLE.TEACHER },
  );
  assert.equal(profile.gender, '');
  assert.equal(profile.visibility, NAME_VISIBILITY.CLASS_PARTICIPANTS);
  assert.deepEqual(GENDERS.includes('unknown'), false);
});

test('validatePrivateName requires both names', () => {
  assert.equal(validatePrivateName({ givenName: 'A', familyName: 'B' }).valid, true);
  assert.equal(validatePrivateName({ givenName: ' ', familyName: 'B' }).valid, false);
  assert.equal(validatePrivateName({ givenName: 'A', familyName: '' }).valid, false);
  const result = validatePrivateName({});
  assert.equal(result.valid, false);
  assert.equal(result.errors.givenName, 'required');
  assert.equal(result.errors.familyName, 'required');
});

test('formatPrivateName joins available parts and hasPrivateName reports presence', () => {
  assert.equal(formatPrivateName({ givenName: 'Alex', familyName: 'Sunder' }), 'Alex Sunder');
  assert.equal(formatPrivateName({ givenName: 'Alex' }), 'Alex');
  assert.equal(formatPrivateName({}), '');
  assert.equal(hasPrivateName({ givenName: 'Alex' }), true);
  assert.equal(hasPrivateName({ givenName: '  ' }), false);
  assert.equal(hasPrivateName(null), false);
});

test('an assigned teacher may read an enrolled student private name', () => {
  const student = { role: ROLE.STUDENT, visibility: NAME_VISIBILITY.SELF_AND_STAFF };
  assert.equal(
    canReadPrivateName(student, { viewerId: 'teacher', subjectId: 'student', relationship: NAME_VIEWER.ASSIGNED_TEACHER }),
    true,
  );
  assert.equal(canReadPrivateName(student, { relationship: NAME_VIEWER.PUBLIC }), false);
  assert.equal(canReadPrivateName(null, { relationship: NAME_VIEWER.ASSIGNED_TEACHER }), false);
});

test('class participants only see an assigned teacher name under that policy', () => {
  const teacherOpen = { role: ROLE.TEACHER, visibility: NAME_VISIBILITY.CLASS_PARTICIPANTS };
  const teacherClosed = { role: ROLE.TEACHER, visibility: NAME_VISIBILITY.SELF_AND_STAFF };
  const student = { role: ROLE.STUDENT, visibility: NAME_VISIBILITY.CLASS_PARTICIPANTS };
  const relationship = NAME_VIEWER.CLASS_PARTICIPANT;
  assert.equal(canReadPrivateName(teacherOpen, { relationship }), true);
  assert.equal(canReadPrivateName(teacherClosed, { relationship }), false);
  assert.equal(canReadPrivateName(student, { relationship }), false);
});

test('a subject always reads their own name regardless of relationship', () => {
  const profile = { role: ROLE.STUDENT, visibility: NAME_VISIBILITY.SELF_AND_STAFF };
  assert.equal(canReadPrivateName(profile, { viewerId: 'me', subjectId: 'me' }), true);
  assert.equal(canReadPrivateName(profile, { relationship: NAME_VIEWER.SELF }), true);
  assert.equal(canReadPrivateName(profile, { relationship: NAME_VIEWER.STAFF }), true);
});

test('teacher-facing labels use the private name only inside assigned classes', () => {
  clearRegistry();
  registerPersona({ id: 'teacher-1', displayName: 'Ms T' });
  registerPersona({ id: 'teacher-2', displayName: 'Mr X' });
  registerPersona({ id: 'student-1', displayName: 'alex' });
  const state = {
    privateNames: {
      'student-1': {
        role: ROLE.STUDENT,
        givenName: 'Alex',
        familyName: 'Sunder',
        visibility: NAME_VISIBILITY.SELF_AND_STAFF,
      },
    },
    classrooms: [{ id: 'c1', teacherId: 'teacher-1', studentIds: ['student-1'] }],
    capabilities: [],
  };
  const assigned = { id: 'teacher-1' };
  const other = { id: 'teacher-2', role: ROLE.TEACHER };
  const owner = { id: 'owner-1', role: ROLE.OWNER };

  // Authorization follows the class relationship, not the viewer role label.
  assert.equal(visiblePrivateName(state, assigned, 'student-1'), 'Alex Sunder');
  assert.equal(learnerDisplayName(state, assigned, 'student-1'), 'Alex Sunder');
  assert.equal(visiblePrivateName(state, other, 'student-1'), null);
  assert.equal(learnerDisplayName(state, other, 'student-1'), 'alex');
  assert.equal(visiblePrivateName(state, owner, 'student-1'), null);
});

test('an enrolled student sees an assigned teacher only under class_participants', () => {
  clearRegistry();
  registerPersona({ id: 'teacher-1', displayName: 'Ms T' });
  registerPersona({ id: 'teacher-2', displayName: 'Mr X' });
  registerPersona({ id: 'student-1', displayName: 'alex' });
  const state = {
    privateNames: {
      'teacher-1': {
        role: ROLE.TEACHER,
        givenName: 'Tara',
        familyName: 'Ng',
        visibility: NAME_VISIBILITY.CLASS_PARTICIPANTS,
      },
      'teacher-2': {
        role: ROLE.TEACHER,
        givenName: 'Tom',
        familyName: 'Vu',
        visibility: NAME_VISIBILITY.SELF_AND_STAFF,
      },
    },
    classrooms: [
      { id: 'c1', teacherId: 'teacher-1', studentIds: ['student-1'], status: 'published' },
      { id: 'c2', teacherId: 'teacher-2', studentIds: ['student-1'], status: 'published' },
    ],
    capabilities: [],
  };
  const student = { id: 'student-1', role: ROLE.STUDENT };
  assert.equal(visiblePrivateName(state, student, 'teacher-1'), 'Tara Ng');
  assert.equal(visiblePrivateName(state, student, 'teacher-2'), null);
  assert.equal(learnerDisplayName(state, student, 'teacher-2'), 'Mr X');
});
