import { el } from '../../core/dom.js';
import { getPersona } from '../../data/personas.js';
import { queueCounts } from '../../domain/review.js';
import { MEMBERSHIP, pendingRequestCount, ROLE } from '../../domain/school.js';
import { button, widget } from '../components/primitives.js';

function healthyRelays(relays) {
  const healthy = relays.filter((relay) => relay.health === 'connected').length;
  return `${healthy} of ${relays.length} healthy`;
}

export function renderRail({ state, app }) {
  const persona = getPersona(state.personaId);
  const relays = el('p', {}, healthyRelays(state.relays));

  if (persona.role === ROLE.TEACHER) {
    const counts = queueCounts(state.queue);
    return el('div', { class: 'rail__stack' }, [
      widget('📥 To review', [
        el('p', {}, `${counts.review} submission${counts.review === 1 ? '' : 's'}`),
        button('Open queue', { small: true, onClick: () => app.navigate('/role') }),
      ]),
      widget('📝 Draft grades', el('p', {}, `${counts.draft} unfinished`)),
      widget('👥 Roster', el('p', {}, '3 learners in CS-101')),
      widget('📡 Relays', relays),
    ]);
  }

  if (persona.role === ROLE.OWNER) {
    const pending = state.signQueue.filter((entry) => entry.status === 'pending').length;
    const requests = pendingRequestCount(state.joinRequests, state.enrollRequests);
    return el('div', { class: 'rail__stack' }, [
      widget('🔏 Pending signatures', [
        el('p', {}, pending ? `${pending} waiting` : 'Nothing pending ✓'),
        button('Open sign queue', { small: true, onClick: () => app.navigate('/role') }),
      ]),
      widget('👤 Enrollment requests', [
        el('p', {}, requests ? `${requests} waiting` : 'Nothing pending ✓'),
        button('Review', { small: true, onClick: () => { app.setOrgTab('enrollment'); app.navigate('/role'); } }),
      ]),
      widget('📡 Relays', relays),
    ]);
  }

  const membership = state.memberships?.[persona.id] ?? MEMBERSHIP.NONE;
  const learnerWidgets = [
    widget('⏰ Due soon', [
      el('p', {}, 'A2 revision · due in 2 days'),
      button('Open', { small: true, onClick: () => app.openAssignment() }),
    ]),
  ];

  if (membership !== MEMBERSHIP.ACTIVE) {
    learnerWidgets.push(
      widget('🏫 Academy', [
        el('p', {}, membership === MEMBERSHIP.PENDING ? 'Membership pending' : 'Not a member yet'),
        membership === MEMBERSHIP.PENDING
          ? null
          : button('Request to join', { small: true, onClick: () => app.requestMembership() }),
      ]),
    );
  } else {
    learnerWidgets.push(widget('📬 Awaiting feedback', el('p', {}, 'A1 · graded ✓ 78%')));
  }

  learnerWidgets.push(widget('📡 Relays', relays));
  return el('div', { class: 'rail__stack' }, learnerWidgets);
}
