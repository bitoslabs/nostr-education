import { decode } from 'nostr-tools/nip19';
import { ROLE } from './school.js';

export const SIGNER_TYPES = Object.freeze([
  {
    id: 'local',
    label: 'This device',
    sub: 'Your key is stored in this browser and signs every request here.',
  },
  {
    id: 'extension',
    label: 'Browser extension (NIP-07)',
    sub: 'An extension such as Alby holds your key and signs each request.',
  },
  {
    id: 'bunker',
    label: 'Remote signer (NIP-46)',
    sub: 'A bunker service signs on your approval; your key never leaves it.',
  },
]);

export const DEFAULT_SIGNER = 'local';

export function signerType(id) {
  return SIGNER_TYPES.find((entry) => entry.id === id) ?? SIGNER_TYPES[0];
}

export const ROLE_OPTIONS = Object.freeze([
  { id: ROLE.STUDENT, label: 'Learner' },
  { id: ROLE.TEACHER, label: 'Teacher' },
  { id: ROLE.OWNER, label: 'Owner' },
]);

const HEX_PUBKEY = /^[0-9a-f]{64}$/i;

export function keyType(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (HEX_PUBKEY.test(raw)) return 'pubkey';
  try {
    return decode(raw).type;
  } catch {
    return null;
  }
}

export function isNpub(value) {
  return keyType(value) === 'npub';
}

export function isNsec(value) {
  return keyType(value) === 'nsec';
}

export function isKeyLike(value) {
  const type = keyType(value);
  return type === 'npub' || type === 'nsec' || type === 'nprofile' || type === 'pubkey';
}

export function maskKey(value) {
  const key = String(value ?? '');
  if (key.length <= 14) return key;
  return `${key.slice(0, 9)}…${key.slice(-4)}`;
}
