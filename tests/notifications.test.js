import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SOCIAL_NOTIFICATION,
  groupSocialNotifications,
  isGroupRead,
  matchesNotificationTab,
  mergeSocialNotifications,
  notificationFromEngagement,
  notificationFromZap,
  notificationReadsFor,
  socialNotificationsFor,
  sortSocialNotifications,
  unreadNotificationCount,
  unreadSocialCount,
} from '../src/domain/notifications.js';
import { ZAP_DIRECTION, ZAP_STATUS } from '../src/domain/wallet.js';

const ME = 'a'.repeat(64);
const PEER = 'b'.repeat(64);
const NOTE = 'c'.repeat(64);

function engagement({ id, kind, pubkey = PEER, content = '', tags = [] }) {
  return {
    id,
    kind,
    pubkey,
    content,
    created_at: 1_700_000_000,
    tags: [['p', ME], ...tags],
  };
}

test('a kind:7 reaction addressed to the viewer projects a like', () => {
  const notification = notificationFromEngagement(
    engagement({ id: 'r1', kind: 7, content: '+', tags: [['e', NOTE]] }),
    ME,
  );
  assert.deepEqual(notification, {
    id: 'r1',
    type: SOCIAL_NOTIFICATION.LIKE,
    actor: PEER,
    eventId: NOTE,
    occurredAt: new Date(1_700_000_000 * 1000).toISOString(),
  });
});

test('a dislike, a self-reaction, and an unrelated event never notify', () => {
  assert.equal(
    notificationFromEngagement(engagement({ id: 'r2', kind: 7, content: '-' }), ME),
    null,
  );
  assert.equal(
    notificationFromEngagement(engagement({ id: 'r3', kind: 7, pubkey: ME, content: '+' }), ME),
    null,
  );
  assert.equal(
    notificationFromEngagement(
      { id: 'r4', kind: 7, pubkey: PEER, content: '+', tags: [['p', 'z'.repeat(64)]] },
      ME,
    ),
    null,
  );
  assert.equal(notificationFromEngagement(engagement({ id: 'r5', kind: 999 }), ME), null);
});

test('a kind:6 repost projects a repost', () => {
  const notification = notificationFromEngagement(
    engagement({ id: 'rp1', kind: 6, content: '{}', tags: [['e', NOTE]] }),
    ME,
  );
  assert.equal(notification.type, SOCIAL_NOTIFICATION.REPOST);
  assert.equal(notification.eventId, NOTE);
});

test('a kind:1 with an e tag is a reply; without one it is a mention with a preview', () => {
  const reply = notificationFromEngagement(
    engagement({ id: 'n1', kind: 1, content: 'nice work', tags: [['e', NOTE]] }),
    ME,
  );
  assert.equal(reply.type, SOCIAL_NOTIFICATION.REPLY);
  assert.equal(reply.preview, 'nice work');

  const mention = notificationFromEngagement(
    engagement({ id: 'n2', kind: 1, content: 'hello there' }),
    ME,
  );
  assert.equal(mention.type, SOCIAL_NOTIFICATION.MENTION);
  assert.equal(mention.eventId, null);
});

test('a kind:3 contact list including the viewer projects a follow', () => {
  const notification = notificationFromEngagement(
    engagement({ id: 'c1', kind: 3, tags: [['p', 'z'.repeat(64)]] }),
    ME,
  );
  assert.equal(notification.type, SOCIAL_NOTIFICATION.FOLLOW);
  assert.equal(notification.eventId, null);
  assert.equal(notification.actor, PEER);
});

test('a long reply preview is collapsed and truncated', () => {
  const long = `hello\n\n${'x'.repeat(400)}`;
  const notification = notificationFromEngagement(
    engagement({ id: 'n3', kind: 1, content: long, tags: [['e', NOTE]] }),
    ME,
  );
  assert.ok(notification.preview.length <= 140);
  assert.ok(notification.preview.endsWith('…'));
  assert.ok(!notification.preview.includes('\n'));
});

test('only an incoming zap from someone else becomes a notification', () => {
  const incoming = notificationFromZap(
    {
      id: 'z1',
      direction: ZAP_DIRECTION.IN,
      status: ZAP_STATUS.SETTLED,
      amountSats: 21,
      peerId: PEER,
      eventId: NOTE,
      createdAt: '2026-10-07T10:00:00.000Z',
    },
    ME,
  );
  assert.deepEqual(incoming, {
    id: 'z1',
    type: SOCIAL_NOTIFICATION.ZAP,
    actor: PEER,
    eventId: NOTE,
    amountSats: 21,
    occurredAt: '2026-10-07T10:00:00.000Z',
  });

  assert.equal(
    notificationFromZap({ id: 'z2', direction: ZAP_DIRECTION.OUT, peerId: PEER, amountSats: 5 }, ME),
    null,
  );
  assert.equal(
    notificationFromZap({ id: 'z3', direction: ZAP_DIRECTION.IN, peerId: ME, amountSats: 5 }, ME),
    null,
  );
});

