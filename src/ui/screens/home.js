import { el } from '../../core/dom.js';
import { getPersona } from '../../data/personas.js';
import { FEED_TABS, filterFeed } from '../../domain/feed.js';
import { eventCard } from '../components/event-card.js';
import { button, emptyState, pageTitle, tabs } from '../components/primitives.js';

export function renderHome({ store, app, scope }) {
  const feed = el('div', { class: 'feed' });
  const tabBar = el('div');
  const banner = el('div');
  const node = el('section', { class: 'screen' }, [pageTitle('Home'), banner, tabBar, feed]);

  function render() {
    const state = store.getState();
    const persona = getPersona(state.personaId);

    banner.replaceChildren(...createdBanner(state, persona, app));

    tabBar.replaceChildren(
      tabs(FEED_TABS, state.feedTab, (id) => app.setFeedTab(id), { label: 'Feed' }),
    );

    const events = filterFeed(state.events, {
      personaId: state.personaId,
      tab: state.feedTab,
      following: state.following[state.personaId] ?? [],
    });

    feed.replaceChildren(
      ...(events.length
        ? events.map((event) =>
            eventCard(event, { persona, actions: app, enrollments: state.enrollRequests }),
          )
        : [emptyState('Nothing here yet — follow people or find a course.')]),
    );
  }

  scope.add(store.subscribe(render));
  render();
  return node;
}

function createdBanner(state, persona, app) {
  if (state.lastCreated?.id !== persona.id) return [];
  return [
    el('div', { class: 'card card--accent' }, [
      el('h3', {}, '✓ Account created'),
      el('p', { class: 'small' }, 'Back up your recovery key now — BitOS cannot restore a lost key.'),
      el('div', { class: 'arow' }, [
        button('Open settings', { variant: 'gold', small: true, onClick: () => app.navigate('/settings') }),
        button('Dismiss', { small: true, onClick: () => app.dismissCreated() }),
      ]),
    ]),
  ];
}
