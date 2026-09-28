import { KIND } from './nostr.js';

export const APP_TAG = 'bitos-education';

export function encodeRecord(type, id, payload = {}) {
  return JSON.stringify({ v: 1, type, id, ...payload });
}

export function decodeRecord(content) {
  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === 'object' && parsed.type && parsed.id ? parsed : null;
  } catch {
    return null;
  }
}

export function recordTags(type, id, { recipients = [] } = {}) {
  const tags = [
    ['d', `${type}:${id}`],
    ['t', APP_TAG],
    ['type', type],
  ];
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
