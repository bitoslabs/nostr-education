import assert from 'node:assert/strict';
import test from 'node:test';

import { createActions } from '../src/app/actions.js';
import { createEmitter } from '../src/core/emitter.js';
import { createStore } from '../src/core/store.js';
import { clearRegistry, registerPersona } from '../src/data/personas.js';
import { CLASS_STATUS, classroomsForStudent } from '../src/domain/classroom.js';
import { MEMBERSHIP, REQUEST_STATUS } from '../src/domain/school.js';

const ACADEMY = { id: 'acad1', name: 'Test Academy', ownerId: 'owner1', orgNpub: 'npub1org' };
const CLASSROOM = {
  id: 'room1',
  academyId: 'acad1',
  name: 'Algebra',
  status: CLASS_STATUS.PUBLISHED,
  teacherId: 'teacher1',
  studentIds: [],
};
const REQUEST = {
  id: 'req1',
  learnerId: 'learner1',
  learnerName: 'Learner',
  courseId: 'room1',
  courseTitle: 'Algebra',
  academyId: 'acad1',
  status: REQUEST_STATUS.PENDING,
};

function makeApp(personaId) {
  clearRegistry();
  registerPersona({ id: 'owner1', npub: 'npub1owner', displayName: 'Owner', role: 'owner' });
  registerPersona({ id: 'teacher1', npub: 'npub1teacher', displayName: 'Teacher', role: 'teacher' });
  registerPersona({ id: 'learner1', npub: 'npub1learner', displayName: 'Learner', role: 'student' });

  const store = createStore({
    personaId,
    academies: { owner1: ACADEMY },
    classrooms: [CLASSROOM],
    enrollRequests: [REQUEST],
    memberships: { learner1: MEMBERSHIP.ACTIVE },
    joinRequests: [],
    events: [],
    profiles: {},
  });
  const bus = createEmitter();
  const toasts = [];
  bus.on('toast', (payload) => toasts.push(payload));
  const actions = createActions({
    store,
    bus,
    signer: { getSigner: () => null },
    confirm: { ask: async () => true },
    relay: { publish: async () => true },
  });
  return { store, actions, toasts };
}

test('the class teacher approves an enrollment and the learner is enrolled', () => {
  const { store, actions, toasts } = makeApp('teacher1');
  assert.equal(actions.acceptEnrollment('req1'), true);

  const state = store.getState();
  const room = state.classrooms.find((entry) => entry.id === 'room1');
  assert.deepEqual(room.studentIds, ['learner1']);
  assert.equal(state.enrollRequests[0].status, REQUEST_STATUS.APPROVED);
  assert.ok(toasts.some((entry) => /approved/i.test(entry.message) && entry.tone === 'ok'));
  assert.equal(classroomsForStudent(state.classrooms, 'learner1').length, 1);
});

test('a learner cannot approve their own enrollment', () => {
  const { store, actions, toasts } = makeApp('learner1');
  assert.equal(actions.acceptEnrollment('req1'), false);

  const state = store.getState();
  assert.deepEqual(state.classrooms[0].studentIds, []);
  assert.equal(state.enrollRequests[0].status, REQUEST_STATUS.PENDING);
  assert.ok(toasts.some((entry) => /only the class teacher/i.test(entry.message)));
});

test('acceptEnrollment ignores a request that is not pending', () => {
  const { store, actions } = makeApp('teacher1');
  store.setState({ enrollRequests: [{ ...REQUEST, status: REQUEST_STATUS.APPROVED }] });
  assert.equal(actions.acceptEnrollment('req1'), false);
});

test('canDecideEnrollment reflects who may approve a pending request', () => {
  const teacher = makeApp('teacher1');
  assert.equal(teacher.actions.canDecideEnrollment('req1'), true);
  assert.equal(teacher.actions.canDecideEnrollment('missing'), false);
  assert.equal(makeApp('learner1').actions.canDecideEnrollment('req1'), false);

  teacher.actions.acceptEnrollment('req1');
  assert.equal(teacher.actions.canDecideEnrollment('req1'), false);
});

test('acceptJoin is limited to the owning academy', () => {
  const owner = makeApp('owner1');
  owner.store.setState({
    joinRequests: [
      { id: 'jr1', accountId: 'learner1', academy: 'Test Academy', status: REQUEST_STATUS.PENDING },
    ],
    memberships: { learner1: MEMBERSHIP.PENDING },
  });
  assert.equal(owner.actions.acceptJoin('jr1'), true);
  assert.equal(owner.store.getState().memberships.learner1, MEMBERSHIP.ACTIVE);

  const teacher = makeApp('teacher1');
  teacher.store.setState({
    joinRequests: [
      { id: 'jr1', accountId: 'learner1', academyId: 'acad1', academy: 'Test Academy', status: REQUEST_STATUS.PENDING },
    ],
    memberships: { learner1: MEMBERSHIP.NONE },
  });
  assert.equal(teacher.actions.acceptJoin('jr1'), false);
  assert.equal(teacher.store.getState().memberships.learner1, MEMBERSHIP.NONE);
  assert.ok(teacher.toasts.some((entry) => /only the academy owner/i.test(entry.message)));
});

test('canDecideJoin is limited to the owning academy', () => {
  const { store, actions } = makeApp('owner1');
  store.setState({
    joinRequests: [
      { id: 'jr1', accountId: 'learner1', academyId: 'acad1', academy: 'Test Academy', status: REQUEST_STATUS.PENDING },
      { id: 'jr2', accountId: 'learner1', academyId: 'other', academy: 'Other', status: REQUEST_STATUS.PENDING },
    ],
  });
  assert.equal(actions.canDecideJoin('jr1'), true);
  assert.equal(actions.canDecideJoin('jr2'), false);

  const teacher = makeApp('teacher1');
  teacher.store.setState({
    joinRequests: [
      { id: 'jr1', accountId: 'learner1', academyId: 'acad1', academy: 'Test Academy', status: REQUEST_STATUS.PENDING },
    ],
  });
  assert.equal(teacher.actions.canDecideJoin('jr1'), false);
});