test('merge dedupes by source id, keeps newest first, and reports a no-op', () => {
  const existing = [{ id: 'old', occurredAt: '2026-10-01T00:00:00.000Z' }];
  const merged = mergeSocialNotifications(existing, [
    { id: 'new', occurredAt: '2026-10-07T00:00:00.000Z' },
    { id: 'old', occurredAt: '2026-10-01T00:00:00.000Z' },
  ]);
  assert.deepEqual(merged.map((entry) => entry.id), ['new', 'old']);

  const again = mergeSocialNotifications(merged, [{ id: 'new', occurredAt: '2026-10-07T00:00:00.000Z' }]);
  assert.equal(again, merged);
  assert.deepEqual(merged, sortSocialNotifications(merged));
});

test('grouping collapses likes on the same note into one "and N others" row', () => {
  const list = [
    { id: 'l1', type: 'like', actor: PEER, eventId: NOTE, occurredAt: '2026-10-07T00:00:00.000Z' },
    { id: 'l2', type: 'like', actor: 'd'.repeat(64), eventId: NOTE, occurredAt: '2026-10-06T00:00:00.000Z' },
    { id: 'l3', type: 'like', actor: 'e'.repeat(64), eventId: 'other', occurredAt: '2026-10-05T00:00:00.000Z' },
  ];
  const groups = groupSocialNotifications(list);
  assert.equal(groups.length, 2);
  const likes = groups.find((group) => group.eventId === NOTE);
  assert.equal(likes.count, 2);
  assert.deepEqual(likes.ids.sort(), ['l1', 'l2']);
  assert.equal(likes.occurredAt, '2026-10-07T00:00:00.000Z');
});

test('grouping keeps zaps and mentions separate and filters by tab', () => {
  const list = [
    { id: 'z1', type: 'zap', actor: PEER, amountSats: 21, occurredAt: '2026-10-07T03:00:00.000Z' },
    { id: 'z2', type: 'zap', actor: PEER, amountSats: 1000, occurredAt: '2026-10-07T02:00:00.000Z' },
    { id: 'm1', type: 'mention', actor: PEER, preview: 'hi', occurredAt: '2026-10-07T01:00:00.000Z' },
    { id: 'n1', type: 'reply', actor: PEER, preview: 'yo', occurredAt: '2026-10-07T00:00:00.000Z' },
  ];
  assert.equal(groupSocialNotifications(list).length, 4);
  assert.deepEqual(
    groupSocialNotifications(list, { tab: 'zap' }).map((group) => group.ids[0]),
    ['z1', 'z2'],
  );
  // Replies are grouped under the Mentions tab with mentions.
  assert.deepEqual(
    groupSocialNotifications(list, { tab: 'mention' }).map((group) => group.ids[0]),
    ['m1', 'n1'],
  );
  assert.equal(matchesNotificationTab({ type: 'like' }, 'mention'), false);
  assert.equal(matchesNotificationTab({ type: 'like' }, 'all'), true);
});

test('a group is read only when every source id is read', () => {
  const group = { ids: ['a', 'b'] };
  assert.equal(isGroupRead({ a: 'ts' }, group), false);
  assert.equal(isGroupRead({ a: 'ts', b: 'ts' }, group), true);
});

test('unread counts include social engagement alongside workflow and messages', () => {
  const state = {
    socialNotificationsByAccount: {
      [ME]: [
        { id: 's1', occurredAt: '2026-10-07T00:00:00.000Z' },
        { id: 's2', occurredAt: '2026-10-06T00:00:00.000Z' },
      ],
    },
    notificationReads: { [ME]: { s1: '2026-10-07T01:00:00.000Z' } },
    events: [],
    conversationsByAccount: {},
  };

  assert.deepEqual(socialNotificationsFor(state, ME), state.socialNotificationsByAccount[ME]);
  assert.deepEqual(notificationReadsFor(state, ME), { s1: '2026-10-07T01:00:00.000Z' });
  assert.equal(unreadSocialCount(state, ME), 1);
  assert.equal(unreadNotificationCount(state, ME), 1);
});
