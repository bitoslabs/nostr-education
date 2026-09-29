import { finalizeEvent, generateSecretKey, getPublicKey, verifyEvent } from 'nostr-tools/pure';
import { decode, npubEncode, nsecEncode } from 'nostr-tools/nip19';
import { decrypt as nip44Decrypt, encrypt as nip44Encrypt, getConversationKey } from 'nostr-tools/nip44';
import { BunkerSigner } from 'nostr-tools/nip46';

export const DEFAULT_RELAYS = Object.freeze([
  'wss://nostr-01.yakihonne.com',
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
]);

export const KIND = Object.freeze({
  PROFILE: 0,
  NOTE: 1,
  // NIP-78: kind 78 is a regular event (append-only), kind 30078 is addressable
  // (latest value wins by `d`). Immutable coursework history uses 78; mutable
  // heads use 30078.
  APP_DATA_HISTORY: 78,
  APP_DATA: 30078,
  CREDENTIAL: 30080,
});

export function generateKeyPair() {
  const secretKey = generateSecretKey();
  const pubkey = getPublicKey(secretKey);
  return { secretKey, pubkey, npub: npubEncode(pubkey), nsec: nsecEncode(secretKey) };
}

export function publicKeyFromSecret(secretKey) {
  return getPublicKey(secretKey);
}

export function backupNsecForPubkey(secretKey, expectedPubkey) {
  if (!secretKey || !expectedPubkey) return null;
  try {
    return getPublicKey(secretKey) === expectedPubkey ? nsecEncode(secretKey) : null;
  } catch {
    return null;
  }
}

export function encodeNpub(pubkey) {
  try {
    return npubEncode(pubkey);
  } catch {
    return String(pubkey ?? '');
  }
}

export function encodeNsec(secretKey) {
  try {
    return nsecEncode(secretKey);
  } catch {
    return '';
  }
}

export function decodeKey(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (/^[0-9a-f]{64}$/i.test(raw)) return { type: 'pubkey', pubkey: raw.toLowerCase() };

  try {
    const { type, data } = decode(raw);
    if (type === 'npub') return { type: 'npub', pubkey: data };
    if (type === 'nsec') return { type: 'nsec', secretKey: data, pubkey: getPublicKey(data) };
    if (type === 'nprofile') return { type: 'nprofile', pubkey: data.pubkey, relays: data.relays ?? [] };
    return null;
  } catch {
    return null;
  }
}

export function hasExtension() {
  return typeof window !== 'undefined' && Boolean(window.nostr?.signEvent);
}

export async function extensionPublicKey() {
  if (!hasExtension()) throw new Error('No Nostr extension (NIP-07) is available.');
  return window.nostr.getPublicKey();
}

export async function extensionSignEvent(event) {
  if (!hasExtension()) throw new Error('No Nostr extension (NIP-07) is available.');
  return window.nostr.signEvent(event);
}

export function buildEvent({ kind, content = '', tags = [], createdAt } = {}) {
  return {
    kind,
    created_at: createdAt ?? Math.floor(Date.now() / 1000),
    tags,
    content,
  };
}

export function localSigner(secretKey) {
  return {
    method: 'local',
    async getPublicKey() {
      return getPublicKey(secretKey);
    },
    async signEvent(event) {
      return finalizeEvent(event, secretKey);
    },
    async nip44Encrypt(pubkey, plaintext) {
      return nip44Encrypt(plaintext, getConversationKey(secretKey, pubkey));
    },
    async nip44Decrypt(pubkey, ciphertext) {
      return nip44Decrypt(ciphertext, getConversationKey(secretKey, pubkey));
    },
    async close() {},
  };
}

export function extensionSigner() {
  return {
    method: 'extension',
    getPublicKey: extensionPublicKey,
    signEvent: extensionSignEvent,
    async nip44Encrypt(pubkey, plaintext) {
      if (!window.nostr?.nip44?.encrypt) throw new Error('This extension does not support NIP-44.');
      return window.nostr.nip44.encrypt(pubkey, plaintext);
    },
    async nip44Decrypt(pubkey, ciphertext) {
      if (!window.nostr?.nip44?.decrypt) throw new Error('This extension does not support NIP-44.');
      return window.nostr.nip44.decrypt(pubkey, ciphertext);
    },
    async close() {},
  };
}

export async function connectBunkerSigner({ clientSecretKey, uri, pool, onAuth }) {
  const signer = await BunkerSigner.fromURI(clientSecretKey, uri, {
    ...(pool ? { pool } : {}),
    ...(onAuth ? { onauth: onAuth } : {}),
  });
  await signer.getPublicKey();
  return signer;
}

export function verify(event) {
  return verifyEvent(event);
}

export { finalizeEvent, generateSecretKey, getPublicKey };
