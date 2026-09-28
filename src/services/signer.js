export function createSignerService({ bus }) {
  function request(payload) {
    return new Promise((resolve) => {
      bus.emit('signer:request', { ...payload, resolve });
    });
  }

  return { request };
}
