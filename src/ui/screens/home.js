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
import { LOW_POW_THRESHOLD } from '../../domain/prefs.js';
import { t } from '../../services/i18n/index.js';
import { eventCard } from '../components/event-card.js';
import { button, emptyState, row, tabs } from '../components/primitives.js';
import { statusBadge } from '../components/status-badge.js';

const { section, header, h1, h3, p, div, span } = van.tags;

// One observer per mounted Home screen. The sentinel node below is stable for
// the life of the screen, so we observe it once and let the store drive the
// label; each page that loads pushes the sentinel down and it fires again when
// the reader scrolls back to the bottom.
let feedMoreObserver = null;

export function renderHome({ app, state }) {
  setupFeedAutoLoad(app);
  const more = feedMoreSentinel(state);
  return section(
    { class: 'screen' },
    header({ class: 'page-head' }, [
      div({ class: 'page-head__row' }, h1({ class: 'page-title' }, t('home.title'))),
      () => tabs(FEED_TABS, state.val.feedTab, (id) => app.setFeedTab(id), { label: t('home.feed') }),
    ]),
    () => createdBanner(state.val, getPersona(state.val.personaId), app),
    () => nextActionsSection(state.val, app),
    () => feedList(state.val, app, more),
  );
}

// Auto-load older notes when the end of the feed scrolls near. Uses an
// IntersectionObserver on the app's scroll container (`#main`) rather than a
// scroll listener, so it costs nothing while the reader is elsewhere.
function setupFeedAutoLoad(app) {
  if (typeof IntersectionObserver === 'undefined') return;
  feedMoreObserver?.disconnect();
  const root = typeof document !== 'undefined' ? document.getElementById('main') : null;
  feedMoreObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        if (!entry.target.isConnected) {
          feedMoreObserver?.unobserve(entry.target);
          continue;
        }
        app.loadMoreFeed?.();
      }
    },
    { root, rootMargin: '700px 0px', threshold: 0 },
  );
}

// End-of-feed marker. It is the IntersectionObserver target; the store decides
// whether it shows a spinner, stays quiet, or reports the end of the archive.
function feedMoreSentinel(state) {
  const node = div(
    {
      class: () => `feed-more${state.val.feedMoreStatus === 'end' ? ' feed-more--end' : ''}`,
      role: 'status',
      'aria-live': 'polite',
    },
    [
      span(
        { class: 'feed-more__spinner', 'aria-hidden': 'true' },
        () => (state.val.feedMoreStatus === 'loading' ? span({ class: 'spinner' }) : null),
      ),
      span({ class: 'feed-more__label' }, () => {
        if (state.val.feedMoreStatus === 'loading') return t('home.loadingMore');
        if (state.val.feedMoreStatus === 'end') return t('home.feedEnd');
        return '';
      }),
    ],
  );
  feedMoreObserver?.observe(node);
  return node;
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

function feedList(state, app, more) {
  const persona = getPersona(state.personaId);
  const filtered = filterFeed(state.events, {
    personaId: state.personaId,
    tab: state.feedTab,
    following: state.following[state.personaId] ?? [],
    dismissed: dismissedKeys(state, state.personaId),
    // Viewer scope for For-you ranking: classes, academy, follows, read state,
    // mutes — derived server-style from state, never from client filters.
    context: feedContext(state, persona),
  });
  // Optional low-PoW filter: hide notes below the threshold when the privacy
  // preference is on. Records and other card types are never filtered.
  const refuseLowPow = Boolean(state.prefs?.privacy?.refuseLowPow);
  const events = refuseLowPow
    ? filtered.filter((event) => !(event.type === 'social' && (event.pow ?? 0) < LOW_POW_THRESHOLD))
    : filtered;
  const showReactions = state.prefs?.zap?.nonZapReactions !== false;

  const cards = events.map((event) => {
    const node = eventCard(event, {
      persona,
      actions: app,
      enrollments: state.enrollRequests,
      showReactions,
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
  const body = cards.length
    ? [...cards, more]
    : state.events.length || state.feedStatus === 'ready'
      ? [emptyState(state.events.length ? t('home.emptyFeedTab') : t('home.emptyFeed'))]
      : feedSkeleton();
  return div({ class: 'feed' }, ...body);
}

// Placeholder cards shown only while the first relay page is in flight and no
// cached notes exist, so the feed never flashes an empty state.
function feedSkeleton(count = 4) {
  return Array.from({ length: count }, () =>
    el('article', { class: 'card feed-skeleton' }, [
      el('span', { class: 'skel skel--ava' }),
      el('div', { class: 'skel-body' }, [
        el('span', { class: 'skel skel--line skel--short' }),
        el('span', { class: 'skel skel--line' }),
        el('span', { class: 'skel skel--line skel--mid' }),
      ]),
    ]),
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
