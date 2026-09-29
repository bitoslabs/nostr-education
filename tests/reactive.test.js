import assert from 'node:assert/strict';
import test from 'node:test';

import { bindScreen, createReactiveStore } from '../src/core/reactive.js';
import { createStore } from '../src/core/store.js';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

// bindScreen only needs a node-like root: VanJS reads `nodeType` to accept the
// returned node and `isConnected` to decide whether the binding is still live.
// A real element is exercised manually through the prototype.
const fakeRoot = () => ({ nodeType: 1, isConnected: true });

test('createReactiveStore mirrors the initial and every next state', () => {
  const store = createStore({ n: 0, label: 'a' });
  const state = createReactiveStore(store);

  assert.equal(state.val.n, 0);
  assert.equal(state.val.label, 'a');

  store.setState({ n: 1 });
  assert.equal(state.val.n, 1);
  assert.equal(state.val.label, 'a');
  assert.equal(store.getState().n, 1);
});

test('each bridge projects only its own store', () => {
  const first = createReactiveStore(createStore({ n: 1 }));
  const second = createReactiveStore(createStore({ n: 2 }));

  first.val = { n: 9 };
  assert.equal(second.val.n, 2);
});

test('bindScreen renders immediately and re-renders with the new snapshot', async () => {
  const store = createStore({ n: 1 });
  const state = createReactiveStore(store);
  const root = fakeRoot();
  const seen = [];

  const returned = bindScreen(state, root, (snapshot) => {
    seen.push(snapshot.n);
  });

  assert.equal(returned, root);
  assert.deepEqual(seen, [1]);

  store.setState({ n: 2 });
  await tick();
  store.setState({ n: 3 });
  await tick();

  assert.deepEqual(seen, [1, 2, 3]);
});

test('bindScreen stops updating once its root is disconnected', async () => {
  const store = createStore({ n: 0 });
  const state = createReactiveStore(store);
  const root = fakeRoot();
  let renders = 0;

  bindScreen(state, root, () => {
    renders += 1;
  });
  assert.equal(renders, 1);

  store.setState({ n: 1 });
  await tick();
  assert.equal(renders, 2);

  root.isConnected = false;
  store.setState({ n: 2 });
  await tick();
  store.setState({ n: 3 });
  await tick();

  assert.equal(renders, 2);
});
