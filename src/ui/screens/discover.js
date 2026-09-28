import { el } from '../../core/dom.js';
import { getPersona } from '../../data/personas.js';
import { findAcademyById } from '../../domain/academy.js';
import { isEnrollable, publishedClassrooms, subjectById } from '../../domain/classroom.js';
import {
  ENROLLMENT,
  enrollmentBadge,
  enrollmentStateFor,
  MEMBERSHIP,
  membershipBadge,
  ROLE,
} from '../../domain/school.js';
import { button, emptyState, pageTitle } from '../components/primitives.js';
import { statusBadge } from '../components/status-badge.js';

export function renderDiscover({ store, app, scope }) {
  const node = el('section', { class: 'screen' });

  function render() {
    const state = store.getState();
    const persona = getPersona(state.personaId);
    const learner = persona.role === ROLE.STUDENT;
    const membership = state.memberships?.[persona.id] ?? MEMBERSHIP.NONE;
    const classrooms = publishedClassrooms(state.classrooms ?? []).filter(isEnrollable);

    const children = [pageTitle('Discover')];
    if (learner && membership !== MEMBERSHIP.ACTIVE) children.push(membershipNotice(membership, app));
    children.push(
      ...(classrooms.length
        ? classrooms.map((room) =>
            courseCard(room, {
              state,
              app,
              learner,
              persona,
              membership,
              requests: state.enrollRequests ?? [],
            }),
          )
        : [emptyState('No open classes yet. Academies publish their classrooms here.')]),
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
    el('h3', {}, 'Join an academy to enroll'),
    badge ? el('p', {}, statusBadge(badge.label, badge.tone)) : null,
    el('p', { class: 'muted small' }, 'The academy owner approves memberships. Enrollment opens once you are a member.'),
    membership === MEMBERSHIP.PENDING
      ? el('p', { class: 'muted small' }, 'Your request is waiting for the owner.')
      : button('Request to join', { variant: 'gold', small: true, onClick: () => app.requestMembership() }),
  ]);
}

function courseCard(room, { state, app, learner, persona, membership, requests }) {
  const subject = subjectById(state.subjects ?? [], room.subjectId);
  const academy = findAcademyById(state.academies ?? {}, room.academyId);
  const teacher = room.teacherId ? getPersona(room.teacherId) : null;
  const learners = (room.studentIds ?? []).length;
  const enrolled = (room.studentIds ?? []).includes(persona.id);
  const requestState = enrollmentStateFor(requests, persona.id, room.id);

  let action;
  if (!learner) {
    action = button('Open workspace', {
      small: true,
      onClick: () => app.navigate(persona.role === ROLE.TEACHER ? '/teaching' : '/role'),
    });
  } else if (membership !== MEMBERSHIP.ACTIVE) {
    action = el('span', {}, statusBadge('membership required', 'muted'));
  } else if (enrolled || requestState === ENROLLMENT.APPROVED) {
    action = el('span', {}, statusBadge('enrolled ✓', 'ok'));
  } else {
    const badge = enrollmentBadge(requestState);
    action = badge
      ? el('span', {}, statusBadge(badge.label, badge.tone))
      : button('Request enroll', { variant: 'gold', small: true, onClick: () => app.requestEnrollment(room.id) });
  }

  const meta = [
    `${academy?.name ?? 'Academy'} ✓`,
    teacher ? `teacher ${teacher.displayName} ✓` : 'no teacher yet',
    room.term || null,
    `${learners} learner${learners === 1 ? '' : 's'}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return el('div', { class: 'card' }, [
    el('div', { class: 'crow' }, [
      el('span', { class: 'who' }, room.name),
      subject ? el('span', { class: 'ctx' }, subject.name) : null,
    ]),
    el('p', { class: 'muted small' }, meta),
    el('div', { class: 'arow' }, [action]),
  ]);
}
