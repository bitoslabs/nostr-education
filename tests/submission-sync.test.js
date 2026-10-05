import assert from 'node:assert/strict';
import test from 'node:test';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';

import { createActions } from '../src/app/actions.js';
import { createEmitter } from '../src/core/emitter.js';
import { createStore } from '../src/core/store.js';
import { clearRegistry, registerPersona } from '../src/data/personas.js';
import { HOMEWORK_STATUS, SUBMISSION_STATUS } from '../src/domain/classroom.js';

// Gift wrapping encrypts to each recipient's real pubkey, so the fixtures use
// valid keypairs rather than readable placeholder ids.
const owner = getPublicKey(generateSecretKey());
const teacher = getPublicKey(generateSecretKey());
const student = getPublicKey(generateSecretKey());

// Actions build a DOM node for the signer prompt, so provide the minimal
// document surface `el` needs when running under node.
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

function makeApp({ personaId, submissions = [] }) {
  stubDom();
  clearRegistry();
  registerPersona({ id: owner, npub: 'npub1owner', displayName: 'Owner', role: 'owner' });
  registerPersona({ id: teacher, npub: 'npub1teacher', displayName: 'Teacher', role: 'teacher' });
  registerPersona({ id: student, npub: 'npub1student', displayName: 'Student', role: 'student' });

  const published = [];
  const store = createStore({
    personaId,
    accountId: personaId,
    academies: { [owner]: { id: 'acad1', ownerId: owner, name: 'Academy' } },
    classrooms: [
      {
        id: 'room1',
        academyId: 'acad1',
        subjectId: 'sub1',
        name: 'Algebra',
        teacherId: teacher,
        studentIds: [student],
      },
    ],
    homework: [
      {
        id: 'hw1',
        academyId: 'acad1',
        classroomId: 'room1',
        title: 'Vectors',
        status: HOMEWORK_STATUS.PUBLISHED,
        maxScore: 100,
        createdBy: owner,
      },
    ],
    submissions,
    capabilities: [],
    deliveries: [],
    events: [],
    profiles: {},
    assessmentRevisions: [],
  });
  const bus = createEmitter();
  const signer = {
    canSign: () => true,
    canEncrypt: () => true,
    getSigner: () => ({
      nip44Encrypt: async (_pubkey, content) => content,
      signEvent: async (event) => ({ ...event, pubkey: personaId, id: 'signed', sig: 'sig' }),
    }),
  };
  const actions = createActions({
    store,
    bus,
    signer,
    confirm: { ask: async () => true },
    relay: {
      publish: async (event) => {
        published.push(event);
        return { count: 1, total: 1, ok: ['wss://relay.example'] };
      },
    },
  });
  return { store, actions, published };
}

function recipientsOf(published) {
  return published
    .map((event) => event.tags.find((tag) => tag[0] === 'p')?.[1])
    .filter(Boolean);
}

test('a submission reaches the assigned teacher and owner, not just the homework author', async () => {
  const { actions, published } = makeApp({ personaId: student });

  assert.equal(actions.submitHomework({ homeworkId: 'hw1', text: 'my answer' }), true);
  await new Promise((resolve) => setTimeout(resolve, 20));

  const recipients = recipientsOf(published);
  assert.ok(recipients.includes(teacher), `assigned teacher must receive it, got ${recipients.join(', ')}`);
  assert.ok(recipients.includes(owner), 'owner must receive it');
});

test('a score reaches the learner and the grading teacher\'s other devices', async () => {
  const submission = {
    id: 'sub1',
    homeworkId: 'hw1',
    classroomId: 'room1',
    studentId: student,
    version: 1,
    status: SUBMISSION_STATUS.SUBMITTED,
    score: null,
    maxScore: 100,
    feedback: '',
    files: [],
  };
  const { actions, published } = makeApp({ personaId: teacher, submissions: [submission] });

  assert.equal(actions.gradeSubmission({ submissionId: 'sub1', score: 88 }), true);
  await new Promise((resolve) => setTimeout(resolve, 20));

  const recipients = recipientsOf(published);
  assert.ok(recipients.includes(student), 'learner must receive the score');
  assert.ok(
    recipients.includes(teacher),
    `the grader must be addressed so a second device can refetch, got ${recipients.join(', ')}`,
  );
});
