import { el } from '../../core/dom.js';
import {
  CLASS_STATUS,
  HOMEWORK_STATUS,
  LATE_POLICY,
  classStatusBadge,
  homeworkStatusBadge,
  normalizeLatePolicy,
} from '../../domain/classroom.js';
import { normalizePolicy } from '../../domain/completion.js';
import { buildScoreSheet, normalizeRubric, rubricMax, scoresTotal } from '../../domain/rubric.js';
import { t } from '../../services/i18n/index.js';
import { button, noteBox } from './primitives.js';
import { formFoot, formSection } from './form-fields.js';
import { inviteLinkPanel } from './invite-dialog.js';
import { statusBadge } from './status-badge.js';

function errorLine() {
  return el('p', { class: 'small danger', 'aria-live': 'polite' });
}

function preview(text, limit = 140) {
  const value = String(text ?? '').trim();
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}

function historyBlock(versions = []) {
  if (!versions.length) return null;
  return el('div', {}, [
    el(
      'h3',
      {},
      versions.length === 1 ? t('teaching.historyOne') : t('teaching.history', { count: versions.length }),
    ),
    el(
      'div',
      { class: 'rows' },
      versions.map((entry) =>
        el('div', { class: 'row' }, [
          el(
            'span',
            { class: 'muted small' },
            t('teaching.versionMeta', { version: entry.version, date: entry.submittedAt ?? t('teaching.saved') }),
          ),
          el('span', { class: 'quote' }, preview(entry.text) || t('teaching.noText')),
        ]),
      ),
    ),
  ]);
}

function rubricEditor(initial = []) {
  const list = el('div', { class: 'rows' });
  const entries = [];

  function addRow(criterion = {}) {
    const labelInput = el('input', {
      type: 'text',
      value: criterion.label ?? '',
      placeholder: t('teaching.criterion'),
      'aria-label': t('teaching.criterion'),
    });
    const maxInput = el('input', {
      type: 'number',
      value: criterion.max ?? '',
      min: '1',
      placeholder: t('teaching.pts'),
      'aria-label': t('teaching.points'),
    });
    const entry = { labelInput, maxInput };
    const node = el('div', { class: 'row' }, [
      labelInput,
      maxInput,
      button('✕', {
        small: true,
        onClick: () => {
          node.remove();
          entries.splice(entries.indexOf(entry), 1);
        },
      }),
    ]);
    entries.push(entry);
    list.append(node);
  }

  for (const criterion of normalizeRubric(initial)) addRow(criterion);

  const node = el('div', {}, [list, button(t('teaching.addCriterion'), { small: true, onClick: () => addRow() })]);

  function value() {
    return entries.map((entry) => ({ label: entry.labelInput.value, max: entry.maxInput.value }));
  }

  return { node, value };
}

export function renderCreateSubject({ actions, close }) {
  const nameInput = el('input', { id: 'subject-name', type: 'text', placeholder: t('teaching.placeholderSubject') });
  const codeInput = el('input', { id: 'subject-code', type: 'text', placeholder: t('teaching.placeholderSubjectCode') });
  const error = errorLine();
  const cancel = button(t('common.actions.cancel'), { onClick: close });
  const submit = button(t('teaching.addSubject'), { variant: 'gold', type: 'submit' });

  const run = () => {
    if (!String(nameInput.value).trim()) {
      error.textContent = t('teaching.errSubjectName');
      nameInput.focus();
      return;
    }
    const subject = actions.createSubject({ name: nameInput.value, code: codeInput.value });
    if (subject) close();
  };

  return el('div', {}, [
    el('h2', {}, t('teaching.newSubject')),
    el('p', { class: 'muted small' }, t('teaching.newSubjectBlurb')),
    el(
      'form',
      {
        onSubmit: (event) => {
          event.preventDefault();
          run();
        },
      },
      [
        formSection(t('teaching.fieldSubject'), [
          el('label', { for: 'subject-name' }, t('teaching.fieldName')),
          nameInput,
          el('label', { for: 'subject-code' }, t('teaching.fieldCodeOptional')),
          codeInput,
          el('p', { class: 'field-hint' }, t('teaching.subjectCodeHint')),
        ]),
        error,
        formFoot([cancel, submit]),
      ],
    ),
  ]);
}

