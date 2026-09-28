import { el } from '../../core/dom.js';
import { getPersona } from '../../data/personas.js';
import { isVisible } from '../../domain/feed.js';
import { eventCard } from '../components/event-card.js';
import { emptyState, pageTitle } from '../components/primitives.js';

export function renderNotifications({ store, app, scope }) {
  const list = el('div', { class: 'feed' });
  const node = el('section', { class: 'screen' }, [pageTitle('Notifications'), list]);

  function render() {
    const state = store.getState();
    const persona = getPersona(state.personaId);
    const events = state.events.filter(
      (event) => event.type !== 'social' && isVisible(event, state.personaId),
    );

    list.replaceChildren(
      ...(events.length
        ? events.map((event) =>
            eventCard(event, { persona, actions: app, enrollments: state.enrollRequests }),
          )
        : [emptyState('No workflow notifications.')]),
    );
  }

  scope.add(store.subscribe(render));
  render();
  return node;
}
