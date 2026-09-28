import { nip05Url, splitNip05 } from '../domain/nip05.js';
import { encodeNpub } from './nostr.js';

export async function resolveNip05(identifier, { fetchImpl, timeoutMs = 4000 } = {}) {
  const parts = splitNip05(identifier);
  const url = nip05Url(identifier);
  const doFetch = fetchImpl ?? (typeof fetch === 'function' ? fetch : null);
  if (!parts || !url || !doFetch) return null;

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await doFetch(url, controller ? { signal: controller.signal } : undefined);
    if (!response?.ok) return null;
    const data = await response.json();
    const pubkey = data?.names?.[parts.name];
    if (!pubkey || typeof pubkey !== 'string') return null;
    return { identifier: parts.identifier, pubkey, npub: encodeNpub(pubkey) };
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