export function renderEditSubject({ actions, close, subject }) {
  const nameInput = el('input', { id: 'edit-subject-name', type: 'text', value: subject.name ?? '' });
  const codeInput = el('input', { id: 'edit-subject-code', type: 'text', value: subject.code ?? '' });
  const error = errorLine();
  const cancel = button(t('common.actions.cancel'), { onClick: close });
  const submit = button(t('teaching.saveChanges'), { variant: 'gold', type: 'submit' });

  const run = () => {
    if (!String(nameInput.value).trim()) {
      error.textContent = t('teaching.errSubjectName');
      nameInput.focus();
      return;
    }
    const ok = actions.updateSubject({ subjectId: subject.id, name: nameInput.value, code: codeInput.value });
    if (ok) close();
  };

  return el('div', {}, [
    el('h2', {}, t('teaching.editSubject')),
    el(
      'form',
      {
        onSubmit: (event) => {
          event.preventDefault();
          run();
        },
      },
      [
        formSection(t('teaching.fieldSubject'), [
          el('label', { for: 'edit-subject-name' }, t('teaching.fieldName')),
          nameInput,
          el('label', { for: 'edit-subject-code' }, t('teaching.fieldCodeOptional')),
          codeInput,
        ]),
        error,
        formFoot([cancel, submit]),
      ],
    ),
  ]);
}

export function renderCreateClassroom({ actions, close, subjects = [], teachers = [] }) {
  const error = errorLine();

  if (!subjects.length) {
    return el('div', {}, [
      el('h2', {}, t('teaching.newClassroom')),
      noteBox(t('teaching.needSubject'), 'warn'),
      formFoot([button(t('common.actions.close'), { onClick: close })], true),
    ]);
  }

  const subjectSelect = el('select', { id: 'classroom-subject' }, subjects.map((subject) => el('option', { value: subject.id }, `${subject.name}${subject.code ? ` (${subject.code})` : ''}`)));
  const nameInput = el('input', { id: 'classroom-name', type: 'text', placeholder: t('teaching.placeholderClassroom') });
  const termInput = el('input', { id: 'classroom-term', type: 'text', placeholder: t('teaching.placeholderTerm') });
  const teacherSelect = el(
    'select',
    { id: 'classroom-teacher' },
    [
      el('option', { value: '' }, t('teaching.assignLater')),
      ...teachers.map((teacher) => el('option', { value: teacher.id }, t('teaching.teacherSuffix', { name: teacher.displayName }))),
      el('option', { value: '__invite__' }, t('teaching.inviteTeacherOption')),
    ],
  );
  const inviteName = el('input', { id: 'classroom-invite-name', type: 'text', placeholder: t('teaching.placeholderTeacherName') });
  const inviteHandle = el('input', { id: 'classroom-invite-handle', type: 'text', placeholder: t('teaching.placeholderHandleExample') });
  const inviteWrap = formSection(t('teaching.sectionInviteByHandle'), [
    el('label', { for: 'classroom-invite-name' }, t('teaching.fieldNameOptional')),
    inviteName,
    el('label', { for: 'classroom-invite-handle' }, t('teaching.fieldHandleOrNpub')),
    inviteHandle,
  ]);

  teacherSelect.addEventListener('change', () => {
    inviteWrap.hidden = teacherSelect.value !== '__invite__';
  });
  inviteWrap.hidden = true;

  const cancel = button(t('common.actions.cancel'), { onClick: close });
  const submit = button(t('teaching.createClassroom'), { variant: 'gold', type: 'submit' });

  const run = () => {
    const inviting = teacherSelect.value === '__invite__';
    if (inviting && !String(inviteHandle.value).trim()) {
      error.textContent = t('teaching.errTeacherHandle');
      inviteHandle.focus();
      return;
    }
    const classroom = actions.createClassroom({
      subjectId: subjectSelect.value,
      name: nameInput.value,
      term: termInput.value,
      teacherId: inviting ? null : teacherSelect.value || null,
      inviteTarget: inviting ? inviteHandle.value : '',
      inviteName: inviting ? inviteName.value : '',
    });
    if (classroom) close();
  };

  return el('div', {}, [
    el('h2', {}, t('teaching.newClassroom')),
    el('p', { class: 'muted small' }, t('teaching.newClassroomBlurb')),
    el(
      'form',
      {
        onSubmit: (event) => {
          event.preventDefault();
          run();
        },
      },
      [
        formSection(t('teaching.sectionClassroom'), [
          el('label', { for: 'classroom-subject' }, t('teaching.fieldSubject')),
          subjectSelect,
          el('label', { for: 'classroom-name' }, t('teaching.fieldClassroomName')),
          nameInput,
          el('label', { for: 'classroom-term' }, t('teaching.fieldTerm')),
          termInput,
        ]),
        formSection(t('teaching.fieldTeacher'), [
          el('label', { for: 'classroom-teacher' }, t('teaching.fieldTeacher')),
          teacherSelect,
          el('p', { class: 'field-hint' }, t('teaching.classroomTeacherHint')),
        ]),
        inviteWrap,
        error,
        formFoot([cancel, submit]),
      ],
    ),
  ]);
}

