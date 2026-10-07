// Messaging model.
//
// Conversations are a local index over NIP-17 private messages delivered as
// NIP-59 gift wraps (docs/product-roadmap.md, R3). This module is pure: helpers
// classify and merge a decrypted message into the index; the relay transport
// and store writes live in the app layer.

export const MESSAGE_STATE = Object.freeze({
  LOCAL: 'local',
  SENDING: 'sending',
  SENT: 'sent',
  FAILED: 'failed',
});

export const CONVERSATION_STATUS = Object.freeze({
  ACCEPTED: 'accepted',
  REQUEST: 'request',
  BLOCKED: 'blocked',
});

const MESSAGE_STATES = new Set(Object.values(MESSAGE_STATE));
const CONVERSATION_STATUSES = new Set(Object.values(CONVERSATION_STATUS));

export function normalizeMessage(entry = {}) {
  return {
    id: String(entry.id ?? ''),
    from: entry.from ?? null,
    text: String(entry.text ?? ''),
    state: MESSAGE_STATES.has(entry.state) ? entry.state : MESSAGE_STATE.SENT,
    createdAt: entry.createdAt ?? null,
    readAt: entry.readAt ?? null,
  };
}

export function normalizeConversation(entry = {}) {
  const messages = (entry.messages ?? []).map(normalizeMessage);
  const status = CONVERSATION_STATUSES.has(entry.status)
    ? entry.status
    : CONVERSATION_STATUS.ACCEPTED;
  return {
    id: String(entry.id ?? ''),
    peerId: entry.peerId ?? null,
    status,
    messages,
    updatedAt: entry.updatedAt ?? messages[messages.length - 1]?.createdAt ?? null,
  };
}

export function conversationsForAccount(state, accountId) {
  if (!accountId) return [];
  return state?.conversationsByAccount?.[accountId] ?? [];
}

export function conversationById(list = [], id) {
  return list.find((conversation) => conversation.id === id) ?? null;
}

export function conversationWith(list = [], peerId) {
  return list.find((conversation) => conversation.peerId === peerId) ?? null;
}

export function lastMessage(conversation) {
  const messages = conversation?.messages ?? [];
  return messages.length ? messages[messages.length - 1] : null;
}

export function isUnreadMessage(message, meId) {
  return Boolean(message) && message.from !== meId && !message.readAt;
}

export function unreadMessageCount(list = [], meId) {
  return list.reduce((total, conversation) => {
    if (conversation.status === CONVERSATION_STATUS.BLOCKED) return total;
    return total + (conversation.messages ?? []).filter((message) => isUnreadMessage(message, meId)).length;
  }, 0);
}

export function unreadInConversation(conversation, meId) {
  return (conversation?.messages ?? []).filter((message) => isUnreadMessage(message, meId)).length;
}

export function sortConversations(list = []) {
  return [...list].sort((a, b) => {
    const aAt = new Date(lastMessage(a)?.createdAt ?? a.updatedAt ?? 0).getTime();
    const bAt = new Date(lastMessage(b)?.createdAt ?? b.updatedAt ?? 0).getTime();
    return bAt - aAt;
  });
}

export function sortMessages(list = []) {
  return [...list].sort((a, b) => {
    const aAt = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bAt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return aAt - bAt;
  });
}

function toIsoTimestamp(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return new Date(value * 1000).toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// The message id lives in the client tag so a sender's other devices (and the
// recipient) dedupe the optimistic local copy against the relay echo.
export function clientMessageId(tags = []) {
  const tag = tags.find((entry) => entry[0] === 'client' && entry[1]);
  return tag ? String(tag[1]) : null;
}

// The conversation is keyed by the other party. For an incoming message that is
// the author; for a self-copy (author is me) it is the `p` recipient tag.
export function conversationPeerId({ from, meId, tags = [] } = {}) {
  if (!from) return null;
  if (from !== meId) return from;
  const tag = tags.find((entry) => entry[0] === 'p' && entry[1] && entry[1] !== meId);
  return tag ? String(tag[1]) : null;
}

// Turn a decrypted gift wrap into a normalized message + its conversation peer,
// or null when it is not a usable direct message.
export function incomingMessageFromEvent({ author, tags = [], content, createdAt, eventId } = {}, meId) {
  if (!author || !meId) return null;
  const text = String(content ?? '').trim();
  const id = String(clientMessageId(tags) ?? eventId ?? '');
  if (!text || !id) return null;
  const peerId = conversationPeerId({ from: author, meId, tags });
  if (!peerId || peerId === meId) return null;
  const at = toIsoTimestamp(createdAt);
  const fromMe = author === meId;
  return {
    peerId,
    request: !fromMe,
    message: normalizeMessage({
      id,
      from: author,
      text,
      state: MESSAGE_STATE.SENT,
      createdAt: at,
      // A self-copy is a message I already sent, so it starts read.
      readAt: fromMe ? at : null,
    }),
  };
}

// Merge an incoming message into the conversation index. Dedupes by message id
// so the live subscription and the refresh query cannot double-apply an event.
export function mergeIncomingMessage(list = [], entry = {}) {
  const peerId = entry.peerId;
  const message = normalizeMessage(entry.message ?? {});
  if (!peerId || !message.id) return { list, conversationId: null, changed: false };
  const existing = list.find((conversation) => conversation.peerId === peerId) ?? null;
  if (list.some((conversation) => (conversation.messages ?? []).some((item) => item.id === message.id))) {
    return { list, conversationId: existing?.id ?? null, changed: false };
  }

  if (existing) {
    return {
      list: list.map((conversation) =>
        conversation.id === existing.id
          ? normalizeConversation({
              ...conversation,
              messages: sortMessages([...(conversation.messages ?? []), message]),
              updatedAt: message.createdAt ?? conversation.updatedAt,
            })
          : conversation,
      ),
      conversationId: existing.id,
      changed: true,
    };
  }

  const created = normalizeConversation({
    id: `conv-${peerId}`,
    peerId,
    status: entry.request ? CONVERSATION_STATUS.REQUEST : CONVERSATION_STATUS.ACCEPTED,
    messages: [message],
    updatedAt: message.createdAt,
  });
  return { list: [created, ...list], conversationId: created.id, changed: true };
}
