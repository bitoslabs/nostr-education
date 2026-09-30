import assert from 'node:assert/strict';
import test from 'node:test';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';

import { createActions } from '../src/app/actions.js';
import { createEmitter } from '../src/core/emitter.js';
import { createStore } from '../src/core/store.js';
import { clearRegistry, registerPersona } from '../src/data/personas.js';
import { CAPABILITY, createCapability } from '../src/domain/capability.js';
import { HOMEWORK_STATUS } from '../src/domain/classroom.js';

// Gift wrapping encrypts to each recipient's real pubkey, so the fixtures use
// valid keypairs rather than readable placeholder ids.
const teacher = getPublicKey(generateSecretKey());
const linked = getPublicKey(generateSecretKey());
const roster = getPublicKey(generateSecretKey());

// The lifecycle action builds a DOM node for the signer prompt, so provide the
// minimal document surface `el` needs when running under node.
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
  registerPersona({ id: teacher, npub: 'npub1teacher', displayName: 'Teacher', role: 'teacher' });
  registerPersona({ id: linked, npub: 'npub1linked', displayName: 'Linked', role: 'student' });
  registerPersona({ id: roster, npub: 'npub1roster', displayName: 'Roster', role: 'student' });

  const published = [];
  const store = createStore({
    personaId: teacher,
    accountId: teacher,
    academies: { owner1: { id: 'acad1', ownerId: 'owner1', name: 'Academy' } },
    classrooms: [
      {
        id: 'room1',
        academyId: 'acad1',
        subjectId: 'sub1',
        name: 'Algebra',
        teacherId: teacher,
        studentIds: [roster],
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
        createdBy: teacher,
      },
    ],
    capabilities: [
      createCapability({
        kind: CAPABILITY.ENROLLMENT,
        academyId: 'acad1',
        accountId: linked,
        classroomId: 'room1',
        role: 'student',
        issuedBy: linked,
      }),
    ],
    deliveries: [],
    events: [],
    profiles: {},
  });
  const bus = createEmitter();
  const signer = {
    canSign: () => true,
    getSigner: () => ({
      nip44Encrypt: async (_pubkey, content) => content,
      signEvent: async (event) => ({ ...event, pubkey: teacher, id: 'signed', sig: 'sig' }),
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

test('closing homework reaches link-enrolled learners, not just studentIds', async () => {
  const { store, actions, published } = makeApp();

  assert.equal(actions.closeHomework('hw1'), true);
  assert.equal(store.getState().homework[0].status, HOMEWORK_STATUS.CLOSED);

  // The close is gift-wrapped per recipient; let the async publish settle.
  await new Promise((resolve) => setTimeout(resolve, 20));
  const recipients = recipientsOf(published);
  assert.ok(recipients.includes(teacher), 'teacher should be notified');
  assert.ok(recipients.includes(roster), 'roster student should be notified');
  assert.ok(
    recipients.includes(linked),
    `capability-enrolled learner must receive the close, got ${recipients.join(', ')}`,
  );
});
