export function createConfirmService({ bus }) {
  function confirm({ title, body, confirmLabel = 'Confirm' }) {
    return new Promise((resolve) => {
      bus.emit('confirm:request', { title, body, confirmLabel, resolve });
    });
  }

  return { confirm };
}
