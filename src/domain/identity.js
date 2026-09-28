const NPUB_PREFIX = 'npub1';
const KEY_HEAD = NPUB_PREFIX.length + 4;
const KEY_TAIL = 4;

export function truncateNpub(npub) {
  if (typeof npub !== 'string' || npub.length <= KEY_HEAD + KEY_TAIL + 1) {
    return npub ?? '';
  }
  return `${npub.slice(0, KEY_HEAD)}…${npub.slice(-KEY_TAIL)}`;
}

export function identityName(identity) {
  return identity.displayName ?? truncateNpub(identity.npub);
}

export function identitySecondary(identity) {
  return identity.handle ?? truncateNpub(identity.npub);
}

export function isVerified(identity) {
  return Boolean(identity.verifiedAt);
}
