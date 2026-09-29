import van from 'vanjs-core';

export { van };
export default van;

/**
 * Mirror the frozen app store into a VanJS state. Screens read `state.val` and
 * VanJS re-runs the bindings that touched it, so screens no longer subscribe
 * and call `replaceChildren` by hand.
 *
 * The store keeps ownership of state; this is a read-only projection. Route
 * changes flow through here too, because the router writes `route` to the store.
 */
export function createReactiveStore(store) {
  const snapshot = van.state(store.getState());
  store.subscribe((next) => {
    snapshot.val = next;
  });
  return snapshot;
}

/**
 * Bind an imperative screen to the reactive snapshot. `render(snapshot)` owns
 * `root` and is re-run whenever the store changes, replacing the manual
 * `store.subscribe(render)`. VanJS keeps the binding only while `root` is
 * connected, so navigating away disposes it. Returns `root` for convenience.
 *
 * Screens that also need teardown for non-store resources (timers, theme
 * subscriptions) keep receiving `scope` for those.
 */
export function bindScreen(state, root, render) {
  van.hydrate(root, () => {
    render(state.val);
    return root;
  });
  return root;
}
