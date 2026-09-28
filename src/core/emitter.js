export function createEmitter() {
  const listeners = new Map();

  function on(type, handler) {
    const handlers = listeners.get(type) ?? new Set();
    handlers.add(handler);
    listeners.set(type, handlers);
    return () => off(type, handler);
  }

  function off(type, handler) {
    listeners.get(type)?.delete(handler);
  }

  function emit(type, payload) {
    listeners.get(type)?.forEach((handler) => handler(payload));
  }

  return { on, off, emit };
}