export function renderManageClassroom({ classroom, subjects = [], teachers = [], actions, close }) {
  const error = errorLine();
  const archived = classroom.status === CLASS_STATUS.ARCHIVED;
  const badge = classStatusBadge(classroom.status);

  const subjectSelect = el(
    'select',
    { id: 'manage-classroom-subject' },
    subjects.map((subject) => el('option', { value: subject.id }, `${subject.name}${subject.code ? ` (${subject.code})` : ''}`)),
  );
  subjectSelect.value = classroom.subjectId;

  const nameInput = el('input', { id: 'manage-classroom-name', type: 'text', value: classroom.name ?? '' });
  const termInput = el('input', { id: 'manage-classroom-term', type: 'text', value: classroom.term ?? '' });
  const teacherSelect = el(
    'select',
    { id: 'manage-classroom-teacher' },
    [
      el('option', { value: '' }, t('teaching.noTeacherOption')),
      ...teachers.map((teacher) => el('option', { value: teacher.id }, t('teaching.teacherSuffix', { name: teacher.displayName }))),
    ],
  );
  teacherSelect.value = classroom.teacherId ?? '';

  const cancel = button(t('common.actions.cancel'), { onClick: close });
  const submit = button(t('teaching.saveChanges'), { variant: 'gold', type: 'submit' });

  const run = () => {
    if (!String(nameInput.value).trim()) {
      error.textContent = t('teaching.errClassroomName');
      nameInput.focus();
      return;
    }
    const ok = actions.updateClassroom({
      classroomId: classroom.id,
      name: nameInput.value,
      term: termInput.value,
      subjectId: subjectSelect.value,
      teacherId: teacherSelect.value || null,
    });
    if (ok) close();
  };

  return el('div', {}, [
    el('h2', {}, t('teaching.manageTitle', { name: classroom.name })),
    badge ? el('p', {}, statusBadge(t(badge.key, badge.params), badge.tone)) : null,
    el(
      'form',
      {
        onSubmit: (event) => {
          event.preventDefault();
          run();
        },
      },
      [
        subjects.length
          ? formSection(t('teaching.sectionClassroom'), [
              el('label', { for: 'manage-classroom-subject' }, t('teaching.fieldSubject')),
              subjectSelect,
              el('label', { for: 'manage-classroom-name' }, t('teaching.fieldClassroomName')),
              nameInput,
              el('label', { for: 'manage-classroom-term' }, t('teaching.fieldTerm')),
              termInput,
            ])
          : formSection(t('teaching.sectionClassroom'), [
              noteBox(t('teaching.needSubjectEdit'), 'warn'),
              el('label', { for: 'manage-classroom-name' }, t('teaching.fieldClassroomName')),
              nameInput,
              el('label', { for: 'manage-classroom-term' }, t('teaching.fieldTerm')),
              termInput,
            ]),
        formSection(t('teaching.fieldTeacher'), [
          el('label', { for: 'manage-classroom-teacher' }, t('teaching.fieldTeacher')),
          teacherSelect,
          el('p', { class: 'field-hint' }, t('teaching.classroomTeacherHint')),
        ]),
        error,
        formSection(t('teaching.sectionDanger'), [
          el('p', { class: 'muted small' }, t('teaching.dangerBlurb')),
          el('div', { class: 'arow' }, [
            archived
              ? button(t('teaching.restoreClass'), { small: true, onClick: () => { actions.restoreClassroom(classroom.id); close(); } })
              : button(t('teaching.archiveClass'), { small: true, onClick: () => { actions.archiveClassroom(classroom.id); close(); } }),
            button(t('teaching.deleteClassroom'), {
              variant: 'danger',
              small: true,
              onClick: async () => {
                const ok = await actions.deleteClassroom(classroom.id);
                if (ok) close();
              },
            }),
          ]),
        ]),
        formFoot([cancel, submit]),
      ],
    ),
  ]);
}

