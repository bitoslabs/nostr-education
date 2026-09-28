import { el } from '../../core/dom.js';
import { getPersona } from '../../data/personas.js';
import {
  ENROLLMENT,
  enrollmentBadge,
  enrollmentStateFor,
  MEMBERSHIP,
  membershipBadge,
  ROLE,
} from '../../domain/school.js';
import { button, pageTitle } from '../components/primitives.js';
import { statusBadge } from '../components/status-badge.js';

export function renderDiscover({ store, app, scope }) {
  const node = el('section', { class: 'screen' });

  function render() {
    const state = store.getState();
    const persona = getPersona(state.personaId);
    const learner = persona.role === ROLE.STUDENT;
    const membership = state.memberships?.[persona.id] ?? MEMBERSHIP.NONE;

    const children = [pageTitle('Discover')];
    if (learner && membership !== MEMBERSHIP.ACTIVE) children.push(membershipNotice(membership, app));
    children.push(
      ...state.courses
        .filter((course) => course.status !== 'planned')
        .map((course) => courseCard(course, { app, learner, membership, requests: state.enrollRequests, personaId: persona.id })),
      el('p', { class: 'muted small' }, 'More courses arrive in the pilot build.'),
    );

    node.replaceChildren(...children);
  }

  scope.add(store.subscribe(render));
  render();
  return node;
}

function membershipNotice(membership, app) {
  const badge = membershipBadge(membership);
  return el('div', { class: 'card card--accent' }, [
    el('h3', {}, 'Join BitOS Academy to enroll'),
    badge ? el('p', {}, statusBadge(badge.label, badge.tone)) : null,
    el('p', { class: 'muted small' }, 'The academy owner approves memberships. Enrollment opens once you are a member.'),
    membership === MEMBERSHIP.PENDING
      ? el('p', { class: 'muted small' }, 'Your request is waiting for the owner.')
      : button('Request to join', { variant: 'gold', small: true, onClick: () => app.requestMembership() }),
  ]);
}

function courseCard(course, { app, learner, membership, requests, personaId }) {
  let action;
  if (!learner) {
    action = button('View course', { small: true, onClick: () => app.stub('Course detail — pilot build.') });
  } else if (membership !== MEMBERSHIP.ACTIVE) {
    action = el('span', {}, statusBadge('membership required', 'muted'));
  } else {
    const state = enrollmentStateFor(requests, personaId, course.id);
    const badge = enrollmentBadge(state);
    if (state === ENROLLMENT.APPROVED) {
      action = el('span', {}, statusBadge('enrolled ✓', 'ok'));
    } else if (badge) {
      action = el('span', {}, statusBadge(badge.label, badge.tone));
    } else {
      action = button('Request enroll', { variant: 'gold', small: true, onClick: () => app.requestEnrollment(course.id) });
    }
  }

  return el('div', { class: 'card' }, [
    el('div', { class: 'crow' }, [el('span', { class: 'who' }, `${course.id} · ${course.title}`)]),
    el(
      'p',
      { class: 'muted small' },
      `BitOS Academy ✓ · teacher Bob ✓ · ${course.assignments} assignments · Certificate on completion`,
    ),
    course.status === 'draft' ? el('p', {}, statusBadge('draft — opens soon', 'info')) : null,
    el('div', { class: 'arow' }, [action]),
  ]);
}
