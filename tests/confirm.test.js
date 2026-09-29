import assert from 'node:assert/strict';
import test from 'node:test';

import { createActions } from '../src/app/actions.js';
import { createEmitter } from '../src/core/emitter.js';
import { createStore } from '../src/core/store.js';

function makeActions(confirm, initial = {}) {
  const store = createStore({ authed: true, route: '/home', ...initial });
  const bus = createEmitter();
  const toasts = [];
  bus.on('toast', (payload) => toasts.push(payload));
  const actions = createActions({
    store,
    bus,
    signer: { getSigner: () => null, setSigner: () => {} },
    confirm,
    relay: { publish: async () => true },
  });
  return { store, actions, toasts };
}

test('signOut asks the confirm service before clearing the session', async () => {
  let asked = null;
  const { store, actions } = makeActions(async (request) => {
    asked = request;
    return false;
  });

  const result = await actions.signOut();

  assert.equal(result, false);
  assert.equal(asked.title, 'Sign out?');
  assert.equal(asked.confirmLabel, 'Sign out');
  assert.equal(store.getState().authed, true, 'cancelling keeps the session');
});

test('the confirm service object shape is accepted', async () => {
  const { actions } = makeActions({ confirm: async () => false });
  assert.equal(await actions.signOut(), false);
});
