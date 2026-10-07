import { el } from '../../core/dom.js';
import { bindScreen } from '../../core/reactive.js';
import { formatRelative } from '../../core/time.js';
import { getPersona } from '../../data/personas.js';
import { eventKeyOf } from '../../domain/feed.js';
import { identityName } from '../../domain/identity.js';
import {
  CONVERSATION_STATUS,
  conversationsForAccount,
  lastMessage,
  sortConversations,
  unreadInConversation,
} from '../../domain/messaging.js';
import {
  NOTIFICATION_TABS,
  SOCIAL_NOTIFICATION,
  groupSocialNotifications,
  isGroupRead,
  notificationReadsFor,
  socialNotificationsFor,
  workflowNotifications,
} from '../../domain/notifications.js';
import { formatSats } from '../../domain/wallet.js';
import { t } from '../../services/i18n/index.js';
import { eventCard } from '../components/event-card.js';
import { icon } from '../components/icon.js';
import { avatar, emptyState, tabs } from '../components/primitives.js';

// Leading circle icon per engagement kind, tinted like docs/ui.html.
const TYPE_ICON = Object.freeze({
  [SOCIAL_NOTIFICATION.ZAP]: { name: 'lucide:zap', fallback: '⚡' },
  [SOCIAL_NOTIFICATION.LIKE]: { name: 'lucide:heart', fallback: '♥' },
  [SOCIAL_NOTIFICATION.REPOST]: { name: 'lucide:repeat-2', fallback: '🔁' },
  [SOCIAL_NOTIFICATION.FOLLOW]: { name: 'lucide:user-plus', fallback: '＋' },
  [SOCIAL_NOTIFICATION.MENTION]: { name: 'lucide:at-sign', fallback: '@' },
  [SOCIAL_NOTIFICATION.REPLY]: { name: 'lucide:message-circle', fallback: '💬' },
});

export function renderNotifications({ app, state }) {
  const node = el('section', { class: 'screen' });

  function render(snapshot) {
    const meId = snapshot.personaId;
    const reads = notificationReadsFor(snapshot, meId);
    const tab = snapshot.notificationTab ?? 'all';
    const social = socialNotificationsFor(snapshot, meId);
    const groups = groupSocialNotifications(social, { tab });
    const messages =
      tab === 'all'
        ? sortConversations(conversationsForAccount(snapshot, snapshot.accountId)).filter(
            (conversation) =>
              conversation.status !== CONVERSATION_STATUS.BLOCKED &&
              unreadInConversation(conversation, meId) > 0,
          )
        : [];
    const events = tab === 'all' ? workflowNotifications(snapshot, meId) : [];
    // Messages come from accounts whose status is not BLOCKED, so a blocked
    // sender never surfaces a notification (SAFE-01).

    const socialEmpty = () =>
      emptyState(t('notifications.socialEmpty'), {
        icon: 'lucide:bell',
        fallback: '🔔',
        hint: t('notifications.socialEmptyHint'),
      });

    const children = [
      el('header', { class: 'page-head' }, [
        el('div', { class: 'page-head__row' }, [
          el('h1', { class: 'page-title' }, t('notifications.title')),
          // Wrapped in the actions slot so the round button is pushed to the
          // right edge (title left / action right, docs/ui.html).
          el('div', { class: 'page-head__actions' }, markAllButton(app)),
        ]),
        tabs(
          NOTIFICATION_TABS.map((id) => ({ id, label: t('notifications.tabs.' + id) })),
          tab,
          (id) => app.setNotificationTab(id),
          { label: t('notifications.title') },
        ),
      ]),
    ];

    // Nothing to show across the whole inbox: one clear empty state instead of
    // stacked empty sections. A specific tab (Likes, Zaps, …) always renders
    // its own list so the active filter is still visible.
    const hasAny = groups.length || (tab === 'all' && (messages.length || events.length));
    if (!hasAny) {
      children.push(el('div', { class: 'notif-list' }, [socialEmpty()]));
    } else {
      // The social list is redundant on the "all" tab when it has no rows and
      // other sections do — skip it so the screen does not open with a
      // contradictory "nothing here" message above real content.
      if (groups.length || tab !== 'all') {
        children.push(
          el(
            'div',
            { class: 'notif-list' },
            groups.length ? groups.map((group) => notificationRow(group, reads, app)) : [socialEmpty()],
          ),
        );
      }

      if (tab === 'all' && messages.length) {
        children.push(el('h3', { class: 'section-title' }, t('notifications.messagesSection')));
        children.push(el('div', { class: 'notif-list' }, messages.map((c) => messageRow(c, meId, app))));
      }

      if (tab === 'all') {
        children.push(el('h3', { class: 'section-title' }, t('notifications.activitySection')));
        if (events.length) {
          const persona = getPersona(meId);
          for (const event of events) {
            const card = eventCard(event, {
              persona,
              actions: app,
              enrollments: snapshot.enrollRequests,
            });
            const key = eventKeyOf(event);
            if (key && !reads[key]) {
              card.classList.add('is-unread');
              card.addEventListener('click', () => app.markNotificationRead(key));
            }
            children.push(card);
          }
        } else {
          children.push(
            emptyState(t('notifications.empty'), {
              icon: 'lucide:inbox',
              fallback: '📥',
              hint: t('notifications.activityEmptyHint'),
            }),
          );
        }
      }
    }

    node.replaceChildren(...children.filter(Boolean));
  }

  return bindScreen(state, node, render);
}

