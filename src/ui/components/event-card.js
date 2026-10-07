import { el } from '../../core/dom.js';
import { getPersona } from '../../data/personas.js';
import { identityName, identitySecondary, isVerified } from '../../domain/identity.js';
import {
  ENROLLMENT,
  enrollmentBadge,
  enrollmentStateFor,
} from '../../domain/school.js';
import { t } from '../../services/i18n/index.js';
import { icon } from './icon.js';
import { identityChip } from './identity-chip.js';
import { fileLink } from './file-viewer.js';
import { overflowMenu } from './menu.js';
import { avatar, button } from './primitives.js';
import { statusBadge } from './status-badge.js';

const BADGES = Object.freeze({
  revision: { key: 'home.badgeActionNeeded', tone: 'warn', audience: 'all' },
  completion: { key: 'home.badgePendingSignature', tone: 'info', audience: 'all' },
  issued: { key: 'home.badgeIssued', tone: 'ok', audience: 'all' },
  grade: { key: 'home.badgeFinalized', tone: 'ok', audience: 'all' },
  gradec: { key: 'home.badgeCorrected', tone: 'info', audience: 'all' },
  draft: { key: 'common.badge.draft', tone: 'info', audience: 'all' },
  member: { key: 'home.badgeMembershipApproved', tone: 'ok', audience: 'all' },
  handle: { key: 'home.badgeHandleClaimed', tone: 'ok', audience: 'all' },
});

// Reason codes attached by the For-you ranking, localized for the why-line.
const REASON_KEYS = Object.freeze({
  'your-class': 'home.reasonYourClass',
  followed: 'home.reasonFollowed',
  'your-academy': 'home.reasonYourAcademy',
  recent: 'home.reasonRecent',
  read: 'home.reasonRead',
});

export function eventCard(event, { persona, actions, enrollments = [], showReactions = true, onDismiss, onMuteAuthor } = {}) {
  const author = getPersona(event.author);
  const isSocial = event.type === 'social';
  const menu = cardMenu(event, { persona, actions, onDismiss, onMuteAuthor });
  const children = [isSocial ? noteHeader(author, event, actions, menu) : plainHeader(author, event, menu)];

  const badge = badgeFor(event, persona);
  if (badge) children.push(el('p', {}, statusBadge(t(badge.key, badge.params), badge.tone)));

  children.push(el('p', { class: 'cbody' }, eventText(event)));

  // Transparent relevance: the For-you tab states why a card is shown.
  const reasons = event.ranking?.reasons ?? [];
  if (reasons.length) {
    const labels = reasons.map((code) => REASON_KEYS[code]).filter(Boolean).map((key) => t(key));
    if (labels.length) children.push(el('p', { class: 'muted small' }, t('home.why', { reasons: labels.join(' · ') })));
  }

  if (event.quote) children.push(el('blockquote', { class: 'quote' }, `"${event.quote}"`));
  if (event.files?.length) {
    children.push(postMedia(event.files, { onOpenMedia: (file) => actions?.openFileViewer?.(file) }));
  }
  if (isSocial && event.pow > 0) children.push(powPill(event));

  const actionRow = el('div', { class: 'arow' });
  if (isSocial) actionRow.append(engagementBar(event, actions, persona, { showReactions }));
  const action = actionFor(event, { persona, actions, enrollments });
  if (action) actionRow.append(action);
  if (actionRow.childNodes.length) children.push(actionRow);

  return el('article', { class: 'card' }, children);
}

// Secondary card actions live in a top-right overflow menu so they no longer
// compete with the primary engagement and action row at the bottom:
// Message, Dismiss (informational cards only), and Show less (mute author).
function cardMenu(event, { persona, actions, onDismiss, onMuteAuthor } = {}) {
  const isSocial = event.type === 'social';
  const isOtherAuthor = event.author !== persona?.id;
  const items = [];

  if (isSocial && isOtherAuthor && actions?.openMessageTo) {
    items.push({
      label: t('messages.messageAction'),
      icon: 'lucide:message-circle',
      fallback: '💬',
      onClick: () => actions.openMessageTo(event.author),
    });
  }
  // Informational cards only: required tasks are derived from live records and
  // cannot be dismissed from the feed.
  if (onDismiss) {
    items.push({
      label: t('home.dismiss'),
      icon: 'lucide:x',
      fallback: '✕',
      onClick: () => onDismiss(event),
    });
  }
  // Person-authored cards offer "show less" (a per-person mute of the author,
  // affecting the For-you tab only).
  if (onMuteAuthor && isSocial && isOtherAuthor) {
    items.push({
      label: t('home.muteAuthor'),
      icon: 'lucide:eye-off',
      fallback: '🙈',
      onClick: () => onMuteAuthor(event.author),
    });
  }

  return overflowMenu({ label: t('home.cardActions'), items });
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|svg)(\?.*)?$/i;
const GIF_EXT = /\.gif(\?.*)?$/i;
const VIDEO_EXT = /\.(mp4|m4v|mov|webm|ogv|ogg|avi|mkv)(\?.*)?$/i;

