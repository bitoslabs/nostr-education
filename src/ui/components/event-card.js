import { el } from '../../core/dom.js';
import { getPersona } from '../../data/personas.js';
import {
  ENROLLMENT,
  enrollmentBadge,
  enrollmentStateFor,
} from '../../domain/school.js';
import { t } from '../../services/i18n/index.js';
import { icon } from './icon.js';
import { identityChip } from './identity-chip.js';
import { button, fileChip } from './primitives.js';
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

export function eventCard(event, { persona, actions, enrollments = [] } = {}) {
  const author = getPersona(event.author);
  const children = [
    el('div', { class: 'crow' }, [
      identityChip(author),
      el('span', { class: 't' }, `· ${event.time}`),
      event.context ? el('span', { class: 'ctx' }, event.context) : null,
    ]),
  ];

  const badge = badgeFor(event, persona);
  if (badge) children.push(el('p', {}, statusBadge(t(badge.key, badge.params), badge.tone)));

  children.push(el('p', { class: 'cbody' }, eventText(event)));

  if (event.quote) children.push(el('blockquote', { class: 'quote' }, `"${event.quote}"`));
  if (event.files?.length) {
    children.push(el('div', { class: 'files' }, event.files.map((file) => fileChip(file))));
  }

  const actionRow = el('div', { class: 'arow' });
  if (event.type === 'social') actionRow.append(engagementBar(event, actions));
  const action = actionFor(event, { persona, actions, enrollments });
  if (action) actionRow.append(action);
  children.push(actionRow);

  return el('article', { class: 'card' }, children);
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

function engagementBar(event, actions) {
  const counts = event.counts ?? {};
  const liked = Boolean(event.liked);
  const likeCount = (counts.likes ?? 0) + (liked ? 1 : 0);
  const replyCount = counts.replies ?? 0;
  const bitz = counts.bitz ?? 0;
  const likeAction = liked ? t('home.unlike') : t('home.like');

  return el('div', { class: 'actions', role: 'group', 'aria-label': t('home.postEngagement') }, [
    actionButton({
      kind: 'like',
      on: liked,
      icon: 'lucide:heart',
      fallback: '♥',
      count: likeCount,
      title: likeAction,
      label: t('home.likeActionLabel', {
        action: likeAction,
        count: countLabel(likeCount, t('home.likeNoun'), t('home.likesNoun')),
      }),
      pressed: liked,
      onClick: () => actions?.like?.(event.id),
    }),
    bitzStat(bitz),
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
    [icon(name, { size: 18, fallback }), countNode(count)],
  );
}

function bitzStat(value) {
  return el(
    'span',
    { class: 'action action--stat action--bitz', title: t('home.bitzTitle') },
    [
      icon('lucide:zap', { size: 18, fallback: '⚡' }),
      countNode(value),
      el('span', { class: 'sr' }, countLabel(value, t('home.bitz'), t('home.bitz'))),
    ],
  );
}

function countNode(value) {
  if (!value) return null;
  return el('span', { class: 'action__count', 'aria-hidden': 'true' }, formatCount(value));
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
