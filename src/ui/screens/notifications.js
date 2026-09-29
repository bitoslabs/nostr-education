import { el } from '../../core/dom.js';
import { bindScreen } from '../../core/reactive.js';
import { getPersona } from '../../data/personas.js';
import { isVisible } from '../../domain/feed.js';
import { eventCard } from '../components/event-card.js';
import { emptyState, pageTitle } from '../components/primitives.js';

export function renderNotifications({ app, state }) {
  const list = el('div', { class: 'feed' });
  const node = el('section', { class: 'screen' }, [pageTitle('Notifications'), list]);

  function render(snapshot) {
    const persona = getPersona(snapshot.personaId);
    const events = snapshot.events.filter(
      (event) => event.type !== 'social' && isVisible(event, snapshot.personaId),
    );

    list.replaceChildren(
      ...(events.length
        ? events.map((event) =>
            eventCard(event, { persona, actions: app, enrollments: snapshot.enrollRequests }),
          )
        : [emptyState('No workflow notifications.')]),
    );
  }

  return bindScreen(state, node, render);
}
