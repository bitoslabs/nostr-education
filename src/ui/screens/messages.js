import { el } from '../../core/dom.js';
import { bindScreen } from '../../core/reactive.js';
import { formatRelative } from '../../core/time.js';
import { getPersona } from '../../data/personas.js';
import { identitySecondary } from '../../domain/identity.js';
import {
  CONVERSATION_STATUS,
  MESSAGE_STATE,
  conversationById,
  conversationsForAccount,
  lastMessage,
  sortConversations,
  unreadInConversation,
} from '../../domain/messaging.js';
import { t } from '../../services/i18n/index.js';
import { icon } from '../components/icon.js';
import { avatar, button, iconButton, pageTitle } from '../components/primitives.js';
import { statusBadge } from '../components/status-badge.js';

export function renderMessages({ app, state }) {
  const node = el('section', { class: 'screen messages-screen' });
  const layout = el('div', { class: 'msg-layout' });
  const listEl = el('div', { class: 'msg-list', 'aria-label': t('messages.a11y.list') });
  const threadEl = el('div', { class: 'msg-thread' });

  // The composer is built once so a draft survives the store re-renders that
  // follow send/mark-read; only the list and thread are rebuilt.
  const input = el('textarea', {
    class: 'msg-compose__input',
    rows: '1',
    placeholder: t('messages.placeholder'),
    'aria-label': t('messages.bodyLabel'),
  });
  const form = el('form', { class: 'msg-compose' }, [
    iconButton('lucide:paperclip', {
      label: t('messages.attach'),
      fallback: '📎',
      onClick: () => app.stub(t('messages.attachSoon')),
    }),
    input,
    button(t('messages.send'), { variant: 'gold', small: true, type: 'submit' }),
  ]);
  // The thread currently on screen. On desktop the newest conversation is
  // previewed when none is explicitly selected, so the pane is never empty.
  let currentThreadId = null;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text || !currentThreadId) return;
    app.sendMessage(currentThreadId, text);
    input.value = '';
    input.focus();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  let lastActive = null;

  function render(snapshot) {
    const meId = snapshot.personaId;
    const conversations = sortConversations(conversationsForAccount(snapshot, snapshot.accountId));
    const selected = snapshot.activeConversationId
      ? conversationById(conversations, snapshot.activeConversationId)
      : null;
    const active = selected ?? (wideLayout() ? conversations[0] : null) ?? null;
    currentThreadId = active?.id ?? null;
    if ((active?.id ?? null) !== lastActive) {
      lastActive = active?.id ?? null;
      input.value = '';
    }

    const head = pageTitle(t('messages.title'), {
      actions: [
        el(
          'span',
          {
            class: 'chip chip--lock',
            title: t('messages.banner'),
            'aria-label': `${t('messages.a11y.encryption')}: ${t('messages.encryptionBadge')}`,
          },
          [icon('lucide:lock', { size: 13, fallback: '🔒' }), t('messages.encryptionBadge')],
        ),
        iconButton('lucide:square-pen', {
          label: t('messages.newMessage'),
          fallback: '✎',
          onClick: () => app.openNewMessage(),
        }),
      ],
    });

    // While the first relay query is in flight an inbox with nothing cached
    // shows skeleton rows instead of a premature "No conversations yet".
    const loading = !conversations.length && snapshot.messagesStatus === 'loading';
    const listBody = conversations.length
      ? conversations.map((conversation) => conversationRow(conversation, meId, active?.id, app))
      : loading
        ? conversationSkeleton()
        : [
            messageEmpty({
              iconName: 'lucide:message-square-dots',
              title: t('messages.emptyTitle'),
              body: t('messages.emptyBody'),
              action: button(t('messages.newMessage'), {
                variant: 'gold',
                small: true,
                onClick: () => app.openNewMessage(),
              }),
            }),
          ];
    listEl.setAttribute('aria-busy', loading ? 'true' : 'false');
    listEl.replaceChildren(...listBody);

    layout.classList.toggle('is-thread-open', Boolean(active));
    layout.replaceChildren(listEl, threadEl);
    threadEl.replaceChildren(...threadBody(active, meId, app, form, loading));

    node.replaceChildren(head, layout);
  }

  return bindScreen(state, node, render);
}

function conversationRow(conversation, meId, activeId, app) {
  const peer = getPersona(conversation.peerId);
  const last = lastMessage(conversation);
  const unread = unreadInConversation(conversation, meId);
  const mine = last?.from === meId;
  const time = last?.createdAt ? formatRelative(last.createdAt) : null;

  const preview = last
    ? el('span', { class: 'convrow__preview' }, [
        mine ? el('span', { class: 'convrow__tick', 'aria-hidden': 'true' }, '✓✓ ') : null,
        last.text,
      ])
    : el('span', { class: 'convrow__preview muted' }, t('messages.empty'));

  let side = null;
  if (unread) side = el('span', { class: 'convrow__badge' }, unread > 9 ? '9+' : String(unread));
  else if (conversation.status === CONVERSATION_STATUS.REQUEST) side = statusBadge(t('messages.requestLabel'), 'info');

  return el(
    'button',
    {
      class: `convrow${conversation.id === activeId ? ' is-on' : ''}${unread ? ' is-unread' : ''}`,
      type: 'button',
      'aria-current': conversation.id === activeId ? 'true' : null,
      onClick: () => app.setActiveConversation(conversation.id),
    },
    [
      avatar(peer, 44),
      el('span', { class: 'convrow__body' }, [
        el('span', { class: 'convrow__top' }, [
          el('strong', {}, peer.displayName),
          time ? el('span', { class: 'convrow__time' }, time) : null,
        ]),
        preview,
      ]),
      side,
    ],
  );
}

