import { el } from '../../core/dom.js';
import { getPersona } from '../../data/personas.js';
import {
  HOMEWORK_STATUS,
  SUBMISSION_STATUS,
  classroomsForStudent,
  homeworkForClassroom,
  submissionFor,
  submissionStatusBadge,
  subjectById,
} from '../../domain/classroom.js';
import { MEMBERSHIP, membershipBadge } from '../../domain/school.js';
import { button, emptyState, pageTitle } from '../components/primitives.js';
import { statusBadge } from '../components/status-badge.js';

export function renderEducation({ store, app, scope }) {
  const node = el('section', { class: 'screen' });

  function render() {
    const state = store.getState();
    const persona = getPersona(state.personaId);
    const membership = state.memberships?.[persona.id] ?? MEMBERSHIP.NONE;
    const token = membershipBadge(membership);

    const children = [pageTitle('Education')];
    if (token) children.push(el('p', {}, statusBadge(token.label, token.tone)));

    if (membership !== MEMBERSHIP.ACTIVE) {
      children.push(joinCard(membership, app));
    } else {
      children.push(...classCards(state, app, persona));
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

function joinCard(membership, app) {
  return el('div', { class: 'card card--accent' }, [
    el('h3', {}, 'Join an academy'),
    el('p', { class: 'muted small' }, 'The owner approves memberships. Once active, your classes and homework appear here.'),
    membership === MEMBERSHIP.PENDING
      ? el('p', { class: 'muted small' }, 'Waiting for owner approval.')
      : button('Request to join BitOS Academy', { variant: 'gold', onClick: () => app.requestMembership() }),
  ]);
}

function classCards(state, app, persona) {
  const classrooms = classroomsForStudent(state.classrooms ?? [], persona.id);
  if (!classrooms.length) {
    return [emptyState('No classes yet. Use an invite link from your teacher or academy.')];
  }
  return classrooms.map((room) => classCard(state, app, persona, room));
}

function classCard(state, app, persona, room) {
  const subject = subjectById(state.subjects ?? [], room.subjectId);
  const teacher = room.teacherId ? getPersona(room.teacherId) : null;
  const homework = homeworkForClassroom(state.homework ?? [], room.id).filter(
    (item) => item.status === HOMEWORK_STATUS.PUBLISHED,
  );

  return el('div', { class: 'card' }, [
    el('div', { class: 'crow' }, [
      el('span', { class: 'who' }, room.name),
      subject ? el('span', { class: 'ctx' }, subject.name) : null,
    ]),
    el('p', { class: 'muted small' }, teacher ? `Teacher: ${teacher.displayName} ✓` : 'No teacher assigned'),
    ...(homework.length
      ? homework.map((item) => homeworkRow(state, app, persona, item))
      : [emptyState('No homework yet.')]),
  ]);
}

function homeworkRow(state, app, persona, item) {
  const submission = submissionFor(state.submissions ?? [], item.id, persona.id);
  const token = submissionStatusBadge(submission);
  const graded = submission?.status === SUBMISSION_STATUS.GRADED;
  const label = graded ? 'Resubmit' : submission ? 'Submit new version' : 'Submit homework';

  const children = [
    el('h3', {}, `${item.title} · due ${item.due} · out of ${item.maxScore}`),
    item.instructions ? el('p', { class: 'muted small' }, item.instructions) : null,
    el('div', { class: 'arow' }, [
      statusBadge(token.label, token.tone),
      button(label, { variant: graded ? 'default' : 'gold', small: true, onClick: () => app.openSubmitHomework(item.id) }),
    ]),
  ];

  if (graded && submission.feedback) {
    children.push(el('blockquote', { class: 'quote' }, `"${submission.feedback}"`));
  }
  return el('div', {}, children);
}