function isImageFile(file) {
  if (file?.type) return String(file.type).startsWith('image/');
  return IMAGE_EXT.test(String(file?.url ?? ''));
}

function isGifFile(file) {
  if (file?.type) return String(file.type).toLowerCase() === 'image/gif';
  return GIF_EXT.test(String(file?.url ?? ''));
}

function isVideoFile(file) {
  if (file?.type) return String(file.type).toLowerCase().startsWith('video/');
  return VIDEO_EXT.test(String(file?.url ?? ''));
}

function mediaItem(file, { gif = false, onOpen } = {}) {
  const handleClick = (event) => {
    if (!onOpen) return;
    event.preventDefault();
    onOpen(file);
  };
  return el(
    'a',
    {
      class: `postmedia__item${gif ? ' is-gif' : ''}`,
      href: file.url,
      target: '_blank',
      rel: 'noopener noreferrer',
      onClick: onOpen ? handleClick : null,
    },
    el('img', {
      src: file.url,
      alt: file.name ?? '',
      loading: 'lazy',
      referrerpolicy: 'no-referrer',
    }),
  );
}

// Notes carry media as `files` (parsed from NIP-92 `imeta`). Photos fill the
// grid; GIFs are contained at a fixed height; video plays inline; anything else
// is a chip that opens the in-app viewer when the caller supplies `onOpenMedia`.
function postMedia(files, { onOpenMedia } = {}) {
  const videos = files.filter(isVideoFile);
  const images = files.filter((file) => isImageFile(file) && !isVideoFile(file));
  const photos = images.filter((file) => !isGifFile(file));
  const gifs = images.filter(isGifFile);
  const others = files.filter((file) => !isImageFile(file) && !isVideoFile(file));
  return el('div', { class: 'postmedia' }, [
    photos.length
      ? el(
          'div',
          { class: `postmedia__grid${photos.length === 1 ? ' is-single' : ''}` },
          photos.map((file) => mediaItem(file, { onOpen: onOpenMedia })),
        )
      : null,
    gifs.length
      ? el(
          'div',
          { class: 'postmedia__gifs' },
          gifs.map((file) => mediaItem(file, { gif: true, onOpen: onOpenMedia })),
        )
      : null,
    videos.length
      ? el(
          'div',
          { class: 'postmedia__videos' },
          videos.map((file) =>
            el('video', {
              class: 'postmedia__video',
              src: file.url,
              controls: true,
              playsinline: true,
              preload: 'metadata',
            }),
          ),
        )
      : null,
    others.length
      ? el(
          'div',
          { class: 'files' },
          others.map((file) => fileLink(file, { onOpen: onOpenMedia })),
        )
      : null,
  ]);
}

// Read-only rendering of a whole note (no actions), used by the reply dialog so
// the author replies to the full original rather than a truncated quote.
export function notePreview(event, { onOpenMedia } = {}) {
  const author = getPersona(event.author);
  return el('div', { class: 'note-preview' }, [
    el('div', { class: 'note-head' }, [
      avatar(author, 36),
      el('div', { class: 'note-head__meta' }, [
        el('span', { class: 'note-head__name' }, [
          identityName(author),
          isVerified(author) ? el('span', { class: 'vmark' }, '✓') : null,
        ]),
        el('span', { class: 'note-head__npub mono' }, identitySecondary(author)),
        el('span', { class: 't' }, `· ${event.time}`),
      ]),
      event.kind != null ? el('span', { class: 'spacer' }) : null,
      event.kind != null ? el('span', { class: 'kindtag mono' }, `kind:${event.kind}`) : null,
    ]),
    el('p', { class: 'cbody' }, event.text),
    event.quote ? el('blockquote', { class: 'quote' }, `"${event.quote}"`) : null,
    event.files?.length ? postMedia(event.files, { onOpenMedia }) : null,
    event.pow > 0 ? powPill(event) : null,
  ]);
}

function eventText(event) {
  if (event.type === 'member' && !event.text) {
    return event.memberStatus === 'none'
      ? t('home.memberDeclinedBody')
      : t('home.memberApprovedBody');
  }
  return event.text;
}

