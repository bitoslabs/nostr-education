import { el } from '../../core/dom.js';
import { getPersona } from '../../data/personas.js';
import { assignmentBadge, MEMBERSHIP, membershipBadge, REQUEST_STATUS } from '../../domain/school.js';
import { button, pageTitle } from '../components/primitives.js';
import { statusBadge } from '../components/status-badge.js';

export function renderEducation({ store, app, scope }) {
  const node = el('section', { class: 'screen' });

  function render() {
    const state = store.getState();
    const persona = getPersona(state.personaId);
    const membership = state.memberships?.[persona.id] ?? MEMBERSHIP.NONE;
    const membershipToken = membershipBadge(membership);

    const children = [pageTitle('Education')];

    if (membershipToken) {
      children.push(el('p', {}, statusBadge(membershipToken.label, membershipToken.tone)));
    }

    if (membership !== MEMBERSHIP.ACTIVE) {
      children.push(
        el('div', { class: 'card card--accent' }, [
          el('h3', {}, 'Join BitOS Academy'),
          el('p', { class: 'muted small' }, 'The owner approves memberships. Once active, your classes and assignments appear here.'),
          membership === MEMBERSHIP.PENDING
            ? el('p', { class: 'muted small' }, 'Waiting for owner approval.')
            : button('Request to join', { variant: 'gold', onClick: () => app.requestMembership() }),
        ]),
      );
    } else {
      children.push(...activeClassCards(state, persona, app));
    }

    children.push(
      el('div', { class: 'card' }, [
        el('h3', {}, 'Find a course'),
        el('p', { class: 'muted small' }, 'Browse the catalog for new courses.'),
        button('Go to Discover', { onClick: () => app.navigate('/discover') }),
      ]),
    );

    node.replaceChildren(...children);
  }

  scope.add(store.subscribe(render));
  render();
  return node;
}

function activeClassCards(state, persona, app) {
  const cards = [];
  const course = state.courses.find((entry) => entry.id === 'CS-101');
  const badge = assignmentBadge(state.assignment);
  const enrolled = state.enrollRequests.filter(
    (entry) => entry.learnerId === persona.id && entry.status === REQUEST_STATUS.APPROVED,
  );

  cards.push(
    el('div', { class: 'card' }, [
      el('h3', {}, `${course.id} · ${course.title}`),
      el('p', { class: 'muted small' }, `Teacher: Bob ✓ · ${course.assignments} assignments · progress ${course.progress}`),
      el('p', {}, statusBadge(badge.label, badge.tone)),
      button(`Open ${state.assignment.title}`, { variant: 'gold', onClick: () => app.openAssignment() }),
    ]),
    el('div', { class: 'card' }, [
      el('h3', {}, '⏰ Deadlines'),
      el('p', {}, 'A2 revision · due in 2 days · late accepted +48h'),
    ]),
  );

  if (enrolled.length) {
    cards.push(
      el('div', { class: 'card' }, [
        el('h3', {}, 'My classes'),
        el('div', { class: 'rows' }, enrolled.map((entry) =>
          el('div', { class: 'row' }, [
            el('span', { class: 'who' }, `${entry.courseId} · ${entry.courseTitle}`),
            statusBadge('enrolled ✓', 'ok'),
          ]),
        )),
      ]),
    );
  }

  return cards;
}