function targetInviteDialog({ title, blurb, invite, actions, close }) {
  const error = errorLine();
  const nameInput = el('input', { type: 'text', placeholder: t('teaching.placeholderFullName'), 'aria-label': t('teaching.fieldName') });
  const targetInput = el('input', { type: 'text', placeholder: t('teaching.placeholderHandle'), 'aria-label': t('teaching.fieldHandleOrNpub') });
  const body = el('div', {}, [
    el('h2', {}, title),
    el('p', { class: 'muted small' }, blurb),
    el('label', {}, t('teaching.fieldNameOptional')),
    nameInput,
    el('label', {}, t('teaching.fieldHandleOrNpub')),
    targetInput,
    error,
    el('div', { class: 'dlg-foot' }, [
      button(t('common.actions.cancel'), { onClick: close }),
      button(t('teaching.createInvite'), {
        variant: 'gold',
        onClick: () => {
          const created = invite({ target: targetInput.value, name: nameInput.value });
          if (!created) {
            error.textContent = t('teaching.errCheckHandle');
            return;
          }
          body.replaceChildren(...inviteLinkPanel({ invite: created, copyText: actions.copyText, actions, close }));
        },
      }),
    ]),
  ]);
  return body;
}

export function renderInviteStudent({ classroom, actions, close }) {
  return targetInviteDialog({
    title: t('teaching.inviteLearnerTitle', { name: classroom.name }),
    blurb: t('teaching.inviteLearnerBlurb'),
    invite: (payload) => actions.inviteStudentToClass({ classroomId: classroom.id, ...payload }),
    actions,
    close,
  });
}

export function renderInviteClassTeacher({ classroom, actions, close }) {
  return targetInviteDialog({
    title: t('teaching.inviteTeacherTitle', { name: classroom.name }),
    blurb: t('teaching.inviteTeacherBlurb'),
    invite: (payload) => actions.inviteClassTeacher({ classroomId: classroom.id, ...payload }),
    actions,
    close,
  });
}