function badgeFor(event, persona) {
  if (event.type === 'member') {
    return event.memberStatus === 'none'
      ? { key: 'home.badgeMembershipDeclined', tone: 'warn' }
      : BADGES.member;
  }
  const token = BADGES[event.type];
  if (!token) return null;
  if (event.type === 'revision') {
    const audience = Array.isArray(event.audience) ? event.audience : [];
    return event.actionNeeded && audience.includes(persona?.id) ? token : null;
  }
  if (token.audience !== 'all' && persona?.id !== token.audience) return null;
  return token;
}

// Social notes get a flat, inline identity line (name · npub · time) with the
// kind badge and copy button pinned right, matching docs/ui.html. Other card
// types keep the compact identity chip.
function noteHeader(author, event, actions, menu) {
  // The identity line is the profile entry point: tapping the avatar or name
  // opens that author's profile page (public key carried in the route).
  const identity = el(
    'button',
    {
      class: 'note-head__open',
      type: 'button',
      onClick: actions?.openProfile ? () => actions.openProfile(author.id) : null,
    },
    [
      avatar(author, 44),
      el('div', { class: 'note-head__meta' }, [
        el('span', { class: 'note-head__name' }, [
          identityName(author),
          isVerified(author) ? el('span', { class: 'vmark' }, '✓') : null,
        ]),
        el('span', { class: 'note-head__npub mono' }, identitySecondary(author)),
        el('span', { class: 't' }, `· ${event.time}`),
      ]),
    ],
  );
  return el('div', { class: 'note-head' }, [
    identity,
    el('span', { class: 'spacer' }),
    authorMeta(event, actions),
    menu,
  ]);
}

function plainHeader(author, event, menu) {
  return el('div', { class: 'crow' }, [
    identityChip(author),
    el('span', { class: 't' }, `· ${event.time}`),
    event.context ? el('span', { class: 'ctx' }, event.context) : null,
    menu ? el('span', { class: 'spacer' }) : null,
    menu,
  ]);
}

function authorMeta(event, actions) {
  return el('span', { class: 'postmeta' }, [
    event.kind != null ? el('span', { class: 'kindtag mono' }, `kind:${event.kind}`) : null,
    el(
      'button',
      {
        class: 'postmeta__copy',
        type: 'button',
        title: t('home.copyEventId'),
        'aria-label': t('home.copyEventId'),
        onClick: () => actions?.copyText?.(event.id, t('home.eventIdCopied')),
      },
      icon('lucide:fingerprint', { size: 14, fallback: '#' }),
    ),
  ]);
}

// NIP-13 proof-of-work pill shown under the note body (docs/ui.html).
function powPill(event) {
  return el('div', { class: 'powpill', title: t('home.powTitle', { bits: event.pow }) }, [
    icon('lucide:shield-check', { size: 13, fallback: '⛏' }),
    el('span', { class: 'powpill__label' }, 'PoW'),
    powBars(event.pow),
    el('b', { class: 'mono' }, t(event.pow === 1 ? 'home.powBit' : 'home.powBits', { bits: event.pow })),
  ]);
}

// Sixteen-segment meter, one segment per two bits of achieved difficulty
// (matches powBars() in docs/ui.html).
function powBars(bits) {
  const filled = Math.min(16, Math.floor((Number(bits) || 0) / 2));
  return el(
    'span',
    { class: 'powbar', 'aria-hidden': 'true' },
    Array.from({ length: 16 }, (_, index) =>
      el('span', { class: `powbar__bar${index < filled ? ' is-on' : ''}` }),
    ),
  );
}

