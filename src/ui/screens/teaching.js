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
import { t } from '../../services/i18n/index.js';
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
        { id: 'classes', label: t('teaching.tabClasses') },
        { id: 'review', label: t('teaching.tabReview', { count: counts.pending }) },
        { id: 'graded', label: t('teaching.tabGraded', { count: counts.graded }) },
        { id: 'gradebook', label: t('teaching.tabGradebook') },
      ],
      snapshot.roleTab,
      (id) => app.setRoleTab(id),
      { label: t('teaching.title') },
    );

    let body;
    if (snapshot.roleTab === 'classes') body = classesBody(snapshot, app, persona);
    else if (snapshot.roleTab === 'gradebook') body = gradebookBody(snapshot, app, persona);
    else body = assessmentBody(snapshot, app, queue);

    const extras =
      snapshot.roleTab === 'classes' && !snapshot.academies?.[persona.id] ? [createAcademyCard(app)] : [];
    node.replaceChildren(pageTitle(t('teaching.title')), tabBar, ...body, ...extras);
  }

  return bindScreen(state, node, render);
}

function createAcademyCard(app) {
  return el('div', { class: 'card' }, [
    el('h3', {}, t('common.workspace.createTitle')),
    el('p', { class: 'muted small' }, t('common.workspace.createBody')),
    button(t('common.workspace.createAction'), { small: true, onClick: () => app.openCreateAcademy() }),
  ]);
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
    return [emptyState(t('teaching.emptyClasses'))];
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
      el(
        'span',
        { class: 't' },
        students.length === 1 ? t('teaching.learnerOne') : t('teaching.learners', { count: students.length }),
      ),
    ]),
    el('div', { class: 'arow' }, [
      button(t('teaching.postHomeworkButton'), { variant: 'gold', small: true, onClick: () => app.openCreateHomework(room.id) }),
      button(t('teaching.inviteLearner'), { small: true, onClick: () => app.openInviteStudent(room.id) }),
      button(t('teaching.shareClassLink'), { small: true, onClick: () => app.openClassLink(room.id) }),
    ]),
    ...(homework.length
      ? homework.map((item) => homeworkBlock(state, app, item, students))
      : [emptyState(t('teaching.emptyHomework'))]),
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
    const badgeLabel = result.eligible
      ? t('teaching.completionEligible')
      : result.gradedCount === 0
        ? t('teaching.noGradesYet')
        : t('teaching.completionPending', { average: result.average ?? 0 });
    const recommended = (state.recommendations ?? []).some(
      (entry) => entry.classroomId === room.id && entry.studentId === studentId && entry.status === 'recommended',
    );
    return row([
      el('span', { class: 'who' }, getPersona(studentId).displayName),
      recommended
        ? statusBadge(t('teaching.recommended'), 'ok')
        : statusBadge(badgeLabel, badge.tone),
      el('span', { class: 'spacer' }),
      !recommended && result.eligible
        ? button(t('teaching.recommend'), {
            variant: 'gold',
            small: true,
            onClick: () => app.recommendCompletion({ classroomId: room.id, studentId }),
          })
        : null,
    ]);
  });
  if (!rows.length) rows.push(emptyState(t('teaching.emptyLearners')));

  return el('div', {}, [
    el('div', { class: 'crow' }, [
      el('span', { class: 'who' }, t('teaching.completion')),
      el('span', { class: 'spacer' }),
      button(t('teaching.rules'), { small: true, onClick: () => app.openCompletionPolicy(room.id) }),
    ]),
    el('div', { class: 'rows' }, rows),
  ]);
}

function homeworkBlock(state, app, item, students) {
  const status = homeworkStatusBadge(item.status);
  const rows = students.map((studentId) => {
    const submission = submissionFor(state.submissions ?? [], item.id, studentId);
    const token = submissionStatusBadge(submission);
    const learner = getPersona(studentId);
    const graded = submission?.status === SUBMISSION_STATUS.GRADED;
    return row([
      el('span', { class: 'who' }, learner.displayName),
      statusBadge(t(token.key, token.params), token.tone),
      submission?.late ? statusBadge(t('teaching.late'), 'warn') : null,
      el('span', { class: 'spacer' }),
      submission
        ? button(graded ? t('teaching.editScore') : t('teaching.setScore'), {
            variant: graded ? 'default' : 'gold',
            small: true,
            onClick: () => app.openGradeSubmission(submission.id),
          })
        : null,
    ]);
  });
  if (!rows.length) rows.push(emptyState(t('teaching.emptyLearners')));

  return el('div', {}, [
    el('div', { class: 'crow' }, [
      el('span', { class: 'who' }, t('teaching.homeworkMeta', { title: item.title, due: item.due, maxScore: item.maxScore })),
      statusBadge(
        status ? t(status.key, status.params) : t('common.badge.published'),
        status?.tone ?? 'ok',
      ),
      el('span', { class: 'spacer' }),
      button(t('teaching.manage'), { small: true, onClick: () => app.openManageHomework(item.id) }),
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
          statusBadge(t(token.key, token.params), token.tone),
          el('span', { class: 'spacer' }),
          button(graded ? t('teaching.editScore') : t('teaching.setScore'), {
            variant: graded ? 'default' : 'gold',
            small: true,
            onClick: () => app.openGradeSubmission(submission.id),
          }),
        ]);
      })
    : [
        emptyState(
          wanted === SUBMISSION_STATUS.GRADED ? t('teaching.emptyGraded') : t('teaching.emptyReview'),
        ),
      ];

  return [el('div', { class: 'rows' }, list)];
}

function gradebookBody(state, app, persona) {
  const classrooms = scopedClassrooms(state, persona);
  if (!classrooms.length) return [emptyState(t('teaching.emptyGradebook'))];

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
          { 'aria-label': t('teaching.classLabel'), onChange: (event) => app.setGradebookClass(event.target.value) },
          classrooms.map((entry) =>
            el('option', { value: entry.id, selected: entry.id === selectedId }, entry.name),
          ),
        )
      : el('p', { class: 'muted small' }, room.name);

  const header = el('div', { class: 'crow' }, [
    el('span', { class: 'who' }, room.name),
    el('span', { class: 'spacer' }),
    classAverage == null
      ? statusBadge(t('teaching.noGradesYet'), 'muted')
      : statusBadge(t('teaching.classAverage', { n: classAverage }), 'ok'),
  ]);

  if (!homework.length) return [picker, header, emptyState(t('teaching.emptyPublishedHomework'))];
  if (!students.length) return [picker, header, emptyState(t('teaching.emptyClassLearners'))];

  const rows = students.map((studentId) => {
    const learner = getPersona(studentId);
    const cells = homework.map((item) => {
      const submission = submissionFor(submissions, item.id, studentId);
      const percent = scorePercent(submission);
      const label = submission ? (percent == null ? t('teaching.submitted') : `${percent}%`) : '—';
      return el('span', { class: 'chip' }, t('teaching.gradebookChip', { title: item.title, label }));
    });
    const average = averagePercent(
      homework.map((item) => submissionFor(submissions, item.id, studentId)).filter(Boolean),
    );
    return row([
      el('span', { class: 'who' }, learner.displayName),
      ...cells,
      el('span', { class: 'spacer' }),
      average == null ? null : statusBadge(t('teaching.average', { n: average }), 'ok'),
    ]);
  });

  return [picker, header, el('div', { class: 'rows' }, rows)];
}