export function renderCreateHomework({ classroom, subject, actions, close }) {
  const error = errorLine();
  const titleInput = el('input', { type: 'text', placeholder: t('teaching.placeholderHomeworkTitle'), 'aria-label': t('teaching.ariaHomeworkTitle') });
  const instructions = el('textarea', { rows: '4', placeholder: t('teaching.placeholderInstructions'), 'aria-label': t('teaching.ariaInstructions') });
  const due = el('input', { type: 'text', placeholder: t('teaching.placeholderDueExample'), 'aria-label': t('teaching.ariaDueDate') });
  const dueAt = el('input', { type: 'datetime-local', 'aria-label': t('teaching.ariaDueDateTime') });
  const maxScore = el('input', { type: 'number', value: '100', min: '1', 'aria-label': t('teaching.ariaMaxScore') });
  const rubric = rubricEditor();

  const submit = (publish) => {
    if (!String(titleInput.value).trim()) {
      error.textContent = t('teaching.errHomeworkTitle');
      return;
    }
    const item = actions.createHomework({
      classroomId: classroom.id,
      title: titleInput.value,
      instructions: instructions.value,
      due: due.value,
      dueAt: dueAt.value,
      maxScore: maxScore.value,
      rubric: rubric.value(),
      publish,
    });
    if (item) close();
  };

  return el('div', {}, [
    el('h2', {}, t('teaching.postHomeworkTitle')),
    el('p', { class: 'muted small' }, `${subject?.name ?? t('teaching.fieldSubject')} ▸ ${classroom.name}`),
    el('label', {}, t('teaching.fieldTitle')),
    titleInput,
    el('label', {}, t('teaching.fieldInstructions')),
    instructions,
    el('label', {}, t('teaching.fieldDue')),
    due,
    el('label', {}, t('teaching.fieldDueDateTime')),
    dueAt,
    el('label', {}, t('teaching.fieldMaxScore')),
    maxScore,
    el('label', {}, t('teaching.fieldRubricOptional')),
    rubric.node,
    error,
    el('div', { class: 'dlg-foot' }, [
      button(t('common.actions.cancel'), { onClick: close }),
      button(t('teaching.saveDraft'), { small: true, onClick: () => submit(false) }),
      button(t('teaching.postHomeworkTitle'), { variant: 'gold', onClick: () => submit(true) }),
    ]),
  ]);
}

export function renderManageHomework({ homeworkItem, actions, close }) {
  const error = errorLine();
  const closed = homeworkItem.status === HOMEWORK_STATUS.CLOSED;
  const isDraft = homeworkItem.status === HOMEWORK_STATUS.DRAFT;
  const badge = homeworkStatusBadge(homeworkItem.status);
  const titleInput = el('input', { type: 'text', value: homeworkItem.title ?? '', 'aria-label': t('teaching.ariaHomeworkTitle') });
  const instructions = el('textarea', {
    rows: '4',
    value: homeworkItem.instructions ?? '',
    placeholder: t('teaching.placeholderInstructions'),
    'aria-label': t('teaching.ariaInstructions'),
  });
  const due = el('input', { type: 'text', value: homeworkItem.due ?? '', 'aria-label': t('teaching.ariaDueDate') });
  const dueAt = el('input', {
    type: 'datetime-local',
    value: homeworkItem.dueAt ?? '',
    'aria-label': t('teaching.ariaDueDateTime'),
  });
  const maxScore = el('input', {
    type: 'number',
    value: String(homeworkItem.maxScore ?? 100),
    min: '1',
    'aria-label': t('teaching.ariaMaxScore'),
  });
  const rubric = rubricEditor(homeworkItem.rubric);

  return el('div', {}, [
    el('h2', {}, t('teaching.manageTitle', { name: homeworkItem.title })),
    badge ? el('p', {}, statusBadge(t(badge.key, badge.params), badge.tone)) : null,
    el('label', {}, t('teaching.fieldTitle')),
    titleInput,
    el('label', {}, t('teaching.fieldInstructions')),
    instructions,
    el('label', {}, t('teaching.fieldDue')),
    due,
    el('label', {}, t('teaching.fieldDueDateTime')),
    dueAt,
    el('label', {}, t('teaching.fieldMaxScore')),
    maxScore,
    el('label', {}, t('teaching.fieldRubricOptional')),
    rubric.node,
    error,
    el('div', { class: 'dlg-foot' }, [
      button(t('common.actions.cancel'), { onClick: close }),
      button(t('teaching.saveChanges'), {
        variant: 'gold',
        onClick: () => {
          if (!String(titleInput.value).trim()) {
            error.textContent = t('teaching.errHomeworkTitle');
            return;
          }
          const ok = actions.updateHomework({
            homeworkId: homeworkItem.id,
            title: titleInput.value,
            instructions: instructions.value,
            due: due.value,
            dueAt: dueAt.value,
            maxScore: maxScore.value,
            rubric: rubric.value(),
          });
          if (ok) close();
        },
      }),
    ]),
    el('div', { class: 'arow' }, [
      isDraft
        ? button(t('teaching.publishToLearners'), {
            variant: 'gold',
            small: true,
            onClick: () => { actions.publishHomework(homeworkItem.id); close(); },
          })
        : closed
          ? button(t('teaching.reopenSubmissions'), { small: true, onClick: () => { actions.reopenHomework(homeworkItem.id); close(); } })
          : button(t('teaching.closeSubmissions'), { small: true, onClick: () => { actions.closeHomework(homeworkItem.id); close(); } }),
      button(t('teaching.deleteHomework'), {
        variant: 'ghost',
        small: true,
        onClick: async () => {
          const ok = await actions.deleteHomework(homeworkItem.id);
          if (ok) close();
        },
      }),
    ]),
  ]);
}

