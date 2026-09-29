import { el } from '../../core/dom.js';
import {
  CLASS_STATUS,
  HOMEWORK_STATUS,
  LATE_POLICY,
  classStatusBadge,
  homeworkStatusBadge,
  latePolicyLabel,
  normalizeLatePolicy,
} from '../../domain/classroom.js';
import { normalizePolicy } from '../../domain/completion.js';
import { buildScoreSheet, normalizeRubric, rubricMax, scoresTotal } from '../../domain/rubric.js';
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
    el('h3', {}, `History · ${versions.length} version${versions.length === 1 ? '' : 's'}`),
    el(
      'div',
      { class: 'rows' },
      versions.map((entry) =>
        el('div', { class: 'row' }, [
          el('span', { class: 'muted small' }, `v${entry.version} · ${entry.submittedAt ?? 'saved'}`),
          el('span', { class: 'quote' }, preview(entry.text) || '(no text)'),
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
      placeholder: 'Criterion',
      'aria-label': 'Criterion',
    });
    const maxInput = el('input', {
      type: 'number',
      value: criterion.max ?? '',
      min: '1',
      placeholder: 'pts',
      'aria-label': 'Points',
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

  const node = el('div', {}, [list, button('＋ Add criterion', { small: true, onClick: () => addRow() })]);

  function value() {
    return entries.map((entry) => ({ label: entry.labelInput.value, max: entry.maxInput.value }));
  }

  return { node, value };
}

export function renderCreateSubject({ actions, close }) {
  const nameInput = el('input', { id: 'subject-name', type: 'text', placeholder: 'Computer Science' });
  const codeInput = el('input', { id: 'subject-code', type: 'text', placeholder: 'CS' });
  const error = errorLine();
  const cancel = button('Cancel', { onClick: close });
  const submit = button('Add subject', { variant: 'gold', type: 'submit' });

  const run = () => {
    if (!String(nameInput.value).trim()) {
      error.textContent = 'Enter a subject name.';
      nameInput.focus();
      return;
    }
    const subject = actions.createSubject({ name: nameInput.value, code: codeInput.value });
    if (subject) close();
  };

  return el('div', {}, [
    el('h2', {}, 'New subject'),
    el('p', { class: 'muted small' }, 'A subject is a reused area of study. Classrooms belong to a subject.'),
    el(
      'form',
      {
        onSubmit: (event) => {
          event.preventDefault();
          run();
        },
      },
      [
        formSection('Subject', [
          el('label', { for: 'subject-name' }, 'Name'),
          nameInput,
          el('label', { for: 'subject-code' }, 'Code (optional)'),
          codeInput,
          el('p', { class: 'field-hint' }, 'A short code such as CS or MATH appears beside the subject in your course list.'),
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
  const cancel = button('Cancel', { onClick: close });
  const submit = button('Save changes', { variant: 'gold', type: 'submit' });

  const run = () => {
    if (!String(nameInput.value).trim()) {
      error.textContent = 'Enter a subject name.';
      nameInput.focus();
      return;
    }
    const ok = actions.updateSubject({ subjectId: subject.id, name: nameInput.value, code: codeInput.value });
    if (ok) close();
  };

  return el('div', {}, [
    el('h2', {}, 'Edit subject'),
    el(
      'form',
      {
        onSubmit: (event) => {
          event.preventDefault();
          run();
        },
      },
      [
        formSection('Subject', [
          el('label', { for: 'edit-subject-name' }, 'Name'),
          nameInput,
          el('label', { for: 'edit-subject-code' }, 'Code (optional)'),
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
      el('h2', {}, 'New classroom'),
      noteBox('Create a subject first — a classroom belongs to a subject.', 'warn'),
      formFoot([button('Close', { onClick: close })], true),
    ]);
  }

  const subjectSelect = el('select', { id: 'classroom-subject' }, subjects.map((subject) => el('option', { value: subject.id }, `${subject.name}${subject.code ? ` (${subject.code})` : ''}`)));
  const nameInput = el('input', { id: 'classroom-name', type: 'text', placeholder: 'Applied Cryptography' });
  const termInput = el('input', { id: 'classroom-term', type: 'text', placeholder: 'Term 1' });
  const teacherSelect = el(
    'select',
    { id: 'classroom-teacher' },
    [
      el('option', { value: '' }, '— Assign later —'),
      ...teachers.map((teacher) => el('option', { value: teacher.id }, `${teacher.displayName} · teacher`)),
      el('option', { value: '__invite__' }, '✉ Invite a teacher by handle…'),
    ],
  );
  const inviteName = el('input', { id: 'classroom-invite-name', type: 'text', placeholder: 'Teacher name' });
  const inviteHandle = el('input', { id: 'classroom-invite-handle', type: 'text', placeholder: '@bob or npub1…' });
  const inviteWrap = formSection('Invite by handle', [
    el('label', { for: 'classroom-invite-name' }, 'Name (optional)'),
    inviteName,
    el('label', { for: 'classroom-invite-handle' }, 'Handle or npub'),
    inviteHandle,
  ]);

  teacherSelect.addEventListener('change', () => {
    inviteWrap.hidden = teacherSelect.value !== '__invite__';
  });
  inviteWrap.hidden = true;

  const cancel = button('Cancel', { onClick: close });
  const submit = button('Create classroom', { variant: 'gold', type: 'submit' });

  const run = () => {
    const inviting = teacherSelect.value === '__invite__';
    if (inviting && !String(inviteHandle.value).trim()) {
      error.textContent = 'Enter the teacher handle or npub.';
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
    el('h2', {}, 'New classroom'),
    el('p', { class: 'muted small' }, 'A classroom runs one subject for a term. Assign a teacher to publish it.'),
    el(
      'form',
      {
        onSubmit: (event) => {
          event.preventDefault();
          run();
        },
      },
      [
        formSection('Classroom', [
          el('label', { for: 'classroom-subject' }, 'Subject'),
          subjectSelect,
          el('label', { for: 'classroom-name' }, 'Classroom name'),
          nameInput,
          el('label', { for: 'classroom-term' }, 'Term'),
          termInput,
        ]),
        formSection('Teacher', [
          el('label', { for: 'classroom-teacher' }, 'Teacher'),
          teacherSelect,
          el('p', { class: 'field-hint' }, 'A classroom without a teacher stays a draft, hidden from learners.'),
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
      el('option', { value: '' }, '— No teacher —'),
      ...teachers.map((teacher) => el('option', { value: teacher.id }, `${teacher.displayName} · teacher`)),
    ],
  );
  teacherSelect.value = classroom.teacherId ?? '';

  const cancel = button('Cancel', { onClick: close });
  const submit = button('Save changes', { variant: 'gold', type: 'submit' });

  const run = () => {
    if (!String(nameInput.value).trim()) {
      error.textContent = 'Enter a classroom name.';
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
    el('h2', {}, `Manage · ${classroom.name}`),
    badge ? el('p', {}, statusBadge(badge.label, badge.tone)) : null,
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
          ? formSection('Classroom', [
              el('label', { for: 'manage-classroom-subject' }, 'Subject'),
              subjectSelect,
              el('label', { for: 'manage-classroom-name' }, 'Classroom name'),
              nameInput,
              el('label', { for: 'manage-classroom-term' }, 'Term'),
              termInput,
            ])
          : formSection('Classroom', [
              noteBox('Create a subject before editing this classroom.', 'warn'),
              el('label', { for: 'manage-classroom-name' }, 'Classroom name'),
              nameInput,
              el('label', { for: 'manage-classroom-term' }, 'Term'),
              termInput,
            ]),
        formSection('Teacher', [
          el('label', { for: 'manage-classroom-teacher' }, 'Teacher'),
          teacherSelect,
          el('p', { class: 'field-hint' }, 'A classroom without a teacher stays a draft, hidden from learners.'),
        ]),
        error,
        formSection('Danger zone', [
          el('p', { class: 'muted small' }, 'Archiving hides the classroom from learners but keeps its records. Deleting removes it permanently.'),
          el('div', { class: 'arow' }, [
            archived
              ? button('Restore class', { small: true, onClick: () => { actions.restoreClassroom(classroom.id); close(); } })
              : button('Archive class', { small: true, onClick: () => { actions.archiveClassroom(classroom.id); close(); } }),
            button('Delete classroom', {
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
  const nameInput = el('input', { type: 'text', placeholder: 'Full name', 'aria-label': 'Name' });
  const targetInput = el('input', { type: 'text', placeholder: '@handle or npub1…', 'aria-label': 'Handle or npub' });
  const body = el('div', {}, [
    el('h2', {}, title),
    el('p', { class: 'muted small' }, blurb),
    el('label', {}, 'Name (optional)'),
    nameInput,
    el('label', {}, 'Handle or npub'),
    targetInput,
    error,
    el('div', { class: 'dlg-foot' }, [
      button('Cancel', { onClick: close }),
      button('Create invite', {
        variant: 'gold',
        onClick: () => {
          const created = invite({ target: targetInput.value, name: nameInput.value });
          if (!created) {
            error.textContent = 'Check the handle or npub, then try again.';
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
    title: `Invite a learner · ${classroom.name}`,
    blurb: 'They accept the link, join the academy, and are enrolled in this classroom.',
    invite: (payload) => actions.inviteStudentToClass({ classroomId: classroom.id, ...payload }),
    actions,
    close,
  });
}

export function renderInviteClassTeacher({ classroom, actions, close }) {
  return targetInviteDialog({
    title: `Invite a teacher · ${classroom.name}`,
    blurb: 'They accept the link and teach this classroom. They get class tools, not owner powers.',
    invite: (payload) => actions.inviteClassTeacher({ classroomId: classroom.id, ...payload }),
    actions,
    close,
  });
}

export function renderCreateHomework({ classroom, subject, actions, close }) {
  const error = errorLine();
  const titleInput = el('input', { type: 'text', placeholder: 'Hash functions', 'aria-label': 'Homework title' });
  const instructions = el('textarea', { rows: '4', placeholder: 'What should learners do?', 'aria-label': 'Instructions' });
  const due = el('input', { type: 'text', placeholder: 'Mar 14', 'aria-label': 'Due date' });
  const dueAt = el('input', { type: 'datetime-local', 'aria-label': 'Due date and time' });
  const maxScore = el('input', { type: 'number', value: '100', min: '1', 'aria-label': 'Max score' });
  const rubric = rubricEditor();

  const submit = (publish) => {
    if (!String(titleInput.value).trim()) {
      error.textContent = 'Enter a homework title.';
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
    el('h2', {}, 'Post homework'),
    el('p', { class: 'muted small' }, `${subject?.name ?? 'Subject'} ▸ ${classroom.name}`),
    el('label', {}, 'Title'),
    titleInput,
    el('label', {}, 'Instructions'),
    instructions,
    el('label', {}, 'Due'),
    due,
    el('label', {}, 'Due date & time (used to flag late work)'),
    dueAt,
    el('label', {}, 'Max score (used when no rubric)'),
    maxScore,
    el('label', {}, 'Rubric (optional)'),
    rubric.node,
    error,
    el('div', { class: 'dlg-foot' }, [
      button('Cancel', { onClick: close }),
      button('Save draft', { small: true, onClick: () => submit(false) }),
      button('Post homework', { variant: 'gold', onClick: () => submit(true) }),
    ]),
  ]);
}

export function renderManageHomework({ homeworkItem, actions, close }) {
  const error = errorLine();
  const closed = homeworkItem.status === HOMEWORK_STATUS.CLOSED;
  const isDraft = homeworkItem.status === HOMEWORK_STATUS.DRAFT;
  const badge = homeworkStatusBadge(homeworkItem.status);
  const titleInput = el('input', { type: 'text', value: homeworkItem.title ?? '', 'aria-label': 'Homework title' });
  const instructions = el('textarea', {
    rows: '4',
    value: homeworkItem.instructions ?? '',
    placeholder: 'What should learners do?',
    'aria-label': 'Instructions',
  });
  const due = el('input', { type: 'text', value: homeworkItem.due ?? '', 'aria-label': 'Due date' });
  const dueAt = el('input', {
    type: 'datetime-local',
    value: homeworkItem.dueAt ?? '',
    'aria-label': 'Due date and time',
  });
  const maxScore = el('input', {
    type: 'number',
    value: String(homeworkItem.maxScore ?? 100),
    min: '1',
    'aria-label': 'Max score',
  });
  const rubric = rubricEditor(homeworkItem.rubric);

  return el('div', {}, [
    el('h2', {}, `Manage · ${homeworkItem.title}`),
    badge ? el('p', {}, statusBadge(badge.label, badge.tone)) : null,
    el('label', {}, 'Title'),
    titleInput,
    el('label', {}, 'Instructions'),
    instructions,
    el('label', {}, 'Due'),
    due,
    el('label', {}, 'Due date & time (used to flag late work)'),
    dueAt,
    el('label', {}, 'Max score (used when no rubric)'),
    maxScore,
    el('label', {}, 'Rubric (optional)'),
    rubric.node,
    error,
    el('div', { class: 'dlg-foot' }, [
      button('Cancel', { onClick: close }),
      button('Save changes', {
        variant: 'gold',
        onClick: () => {
          if (!String(titleInput.value).trim()) {
            error.textContent = 'Enter a homework title.';
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
        ? button('Publish to learners', {
            variant: 'gold',
            small: true,
            onClick: () => { actions.publishHomework(homeworkItem.id); close(); },
          })
        : closed
          ? button('Reopen submissions', { small: true, onClick: () => { actions.reopenHomework(homeworkItem.id); close(); } })
          : button('Close submissions', { small: true, onClick: () => { actions.closeHomework(homeworkItem.id); close(); } }),
      button('Delete homework', {
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
    placeholder: 'Write your answer…',
    'aria-label': 'Your answer',
  });
  if (submission?.text) body.value = submission.text;

  return el('div', {}, [
    el('h2', {}, homeworkItem.title),
    el('p', { class: 'muted small' }, `Due ${homeworkItem.due} · out of ${homeworkItem.maxScore}`),
    homeworkItem.instructions ? el('p', {}, homeworkItem.instructions) : null,
    submission
      ? noteBox(`Submitting creates version ${submission.version + 1}. Version ${submission.version} stays in history.`)
      : null,
    historyBlock(versions),
    el('label', {}, 'Your answer'),
    body,
    error,
    el('div', { class: 'dlg-foot' }, [
      button('Cancel', { onClick: close }),
      button(submission ? 'Submit new version' : 'Submit homework', {
        variant: 'gold',
        onClick: () => {
          const ok = actions.submitHomework({ homeworkId: homeworkItem.id, text: body.value });
          if (ok) close();
          else error.textContent = 'Write your answer before submitting.';
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
    'aria-label': 'Score',
  });
  const feedback = el('textarea', {
    rows: '3',
    placeholder: 'Feedback for the learner (optional)',
    'aria-label': 'Feedback',
  });
  if (submission.feedback) feedback.value = submission.feedback;

  const scoringBlock = usesRubric
    ? el(
        'div',
        {},
        criteria.map((criterion, index) => [
          el('label', {}, `${criterion.label} (0–${criterion.max})`),
          rubricInputs[index],
        ]),
      )
    : el('div', {}, [el('label', {}, `Score (0–${submission.maxScore})`), score]);

  const saveScore = () => {
    if (usesRubric) {
      if (rubricInputs.some((input) => input.value === '')) {
        error.textContent = 'Score every rubric criterion.';
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
      else error.textContent = 'Check the rubric scores and try again.';
      return;
    }
    const ok = actions.gradeSubmission({
      submissionId: submission.id,
      score: score.value,
      feedback: feedback.value,
    });
    if (ok) close();
    else error.textContent = `Enter a number between 0 and ${submission.maxScore}.`;
  };

  const requestRevision = () => {
    const ok = actions.requestRevision({ submissionId: submission.id, feedback: feedback.value });
    if (ok) close();
    else error.textContent = 'Write what the learner should change.';
  };

  return el('div', {}, [
    el('h2', {}, `Score · ${learnerName}`),
    el(
      'p',
      { class: 'muted small' },
      usesRubric
        ? `${homeworkItem.title} · rubric out of ${rubricMax(criteria)}`
        : `${homeworkItem.title} · out of ${submission.maxScore}`,
    ),
    el('h3', {}, 'Submission'),
    el('blockquote', { class: 'quote' }, submission.text || '(no text)'),
    versions.length > 1
      ? el(
          'p',
          { class: 'muted small' },
          `Version ${submission.version} of ${versions.length} — earlier versions stay in history.`,
        )
      : null,
    revisions.some((entry) => entry.status === 'finalized')
      ? el('div', {}, [
          el('h3', {}, 'Previous scores'),
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
    el('label', {}, 'Feedback'),
    feedback,
    error,
    el('div', { class: 'dlg-foot' }, [
      button('Request revision', { onClick: requestRevision }),
      button('Save score', { variant: 'gold', onClick: saveScore }),
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
    'aria-label': 'Minimum average',
  });
  const requireAll = el('input', { type: 'checkbox', checked: policy.requireAllHomework });
  const currentLate = normalizeLatePolicy(classroom.latePolicy);
  const lateSelect = el(
    'select',
    { 'aria-label': 'Late work policy' },
    Object.values(LATE_POLICY).map((value) =>
      el('option', { value, selected: value === currentLate }, latePolicyLabel(value)),
    ),
  );

  return el('div', {}, [
    el('h2', {}, `Completion rules · ${classroom.name}`),
    el(
      'p',
      { class: 'muted small' },
      `Version ${classroom.completionVersion ?? 0}. Changing the rules publishes a new version and recomputes eligibility.`,
    ),
    el('label', {}, 'Minimum average (%)'),
    minAverage,
    el('label', { class: 'check' }, [requireAll, el('span', {}, 'All homework must be graded')]),
    el('label', {}, 'Late work'),
    lateSelect,
    error,
    el('div', { class: 'dlg-foot' }, [
      button('Cancel', { onClick: close }),
      button('Save rules', {
        variant: 'gold',
        onClick: () => {
          const ok = actions.setCompletionPolicy({
            classroomId: classroom.id,
            minAverage: minAverage.value,
            requireAllHomework: requireAll.checked,
            latePolicy: lateSelect.value,
          });
          if (ok) close();
          else error.textContent = 'Only the academy owner can change completion rules.';
        },
      }),
    ]),
  ]);
}
