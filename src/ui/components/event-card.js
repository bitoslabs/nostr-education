import { el } from '../../core/dom.js';
import { getPersona } from '../../data/personas.js';
import {
  ENROLLMENT,
  enrollmentBadge,
  enrollmentStateFor,
} from '../../domain/school.js';
import { icon } from './icon.js';
import { identityChip } from './identity-chip.js';
import { button, fileChip } from './primitives.js';
import { statusBadge } from './status-badge.js';

const BADGES = Object.freeze({
  revision: { label: '▲ action needed', tone: 'warn', audience: 'all' },
  completion: { label: 'pending organization signature', tone: 'info', audience: 'all' },
  issued: { label: '✓ issued', tone: 'ok', audience: 'all' },
  grade: { label: '✓ finalized', tone: 'ok', audience: 'all' },
  gradec: { label: 'corrected', tone: 'info', audience: 'all' },
  draft: { label: 'draft', tone: 'info', audience: 'all' },
  member: { label: '✓ membership approved', tone: 'ok', audience: 'all' },
  handle: { label: '✓ handle claimed', tone: 'ok', audience: 'all' },
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
  if (badge) children.push(el('p', {}, statusBadge(badge.label, badge.tone)));

  children.push(el('p', { class: 'cbody' }, event.text));

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

function badgeFor(event, persona) {
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

  return el('div', { class: 'actions', role: 'group', 'aria-label': 'Post engagement' }, [
    actionButton({
      kind: 'like',
      on: liked,
      icon: 'lucide:heart',
      fallback: '♥',
      count: likeCount,
      title: liked ? 'Unlike' : 'Like',
      label: `${liked ? 'Unlike' : 'Like'} · ${countLabel(likeCount, 'like')}`,
      pressed: liked,
      onClick: () => actions?.like?.(event.id),
    }),
    bitzStat(bitz),
    actionButton({
      kind: 'reply',
      icon: 'lucide:message-circle',
      fallback: '💬',
      count: replyCount,
      title: 'Reply',
      label: `Reply · ${countLabel(replyCount, 'reply')}`,
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
    { class: 'action action--stat action--bitz', title: 'Bitz · kudos & tips' },
    [
      icon('lucide:zap', { size: 18, fallback: '⚡' }),
      countNode(value),
      el('span', { class: 'sr' }, countLabel(value, 'bitz', 'bitz')),
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
    case 'revision':
      return actor === 'alice' ? primary('Open assignment', () => actions.openAssignment()) : null;

    case 'submission':
      return actor === 'bob'
        ? primary('Review', () => actions.openReview(event.queueId, 'review'))
        : null;

    case 'grade':
      if (actor === 'alice') return primary('View grade', () => actions.openAssignment());
      if (actor === 'bob') return primary('Correct grade', () => actions.openReview(event.queueId, 'correct'));
      return null;

    case 'gradec':
      return actor === 'alice' ? primary('View grade', () => actions.openAssignment()) : null;

    case 'completion':
      return actor === 'nadia'
        ? primary('Review & sign', () => actions.openSign(event.signId))
        : null;

    case 'issued':
      return actor === 'alice'
        ? primary('View in Credentials', () => actions.navigate('/credentials'))
        : null;

    case 'course': {
      if (!event.courseId) return null;
      const state = enrollmentStateFor(enrollments, actor, event.courseId);
      if (state === ENROLLMENT.APPROVED) {
        return el('span', { class: 'spacer' }, statusBadge('enrolled ✓', 'ok'));
      }
      const badge = enrollmentBadge(state);
      if (badge) return el('span', { class: 'spacer' }, statusBadge(badge.label, badge.tone));
      return primary('Request enroll', () => actions.requestEnrollment(event.courseId));
    }

    case 'enrollreq':
      if (actor !== 'nadia' || !event.requestId) return null;
      return el('span', { class: 'spacer inline-actions' }, [
        button('Decline', { small: true, onClick: () => actions.declineEnrollment(event.requestId) }),
        primary('Accept', () => actions.acceptEnrollment(event.requestId)),
      ]);

    case 'joinreq':
      if (actor !== 'nadia' || !event.requestId) return null;
      return el('span', { class: 'spacer inline-actions' }, [
        button('Decline', { small: true, onClick: () => actions.declineJoin(event.requestId) }),
        primary('Accept', () => actions.acceptJoin(event.requestId)),
      ]);

    default:
      return null;
  }
}