export function renderSubmitHomework({ homeworkItem, submission, versions = [], actions, close }) {
  const error = errorLine();
  const body = el('textarea', {
    rows: '6',
    placeholder: t('teaching.placeholderAnswer'),
    'aria-label': t('teaching.yourAnswer'),
  });
  if (submission?.text) body.value = submission.text;

  return el('div', {}, [
    el('h2', {}, homeworkItem.title),
    el('p', { class: 'muted small' }, t('teaching.submitDueMeta', { due: homeworkItem.due, maxScore: homeworkItem.maxScore })),
    homeworkItem.instructions ? el('p', {}, homeworkItem.instructions) : null,
    submission
      ? noteBox(
          t('teaching.submitVersionNote', {
            next: submission.version + 1,
            current: submission.version,
          }),
        )
      : null,
    historyBlock(versions),
    el('label', {}, t('teaching.yourAnswer')),
    body,
    error,
    el('div', { class: 'dlg-foot' }, [
      button(t('common.actions.cancel'), { onClick: close }),
      button(submission ? t('teaching.submitNewVersion') : t('teaching.submitHomework'), {
        variant: 'gold',
        onClick: () => {
          const ok = actions.submitHomework({ homeworkId: homeworkItem.id, text: body.value });
          if (ok) close();
          else error.textContent = t('teaching.errAnswerRequired');
        },
      }),
    ]),
  ]);
}

export function renderGradeSubmission({
  submission,
  homeworkItem,
  learnerName,
  versions = [],
  revisions = [],
  actions,
  close,
}) {
  const error = errorLine();
  const criteria = normalizeRubric(homeworkItem.rubric);
  const usesRubric = criteria.length > 0;
  const rubricInputs = criteria.map((criterion, index) => {
    const existing = (submission.scores ?? [])[index];
    return el('input', {
      type: 'number',
      min: '0',
      max: String(criterion.max),
      value: existing ? String(existing.score) : '',
      'aria-label': criterion.label,
    });
  });
  const score = el('input', {
    type: 'number',
    min: '0',
    max: String(submission.maxScore),
    value: submission.score == null ? '' : String(submission.score),
    'aria-label': t('teaching.ariaScore'),
  });
  const feedback = el('textarea', {
    rows: '3',
    placeholder: t('teaching.placeholderFeedback'),
    'aria-label': t('teaching.feedback'),
  });
  if (submission.feedback) feedback.value = submission.feedback;

  const scoringBlock = usesRubric
    ? el(
        'div',
        {},
        criteria.map((criterion, index) => [
          el('label', {}, t('teaching.criterionRange', { label: criterion.label, max: criterion.max })),
          rubricInputs[index],
        ]),
      )
    : el('div', {}, [el('label', {}, t('teaching.scoreRange', { max: submission.maxScore })), score]);

  const saveScore = () => {
    if (usesRubric) {
      if (rubricInputs.some((input) => input.value === '')) {
        error.textContent = t('teaching.errScoreAllCriteria');
        return;
      }
      const sheet = buildScoreSheet(criteria, rubricInputs.map((input) => input.value));
      const ok = actions.gradeSubmission({
        submissionId: submission.id,
        score: scoresTotal(sheet),
        scores: sheet,
        feedback: feedback.value,
      });
      if (ok) close();
      else error.textContent = t('teaching.errRubricScores');
      return;
    }
    const ok = actions.gradeSubmission({
      submissionId: submission.id,
      score: score.value,
      feedback: feedback.value,
    });
    if (ok) close();
    else error.textContent = t('teaching.errScoreRange', { max: submission.maxScore });
  };

  const requestRevision = () => {
    const ok = actions.requestRevision({ submissionId: submission.id, feedback: feedback.value });
    if (ok) close();
    else error.textContent = t('teaching.errRevisionFeedback');
  };

  return el('div', {}, [
    el('h2', {}, t('teaching.scoreTitle', { name: learnerName })),
    el(
      'p',
      { class: 'muted small' },
      usesRubric
        ? t('teaching.rubricOutOf', { title: homeworkItem.title, max: rubricMax(criteria) })
        : t('teaching.outOf', { title: homeworkItem.title, max: submission.maxScore }),
    ),
    el('h3', {}, t('teaching.submissionHeading')),
    el('blockquote', { class: 'quote' }, submission.text || t('teaching.noText')),
    versions.length > 1
      ? el(
          'p',
          { class: 'muted small' },
          t('teaching.versionNote', { version: submission.version, total: versions.length }),
        )
      : null,
    revisions.some((entry) => entry.status === 'finalized')
      ? el('div', {}, [
          el('h3', {}, t('teaching.previousScores')),
          el(
            'div',
            { class: 'rows' },
            revisions
              .filter((entry) => entry.status === 'finalized')
              .map((entry) =>
                el('div', { class: 'row' }, [
                  el('span', { class: 'muted small' }, `v${entry.version}`),
                  el(
                    'span',
                    { class: 'quote' },
                    `${entry.score}/${entry.maxScore ?? submission.maxScore}${
                      entry.feedback ? ` — ${preview(entry.feedback, 80)}` : ''
                    }`,
                  ),
                ]),
              ),
          ),
        ])
      : null,
    scoringBlock,
    el('label', {}, t('teaching.feedback')),
    feedback,
    error,
    el('div', { class: 'dlg-foot' }, [
      button(t('teaching.requestRevision'), { onClick: requestRevision }),
      button(t('teaching.saveScore'), { variant: 'gold', onClick: saveScore }),
    ]),
  ]);
}

