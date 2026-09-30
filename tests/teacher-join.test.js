import assert from 'node:assert/strict';
import test from 'node:test';

import { createActions } from '../src/app/actions.js';
import { createEmitter } from '../src/core/emitter.js';
import { createStore } from '../src/core/store.js';
import { clearRegistry, registerPersona } from '../src/data/personas.js';
import { INVITE_STATUS } from '../src/domain/academy.js';
import { CAPABILITY } from '../src/domain/capability.js';
import { CLASS_STATUS, classroomsForTeacher } from '../src/domain/classroom.js';
import { ROLE } from '../src/domain/school.js';
import { applyRecord } from '../src/domain/records.js';

const ACADEMY = { id: 'acad1', name: 'Test Academy', ownerId: 'owner1', orgNpub: 'npub1org' };
const CLASSROOM = {
  id: 'room1',
  academyId: 'acad1',
  subjectId: 'sub1',
  name: 'Algebra',
  status: CLASS_STATUS.DRAFT,
  teacherId: null,
  studentIds: [],
};

function makeApp() {
  clearRegistry();
  registerPersona({ id: 'owner1', npub: 'npub1owner', displayName: 'Owner', role: 'owner' });
  registerPersona({ id: 'teacher1', npub: 'npub1teacher', displayName: 'Teacher', role: 'student' });

  const store = createStore({
    personaId: 'teacher1',
    accountId: 'teacher1',
    academies: { owner1: ACADEMY },
    classrooms: [CLASSROOM],
    subjects: [{ id: 'sub1', academyId: 'acad1', name: 'Maths', code: '' }],
    invites: [
      {
        id: 'inv1',
        academyId: 'acad1',
        classroomId: 'room1',
        role: ROLE.TEACHER,
        target: '',
        name: '',
        code: 'teachercode',
        status: INVITE_STATUS.PENDING,
        createdBy: 'owner1',
        time: 'now',
        acceptedBy: null,
      },
    ],
    memberships: {},
    academyMemberships: [],
    capabilities: [],
    joinRequests: [],
    events: [],
    profiles: {},
  });
  const bus = createEmitter();
  const actions = createActions({
    store,
    bus,
    signer: { getSigner: () => null, canSign: () => false },
    confirm: { ask: async () => true },
    relay: { publish: async () => true },
  });
  return { store, actions };
}

test('accepting a teacher invite persists an assignment that survives a stale catalog re-apply', async () => {
  const { store, actions } = makeApp();
  const ok = await actions.acceptInvite('teachercode', { prove: false });
  assert.equal(ok, true);

  let state = store.getState();
  assert.equal(state.classrooms[0].teacherId, 'teacher1');
  const capability = state.capabilities.find((entry) => entry.kind === CAPABILITY.TEACHER_ASSIGNMENT);
  assert.ok(capability, 'expected a teacher-assignment capability');
  assert.equal(capability.classroomId, 'room1');
  assert.equal(classroomsForTeacher(state.classrooms, 'teacher1', state.capabilities).length, 1);

  // Refreshing re-syncs the owner's public classroom record, which still has
  // teacherId null. The capability must keep the class assigned.
  const patch = applyRecord(state, {
    type: 'classroom',
    id: 'room1',
    academyId: 'acad1',
    subjectId: 'sub1',
    name: 'Algebra',
    status: CLASS_STATUS.DRAFT,
    teacherId: null,
  });
  state = { ...state, ...patch };
  assert.equal(classroomsForTeacher(state.classrooms, 'teacher1', state.capabilities).length, 1);
});
