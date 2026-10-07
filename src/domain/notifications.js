// Notification inbox helpers.
//
// Notifications are a projection over committed sources: workflow events,
// direct messages, and public engagement on the viewer's own notes (reactions,
// replies, reposts, and zaps). Marking one read is a local, per-person
// preference: it never mutates the source record or grants authority
// (docs/product-roadmap.md, Notification envelope).

import { eventKeyOf, isVisible } from './feed.js';
import { conversationsForAccount, unreadMessageCount } from './messaging.js';
import { ZAP_DIRECTION } from './wallet.js';

// NIP-01 kind 1 note/reply, NIP-02 kind 3 contact list, NIP-18 kind 6 repost,
// NIP-25 kind 7 reaction. Kept local so this pure module stays free of the
// platform service layer.
const KIND_NOTE = 1;
const KIND_CONTACT = 3;
const KIND_REPOST = 6;
const KIND_REACTION = 7;

const PREVIEW_LIMIT = 140;

// Categories of engagement that can notify the author of a note. The value is
// also the i18n key suffix (notifications.social.<type>).
export const SOCIAL_NOTIFICATION = Object.freeze({
  LIKE: 'like',
  REPLY: 'reply',
  REPOST: 'repost',
  MENTION: 'mention',
  ZAP: 'zap',
  FOLLOW: 'follow',
});

// Inbox filters shown as tabs (docs/ui.html, Notifications). Each id maps to a
// set of engagement types; `all` matches everything.
export const NOTIFICATION_TABS = Object.freeze(['all', 'zap', 'mention', 'repost', 'like', 'follow']);

const TAB_TYPES = Object.freeze({
  zap: new Set([SOCIAL_NOTIFICATION.ZAP]),
  mention: new Set([SOCIAL_NOTIFICATION.MENTION, SOCIAL_NOTIFICATION.REPLY]),
  repost: new Set([SOCIAL_NOTIFICATION.REPOST]),
  like: new Set([SOCIAL_NOTIFICATION.LIKE]),
  follow: new Set([SOCIAL_NOTIFICATION.FOLLOW]),
});

export function matchesNotificationTab(notification, tab) {
  if (!tab || tab === 'all') return true;
  const types = TAB_TYPES[tab];
  return types ? types.has(notification?.type) : true;
}

export function notificationReadsFor(state, personaId) {
  if (!personaId) return {};
  return state?.notificationReads?.[personaId] ?? {};
}

export function workflowNotifications(state, personaId) {
  return (state?.events ?? []).filter(
    (event) => event.type !== 'social' && isVisible(event, personaId),
  );
}

export function isWorkflowRead(reads, event) {
  const key = eventKeyOf(event);
  return Boolean(key) && Boolean(reads?.[key]);
}

export function unreadWorkflowCount(state, personaId) {
  const reads = notificationReadsFor(state, personaId);
  return workflowNotifications(state, personaId).filter((event) => !isWorkflowRead(reads, event)).length;
}

// ---- Social engagement notifications -------------------------------------
//
// One row per committed public engagement event addressed to the viewer as the
// note author. The signed engagement event is the source; `actor` is the person
// who acted and `eventId` the note they acted on, so the row can deep-link.

export function socialNotificationsFor(state, personaId) {
  if (!personaId) return [];
  return state?.socialNotificationsByAccount?.[personaId] ?? [];
}

export function notificationKeyOf(notification) {
  return notification?.eventKey ?? notification?.id ?? null;
}

export function isNotificationRead(reads, notification) {
  const key = notificationKeyOf(notification);
  return Boolean(key) && Boolean(reads?.[key]);
}

export function unreadSocialCount(state, personaId) {
  const reads = notificationReadsFor(state, personaId);
  return socialNotificationsFor(state, personaId).filter(
    (notification) => !isNotificationRead(reads, notification),
  ).length;
}

export function unreadNotificationCount(state, personaId) {
  const messages = unreadMessageCount(conversationsForAccount(state, personaId), personaId);
  return unreadWorkflowCount(state, personaId) + unreadSocialCount(state, personaId) + messages;
}

// Project one public engagement event into a notification for the note author.
// Returns null when the event is not addressed to `personaId`, is authored by
// them (no self-notification), or is not an engagement kind the inbox knows.
export function notificationFromEngagement(event, personaId) {
  if (!event?.id || !personaId) return null;
  if (event.pubkey === personaId) return null;
  const tags = Array.isArray(event.tags) ? event.tags : [];
  // The `p` tag addresses the note author. Confirming it here means a relay
  // match or a forged tag can never notify an unrelated viewer.
  if (!tags.some((tag) => tag?.[0] === 'p' && tag[1] === personaId)) return null;

  const kind = Number(event.kind);
  if (![KIND_NOTE, KIND_CONTACT, KIND_REPOST, KIND_REACTION].includes(kind)) return null;

  const targetId = tags.find((tag) => tag?.[0] === 'e')?.[1] ?? null;
  const base = {
    id: String(event.id),
    actor: event.pubkey,
    eventId: targetId,
    occurredAt: isoFromCreatedAt(event.created_at),
  };

  // NIP-02 contact list that now includes the viewer: a new follow.
  if (kind === KIND_CONTACT) {
    return { ...base, type: SOCIAL_NOTIFICATION.FOLLOW };
  }
  if (kind === KIND_REACTION) {
    if (event.content === '-') return null; // a dislike, not a like
    return { ...base, type: SOCIAL_NOTIFICATION.LIKE };
  }
  if (kind === KIND_REPOST) {
    return { ...base, type: SOCIAL_NOTIFICATION.REPOST };
  }
  // Kind 1 with an `e` tag is a reply/comment; without one it is a mention.
  return {
    ...base,
    type: targetId ? SOCIAL_NOTIFICATION.REPLY : SOCIAL_NOTIFICATION.MENTION,
    preview: previewOf(event.content),
  };
}