function threadBody(active, meId, app, form, loading = false) {
  if (!active) {
    return [
      loading
        ? threadSkeleton()
        : messageEmpty({
            iconName: 'lucide:lock',
            title: t('messages.emptyThreadTitle'),
            body: t('messages.emptyThreadBody'),
          }),
    ];
  }
  const peer = getPersona(active.peerId);
  const last = lastMessage(active);
  const lastTime = last?.createdAt ? formatRelative(last.createdAt) : null;

  const header = el('div', { class: 'msg-thread__head' }, [
    el(
      'button',
      {
        class: 'icon-btn msg-back',
        type: 'button',
        'aria-label': t('messages.back'),
        onClick: () => app.setActiveConversation(null),
      },
      icon('lucide:arrow-left', { size: 20, fallback: '←' }),
    ),
    avatar(peer, 38),
    el('span', { class: 'msg-thread__id' }, [
      el('strong', {}, peer.displayName),
      el('span', { class: 'msg-thread__sub mono' }, identitySecondary(peer)),
      lastTime ? el('span', { class: 'msg-thread__sub' }, t('messages.lastActivity', { time: lastTime })) : null,
    ]),
    el('span', { class: 'spacer' }),
    iconButton('lucide:zap', {
      label: t('wallet.zap.title'),
      fallback: '⚡',
      onClick: () => app.openZapPeer(active.peerId),
    }),
    active.status === CONVERSATION_STATUS.ACCEPTED
      ? button(t('messages.block'), { small: true, onClick: () => app.blockConversation(active.id) })
      : null,
  ]);

  if (active.status === CONVERSATION_STATUS.REQUEST) {
    return [
      header,
      el('div', { class: 'msg-note' }, [
        statusBadge(t('messages.requestLabel'), 'info'),
        el('p', { class: 'muted small' }, t('messages.requestNote')),
        el('div', { class: 'arow' }, [
          button(t('messages.decline'), { small: true, onClick: () => app.declineConversation(active.id) }),
          button(t('messages.block'), { small: true, onClick: () => app.blockConversation(active.id) }),
          button(t('messages.accept'), {
            variant: 'gold',
            small: true,
            onClick: () => app.acceptConversation(active.id),
          }),
        ]),
      ]),
    ];
  }

  if (active.status === CONVERSATION_STATUS.BLOCKED) {
    return [
      header,
      el('div', { class: 'msg-note' }, [
        statusBadge(t('messages.blocked'), 'err'),
        el('div', { class: 'arow' }, [
          button(t('messages.unblock'), { small: true, onClick: () => app.unblockConversation(active.id) }),
        ]),
      ]),
    ];
  }

  const messages = el('div', { class: 'msg-messages' }, [
    el('div', { class: 'msg-banner' }, [
      icon('lucide:shield-check', { size: 14, fallback: '🔒' }),
      t('messages.banner'),
    ]),
    ...(active.messages ?? []).map((message) => messageBubble(message, meId, app)),
  ]);
  return [header, messages, form];
}

// Placeholder rows for the first relay page. Reuses the shared shimmer so the
// inbox reads as loading, not empty, before decrypted messages arrive.
function conversationSkeleton(count = 6) {
  return Array.from({ length: count }, () =>
    el('div', { class: 'convrow convrow--skeleton', 'aria-hidden': 'true' }, [
      el('span', { class: 'skel skel--ava' }),
      el('span', { class: 'convrow__body' }, [
        el('span', { class: 'skel skel--line skel--short' }),
        el('span', { class: 'skel skel--line skel--mid' }),
      ]),
    ]),
  );
}

function threadSkeleton() {
  return el('div', { class: 'msg-thread-skeleton', 'aria-hidden': 'true' }, [
    el('span', { class: 'skel skel--bubble is-in' }),
    el('span', { class: 'skel skel--bubble is-out' }),
    el('span', { class: 'skel skel--bubble is-in skel--short' }),
  ]);
}

// A designed empty state: icon badge, title, guidance, and an optional primary
// action. Centred with generous padding so a bare pane still reads as
// intentional rather than broken.
function messageEmpty({ iconName, title, body, action } = {}) {
  return el('div', { class: 'msg-empty' }, [
    el('span', { class: 'msg-empty__icon' }, icon(iconName, { size: 26, fallback: '💬' })),
    el('strong', { class: 'msg-empty__title' }, title),
    body ? el('p', { class: 'msg-empty__body muted' }, body) : null,
    action ?? null,
  ]);
}

function messageBubble(message, meId, app) {
  const mine = message.from === meId;
  const meta = [];
  const time = formatRelative(message.createdAt);
  if (time) meta.push(time);
  if (message.state === MESSAGE_STATE.SENDING) meta.push(t('messages.state.sending'));
  else if (message.state === MESSAGE_STATE.FAILED) meta.push(t('messages.state.failed'));

  // A failed send is recoverable: re-encrypts and republishes under the same
  // message id, so a retry that eventually lands never duplicates.
  const retry =
    mine && message.state === MESSAGE_STATE.FAILED
      ? button(t('messages.retry'), {
          small: true,
          className: 'bubble__retry',
          onClick: () => app.retryMessage(message.id),
        })
      : null;

  const metaNodes = [];
  meta.forEach((entry, index) => {
    if (index) metaNodes.push(' · ');
    metaNodes.push(entry);
  });
  if (retry) metaNodes.push(' ', retry);

  return el(
    'div',
    {
      class: `bubble${mine ? ' is-mine' : ''}${message.state === MESSAGE_STATE.FAILED ? ' is-failed' : ''}`,
    },
    [
      el('span', { class: 'bubble__text' }, message.text),
      metaNodes.length ? el('span', { class: 'bubble__meta' }, metaNodes) : null,
    ],
  );
}

function wideLayout() {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(min-width: 861px)').matches);
}
