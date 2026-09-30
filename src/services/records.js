import { KIND } from './nostr.js';

export const APP_TAG = 'bitos-education';

// Regular kind:78 events are append-only and must carry an immutable fact.
// Every other record is a mutable head published as addressable kind:30078.
export const HISTORY_RECORD_TYPES = Object.freeze([
  'submission-ver',
  'assessment-rev',
  'homework-rev',
]);

export function isHistoryRecord(type) {
  return HISTORY_RECORD_TYPES.includes(type);
}

export function recordKind(type) {
  return isHistoryRecord(type) ? KIND.APP_DATA_HISTORY : KIND.APP_DATA;
}

export function encodeRecord(type, id, payload = {}) {
  // Protocol fields are authoritative. Domain payloads (for example an
  // academy's `type: "school"`) must not overwrite the record envelope.
  const body = type === 'academy' && payload.type
    ? { ...payload, academyType: payload.type }
    : payload;
  return JSON.stringify({ ...body, v: 1, type, id });
}

export function decodeRecord(content, tags = [], createdAt = null) {
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
    // The raw event's `created_at` (unix seconds) is the authoritative publish
    // time; keep it alongside the payload so the UI can show when the record
    // was actually sent, not when a client happened to write the field.
    const eventTime = Number(createdAt);
    if (Number.isFinite(eventTime) && eventTime > 0) record.eventCreatedAt = eventTime;
    return record.type && record.id ? record : null;
  } catch {
    return null;
  }
}

export function recordTags(type, id, { recipients = [], code = null, head = null } = {}) {
  const tags = [
    ['d', `${type}:${id}`],
    ['t', APP_TAG],
    ['type', type],
  ];
  // History events point at their mutable head so a reader can resolve current
  // state from one event and walk to the history.
  if (isHistoryRecord(type) && head) tags.push(['a', head]);
  if (code) tags.push(['code', String(code).toLowerCase()]);
  for (const recipient of recipients) tags.push(['p', recipient]);
  return tags;
}

export function recordEvent({ type, id, payload, recipients = [], head = null } = {}) {
  return {
    kind: recordKind(type),
    tags: recordTags(type, id, { recipients, head }),
    content: encodeRecord(type, id, payload),
  };
}

// Addressable head address for a history record, e.g.
// `30078:<author>:submission:<submissionId>`.
export function headAddress(headType, id, author) {
  if (!headType || !id || !author) return null;
  return `${KIND.APP_DATA}:${author}:${headType}:${id}`;
}
