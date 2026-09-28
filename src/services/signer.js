export function createSignerService({ bus }) {
  let active = null;

  function setSigner(signer) {
    active = signer;
  }

  function getSigner() {
    return active;
  }

  function canSign() {
    return Boolean(active);
  }

  function canEncrypt() {
    return typeof active?.nip44Encrypt === 'function';
  }

  async function encrypt(pubkey, plaintext) {
    if (!canEncrypt()) throw new Error('The connected signer cannot encrypt (no NIP-44).');
    return active.nip44Encrypt(pubkey, plaintext);
  }

  async function decrypt(pubkey, ciphertext) {
    if (typeof active?.nip44Decrypt !== 'function') {
      throw new Error('The connected signer cannot decrypt (no NIP-44).');
    }
    return active.nip44Decrypt(pubkey, ciphertext);
  }

  function review(payload) {
    return new Promise((resolve) => {
      bus.emit('signer:request', { ...payload, resolve });
    });
  }

  async function request({ title, action, detail, event } = {}) {
    const decision = await review({ title, action, detail });
    if (!decision?.approved) return { approved: false };

    if (!event) return { approved: true };
    if (!active) throw new Error('No signer is connected.');

    const signed = await active.signEvent(event);
    return { approved: true, event: signed };
  }

  return { setSigner, getSigner, canSign, canEncrypt, encrypt, decrypt, request };
}
