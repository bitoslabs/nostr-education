import { el } from '../../core/dom.js';
import { bindScreen } from '../../core/reactive.js';
import { getPersona } from '../../data/personas.js';
import {
  HOMEWORK_STATUS,
  SUBMISSION_STATUS,
  averagePercent,
  classroomsForAcademy,
  classroomsForTeacher,
  homeworkForClassroom,
  homeworkStatusBadge,
  reviewCounts,
  reviewQueue,
  scorePercent,
  submissionFor,
  submissionStatusBadge,
  submissionsForClassroom,
  subjectById,
} from '../../domain/classroom.js';
import { completionBadge, evaluateCompletion } from '../../domain/completion.js';
import { ROLE } from '../../domain/school.js';
import { button, emptyState, pageTitle, row, tabs } from '../components/primitives.js';
import { statusBadge } from '../components/status-badge.js';

export function renderTeaching({ app, state }) {
  const node = el('section', { class: 'screen' });

  function render(snapshot) {
    const persona = getPersona(snapshot.personaId);
    const queue = reviewQueue(snapshot.submissions ?? [], snapshot.homework ?? [], scopedClassrooms(snapshot, persona));
    const counts = reviewCounts(queue);

    const tabBar = tabs(
      [
        { id: 'classes', label: 'My classes' },
        { id: 'review', label: `To review (${counts.pending})` },
        { id: 'graded', label: `Graded (${counts.graded})` },
        { id: 'gradebook', label: 'Gradebook' },
      ],
      snapshot.roleTab,
      (id) => app.setRoleTab(id),
      { label: 'Teaching' },
    );

    let body;
    if (snapshot.roleTab === 'classes') body = classesBody(snapshot, app, persona);
    else if (snapshot.roleTab === 'gradebook') body = gradebookBody(snapshot, app, persona);
    else body = assessmentBody(snapshot, app, queue);

    node.replaceChildren(pageTitle('Teaching'), tabBar, ...body);
  }

  return bindScreen(state, node, render);
}

function scopedClassrooms(state, persona) {
  const owned = state.academies?.[persona.id];
  if (persona.role === ROLE.OWNER && owned) {
    return classroomsForAcademy(state.classrooms ?? [], owned.id);
  }
  return classroomsForTeacher(state.classrooms ?? [], persona.id, state.capabilities ?? []);
}

function classesBody(state, app, persona) {
  const classrooms = classroomsForTeacher(state.classrooms ?? [], persona.id, state.capabilities ?? []);
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
      button('Share class link', { small: true, onClick: () => app.openClassLink(room.id) }),
    ]),
    ...(homework.length
      ? homework.map((item) => homeworkBlock(state, app, item, students))
      : [emptyState('No homework posted yet.')]),
    completionBlock(state, app, room, homework, students),
  ]);
}

function completionBlock(state, app, room, homework, students) {
  const rows = students.map((studentId) => {
    const result = evaluateCompletion({
      policy: room.completion,
      homework,
      submissions: state.submissions ?? [],
      studentId,
    });
    const badge = completionBadge(result);
    const recommended = (state.recommendations ?? []).some(
      (entry) => entry.classroomId === room.id && entry.studentId === studentId && entry.status === 'recommended',
    );
    return row([
      el('span', { class: 'who' }, getPersona(studentId).displayName),
      recommended
        ? statusBadge('recommended ✓', 'ok')
        : statusBadge(badge.label, badge.tone),
      el('span', { class: 'spacer' }),
      !recommended && result.eligible
        ? button('Recommend', {
            variant: 'gold',
            small: true,
            onClick: () => app.recommendCompletion({ classroomId: room.id, studentId }),
          })
        : null,
    ]);
  });
  if (!rows.length) rows.push(emptyState('No learners enrolled yet.'));

  return el('div', {}, [
    el('div', { class: 'crow' }, [
      el('span', { class: 'who' }, 'Completion'),
      el('span', { class: 'spacer' }),
      button('Rules', { small: true, onClick: () => app.openCompletionPolicy(room.id) }),
    ]),
    el('div', { class: 'rows' }, rows),
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
      submission?.late ? statusBadge('late', 'warn') : null,
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
    el('div', { class: 'crow' }, [
      el('span', { class: 'who' }, `${item.title} · due ${item.due} · out of ${item.maxScore}`),
      statusBadge(homeworkStatusBadge(item.status)?.label ?? 'published', homeworkStatusBadge(item.status)?.tone ?? 'ok'),
      el('span', { class: 'spacer' }),
      button('Manage', { small: true, onClick: () => app.openManageHomework(item.id) }),
    ]),
    item.instructions ? el('p', { class: 'muted small' }, item.instructions) : null,
    el('div', { class: 'rows' }, rows),
  ]);
}

