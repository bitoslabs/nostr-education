import { verifyEvent } from 'nostr-tools/pure';

const FRESHNESS_SECONDS = 60;

export async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(String(text ?? ''));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function tagValue(event, name) {
  return (event.tags ?? []).find((tag) => tag[0] === name)?.[1];
}

/*
  NIP-98 HTTP auth: `Authorization: Nostr <base64(kind 27235 event)>`.
  Verifies signature, kind, url, method, optional body hash, and freshness.
*/
export async function verifyNip98({ header, url, method, body, now = Date.now() } = {}) {
  const token = String(header ?? '').trim().replace(/^nostr\s+/i, '');
  if (!token) return { ok: false, reason: 'missing' };

  let event;
  try {
    event = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (event?.kind !== 27235) return { ok: false, reason: 'kind' };
  if (!verifyEvent(event)) return { ok: false, reason: 'signature' };
  if (tagValue(event, 'u') !== url) return { ok: false, reason: 'url' };
  if (String(tagValue(event, 'method') ?? '').toUpperCase() !== String(method ?? '').toUpperCase()) {
    return { ok: false, reason: 'method' };
  }
  if (body) {
    const expected = tagValue(event, 'payload');
    if (expected !== (await sha256Hex(body))) return { ok: false, reason: 'payload' };
  }
  const ageSeconds = Math.abs(now / 1000 - Number(event.created_at ?? 0));
  if (!Number.isFinite(ageSeconds) || ageSeconds > FRESHNESS_SECONDS) {
    return { ok: false, reason: 'stale' };
  }
  return { ok: true, pubkey: event.pubkey, event };
}