function markAllButton(app) {
  return el(
    'button',
    {
      class: 'notif-markall',
      type: 'button',
      title: t('notifications.markAllRead'),
      'aria-label': t('notifications.markAllRead'),
      onClick: () => app.markAllNotificationsRead(),
    },
    icon('lucide:check-check', { size: 16, fallback: '✓✓' }),
  );
}

function notificationRow(group, reads, app) {
  const unread = !isGroupRead(reads, group);
  const actors = group.actors.map(getPersona);
  const main = actors[0];
  const extras = actors.slice(1, 3);
  const text = el('span', { class: 'notif-text' }, [
    el('b', {}, identityName(main)),
    group.count > 1 ? el('span', { class: 'notif-text__others' }, ` ${t('notifications.andOthers', { count: group.count - 1 })}`) : null,
    ` ${actionText(group)}`,
    group.type === SOCIAL_NOTIFICATION.ZAP && group.amountSats
      ? el('span', { class: 'notif-text__amount' }, ` · ${t('notifications.sats', { amount: formatCount(group.amountSats) })}`)
      : null,
  ]);

  return el(
    'button',
    {
      class: `notif-item${unread ? ' is-unread' : ''}`,
      type: 'button',
      onClick: () => openGroup(group, app),
    },
    [
      iconBubble(group.type),
      el('span', { class: 'notif-main' }, [
        el('span', { class: 'notif-actors' }, [
          el('span', { class: 'notif-actors__stack' }, [
            avatar(main, 24),
            ...extras.map((actor) => avatar(actor, 24)),
          ]),
          el('span', { class: 'notif-time' }, formatRelative(group.occurredAt) ?? ''),
        ]),
        text,
        group.preview ? el('span', { class: 'notif-preview' }, group.preview) : null,
      ]),
      unread ? el('span', { class: 'notif-dot', 'aria-hidden': 'true' }) : null,
    ],
  );
}

function iconBubble(type) {
  const spec = TYPE_ICON[type] ?? { name: 'lucide:bell', fallback: '🔔' };
  return el('span', { class: `notif-icon notif-icon--${type}` }, [
    icon(spec.name, { size: 16, fallback: spec.fallback }),
  ]);
}

function actionText(group) {
  switch (group.type) {
    case SOCIAL_NOTIFICATION.LIKE:
      return t('notifications.social.like');
    case SOCIAL_NOTIFICATION.REPLY:
      return t('notifications.social.reply');
    case SOCIAL_NOTIFICATION.REPOST:
      return t('notifications.social.repost');
    case SOCIAL_NOTIFICATION.MENTION:
      return t('notifications.social.mention');
    case SOCIAL_NOTIFICATION.ZAP:
      return t('notifications.social.zap', { amount: formatSats(group.amountSats) });
    case SOCIAL_NOTIFICATION.FOLLOW:
      return t('notifications.social.follow');
    default:
      return '';
  }
}

// A row deep-links to its source: the thread for a like/reply/repost/mention,
// the wallet for a zap, the actor's profile for a follow. When the note is not
// loaded locally, fall back to the home feed.
function openGroup(group, app) {
  for (const id of group.ids) app.markNotificationRead(id);
  if (group.type === SOCIAL_NOTIFICATION.FOLLOW) {
    app.openProfile?.(group.actors[0]);
    return;
  }
  if (group.type === SOCIAL_NOTIFICATION.ZAP) {
    app.navigate?.('/wallet');
    return;
  }
  const opened = group.eventId ? app.openThread?.(group.eventId) : null;
  if (!opened) app.navigate?.('/home');
}

function messageRow(conversation, meId, app) {
  const peer = getPersona(conversation.peerId);
  const last = lastMessage(conversation);
  return el(
    'button',
    {
      class: 'notif-item is-unread',
      type: 'button',
      onClick: () => {
        app.setActiveConversation(conversation.id);
        app.navigate('/messages');
      },
    },
    [
      el('span', { class: 'notif-icon notif-icon--message' }, [
        icon('lucide:message-circle', { size: 16, fallback: '💬' }),
      ]),
      el('span', { class: 'notif-main' }, [
        el('span', { class: 'notif-actors' }, [
          el('span', { class: 'notif-actors__stack' }, avatar(peer, 24)),
          el('span', { class: 'notif-time' }, formatRelative(last?.createdAt) ?? ''),
        ]),
        el('span', { class: 'notif-text' }, [
          el('b', {}, identityName(peer)),
          ` ${t('notifications.sentMessage')}`,
        ]),
        last?.text ? el('span', { class: 'notif-preview' }, last.text) : null,
      ]),
      el('span', { class: 'notif-dot', 'aria-hidden': 'true' }),
    ],
  );
}

function formatCount(value) {
  const total = Number(value) || 0;
  if (total < 1000) return String(total);
  if (total < 1000000) return `${trimZero(total / 1000)}k`;
  return `${trimZero(total / 1000000)}m`;
}

function trimZero(value) {
  const digits = value < 10 ? 1 : 0;
  return value.toFixed(digits).replace(/\.0$/, '');
}
