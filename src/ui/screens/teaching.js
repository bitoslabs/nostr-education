import { el } from '../../core/dom.js';
import { bindScreen } from '../../core/reactive.js';
import { formatDate } from '../../core/time.js';
import { getPersona } from '../../data/personas.js';
import {
  HOMEWORK_STATUS,
  SUBMISSION_STATUS,
  averagePercent,
  classroomsForAcademy,
  classroomsForTeacher,
  enrolledAccountIds,
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
import { button, dateMeta, emptyState, pageTitle, row, tabs, timeStamp } from '../components/primitives.js';
import { statusBadge } from '../components/status-badge.js';

export function renderTeaching({ app, state }) {
  const node = el('section', { class: 'screen' });
  let studentQuery = '';
  let studentSort = 'name';
  let studentClass = 'all';
  let studentSubject = 'all';
  let assessQuery = '';
  let assessClass = 'all';
  let gradebookQuery = '';

  function render(snapshot) {
    const persona = getPersona(snapshot.personaId);
    const queue = reviewQueue(snapshot.submissions ?? [], snapshot.homework ?? [], scopedClassrooms(snapshot, persona));
    const counts = reviewCounts(queue);
    const roster = scopedRoster(snapshot, persona);

    const tabBar = tabs(
      [
        { id: 'classes', label: t('teaching.tabClasses') },
        { id: 'students', label: t('teaching.tabStudents', { count: roster.length }) },
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
    else if (snapshot.roleTab === 'students') {
      body = studentsBody({
        state,
        app,
        roster,
        getQuery: () => studentQuery,
        setQuery: (value) => {
          studentQuery = value;
        },
        getSort: () => studentSort,
        setSort: (value) => {
          studentSort = value;
        },
        getClass: () => studentClass,
        setClass: (value) => {
          studentClass = value;
        },
        getSubject: () => studentSubject,
        setSubject: (value) => {
          studentSubject = value;
        },
      });
    } else if (snapshot.roleTab === 'gradebook') {
      body = gradebookBody({
        state,
        app,
        persona,
        getQuery: () => gradebookQuery,
        setQuery: (value) => {
          gradebookQuery = value;
        },
      });
    }
    else {
      body = assessmentBody({
        tab: snapshot.roleTab,
        state,
        app,
        queue,
        getQuery: () => assessQuery,
        setQuery: (value) => {
          assessQuery = value;
        },
        getClass: () => assessClass,
        setClass: (value) => {
          assessClass = value;
        },
      });
    }

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

// The roster a teacher can act on: on-device studentIds plus learners who
// self-enrolled with a capability (their ids never sync into the class record).
function classroomRoster(state, room) {
  return [
    ...new Set([...(room.studentIds ?? []), ...enrolledAccountIds(state.capabilities ?? [], room.id)]),
  ];
}

function scopedClassrooms(state, persona) {
  const owned = state.academies?.[persona.id];
  if (persona.role === ROLE.OWNER && owned) {
    return classroomsForAcademy(state.classrooms ?? [], owned.id);
  }
  return classroomsForTeacher(state.classrooms ?? [], persona.id, state.capabilities ?? []);
}

// One row per learner per class, with their submission progress and average.
function scopedRoster(state, persona) {
  const entries = [];
  for (const room of scopedClassrooms(state, persona)) {
    const homework = homeworkForClassroom(state.homework ?? [], room.id).filter(
      (item) => item.status !== HOMEWORK_STATUS.DRAFT,
    );
    const subject = subjectById(state.subjects ?? [], room.subjectId);
    for (const studentId of classroomRoster(state, room)) {
      const submissions = homework
        .map((item) => submissionFor(state.submissions ?? [], item.id, studentId))
        .filter(Boolean);
      const graded = submissions.filter((submission) => submission.status === SUBMISSION_STATUS.GRADED);
      entries.push({
        studentId,
        classroomId: room.id,
        classroomName: room.name,
        subjectId: room.subjectId ?? null,
        subjectName: subject?.name ?? null,
        homeworkCount: homework.length,
        submitted: submissions.length,
        graded: graded.length,
        score: graded.reduce((sum, submission) => sum + (Number(submission.score) || 0), 0),
        max: graded.reduce((sum, submission) => sum + (Number(submission.maxScore) || 0), 0),
        average: averagePercent(submissions),
      });
    }
  }
  return entries;
}

function rosterName(entry) {
  return getPersona(entry.studentId).displayName ?? '';
}

function filterRoster(entries, { query = '', sort = 'name', classId = 'all', subjectId = 'all' } = {}) {
  const needle = String(query).trim().toLowerCase();
  let list = classId && classId !== 'all'
    ? entries.filter((entry) => entry.classroomId === classId)
    : [...entries];
  if (subjectId && subjectId !== 'all') {
    list = list.filter((entry) => (entry.subjectId ?? 'none') === subjectId);
  }
  if (needle) {
    list = list.filter((entry) => {
      const learner = getPersona(entry.studentId);
      return [learner.displayName, learner.handle, entry.classroomName]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }
  list.sort((left, right) => {
    if (sort === 'class') {
      return left.classroomName.localeCompare(right.classroomName) || rosterName(left).localeCompare(rosterName(right));
    }
    if (sort === 'average') return (right.average ?? -1) - (left.average ?? -1);
    return rosterName(left).localeCompare(rosterName(right));
  });
  return list;
}

function rosterSummary(entries) {
  const averages = entries.map((entry) => entry.average).filter((value) => value != null);
  return {
    learners: new Set(entries.map((entry) => entry.studentId)).size,
    classes: new Set(entries.map((entry) => entry.classroomId)).size,
    average: averages.length ? Math.round(averages.reduce((sum, value) => sum + value, 0) / averages.length) : null,
    graded: entries.reduce((sum, entry) => sum + entry.graded, 0),
    total: entries.reduce((sum, entry) => sum + entry.homeworkCount, 0),
    score: entries.reduce((sum, entry) => sum + (entry.score ?? 0), 0),
    max: entries.reduce((sum, entry) => sum + (entry.max ?? 0), 0),
  };
}

// Per-subject rollup of the currently filtered roster.
function subjectSummaries(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const key = entry.subjectId ?? 'none';
    const group = groups.get(key) ?? { id: key, name: entry.subjectName ?? t('teaching.noSubject'), rows: [] };
    group.rows.push(entry);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({ id: group.id, name: group.name, ...rosterSummary(group.rows) }));
}

function rosterStat(value, label) {
  return el('div', { class: 'stat' }, [el('b', {}, value), el('span', {}, label)]);
}

function rosterTableRow(app, entry) {
  const learner = getPersona(entry.studentId);
  const complete = entry.homeworkCount > 0 && entry.graded === entry.homeworkCount;
  return el('tr', {}, [
    el('td', {}, el('span', { class: 'who' }, learner.displayName)),
    el('td', {}, el('span', { class: 'muted small' }, learner.handle ? `@${learner.handle}` : '—')),
    el('td', {}, entry.classroomName),
    el(
      'td',
      {},
      entry.average == null
        ? el('span', {}, '—')
        : statusBadge(t('teaching.average', { n: entry.average }), 'ok'),
    ),
    el(
      'td',
      {},
      entry.max > 0
        ? el('span', { class: 'points' }, t('teaching.pointsOf', { score: entry.score, max: entry.max }))
        : el('span', {}, '—'),
    ),
    el(
      'td',
      {},
      statusBadge(t('teaching.rosterProgress', { done: entry.graded, total: entry.homeworkCount }), complete ? 'ok' : 'info'),
    ),
    el(
      'td',
      { class: 'num' },
      button(t('teaching.tabGradebook'), {
        small: true,
        onClick: () => {
          app.setGradebookClass(entry.classroomId);
          app.setRoleTab('gradebook');
        },
      }),
    ),
  ]);
}

function studentsBody({
  state,
  app,
  roster,
  getQuery,
  setQuery,
  getSort,
  setSort,
  getClass,
  setClass,
  getSubject,
  setSubject,
}) {
  const classFilter = el(
    'select',
    { 'aria-label': t('teaching.filterClass') },
    [
      { id: 'all', label: t('teaching.allClasses') },
      ...[...new Map(roster.map((entry) => [entry.classroomId, entry.classroomName])).entries()].map(
        ([id, name]) => ({ id, label: name }),
      ),
    ].map((option) => el('option', { value: option.id, selected: option.id === getClass() }, option.label)),
  );
  const subjectFilter = el(
    'select',
    { 'aria-label': t('teaching.filterSubject') },
    [
      { id: 'all', label: t('teaching.allSubjects') },
      ...[...new Map(roster.map((entry) => [entry.subjectId ?? 'none', entry.subjectName ?? t('teaching.noSubject')])).entries()].map(
        ([id, name]) => ({ id, label: name }),
      ),
    ].map((option) => el('option', { value: option.id, selected: option.id === getSubject() }, option.label)),
  );
  const queryInput = el('input', {
    type: 'search',
    placeholder: t('teaching.rosterSearch'),
    'aria-label': t('teaching.rosterSearch'),
    value: getQuery(),
  });
  const sortSelect = el(
    'select',
    { 'aria-label': t('teaching.rosterSort') },
    [
      { id: 'name', label: t('teaching.rosterSortName') },
      { id: 'class', label: t('teaching.rosterSortClass') },
      { id: 'average', label: t('teaching.rosterSortAverage') },
    ].map((option) => el('option', { value: option.id, selected: option.id === getSort() }, option.label)),
  );

  const summaryWrap = el('div', { class: 'statgrid' });
  const subjectTbody = el('tbody');
  const subjectWrap = el(
    'div',
    { class: 'dtable-wrap' },
    el('table', { class: 'dtable' }, [
      el(
        'thead',
        {},
        el(
          'tr',
          {},
          [
            t('teaching.colSubject'),
            t('teaching.colLearners'),
            t('teaching.colAverage'),
            t('teaching.colPoints'),
            t('teaching.colProgress'),
          ].map(
            (label) => el('th', {}, label),
          ),
        ),
      ),
      subjectTbody,
    ]),
  );
  const subjectHeading = el('h3', { class: 'muted small section-title' }, t('teaching.bySubject'));
  const tbody = el('tbody');
  const table = el('table', { class: 'dtable' }, [
    el(
      'thead',
      {},
      el(
        'tr',
        {},
        [
          t('teaching.colLearner'),
          t('teaching.colHandle'),
          t('teaching.colClass'),
          t('teaching.colAverage'),
          t('teaching.colScore'),
          t('teaching.colProgress'),
          '',
        ].map((label) => el('th', {}, label)),
      ),
    ),
    tbody,
  ]);
  const listWrap = el('div', { class: 'dtable-wrap' }, table);

  const draw = () => {
    const persona = getPersona(state.val.personaId);
    const entries = filterRoster(scopedRoster(state.val, persona), {
      query: getQuery(),
      sort: getSort(),
      classId: getClass(),
      subjectId: getSubject(),
    });
    const summary = rosterSummary(entries);
    summaryWrap.replaceChildren(
      rosterStat(String(summary.learners), t('teaching.statLearners')),
      rosterStat(String(summary.classes), t('teaching.statClasses')),
      rosterStat(summary.average == null ? '—' : `${summary.average}%`, t('teaching.statAverage')),
      rosterStat(`${summary.graded}/${summary.total}`, t('teaching.statGraded')),
    );

    const subjects = subjectSummaries(entries);
    subjectTbody.replaceChildren(
      ...(subjects.length
        ? subjects.map((group) =>
            el('tr', {}, [
              el('td', {}, el('span', { class: 'who' }, group.name)),
              el('td', {}, String(group.learners)),
              el(
                'td',
                {},
                group.average == null
                  ? el('span', {}, '—')
                  : statusBadge(t('teaching.average', { n: group.average }), 'ok'),
              ),
              el(
                'td',
                {},
                group.max > 0
                  ? el('span', { class: 'points' }, t('teaching.pointsOf', { score: group.score, max: group.max }))
                  : el('span', {}, '—'),
              ),
              el(
                'td',
                {},
                statusBadge(
                  t('teaching.rosterProgress', { done: group.graded, total: group.total }),
                  group.total > 0 && group.graded === group.total ? 'ok' : 'info',
                ),
              ),
            ]),
          )
        : [el('tr', {}, el('td', { colspan: '5', class: 'muted small' }, t('teaching.rosterEmpty')))]),
    );
    subjectHeading.hidden = !subjects.length;
    subjectWrap.hidden = !subjects.length;
    tbody.replaceChildren(
      ...(entries.length
        ? entries.map((entry) => rosterTableRow(app, entry))
        : [
            el(
              'tr',
              {},
              el('td', { colspan: '7', class: 'muted small' }, t('teaching.rosterEmpty')),
            ),
          ]),
    );
  };

  for (const control of [classFilter, subjectFilter, queryInput, sortSelect]) {
    control.addEventListener('change', () => {
      setClass(classFilter.value);
      setSubject(subjectFilter.value);
      setQuery(queryInput.value);
      setSort(sortSelect.value);
      draw();
    });
  }
  queryInput.addEventListener('input', () => {
    setQuery(queryInput.value);
    draw();
  });

  draw();

  if (!roster.length) return [emptyState(t('teaching.emptyLearners'))];

  return [
    summaryWrap,
    subjectHeading,
    subjectWrap,
    // Filter/search/sort sit directly on top of the roster table they control.
    el('div', { class: 'toolbar' }, [classFilter, subjectFilter, queryInput, sortSelect]),
    listWrap,
  ];
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
  const students = classroomRoster(state, room);
  const pending = reviewCounts(reviewQueue(state.submissions ?? [], homework, [room])).pending;

  return el('div', { class: 'card card--accent' }, [
    el('div', { class: 'crow' }, [
      el('span', { class: 'who' }, room.name),
      subject ? el('span', { class: 'ctx' }, subject.name) : null,
      el(
        'span',
        { class: 't' },
        students.length === 1 ? t('teaching.learnerOne') : t('teaching.learners', { count: students.length }),
      ),
      pending ? statusBadge(t('teaching.toGrade', { n: pending }), 'warn') : null,
    ]),
    el('div', { class: 'arow' }, [
      button(t('teaching.postHomeworkButton'), { variant: 'gold', small: true, onClick: () => app.openCreateHomework(room.id) }),
      button(t('teaching.inviteLearner'), { small: true, onClick: () => app.openInviteStudent(room.id) }),
      button(t('teaching.shareClassLink'), { small: true, onClick: () => app.openClassLink(room.id) }),
    ]),
    ...(homework.length
      ? homework.map((item) => homeworkAccordion(state, app, item, students))
      : [emptyState(t('teaching.emptyHomework'))]),
    completionAccordion(state, app, room, homework, students),
  ]);
}

// Collapse per-class detail so the class list stays scannable; expand to work.
function completionAccordion(state, app, room, homework, students) {
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
      recommended ? statusBadge(t('teaching.recommended'), 'ok') : statusBadge(badgeLabel, badge.tone),
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

  return el('details', { class: 'acc' }, [
    el('summary', {}, [
      el('span', { class: 'who' }, t('teaching.completion')),
      el('span', { class: 'spacer' }),
      button(t('teaching.rules'), {
        small: true,
        onClick: (event) => {
          event.preventDefault();
          event.stopPropagation();
          app.openCompletionPolicy(room.id);
        },
      }),
    ]),
    el('div', { class: 'acc__body' }, el('div', { class: 'rows' }, rows)),
  ]);
}

function homeworkAccordion(state, app, item, students) {
  const status = homeworkStatusBadge(item.status);
  const graded = students.filter(
    (studentId) => submissionFor(state.submissions ?? [], item.id, studentId)?.status === SUBMISSION_STATUS.GRADED,
  ).length;
  const rows = students.map((studentId) => {
    const submission = submissionFor(state.submissions ?? [], item.id, studentId);
    const token = submissionStatusBadge(submission);
    const learner = getPersona(studentId);
    const isGraded = submission?.status === SUBMISSION_STATUS.GRADED;
    return row([
      el('span', { class: 'who' }, learner.displayName),
      statusBadge(t(token.key, token.params), token.tone),
      submission?.late ? statusBadge(t('teaching.late'), 'warn') : null,
      submission
        ? timeStamp('teaching.submittedAt', submission.submittedEventAt ?? submission.submittedAt)
        : null,
      el('span', { class: 'spacer' }),
      submission
        ? el('span', { class: 'inline-actions' }, [
            button(t('teaching.viewSubmission'), {
              small: true,
              onClick: () => app.openViewSubmission(submission.id),
            }),
            button(isGraded ? t('teaching.editScore') : t('teaching.setScore'), {
              variant: isGraded ? 'default' : 'gold',
              small: true,
              onClick: () => app.openGradeSubmission(submission.id),
            }),
          ])
        : null,
    ]);
  });
  if (!rows.length) rows.push(emptyState(t('teaching.emptyLearners')));

  return el('details', { class: 'acc' }, [
    el('summary', {}, [
      el('span', { class: 'who' }, item.title),
      statusBadge(status ? t(status.key, status.params) : t('common.badge.published'), status?.tone ?? 'ok'),
      el('span', { class: 'muted small' }, t('teaching.rosterProgress', { done: graded, total: students.length })),
      el('span', { class: 'muted small' }, t('teaching.submitDueMeta', { due: item.due, maxScore: item.maxScore })),
      dateMeta(item.eventCreatedAt ?? item.createdAt, item.eventUpdatedAt ?? item.updatedAt),
      el('span', { class: 'spacer' }),
      button(t('teaching.manage'), {
        small: true,
        onClick: (event) => {
          event.preventDefault();
          event.stopPropagation();
          app.openManageHomework(item.id);
        },
      }),
    ]),
    el('div', { class: 'acc__body' }, [
      item.cover || item.instructions
        ? el(
            'div',
            { class: item.cover && item.instructions ? 'hw__grid hw__grid--media' : 'hw__grid' },
            [
              item.cover ? el('img', { class: 'hw__thumb', src: item.cover, alt: '', loading: 'lazy' }) : null,
              item.instructions
                ? el('div', { class: 'hw__text' }, el('p', { class: 'muted small' }, item.instructions))
                : null,
            ],
          )
        : null,
      el('div', { class: 'rows' }, rows),
    ]),
  ]);
}

function assessmentBody({ tab, state, app, queue, getQuery, setQuery, getClass, setClass }) {
  const wanted = tab === 'graded' ? SUBMISSION_STATUS.GRADED : SUBMISSION_STATUS.SUBMITTED;
  const base = queue.filter((entry) => entry.submission.status === wanted);
  const classes = [
    ...new Map(
      base
        .filter((entry) => entry.classroom?.id)
        .map((entry) => [entry.classroom.id, entry.classroom.name]),
    ).entries(),
  ];

  const classSelect = el(
    'select',
    { 'aria-label': t('teaching.filterClass') },
    [
      el('option', { value: 'all', selected: getClass() === 'all' }, t('teaching.allClasses')),
      ...classes.map(([id, name]) => el('option', { value: id, selected: id === getClass() }, name)),
    ],
  );
  const search = el('input', {
    type: 'search',
    placeholder: t('teaching.assessmentSearch'),
    'aria-label': t('teaching.assessmentSearch'),
    value: getQuery(),
  });

  const summaryWrap = el('div', { class: 'statgrid' });
  const tbody = el('tbody');
  const table = el('table', { class: 'dtable' }, [
    el(
      'thead',
      {},
      el(
        'tr',
        {},
        [
          t('teaching.colLearner'),
          t('teaching.colClass'),
          t('teaching.colHomework'),
          t('teaching.colStatus'),
          t('teaching.colVersion'),
          '',
        ].map((label) => el('th', {}, label)),
      ),
    ),
    tbody,
  ]);
  const listWrap = el('div', { class: 'dtable-wrap' }, table);

  const draw = () => {
    const needle = String(getQuery()).trim().toLowerCase();
    const filtered = base.filter((entry) => {
      if (getClass() !== 'all' && entry.classroom?.id !== getClass()) return false;
      if (!needle) return true;
      const learner = getPersona(entry.submission.studentId);
      return [learner.displayName, entry.homework?.title, entry.classroom?.name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });

    const late = filtered.filter((entry) => entry.submission.late).length;
    const average =
      wanted === SUBMISSION_STATUS.GRADED ? averagePercent(filtered.map((entry) => entry.submission)) : null;
    summaryWrap.replaceChildren(
      rosterStat(
        String(filtered.length),
        wanted === SUBMISSION_STATUS.GRADED ? t('teaching.statGraded') : t('teaching.statPending'),
      ),
      rosterStat(String(late), t('teaching.statLate')),
      rosterStat(String(new Set(filtered.map((entry) => entry.classroom?.id)).size), t('teaching.statClasses')),
      rosterStat(average == null ? '—' : `${average}%`, t('teaching.statAverage')),
    );

    tbody.replaceChildren(
      ...(filtered.length
        ? filtered.map(({ submission, homework, classroom }) => {
            const token = submissionStatusBadge(submission);
            const graded = submission.status === SUBMISSION_STATUS.GRADED;
            const submitted = formatDate(submission.submittedEventAt ?? submission.submittedAt);
            return el('tr', {}, [
              el('td', {}, el('span', { class: 'who' }, getPersona(submission.studentId).displayName)),
              el('td', {}, classroom?.name ?? '—'),
              el('td', {}, homework?.title ?? '—'),
              el('td', {}, statusBadge(t(token.key, token.params), token.tone)),
              el(
                'td',
                {},
                [
                  t('teaching.versionShort', { version: submission.version }),
                  submission.late ? t('teaching.late') : null,
                  submitted,
                ]
                  .filter(Boolean)
                  .join(' · '),
              ),
              el(
                'td',
                { class: 'num' },
                el('span', { class: 'inline-actions' }, [
                  button(t('teaching.viewSubmission'), {
                    small: true,
                    onClick: () => app.openViewSubmission(submission.id),
                  }),
                  button(graded ? t('teaching.editScore') : t('teaching.setScore'), {
                    variant: 'gold',
                    small: true,
                    onClick: () => app.openGradeSubmission(submission.id),
                  }),
                ]),
              ),
            ]);
          })
        : [
            el(
              'tr',
              {},
              el(
                'td',
                { colspan: '6', class: 'muted small' },
                wanted === SUBMISSION_STATUS.GRADED ? t('teaching.emptyGraded') : t('teaching.emptyReview'),
              ),
            ),
          ]),
    );
  };

  classSelect.addEventListener('change', () => {
    setClass(classSelect.value);
    draw();
  });
  search.addEventListener('input', () => {
    setQuery(search.value);
    draw();
  });

  draw();

  return [
    summaryWrap,
    el('div', { class: 'toolbar' }, [classSelect, search]),
    listWrap,
  ];
}

function gradebookBody({ state, app, persona, getQuery, setQuery }) {
  const snapshot = state.val;
  const classrooms = scopedClassrooms(snapshot, persona);
  if (!classrooms.length) return [emptyState(t('teaching.emptyGradebook'))];

  const selectedId = classrooms.some((room) => room.id === snapshot.gradebookClassId)
    ? snapshot.gradebookClassId
    : classrooms[0].id;
  const room = classrooms.find((entry) => entry.id === selectedId);
  const homework = homeworkForClassroom(snapshot.homework ?? [], room.id).filter(
    (item) => item.status !== HOMEWORK_STATUS.DRAFT,
  );
  const students = classroomRoster(snapshot, room);
  const submissions = snapshot.submissions ?? [];
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
      : el('span', { class: 'who' }, room.name);

  const toolbar = el('div', { class: 'toolbar' }, [picker]);

  if (!homework.length) return [toolbar, emptyState(t('teaching.emptyPublishedHomework'))];
  if (!students.length) return [toolbar, emptyState(t('teaching.emptyClassLearners'))];

  const queryInput = el('input', {
    type: 'search',
    placeholder: t('teaching.rosterSearch'),
    'aria-label': t('teaching.rosterSearch'),
    value: getQuery(),
  });
  toolbar.append(queryInput);

  const gradedCells = students.reduce(
    (count, studentId) =>
      count +
      homework.filter(
        (item) => submissionFor(submissions, item.id, studentId)?.status === SUBMISSION_STATUS.GRADED,
      ).length,
    0,
  );
  const totalCells = students.length * homework.length;
  const summaryWrap = el('div', { class: 'statgrid' }, [
    rosterStat(String(students.length), t('teaching.statLearners')),
    rosterStat(String(homework.length), t('teaching.statHomework')),
    rosterStat(classAverage == null ? '—' : `${classAverage}%`, t('teaching.statAverage')),
    rosterStat(`${gradedCells}/${totalCells}`, t('teaching.statGraded')),
  ]);

  const legend = el('div', { class: 'legend' }, [
    el('span', { class: 'legend__item' }, [el('span', { class: 'chip is-on' }, '10'), t('teaching.legendGraded')]),
    el('span', { class: 'legend__item' }, [el('span', { class: 'chip' }, '•'), t('teaching.legendSubmitted')]),
    el('span', { class: 'legend__item' }, [el('span', { class: 'chip' }, '—'), t('teaching.legendMissing')]),
  ]);

  const tbody = el('tbody');
  const table = el('table', { class: 'dtable dtable--matrix' }, [
    el(
      'thead',
      {},
      el(
        'tr',
        {},
        [
          el('th', {}, t('teaching.colLearner')),
          ...homework.map((item) => el('th', { title: item.title }, item.title)),
          el('th', {}, t('teaching.colAverage')),
        ],
      ),
    ),
    tbody,
  ]);
  const listWrap = el('div', { class: 'dtable-wrap' }, table);

  const draw = () => {
    const needle = String(getQuery()).trim().toLowerCase();
    const visible = needle
      ? students.filter((studentId) => {
          const learner = getPersona(studentId);
          return [learner.displayName, learner.handle]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(needle));
        })
      : students;

    tbody.replaceChildren(
      ...(visible.length
        ? visible.map((studentId) => {
            const learner = getPersona(studentId);
            const cells = homework.map((item) => {
              const submission = submissionFor(submissions, item.id, studentId);
              const graded = submission?.status === SUBMISSION_STATUS.GRADED;
              const tooltip = `${item.title} · ${
                submission ? `${submission.score ?? '—'}/${submission.maxScore ?? '—'}` : t('common.badge.notSubmitted')
              }`;
              let cell;
              if (graded) {
                cell = el(
                  'button',
                  {
                    class: 'chip is-on',
                    type: 'button',
                    title: tooltip,
                    onClick: () => app.openViewSubmission(submission.id),
                  },
                  String(submission.score ?? '—'),
                );
              } else if (submission) {
                cell = el(
                  'button',
                  { class: 'chip', type: 'button', title: tooltip, onClick: () => app.openViewSubmission(submission.id) },
                  '•',
                );
              } else {
                cell = el('span', { class: 'chip', title: tooltip }, '—');
              }
              return el('td', { class: 'cell-score' }, cell);
            });
            const average = averagePercent(
              homework.map((item) => submissionFor(submissions, item.id, studentId)).filter(Boolean),
            );
            return el('tr', {}, [
              el('td', {}, el('span', { class: 'who' }, learner.displayName)),
              ...cells,
              el(
                'td',
                {},
                average == null ? el('span', {}, '—') : statusBadge(t('teaching.average', { n: average }), 'ok'),
              ),
            ]);
          })
        : [el('tr', {}, el('td', { colspan: String(homework.length + 2), class: 'muted small' }, t('teaching.rosterEmpty')))]),
    );
  };

  queryInput.addEventListener('input', () => {
    setQuery(queryInput.value);
    draw();
  });
  draw();

  return [toolbar, summaryWrap, legend, listWrap];
}
