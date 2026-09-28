import { KIND } from './nostr.js';

export const APP_TAG = 'bitos-education';

export function encodeRecord(type, id, payload = {}) {
  // Protocol fields are authoritative. Domain payloads (for example an
  // academy's `type: "school"`) must not overwrite the record envelope.
  const body = type === 'academy' && payload.type
    ? { ...payload, academyType: payload.type }
    : payload;
  return JSON.stringify({ ...body, v: 1, type, id });
}

export function decodeRecord(content, tags = []) {
  try {
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object') return null;

    // Tags are part of the signed event envelope and are authoritative. Older
    // builds allowed payload fields such as an academy's `type: "school"` to
    // overwrite these values in content, so recover those records here.
    const taggedType = tags.find((tag) => tag[0] === 'type')?.[1] ?? null;
    const taggedAddress = tags.find((tag) => tag[0] === 'd')?.[1] ?? null;
    const addressPrefix = taggedType ? `${taggedType}:` : null;
    const taggedId = addressPrefix && taggedAddress?.startsWith(addressPrefix)
      ? taggedAddress.slice(addressPrefix.length)
      : null;
    const record = {
      ...parsed,
      ...(taggedType ? { type: taggedType } : {}),
      ...(taggedId ? { id: taggedId } : {}),
    };
    return record.type && record.id ? record : null;
  } catch {
    return null;
  }
}

export function recordTags(type, id, { recipients = [], code = null } = {}) {
  const tags = [
    ['d', `${type}:${id}`],
    ['t', APP_TAG],
    ['type', type],
  ];
  if (code) tags.push(['code', String(code).toLowerCase()]);
  for (const recipient of recipients) tags.push(['p', recipient]);
  return tags;
}

export function recordEvent({ type, id, payload, recipients = [] } = {}) {
  return {
    kind: KIND.APP_DATA,
    tags: recordTags(type, id, { recipients }),
    content: encodeRecord(type, id, payload),
  };
}