// A settled incoming zap receipt is an engagement notification, reusing the
// normalized wallet entry so the amount and sender are already resolved.
export function notificationFromZap(zap, personaId) {
  if (!zap?.id || !personaId) return null;
  if (zap.direction !== ZAP_DIRECTION.IN) return null;
  const peer = zap.peerId ?? null;
  if (!peer || peer === personaId) return null;
  return {
    id: String(zap.id),
    type: SOCIAL_NOTIFICATION.ZAP,
    actor: peer,
    eventId: zap.eventId ?? null,
    amountSats: Number(zap.amountSats) || 0,
    occurredAt: zap.createdAt ?? new Date().toISOString(),
  };
}

// Insert engagements, deduping by source event id and keeping newest first.
// Returns the original list unchanged when nothing new arrived so callers can
// detect a no-op and skip a store write.
export function mergeSocialNotifications(list = [], incoming = []) {
  const additions = (Array.isArray(incoming) ? incoming : [incoming]).filter((entry) => entry?.id);
  if (!additions.length) return list ?? [];
  const current = list ?? [];
  const seen = new Set(current.map((entry) => entry.id));
  const fresh = additions.filter((entry) => !seen.has(entry.id));
  if (!fresh.length) return current;
  return sortSocialNotifications([...fresh, ...current]);
}

export function sortSocialNotifications(list = []) {
  return [...list].sort(
    (left, right) =>
      (Date.parse(right.occurredAt ?? '') || 0) - (Date.parse(left.occurredAt ?? '') || 0) ||
      String(right.id).localeCompare(String(left.id)),
  );
}

// Collapse repeat engagement of the same kind on the same note into one row
// ("X and N others liked your note"), matching docs/ui.html. Zaps, mentions,
// and replies stay separate because each carries its own amount or text.
// Ids are retained so a click can mark the whole row read.
export function groupSocialNotifications(list = [], { tab = 'all' } = {}) {
  const groups = new Map();
  for (const notification of list) {
    if (!notification?.id || !matchesNotificationTab(notification, tab)) continue;
    const key = groupKeyOf(notification);
    const group = groups.get(key);
    if (group) {
      group.ids.push(notification.id);
      if (notification.actor && !group.actors.includes(notification.actor)) {
        group.actors.push(notification.actor);
      }
      if ((Date.parse(notification.occurredAt ?? '') || 0) > (Date.parse(group.occurredAt ?? '') || 0)) {
        group.occurredAt = notification.occurredAt;
      }
    } else {
      groups.set(key, {
        key,
        type: notification.type,
        actors: notification.actor ? [notification.actor] : [],
        eventId: notification.eventId ?? null,
        occurredAt: notification.occurredAt ?? null,
        amountSats: notification.amountSats ?? 0,
        preview: notification.preview ?? '',
        ids: [notification.id],
      });
    }
  }
  return [...groups.values()]
    .map((group) => ({ ...group, count: group.actors.length || 1 }))
    .sort(
      (left, right) =>
        (Date.parse(right.occurredAt ?? '') || 0) - (Date.parse(left.occurredAt ?? '') || 0) ||
        String(right.key).localeCompare(String(left.key)),
    );
}

export function isGroupRead(reads, group) {
  const ids = group?.ids ?? [];
  return ids.length > 0 && ids.every((id) => Boolean(reads?.[id]));
}

function groupKeyOf(notification) {
  if (
    notification.type === SOCIAL_NOTIFICATION.LIKE ||
    notification.type === SOCIAL_NOTIFICATION.REPOST
  ) {
    return `${notification.type}:${notification.eventId ?? ''}`;
  }
  if (notification.type === SOCIAL_NOTIFICATION.FOLLOW) return 'follow';
  return `${notification.type}:${notification.id}`;
}

function isoFromCreatedAt(createdAt) {
  const seconds = Number(createdAt);
  return Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds * 1000).toISOString()
    : new Date().toISOString();
}

function previewOf(content) {
  const text = String(content ?? '').replace(/\s+/g, ' ').trim();
  return text.length > PREVIEW_LIMIT ? `${text.slice(0, PREVIEW_LIMIT - 1)}…` : text;
}
