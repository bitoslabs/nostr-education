// Pure NIP helpers for the social layer. Kept free of DOM and network so the
// tag shapes and PoW math are covered by unit tests.
//
// Kinds referenced here (verify against the NIPs before extending):
//   NIP-01  kind 1   note / reply
//   NIP-09  kind 5   deletion request
//   NIP-13           proof of work (nonce tag + leading-zero event id)
//   NIP-18  kind 6   repost
//   NIP-25  kind 7   reaction (like)
//   NIP-57  kind 9734/9735 zap request / receipt

// Number of leading zero bits in a hex event id (NIP-13 difficulty).
export function leadingZeroBits(hex) {
  let bits = 0;
  for (const char of String(hex ?? '')) {
    const nibble = Number.parseInt(char, 16);
    if (Number.isNaN(nibble)) return bits;
    if (nibble === 0) {
      bits += 4;
      continue;
    }
    // Math.clz32(1)=31 … Math.clz32(8)=28 → 3…0 leading zeros in the nibble.
    bits += Math.clz32(nibble) - 28;
    break;
  }
  return bits;
}

export function nonceTarget(event) {
  const tag = (event?.tags ?? []).find((entry) => entry?.[0] === 'nonce');
  const target = Number(tag?.[2]);
  return Number.isFinite(target) && target > 0 ? target : null;
}

// Achieved difficulty for a signed event. The nonce target is only what the
// miner aimed for; the id is the proof, so display the achieved bits.
export function powDifficulty(event) {
  return event?.id ? leadingZeroBits(event.id) : 0;
}

export const REACTION_LIKE = '+';
export const REACTION_DISLIKE = '-';

export function reactionTags(note) {
  return [
    ['e', note.id],
    ['p', note.pubkey],
    ['k', String(note.kind ?? 1)],
  ];
}

// NIP-18 kind 6 repost: content is the reposted event JSON, plus `e`/`p` tags.
export function repostTags(note) {
  return [
    ['e', note.id],
    ['p', note.pubkey],
  ];
}

// NIP-10 reply to a top-level note: mark the same id as both root and reply so
// clients that only read the deprecated positional form and clients that read
// markers both resolve the thread.
export function replyTags(note, { relay = '' } = {}) {
  return [
    ['e', note.id, relay, 'root'],
    ['e', note.id, relay, 'reply'],
    ['p', note.pubkey],
  ];
}
