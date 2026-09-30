import assert from 'node:assert/strict';
import test from 'node:test';

import { createActions } from '../src/app/actions.js';
import { createEmitter } from '../src/core/emitter.js';
import { createStore } from '../src/core/store.js';
import { clearRegistry, registerPersona } from '../src/data/personas.js';
import { SUBMISSION_STATUS } from '../src/domain/classroom.js';

// gradeSubmission builds a DOM node for the signer prompt before publishing.
function stubDom() {
  if (globalThis.document) return;
  class FakeNode {
    constructor() {
      this.style = {};
      this.dataset = {};
      this.children = [];
      this.className = '';
    }
    setAttribute() {}
    addEventListener() {}
    append(child) {
      this.children.push(child);
    }
  }
  globalThis.Node = FakeNode;
  globalThis.document = {
    createElement: () => new FakeNode(),
    createTextNode: (text) => ({ textContent: String(text) }),
  };
}

function makeApp() {
  stubDom();
  clearRegistry();
  registerPersona({ id: 'teacher1', npub: 'npub1teacher', displayName: 'Teacher', role: 'teacher' });
  registerPersona({ id: 'student1', npub: 'npub1student', displayName: 'Student', role: 'student' });

  const store = createStore({
    personaId: 'teacher1',
    accountId: 'teacher1',
    academies: { owner1: { id: 'acad1', ownerId: 'owner1', name: 'Academy' } },
    classrooms: [
      {
        id: 'room1',
        academyId: 'acad1',
        subjectId: 'sub1',
        name: 'Algebra',
        teacherId: 'teacher1',
        studentIds: ['student1'],
      },
    ],
    homework: [
      { id: 'hw1', classroomId: 'room1', title: 'Vectors', maxScore: 100, status: 'published', createdBy: 'teacher1' },
    ],
    submissions: [
      {
        id: 'sub1',
        classroomId: 'room1',
        homeworkId: 'hw1',
        studentId: 'student1',
        status: SUBMISSION_STATUS.REVISION,
        version: 1,
        maxScore: 100,
        score: null,
      },
    ],
    assessmentRevisions: [
      {
        id: 'a1',
        submissionId: 'sub1',
        homeworkId: 'hw1',
        studentId: 'student1',
        version: 1,
        status: 'finalized',
        score: 70,
        maxScore: 100,
        gradedAt: '2026-09-30T09:00:00.000Z',
      },
      {
        id: 'a2',
        submissionId: 'sub1',
        homeworkId: 'hw1',
        studentId: 'student1',
        version: 2,
        status: 'revision',
        score: null,
        maxScore: 100,
        requestedAt: '2026-09-30T09:30:00.000Z',
        feedback: 'Please redo',
      },
    ],
    deliveries: [],
    events: [],
    capabilities: [],
    profiles: {},
  });
  const bus = createEmitter();
  const actions = createActions({
    store,
    bus,
    signer: { getSigner: () => null, canSign: () => false },
    confirm: { ask: async () => true },
    relay: { publish: async () => ({ count: 0, total: 0, ok: [] }) },
  });
  return { store, actions };
}

test('a re-grade after a revision request gets a fresh version and becomes the score', () => {
  const { store, actions } = makeApp();

  assert.equal(actions.gradeSubmission({ submissionId: 'sub1', score: 88, feedback: 'Better' }), true);

  const state = store.getState();
  const finalized = state.assessmentRevisions
    .filter((entry) => entry.submissionId === 'sub1' && entry.status === 'finalized')
    .sort((a, b) => a.version - b.version);
  assert.equal(finalized.length, 2);
  assert.equal(finalized[1].version, 3, 're-grade must not reuse the revision request version 2');

  const head = state.submissions.find((entry) => entry.id === 'sub1');
  assert.equal(head.score, 88);
  assert.equal(head.status, SUBMISSION_STATUS.GRADED);
  assert.equal(head.assessmentVersion, 3);
});
