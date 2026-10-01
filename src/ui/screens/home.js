import van from 'vanjs-core';
import { el } from '../../core/dom.js';
import { formatDate } from '../../core/time.js';
import { getPersona } from '../../data/personas.js';
import {
  FEED_TABS,
  eventKeyOf,
  feedContext,
  filterFeed,
  isActionNeededFor,
  nextActions,
} from '../../domain/feed.js';
import { t } from '../../services/i18n/index.js';
import { eventCard } from '../components/event-card.js';
import { button, emptyState, row, tabs } from '../components/primitives.js';
import { statusBadge } from '../components/status-badge.js';

const { section, h1, h3, p, div } = van.tags;

export function renderHome({ app, state }) {
  return section(
    { class: 'screen' },
    h1(t('home.title')),
    () => createdBanner(state.val, getPersona(state.val.personaId), app),
    () => nextActionsSection(state.val, app),
    () => tabs(FEED_TABS, state.val.feedTab, (id) => app.setFeedTab(id), { label: t('home.feed') }),
    () => feedList(state.val, app),
  );
}

function dismissedKeys(state, personaId) {
  const mine = state.feedStates?.[personaId] ?? {};
  return Object.entries(mine)
    .filter(([, value]) => value?.dismissedAt)
    .map(([key]) => key);
}

// Live task queue derived from current records (docs/architecture/home-feed.md).
// Cards open the exact protected record and disappear only when the source
// workflow is complete — dismissing a feed card never completes a task.
function nextActionsSection(state, app) {
  const persona = getPersona(state.personaId);
  const tasks = nextActions(state, persona);
  const body = tasks.length
    ? div({ class: 'rows' }, tasks.map((task) => taskRow(task, app)))
    : p({ class: 'muted small' }, t('home.nextActionsEmpty'));
  return div({ class: 'card' }, [h3(t('home.nextActions')), body]);
}

function taskRow(task, app) {
  const due = task.dueAt
    ? statusBadge(
        t(task.overdue ? 'home.taskOverdue' : 'home.taskDue', { date: formatDate(task.dueAt) ?? task.dueAt }),
        task.overdue ? 'warn' : 'info',
      )
    : null;
  return row([
    el('span', { class: 'who' }, taskSummary(task)),
    task.context ? el('span', { class: 'muted small' }, task.context) : null,
    due,
    el('span', { class: 'spacer' }),
    taskControls(task, app),
  ]);
}

function taskSummary(task) {
  switch (task.kind) {
    case 'assignment.due':
      return t('home.taskAssignmentDue', { title: task.title });
    case 'assignment.revise':
      return t('home.taskAssignmentRevise', { title: task.title });
    case 'submission.review':
      return t('home.taskReview', { title: task.title });
    case 'member.request':
      return t('home.taskJoin', { name: task.actorName, academy: task.context });
    case 'enrollment.request':
      return t('home.taskEnroll', { name: task.actorName, course: task.title });
    default:
      return task.title ?? '';
  }
}

function taskControls(task, app) {
  const primary = (label, onClick) => button(label, { variant: 'gold', small: true, onClick });
  switch (task.open?.type) {
    case 'homework':
      return primary(
        t(task.kind === 'assignment.revise' ? 'home.taskRevise' : 'home.taskSubmit'),
        () => app.openSubmitHomework(task.open.homeworkId),
      );
    case 'submission':
      return primary(t('home.taskReviewAction'), () => app.openGradeSubmission(task.open.submissionId));
    case 'join':
      return el('span', { class: 'inline-actions' }, [
        button(t('home.decline'), { small: true, onClick: () => app.declineJoin(task.open.requestId) }),
        primary(t('home.accept'), () => app.acceptJoin(task.open.requestId)),
      ]);
    case 'enroll':
      return el('span', { class: 'inline-actions' }, [
        button(t('home.decline'), { small: true, onClick: () => app.declineEnrollment(task.open.requestId) }),
        primary(t('home.accept'), () => app.acceptEnrollment(task.open.requestId)),
      ]);
    default:
      return null;
  }
}

function feedList(state, app) {
  const persona = getPersona(state.personaId);
  const events = filterFeed(state.events, {
    personaId: state.personaId,
    tab: state.feedTab,
    following: state.following[state.personaId] ?? [],
    dismissed: dismissedKeys(state, state.personaId),
    // Viewer scope for For-you ranking: classes, academy, follows, read state,
    // mutes — derived server-style from state, never from client filters.
    context: feedContext(state, persona),
  });

  const cards = events.map((event) => {
    const node = eventCard(event, {
      persona,
      actions: app,
      enrollments: state.enrollRequests,
      onDismiss: isActionNeededFor(event, state.personaId)
        ? null
        : () => app.dismissFeedEvent(eventKeyOf(event)),
      onMuteAuthor: (actorId) => app.muteAuthor(actorId),
    });
    // Any interaction with a card marks it read (per person); it only weighs
    // For-you ranking and never hides the card.
    node.addEventListener('click', () => app.readFeedEvent(eventKeyOf(event)));
    return node;
  });
  return div(
    { class: 'feed' },
    ...(cards.length
      ? cards
      : [emptyState(state.events.length ? t('home.emptyFeedTab') : t('home.emptyFeed'))]),
  );
}

function createdBanner(state, persona, app) {
  // VanJS drops a binding whose node is disconnected, so the hidden state must
  // still be a real node. A comment keeps the binding alive until the banner shows.
  if (state.lastCreated?.id !== persona.id) return document.createComment('home-banner');
  return div(
    { class: 'card card--accent' },
    h3(t('home.accountCreated')),
    p({ class: 'small' }, t('home.accountCreatedBody')),
    div(
      { class: 'arow' },
      button(t('home.openSettings'), {
        variant: 'gold',
        small: true,
        onClick: () => app.navigate('/settings'),
      }),
      button(t('home.dismiss'), { small: true, onClick: () => app.dismissCreated() }),
    ),
  );
}
