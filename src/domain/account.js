import { ROLE } from './school.js';

export const SIGNER_TYPES = Object.freeze([
  {
    id: 'extension',
    label: 'Extension (like Alby)',
    sub: 'A separate app holds your key and approves each request.',
  },
  {
    id: 'hardware',
    label: 'Hardware key',
    sub: 'A physical device must be present and unlocked.',
  },
  {
    id: 'remote',
    label: 'Remote signer (bunker)',
    sub: 'Your key stays on a service you control; it signs on your approval.',
  },
  {
    id: 'demo',
    label: 'Demo signer (prototype only)',
    sub: 'Simulated. Never store a real key here.',
  },
]);

export const DEFAULT_SIGNER = 'demo';

export function signerType(id) {
  return SIGNER_TYPES.find((entry) => entry.id === id) ?? SIGNER_TYPES[SIGNER_TYPES.length - 1];
}

export const ROLE_OPTIONS = Object.freeze([
  { id: ROLE.STUDENT, label: 'Learner' },
  { id: ROLE.TEACHER, label: 'Teacher' },
]);

const KEY_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
const NPUB_PATTERN = /^npub1[0-9a-z]{20,}$/;
const NSEC_PATTERN = /^nsec1[0-9a-z]{20,}$/;

function defaultRng() {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.getRandomValues) {
    const bytes = cryptoObj.getRandomValues(new Uint8Array(4));
    return () => bytes[0] / 256;
  }
  return Math.random;
}

export function randomKey(prefix, { length = 58, rng = Math.random } = {}) {
  let payload = '';
  for (let index = 0; index < length; index += 1) {
    payload += KEY_ALPHABET[Math.floor(rng() * KEY_ALPHABET.length)];
  }
  return `${prefix}${payload}`;
}

export function isNsec(value) {
  return NSEC_PATTERN.test(String(value ?? '').trim());
}

export function isNpub(value) {
  return NPUB_PATTERN.test(String(value ?? '').trim());
}

export function isKeyLike(value) {
  return isNsec(value) || isNpub(value);
}

export function maskKey(value) {
  const key = String(value ?? '');
  if (key.length <= 14) return key;
  return `${key.slice(0, 9)}…${key.slice(-4)}`;
}

export function nsecForNpub(npub) {
  return `nsec1${String(npub ?? '').replace(/^npub1/, '')}`;
}

export function slugify(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 16);
}

export function deriveHandle(npub) {
  return `user-${String(npub ?? '').slice(-4)}`;
}

let accountSequence = 0;

export function createDemoIdentity({
  displayName,
  handle,
  npub,
  role = ROLE.STUDENT,
  avatar,
  rng = Math.random,
} = {}) {
  accountSequence += 1;
  const name = String(displayName ?? '').trim() || 'New member';
  const slug = slugify(name) || 'member';
  const key = npub && isNpub(npub) ? String(npub) : randomKey('npub1', { rng });
  return {
    id: `acct-${slug}-${accountSequence}`,
    role,
    displayName: name,
    handle: String(handle ?? '').trim().replace(/^@/, ''),
    avatar: avatar ?? (role === ROLE.TEACHER ? '🧑‍🏫' : '🧑‍🎓'),
    npub: key,
    nsec: nsecForNpub(key),
    verifiedAt: null,
  };
}
