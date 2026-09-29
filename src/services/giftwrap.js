// NIP-59 gift wrap: hide the real author and recipient from relay observers.
// A rumor (the record) is sealed and NIP-44 encrypted to the recipient, then
// wrapped and signed by a throwaway key. See docs/architecture/nostr-native.md.
import { finalizeEvent, generateSecretKey } from 'nostr-tools/pure';
import { decrypt as nip44Decrypt, encrypt as nip44Encrypt, getConversationKey } from 'nostr-tools/nip44';

export const GIFT_WRAP_KIND = 1059;
export const SEAL_KIND = 13;
export const RUMOR_KIND = 14;

const TWO_DAYS = 2 * 24 * 60 * 60;

function randomPastTimestamp(now) {
  return now - Math.floor(Math.random() * TWO_DAYS);
}

// Wrap `content` for one recipient. The caller's signer signs the seal as the
// real author; the wrap is signed locally with a random ephemeral key so the
// recipient's external signer is never asked to hold a second key.
export async function wrapForRecipient({ content, recipient, signer, now = Math.floor(Date.now() / 1000) } = {}) {
  if (!content || !recipient || !signer?.signEvent || !signer?.nip44Encrypt) return null;
  const rumor = {
    kind: RUMOR_KIND,
    created_at: randomPastTimestamp(now),
    tags: [],
    content: String(content),
  };
  const seal = await signer.signEvent({
    kind: SEAL_KIND,
    created_at: randomPastTimestamp(now),
    tags: [],
    content: await signer.nip44Encrypt(recipient, JSON.stringify(rumor)),
  });
  const ephemeral = generateSecretKey();
  const wrapped = nip44Encrypt(JSON.stringify(seal), getConversationKey(ephemeral, recipient));
  return finalizeEvent(
    {
      kind: GIFT_WRAP_KIND,
      created_at: randomPastTimestamp(now),
      tags: [['p', recipient]],
      content: wrapped,
    },
    ephemeral,
  );
}

// Unwrap an incoming wrap with the recipient's signer. Returns the sealed rumor
// content and the real author pubkey (from the inner seal), or null.
export async function unwrapGiftWrap({ wrap, signer } = {}) {
  if (!wrap || wrap.kind !== GIFT_WRAP_KIND || !signer?.nip44Decrypt) return null;
  try {
    const seal = JSON.parse(await signer.nip44Decrypt(wrap.pubkey, wrap.content));
    if (!seal || seal.kind !== SEAL_KIND || !seal.pubkey) return null;
    const rumor = JSON.parse(await signer.nip44Decrypt(seal.pubkey, seal.content));
    if (!rumor || typeof rumor.content !== 'string') return null;
    return { content: rumor.content, author: seal.pubkey, createdAt: rumor.created_at ?? null };
  } catch {
    return null;
  }
}

export { nip44Decrypt, nip44Encrypt };
