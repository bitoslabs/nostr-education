export function createStore(initialState = {}) {
  let state = Object.freeze({ ...initialState });
  const listeners = new Set();

  function getState() {
    return state;
  }

  function setState(patch) {
    const next = typeof patch === 'function' ? patch(state) : patch;
    state = Object.freeze({ ...state, ...next });
    listeners.forEach((listener) => listener(state));
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { getState, setState, subscribe };
}
