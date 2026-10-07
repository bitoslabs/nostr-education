// NIP-59 gift wrap: hide the real author and recipient from relay observers.
// A rumor (the record) is sealed and NIP-44 encrypted to the recipient, then
// wrapped and signed by a throwaway key. See docs/architecture/nostr-native.md.
import { finalizeEvent, generateSecretKey } from 'nostr-tools/pure';
import { decrypt as nip44Decrypt, encrypt as nip44Encrypt, getConversationKey } from 'nostr-tools/nip44';

export const GIFT_WRAP_KIND = 1059;
export const SEAL_KIND = 13;
// NIP-17 private direct message: the rumor kind a chat transport expects.
export const RUMOR_KIND = 14;
// Application records are not chat, so they travel inside a distinct rumor
// kind. The kind lives inside the seal (encrypted to the recipient) and never
// reaches relay filters; it exists so a decrypted gift wrap can be classified
// without trusting the message body.
export const RECORD_RUMOR_KIND = 30078;

const TWO_DAYS = 2 * 24 * 60 * 60;

function randomPastTimestamp(now) {
  return now - Math.floor(Math.random() * TWO_DAYS);
}

// Wrap `content` for one recipient. The caller's signer signs the seal as the
// real author; the wrap is signed locally with a random ephemeral key so the
// recipient's external signer is never asked to hold a second key.
//
// Per NIP-59 only the inner rumor carries the real timestamp; the seal and wrap
// timestamps are deliberately randomized to blunt timing analysis.
export async function wrapForRecipient({
  content,
  recipient,
  signer,
  kind = RUMOR_KIND,
  tags = [],
  now = Math.floor(Date.now() / 1000),
} = {}) {
  if (!content || !recipient || !signer?.signEvent || !signer?.nip44Encrypt) return null;
  const rumor = {
    kind,
    created_at: now,
    tags: Array.isArray(tags) ? tags : [],
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
    return {
      content: rumor.content,
      author: seal.pubkey,
      createdAt: rumor.created_at ?? null,
      kind: rumor.kind ?? RUMOR_KIND,
      tags: Array.isArray(rumor.tags) ? rumor.tags : [],
    };
  } catch {
    return null;
  }
}

export { nip44Decrypt, nip44Encrypt };
