import van from 'vanjs-core';
import { getPersona } from '../../data/personas.js';
import { FEED_TABS, filterFeed } from '../../domain/feed.js';
import { eventCard } from '../components/event-card.js';
import { button, emptyState, tabs } from '../components/primitives.js';

const { section, h1, h3, p, div } = van.tags;

export function renderHome({ app, state }) {
  return section(
    { class: 'screen' },
    h1('Home'),
    () => createdBanner(state.val, getPersona(state.val.personaId), app),
    () => tabs(FEED_TABS, state.val.feedTab, (id) => app.setFeedTab(id), { label: 'Feed' }),
    () => feedList(state.val, app),
  );
}

function feedList(state, app) {
  const persona = getPersona(state.personaId);
  const events = filterFeed(state.events, {
    personaId: state.personaId,
    tab: state.feedTab,
    following: state.following[state.personaId] ?? [],
  });

  return div(
    { class: 'feed' },
    ...(events.length
      ? events.map((event) =>
          eventCard(event, { persona, actions: app, enrollments: state.enrollRequests }),
        )
      : [emptyState('Nothing here yet — follow people or find a course.')]),
  );
}

function createdBanner(state, persona, app) {
  // VanJS drops a binding whose node is disconnected, so the hidden state must
  // still be a real node. A comment keeps the binding alive until the banner shows.
  if (state.lastCreated?.id !== persona.id) return document.createComment('home-banner');
  return div(
    { class: 'card card--accent' },
    h3('✓ Account created'),
    p({ class: 'small' }, 'Back up your recovery key now — BitOS cannot restore a lost key.'),
    div(
      { class: 'arow' },
      button('Open settings', {
        variant: 'gold',
        small: true,
        onClick: () => app.navigate('/settings'),
      }),
      button('Dismiss', { small: true, onClick: () => app.dismissCreated() }),
    ),
  );
}
