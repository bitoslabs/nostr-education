import { buildEvent } from './nostr.js';

/* Free public Blossom (BUD-02) servers. Users can switch if one is down. */
export const BLOSSOM_SERVERS = Object.freeze([
  'https://blossom.primal.net',
  'https://blossom.band',
  'https://cdn.sovbit.host',
]);

export const BLOSSOM_UPLOAD_KIND = 24242;

export function normalizeBlossomServer(value) {
  const raw = String(value ?? '').trim().replace(/\/+$/, '');
  if (!raw) return BLOSSOM_SERVERS[0];
  try {
    const url = new URL(raw);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.origin;
  } catch {
    /* fall through to the default */
  }
  return BLOSSOM_SERVERS[0];
}

export async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function base64(bytes) {
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

export function blossomAuthEvent({ sha256, size }) {
  return buildEvent({
    kind: BLOSSOM_UPLOAD_KIND,
    content: 'Upload image',
    tags: [
      ['t', 'upload'],
      ['x', sha256],
      ['size', String(size)],
      ['expiration', String(Math.floor(Date.now() / 1000) + 600)],
    ],
  });
}

export async function uploadBlob({ blob, server, signer, title, action }) {
  const buffer = await blob.arrayBuffer();
  const sha256 = await sha256Hex(buffer);
  const event = blossomAuthEvent({ sha256, size: buffer.byteLength });
  const decision = await signer.request({ event, title, action });
  if (!decision?.approved || !decision.event) return null;

  const authorization = `Nostr ${base64(new TextEncoder().encode(JSON.stringify(decision.event)))}`;
  const origin = normalizeBlossomServer(server);
  const response = await fetch(`${origin}/upload`, {
    method: 'PUT',
    headers: {
      Authorization: authorization,
      'Content-Type': blob.type || 'application/octet-stream',
    },
    body: buffer,
  });
  if (!response.ok) {
    throw new Error(`Blossom upload failed (${response.status}${response.statusText ? ` ${response.statusText}` : ''}).`);
  }
  const descriptor = await response.json().catch(() => null);
  const url = descriptor?.url || `${origin}/${sha256}`;
  return { url, sha256, descriptor };
}