export function renderCompletionPolicy({ classroom, actions, close }) {
  const policy = normalizePolicy(classroom.completion);
  const error = errorLine();
  const minAverage = el('input', {
    type: 'number',
    min: '0',
    max: '100',
    value: String(policy.minAverage),
    'aria-label': t('teaching.ariaMinimumAverage'),
  });
  const requireAll = el('input', { type: 'checkbox', checked: policy.requireAllHomework });
  const currentLate = normalizeLatePolicy(classroom.latePolicy);
  const lateLabels = {
    [LATE_POLICY.ACCEPT]: t('teaching.lateAccept'),
    [LATE_POLICY.FLAG]: t('teaching.lateFlag'),
    [LATE_POLICY.BLOCK]: t('teaching.lateBlock'),
  };
  const lateSelect = el(
    'select',
    { 'aria-label': t('teaching.ariaLateWorkPolicy') },
    Object.values(LATE_POLICY).map((value) =>
      el('option', { value, selected: value === currentLate }, lateLabels[value]),
    ),
  );

  return el('div', {}, [
    el('h2', {}, t('teaching.completionRulesTitle', { name: classroom.name })),
    el(
      'p',
      { class: 'muted small' },
      t('teaching.completionVersionNote', { version: classroom.completionVersion ?? 0 }),
    ),
    el('label', {}, t('teaching.fieldMinimumAverage')),
    minAverage,
    el('label', { class: 'check' }, [requireAll, el('span', {}, t('teaching.allHomeworkGraded'))]),
    el('label', {}, t('teaching.fieldLateWork')),
    lateSelect,
    error,
    el('div', { class: 'dlg-foot' }, [
      button(t('common.actions.cancel'), { onClick: close }),
      button(t('teaching.saveRules'), {
        variant: 'gold',
        onClick: () => {
          const ok = actions.setCompletionPolicy({
            classroomId: classroom.id,
            minAverage: minAverage.value,
            requireAllHomework: requireAll.checked,
            latePolicy: lateSelect.value,
          });
          if (ok) close();
          else error.textContent = t('teaching.errOnlyOwnerRules');
        },
      }),
    ]),
  ]);
}