function assessmentBody(state, app, queue) {
  const wanted = state.roleTab === 'graded' ? SUBMISSION_STATUS.GRADED : SUBMISSION_STATUS.SUBMITTED;
  const entries = queue.filter((entry) => entry.submission.status === wanted);

  const list = entries.length
    ? entries.map(({ submission, homework, classroom }) => {
        const token = submissionStatusBadge(submission);
        const graded = submission.status === SUBMISSION_STATUS.GRADED;
        return row([
          el('span', { class: 'who' }, getPersona(submission.studentId).displayName),
          el('span', { class: 'muted small' }, `${classroom.name} · ${homework.title} · v${submission.version}`),
          statusBadge(token.label, token.tone),
          el('span', { class: 'spacer' }),
          button(graded ? 'Edit score' : 'Set score', {
            variant: graded ? 'default' : 'gold',
            small: true,
            onClick: () => app.openGradeSubmission(submission.id),
          }),
        ]);
      })
    : [
        emptyState(
          wanted === SUBMISSION_STATUS.GRADED ? 'No graded submissions yet.' : 'Nothing to review ✓',
        ),
      ];

  return [el('div', { class: 'rows' }, list)];
}

function gradebookBody(state, app, persona) {
  const classrooms = scopedClassrooms(state, persona);
  if (!classrooms.length) return [emptyState('No classes to grade yet.')];

  const selectedId = classrooms.some((room) => room.id === state.gradebookClassId)
    ? state.gradebookClassId
    : classrooms[0].id;
  const room = classrooms.find((entry) => entry.id === selectedId);
  const homework = homeworkForClassroom(state.homework ?? [], room.id).filter(
    (item) => item.status !== HOMEWORK_STATUS.DRAFT,
  );
  const students = room.studentIds ?? [];
  const submissions = state.submissions ?? [];
  const classAverage = averagePercent(submissionsForClassroom(submissions, room.id));

  const picker =
    classrooms.length > 1
      ? el(
          'select',
          { 'aria-label': 'Class', onChange: (event) => app.setGradebookClass(event.target.value) },
          classrooms.map((entry) =>
            el('option', { value: entry.id, selected: entry.id === selectedId }, entry.name),
          ),
        )
      : el('p', { class: 'muted small' }, room.name);

  const header = el('div', { class: 'crow' }, [
    el('span', { class: 'who' }, room.name),
    el('span', { class: 'spacer' }),
    classAverage == null
      ? statusBadge('no grades yet', 'muted')
      : statusBadge(`class average ${classAverage}%`, 'ok'),
  ]);

  if (!homework.length) return [picker, header, emptyState('No published homework in this class yet.')];
  if (!students.length) return [picker, header, emptyState('No learners enrolled in this class yet.')];

  const rows = students.map((studentId) => {
    const learner = getPersona(studentId);
    const cells = homework.map((item) => {
      const submission = submissionFor(submissions, item.id, studentId);
      const percent = scorePercent(submission);
      const label = submission ? (percent == null ? 'submitted' : `${percent}%`) : '—';
      return el('span', { class: 'chip' }, `${item.title}: ${label}`);
    });
    const average = averagePercent(
      homework.map((item) => submissionFor(submissions, item.id, studentId)).filter(Boolean),
    );
    return row([
      el('span', { class: 'who' }, learner.displayName),
      ...cells,
      el('span', { class: 'spacer' }),
      average == null ? null : statusBadge(`avg ${average}%`, 'ok'),
    ]);
  });

  return [picker, header, el('div', { class: 'rows' }, rows)];
}
