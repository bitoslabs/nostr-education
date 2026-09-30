import assert from 'node:assert/strict';
import test from 'node:test';

import { createActions } from '../src/app/actions.js';
import { createEmitter } from '../src/core/emitter.js';
import { createStore } from '../src/core/store.js';
import { clearRegistry, registerPersona } from '../src/data/personas.js';
import { INVITE_STATUS } from '../src/domain/academy.js';
import { CAPABILITY } from '../src/domain/capability.js';
import { CLASS_STATUS, classroomsForStudent } from '../src/domain/classroom.js';
import { ROLE } from '../src/domain/school.js';
import { applyRecord } from '../src/domain/records.js';
import { recordEvent } from '../src/services/records.js';

const ACADEMY = { id: 'acad1', name: 'Test Academy', ownerId: 'owner1', orgNpub: 'npub1org' };

function makeApp(status) {
  clearRegistry();
  registerPersona({ id: 'owner1', npub: 'npub1owner', displayName: 'Owner', role: 'owner' });
  registerPersona({ id: 'teacher1', npub: 'npub1teacher', displayName: 'Teacher', role: 'teacher' });
  registerPersona({ id: 'student1', npub: 'npub1student', displayName: 'Student', role: 'student' });

  const store = createStore({
    personaId: 'student1',
    accountId: 'student1',
    academies: { owner1: ACADEMY },
    classrooms: [
      {
        id: 'room1',
        academyId: 'acad1',
        subjectId: 'sub1',
        name: 'Algebra',
        status,
        teacherId: 'teacher1',
        studentIds: [],
      },
    ],
    subjects: [{ id: 'sub1', academyId: 'acad1', name: 'Maths', code: '' }],
    invites: [
      {
        id: 'inv1',
        academyId: 'acad1',
        classroomId: 'room1',
        role: ROLE.STUDENT,
        target: '',
        name: '',
        code: 'classlink',
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
  const toasts = [];
  bus.on('toast', (payload) => toasts.push(payload));
  const actions = createActions({
    store,
    bus,
    signer: { getSigner: () => null, canSign: () => false },
    confirm: { ask: async () => true },
    relay: { publish: async () => ({ count: 0, total: 0, ok: [] }) },
  });
  return { store, actions, toasts };
}

test('a class link enrolls a learner into a published class', async () => {
  const { store, actions } = makeApp(CLASS_STATUS.PUBLISHED);
  assert.equal(await actions.acceptInvite('classlink', { prove: false }), true);
  const state = store.getState();
  assert.deepEqual(state.classrooms[0].studentIds, ['student1']);
  assert.equal(state.memberships.student1, 'active');
  assert.equal(classroomsForStudent(state.classrooms, 'student1', state.capabilities).length, 1);
  assert.ok(
    state.capabilities.some(
      (entry) =>
        entry.kind === CAPABILITY.ENROLLMENT &&
        entry.classroomId === 'room1' &&
        entry.accountId === 'student1',
    ),
    'expected a self-enrollment capability so the roster survives elsewhere',
  );
});

test('lookupInvite fetches a shared class link from relays when the catalog missed it', async () => {
  clearRegistry();
  registerPersona({ id: 'student1', npub: 'npub1student', displayName: 'Student', role: 'student' });

  const event = {
    id: 'ev1',
    pubkey: 'owner1',
    ...recordEvent({
      type: 'joinlink',
      id: 'inv9',
      payload: {
        academyId: 'acad1',
        classroomId: 'room1',
        role: ROLE.STUDENT,
        code: 'sharedcode',
        status: 'pending',
        createdBy: 'owner1',
      },
    }),
  };

  const store = createStore({
    personaId: 'student1',
    accountId: 'student1',
    invites: [],
    classrooms: [],
    academies: {},
    profiles: {},
    events: [],
  });
  const bus = createEmitter();
  const actions = createActions({
    store,
    bus,
    signer: { getSigner: () => null, canSign: () => false },
    confirm: { ask: async () => true },
    relay: {
      subscribe(_filters, { onEvent }) {
        onEvent(event);
        return { close() {} };
      },
    },
  });

  const found = await actions.lookupInvite('sharedcode');
  assert.ok(found, 'expected the relay lookup to resolve the invite');
  const invite = store.getState().invites.find((entry) => entry.id === 'inv9');
  assert.ok(invite);
  assert.equal(invite.classroomId, 'room1');
});

test('an open class link stays reusable for more learners', async () => {
  const { store, actions } = makeApp(CLASS_STATUS.PUBLISHED);
  registerPersona({ id: 'student2', npub: 'npub1student2', displayName: 'Student 2', role: 'student' });

  assert.equal(await actions.acceptInvite('classlink', { prove: false }), true);
  assert.equal(store.getState().invites[0].status, INVITE_STATUS.PENDING);

  store.setState({ personaId: 'student2', accountId: 'student2' });
  assert.equal(await actions.acceptInvite('classlink', { prove: false }), true);

  const state = store.getState();
  assert.deepEqual(state.classrooms[0].studentIds, ['student1', 'student2']);
  assert.equal(state.invites[0].status, INVITE_STATUS.PENDING);
});

test('a targeted invite is consumed after acceptance', async () => {
  const { store, actions } = makeApp(CLASS_STATUS.PUBLISHED);
  store.setState({
    invites: [{ ...store.getState().invites[0], target: 'learner@bitos.id' }],
  });
  assert.equal(await actions.acceptInvite('classlink', { prove: false }), true);
  assert.equal(store.getState().invites[0].status, INVITE_STATUS.ACCEPTED);
});

test('a class link for a draft class enrolls the learner and publishes it locally', async () => {
  const { store, actions } = makeApp(CLASS_STATUS.DRAFT);
  assert.equal(await actions.acceptInvite('classlink', { prove: false }), true);
  const state = store.getState();
  assert.deepEqual(state.classrooms[0].studentIds, ['student1']);
  assert.equal(state.classrooms[0].status, CLASS_STATUS.PUBLISHED);
  assert.equal(classroomsForStudent(state.classrooms, 'student1', state.capabilities).length, 1);
});

test('a stale draft classroom record does not downgrade a published, staffed class', () => {
  const base = {
    classrooms: [{ id: 'room1', academyId: 'acad1', status: CLASS_STATUS.PUBLISHED, teacherId: 'teacher1' }],
  };
  const patch = applyRecord(base, {
    type: 'classroom',
    id: 'room1',
    academyId: 'acad1',
    status: CLASS_STATUS.DRAFT,
    teacherId: null,
  });
  assert.equal(patch.classrooms[0].status, CLASS_STATUS.PUBLISHED);
  assert.equal(patch.classrooms[0].teacherId, 'teacher1');
});
