import { el } from '../../core/dom.js';
import { getPersona } from '../../data/personas.js';
import {
  SUBMISSION_STATUS,
  classroomsForTeacher,
  homeworkForClassroom,
  submissionFor,
  submissionStatusBadge,
  subjectById,
} from '../../domain/classroom.js';
import { queueByStatus, queueCounts } from '../../domain/review.js';
import { button, emptyState, pageTitle, row, tabs } from '../components/primitives.js';
import { statusBadge } from '../components/status-badge.js';

export function renderTeaching({ store, app, scope }) {
  const node = el('section', { class: 'screen' });

  function render() {
    const state = store.getState();
    const persona = getPersona(state.personaId);
    const counts = queueCounts(state.queue);

    const tabBar = tabs(
      [
        { id: 'classes', label: 'My classes' },
        { id: 'review', label: `To review (${counts.review})` },
        { id: 'draft', label: `Drafts (${counts.draft})` },
        { id: 'final', label: `Finalized (${counts.final})` },
      ],
      state.roleTab,
      (id) => app.setRoleTab(id),
      { label: 'Teaching' },
    );

    const body =
      state.roleTab === 'classes' ? classesBody(state, app, persona) : assessmentBody(state, app);

    node.replaceChildren(pageTitle('Teaching'), tabBar, ...body);
  }

  scope.add(store.subscribe(render));
  render();
  return node;
}

function classesBody(state, app, persona) {
  const classrooms = classroomsForTeacher(state.classrooms ?? [], persona.id);
  if (!classrooms.length) {
    return [emptyState('No classes yet. An academy owner assigns you to a classroom.')];
  }
  return classrooms.map((room) => classCard(state, app, room));
}

function classCard(state, app, room) {
  const subject = subjectById(state.subjects ?? [], room.subjectId);
  const homework = homeworkForClassroom(state.homework ?? [], room.id);
  const students = room.studentIds ?? [];

  return el('div', { class: 'card card--accent' }, [
    el('div', { class: 'crow' }, [
      el('span', { class: 'who' }, room.name),
      subject ? el('span', { class: 'ctx' }, subject.name) : null,
      el('span', { class: 't' }, `${students.length} learner${students.length === 1 ? '' : 's'}`),
    ]),
    el('div', { class: 'arow' }, [
      button('＋ Post homework', { variant: 'gold', small: true, onClick: () => app.openCreateHomework(room.id) }),
      button('Invite learner', { small: true, onClick: () => app.openInviteStudent(room.id) }),
      button('Copy class link', { small: true, onClick: () => app.openClassLink(room.id) }),
    ]),
    ...(homework.length
      ? homework.map((item) => homeworkBlock(state, app, item, students))
      : [emptyState('No homework posted yet.')]),
  ]);
}

function homeworkBlock(state, app, item, students) {
  const rows = students.map((studentId) => {
    const submission = submissionFor(state.submissions ?? [], item.id, studentId);
    const token = submissionStatusBadge(submission);
    const learner = getPersona(studentId);
    const graded = submission?.status === SUBMISSION_STATUS.GRADED;
    return row([
      el('span', { class: 'who' }, learner.displayName),
      statusBadge(token.label, token.tone),
      el('span', { class: 'spacer' }),
      submission
        ? button(graded ? 'Edit score' : 'Set score', {
            variant: graded ? 'default' : 'gold',
            small: true,
            onClick: () => app.openGradeSubmission(submission.id),
          })
        : null,
    ]);
  });
  if (!rows.length) rows.push(emptyState('No learners enrolled yet.'));

  return el('div', {}, [
    el('h3', {}, `${item.title} · due ${item.due} · out of ${item.maxScore}`),
    item.instructions ? el('p', { class: 'muted small' }, item.instructions) : null,
    el('div', { class: 'rows' }, rows),
  ]);
}

function assessmentBody(state, app) {
  const items = queueByStatus(state.queue, state.roleTab);
  const rows = el(
    'div',
    { class: 'rows' },
    items.length
      ? items.map((item) =>
          row([
            el('span', { class: 'who' }, item.learnerName),
            el('span', { class: 'muted small' }, `${item.title} · ${item.version} · ${item.time}`),
            item.score
              ? statusBadge(`${item.status === 'final' ? '✓ ' : 'draft '}${item.score}`, 'info')
              : null,
            el('span', { class: 'spacer' }),
            item.status === 'final'
              ? button('Correct grade', { small: true, onClick: () => app.openReview(item.id, 'correct') })
              : button('Open', { variant: 'gold', small: true, onClick: () => app.openReview(item.id, 'review') }),
          ]),
        )
      : [emptyState('Nothing here ✓')],
  );

  const completion = completionCard(state, app);
  return [...(completion ? [completion] : []), rows];
}

function completionCard(state, app) {
  if (state.criteriaMet && !state.completionSent) {
    return el('div', { class: 'card card--accent' }, [
      el('h3', {}, 'Alice · CS-101 — all completion criteria met'),
      button('Send completion', { variant: 'gold', onClick: () => app.sendCompletion() }),
    ]);
  }
  if (state.completionSent && !state.signed) {
    return el('div', { class: 'card' }, [
      statusBadge('completion sent — awaiting organization signature', 'info'),
    ]);
  }
  if (state.signed) {
    return el('div', { class: 'card' }, [statusBadge('✓ certificate issued to Alice', 'ok')]);
  }
  return null;
}
