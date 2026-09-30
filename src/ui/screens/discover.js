import { el } from '../../core/dom.js';
import { bindScreen } from '../../core/reactive.js';
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
import { t } from '../../services/i18n/index.js';
import { button, emptyState, pageTitle } from '../components/primitives.js';
import { statusBadge } from '../components/status-badge.js';

export function renderDiscover({ app, state }) {
  const node = el('section', { class: 'screen' });

  function render(snapshot) {
    const persona = getPersona(snapshot.personaId);
    const learner = persona.role === ROLE.STUDENT;
    const membership = snapshot.memberships?.[persona.id] ?? MEMBERSHIP.NONE;
    const classrooms = publishedClassrooms(snapshot.classrooms ?? []).filter(isEnrollable);

    const children = [pageTitle(t('discover.title'))];
    if (learner && membership !== MEMBERSHIP.ACTIVE) children.push(membershipNotice(membership, app));
    children.push(
      ...(classrooms.length
        ? classrooms.map((room) =>
            courseCard(room, {
              state: snapshot,
              app,
              learner,
              persona,
              membership,
              requests: snapshot.enrollRequests ?? [],
            }),
          )
        : [emptyState(t('discover.empty'))]),
    );

    node.replaceChildren(...children);
  }

  return bindScreen(state, node, render);
}

function membershipNotice(membership, app) {
  const badge = membershipBadge(membership);
  return el('div', { class: 'card card--accent' }, [
    el('h3', {}, t('discover.joinAcademy')),
    badge ? el('p', {}, statusBadge(t(badge.key, badge.params), badge.tone)) : null,
    el('p', { class: 'muted small' }, t('discover.membershipExplainer')),
    membership === MEMBERSHIP.PENDING
      ? el('p', { class: 'muted small' }, t('discover.requestWaiting'))
      : button(t('discover.requestJoin'), { variant: 'gold', small: true, onClick: () => app.requestMembership() }),
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
    action = button(t('discover.openWorkspace'), {
      small: true,
      onClick: () => app.navigate(persona.role === ROLE.TEACHER ? '/teaching' : '/role'),
    });
  } else if (membership !== MEMBERSHIP.ACTIVE) {
    action = el('span', {}, statusBadge(t('discover.membershipRequired'), 'muted'));
  } else if (enrolled || requestState === ENROLLMENT.APPROVED) {
    action = el('span', {}, statusBadge(t('common.badge.enrolled'), 'ok'));
  } else {
    const badge = enrollmentBadge(requestState);
    action = badge
      ? el('span', {}, statusBadge(t(badge.key, badge.params), badge.tone))
      : button(t('discover.requestEnroll'), { variant: 'gold', small: true, onClick: () => app.requestEnrollment(room.id) });
  }

  const meta = [
    t('discover.academyVerified', { name: academy?.name ?? t('discover.academyFallback') }),
    teacher ? t('discover.teacherVerified', { name: teacher.displayName }) : t('discover.noTeacher'),
    room.term || null,
    t(learners === 1 ? 'discover.learnerOne' : 'discover.learnerMany', { count: learners }),
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