function engagementBar(event, actions, persona, { showReactions = true } = {}) {
  const counts = event.counts ?? {};
  const liked = Boolean(event.liked);
  const reposted = Boolean(event.reposted);
  const bookmarked = Boolean(event.bookmarked);
  const likeCount = counts.likes ?? 0;
  const replyCount = counts.replies ?? 0;
  const repostCount = counts.reposts ?? 0;
  const bitz = counts.bitz ?? 0;
  const canZap = Boolean(actions?.openZap) && persona?.id && event.author !== persona.id;

  return el('div', { class: 'actions actions--feed', role: 'group', 'aria-label': t('home.postEngagement') }, [
    actionButton({
      kind: 'reply',
      icon: 'lucide:message-circle',
      fallback: '💬',
      count: replyCount,
      title: t('home.reply'),
      label: t('home.replyActionLabel', {
        count: countLabel(replyCount, t('home.replyNoun'), t('home.repliesNoun')),
      }),
      onClick: () => actions?.openThread?.(event.id),
    }),
    // Non-zap reactions can be hidden in Settings → Lightning → Zap preferences.
    showReactions
      ? actionButton({
          kind: 'repost',
          on: reposted,
          icon: 'lucide:repeat-2',
          fallback: '🔁',
          count: repostCount,
          title: reposted ? t('home.unrepost') : t('home.repost'),
          label: t('home.repostActionLabel', {
            count: countLabel(repostCount, t('home.repostNoun'), t('home.repostsNoun')),
          }),
          pressed: reposted,
          onClick: () => actions?.repost?.(event.id),
        })
      : null,
    showReactions
      ? actionButton({
          kind: 'like',
          on: liked,
          icon: 'lucide:heart',
          fallback: '♥',
          count: likeCount,
          title: liked ? t('home.unlike') : t('home.like'),
          label: t('home.likeActionLabel', {
            action: liked ? t('home.unlike') : t('home.like'),
            count: countLabel(likeCount, t('home.likeNoun'), t('home.likesNoun')),
          }),
          pressed: liked,
          onClick: () => actions?.like?.(event.id),
        })
      : null,
    bitzStat(bitz, { onClick: canZap ? () => actions.openZap(event.id) : null }),
    actionButton({
      kind: 'bookmark',
      on: bookmarked,
      icon: 'lucide:bookmark',
      fallback: '🔖',
      title: bookmarked ? t('home.unbookmark') : t('home.bookmark'),
      label: bookmarked ? t('home.unbookmark') : t('home.bookmark'),
      pressed: bookmarked,
      onClick: () => actions?.bookmark?.(event.id),
    }),
  ]);
}

function actionButton({ kind, icon: name, fallback, count, label, title, pressed, on, onClick }) {
  return el(
    'button',
    {
      class: `action action--${kind}${on ? ' is-on' : ''}`,
      type: 'button',
      title,
      'aria-label': label,
      'aria-pressed': pressed == null ? null : String(pressed),
      onClick,
    },
    [icon(name, { size: 18, fallback }), count == null ? null : countNode(count)],
  );
}

function bitzStat(value, { onClick } = {}) {
  const content = [
    icon('lucide:zap', { size: 18, fallback: '⚡' }),
    el('span', { class: 'action__count' }, t('home.satsLabel', { count: formatCount(value) })),
  ];
  if (!onClick) {
    return el('span', { class: 'action action--stat action--bitz', title: t('home.bitzTitle') }, content);
  }
  return el(
    'button',
    {
      class: 'action action--stat action--bitz',
      type: 'button',
      title: t('wallet.zap.title'),
      'aria-label': t('wallet.zap.title'),
      onClick,
    },
    content,
  );
}

function countNode(value) {
  return el('span', { class: 'action__count' }, formatCount(value));
}

function countLabel(value, singular, plural = `${singular}s`) {
  const total = Number(value) || 0;
  return `${formatCount(total)} ${total === 1 ? singular : plural}`;
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

function actionFor(event, { persona, actions, enrollments }) {
  const actor = persona?.id;
  const primary = (label, onClick) =>
    button(label, { variant: 'gold', small: true, className: 'spacer', onClick });

  switch (event.type) {
    case 'completion':
      return actor === 'nadia'
        ? primary(t('home.reviewAndSign'), () => actions.openSign(event.signId))
        : null;

    case 'issued':
      return actor === 'alice'
        ? primary(t('home.viewInCredentials'), () => actions.navigate('/credentials'))
        : null;

    case 'course': {
      if (!event.courseId) return null;
      const state = enrollmentStateFor(enrollments, actor, event.courseId);
      if (state === ENROLLMENT.APPROVED) {
        return el('span', { class: 'spacer' }, statusBadge(t('common.badge.enrolled'), 'ok'));
      }
      const badge = enrollmentBadge(state);
      if (badge) return el('span', { class: 'spacer' }, statusBadge(t(badge.key, badge.params), badge.tone));
      return primary(t('home.requestEnroll'), () => actions.requestEnrollment(event.courseId));
    }

    case 'enrollreq':
      if (!event.requestId || !actions.canDecideEnrollment?.(event.requestId)) return null;
      return el('span', { class: 'spacer inline-actions' }, [
        button(t('home.decline'), { small: true, onClick: () => actions.declineEnrollment(event.requestId) }),
        primary(t('home.accept'), () => actions.acceptEnrollment(event.requestId)),
      ]);

    case 'joinreq':
      if (!event.requestId || !actions.canDecideJoin?.(event.requestId)) return null;
      return el('span', { class: 'spacer inline-actions' }, [
        button(t('home.decline'), { small: true, onClick: () => actions.declineJoin(event.requestId) }),
        primary(t('home.accept'), () => actions.acceptJoin(event.requestId)),
      ]);

    default:
      return null;
  }
}
