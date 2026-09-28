import { el } from '../../core/dom.js';
import { CLASS_STATUS, HOMEWORK_STATUS, classStatusBadge, homeworkStatusBadge } from '../../domain/classroom.js';
import { buildScoreSheet, normalizeRubric, rubricMax, scoresTotal } from '../../domain/rubric.js';
import { button, noteBox } from './primitives.js';
import { inviteLinkPanel } from './invite-dialog.js';
import { statusBadge } from './status-badge.js';

function errorLine() {
  return el('p', { class: 'small danger', 'aria-live': 'polite' });
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
  const nameInput = el('input', { type: 'text', placeholder: 'Computer Science', 'aria-label': 'Subject name' });
  const codeInput = el('input', { type: 'text', placeholder: 'CS', 'aria-label': 'Subject code' });
  const error = errorLine();

  return el('div', {}, [
    el('h2', {}, 'New subject'),
    el('p', { class: 'muted small' }, 'A subject is a reused area of study. Classrooms belong to a subject.'),
    el('label', {}, 'Subject name'),
    nameInput,
    el('label', {}, 'Code (optional)'),
    codeInput,
    error,
    el('div', { class: 'dlg-foot' }, [
      button('Cancel', { onClick: close }),
      button('Add subject', {
        variant: 'gold',
        onClick: () => {
          if (!String(nameInput.value).trim()) {
            error.textContent = 'Enter a subject name.';
            return;
          }
          const subject = actions.createSubject({ name: nameInput.value, code: codeInput.value });
          if (subject) close();
        },
      }),
    ]),
  ]);
}

export function renderEditSubject({ actions, close, subject }) {
  const nameInput = el('input', { type: 'text', value: subject.name ?? '', 'aria-label': 'Subject name' });
  const codeInput = el('input', { type: 'text', value: subject.code ?? '', 'aria-label': 'Subject code' });
  const error = errorLine();

  return el('div', {}, [
    el('h2', {}, 'Edit subject'),
    el('label', {}, 'Subject name'),
    nameInput,
    el('label', {}, 'Code (optional)'),
    codeInput,
    error,
    el('div', { class: 'dlg-foot' }, [
      button('Cancel', { onClick: close }),
      button('Save changes', {
        variant: 'gold',
        onClick: () => {
          if (!String(nameInput.value).trim()) {
            error.textContent = 'Enter a subject name.';
            return;
          }
          const ok = actions.updateSubject({ subjectId: subject.id, name: nameInput.value, code: codeInput.value });
          if (ok) close();
        },
      }),
    ]),
  ]);
}

export function renderCreateClassroom({ actions, close, subjects = [], teachers = [] }) {
  const error = errorLine();

  if (!subjects.length) {
    return el('div', {}, [
      el('h2', {}, 'New classroom'),
      noteBox('Create a subject first — a classroom belongs to a subject.', 'warn'),
      el('div', { class: 'dlg-foot' }, [button('Close', { onClick: close })]),
    ]);
  }

  const subjectSelect = el(
    'select',
    { 'aria-label': 'Subject' },
    subjects.map((subject) => el('option', { value: subject.id }, `${subject.name}${subject.code ? ` (${subject.code})` : ''}`)),
  );
  const nameInput = el('input', { type: 'text', placeholder: 'Applied Cryptography', 'aria-label': 'Classroom name' });
  const termInput = el('input', { type: 'text', placeholder: 'Term 1', 'aria-label': 'Term' });
  const teacherSelect = el(
    'select',
    { 'aria-label': 'Teacher' },
    [
      el('option', { value: '' }, '— Assign later —'),
      ...teachers.map((teacher) => el('option', { value: teacher.id }, `${teacher.displayName} · teacher`)),
      el('option', { value: '__invite__' }, '✉ Invite a teacher by handle…'),
    ],
  );
  const inviteName = el('input', { type: 'text', placeholder: 'Teacher name', 'aria-label': 'Teacher name' });
  const inviteHandle = el('input', { type: 'text', placeholder: '@bob or npub1…', 'aria-label': 'Teacher handle' });
  const inviteWrap = el('div', {}, [
    el('label', {}, 'Invite name'),
    inviteName,
    el('label', {}, 'Handle or npub'),
    inviteHandle,
  ]);

  teacherSelect.addEventListener('change', () => {
    inviteWrap.style.display = teacherSelect.value === '__invite__' ? '' : 'none';
  });
  inviteWrap.style.display = 'none';

  return el('div', {}, [
    el('h2', {}, 'New classroom'),
    el('p', { class: 'muted small' }, 'A classroom runs one subject for a term. Assign a teacher to publish it.'),
    el('label', {}, 'Subject'),
    subjectSelect,
    el('label', {}, 'Classroom name'),
    nameInput,
    el('label', {}, 'Term'),
    termInput,
    el('label', {}, 'Teacher'),
    teacherSelect,
    inviteWrap,
    error,
    el('div', { class: 'dlg-foot' }, [
      button('Cancel', { onClick: close }),
      button('Create classroom', {
        variant: 'gold',
        onClick: () => {
          const inviting = teacherSelect.value === '__invite__';
          if (inviting && !String(inviteHandle.value).trim()) {
            error.textContent = 'Enter the teacher handle or npub.';
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
        },
      }),
    ]),
  ]);
}

export function renderManageClassroom({ classroom, subjects = [], teachers = [], actions, close }) {
  const error = errorLine();
  const archived = classroom.status === CLASS_STATUS.ARCHIVED;
  const badge = classStatusBadge(classroom.status);

  const subjectSelect = el(
    'select',
    { 'aria-label': 'Subject' },
    subjects.map((subject) => el('option', { value: subject.id }, `${subject.name}${subject.code ? ` (${subject.code})` : ''}`)),
  );
  subjectSelect.value = classroom.subjectId;

  const nameInput = el('input', { type: 'text', value: classroom.name ?? '', 'aria-label': 'Classroom name' });
  const termInput = el('input', { type: 'text', value: classroom.term ?? '', 'aria-label': 'Term' });
  const teacherSelect = el(
    'select',
    { 'aria-label': 'Teacher' },
    [
      el('option', { value: '' }, '— No teacher —'),
      ...teachers.map((teacher) => el('option', { value: teacher.id }, `${teacher.displayName} · teacher`)),
    ],
  );
  teacherSelect.value = classroom.teacherId ?? '';

  return el('div', {}, [
    el('h2', {}, `Manage · ${classroom.name}`),
    badge ? el('p', {}, statusBadge(badge.label, badge.tone)) : null,
    subjects.length
      ? el('div', {}, [el('label', {}, 'Subject'), subjectSelect])
      : noteBox('Create a subject before editing this classroom.', 'warn'),
    el('label', {}, 'Classroom name'),
    nameInput,
    el('label', {}, 'Term'),
    termInput,
    el('label', {}, 'Teacher'),
    teacherSelect,
    error,
    el('div', { class: 'dlg-foot' }, [
      button('Cancel', { onClick: close }),
      button('Save changes', {
        variant: 'gold',
        onClick: () => {
          if (!String(nameInput.value).trim()) {
            error.textContent = 'Enter a classroom name.';
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
        },
      }),
    ]),
    el('div', { class: 'arow' }, [
      archived
        ? button('Restore class', { small: true, onClick: () => { actions.restoreClassroom(classroom.id); close(); } })
        : button('Archive class', { small: true, onClick: () => { actions.archiveClassroom(classroom.id); close(); } }),
      button('Delete classroom', {
        variant: 'ghost',
        small: true,
        onClick: async () => {
          const ok = await actions.deleteClassroom(classroom.id);
          if (ok) close();
        },
      }),
    ]),
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
          body.replaceChildren(...inviteLinkPanel({ invite: created, copyText: actions.copyText, close }));
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
  const maxScore = el('input', { type: 'number', value: '100', min: '1', 'aria-label': 'Max score' });
  const rubric = rubricEditor();

  return el('div', {}, [
    el('h2', {}, 'Post homework'),
    el('p', { class: 'muted small' }, `${subject?.name ?? 'Subject'} ▸ ${classroom.name}`),
    el('label', {}, 'Title'),
    titleInput,
    el('label', {}, 'Instructions'),
    instructions,
    el('label', {}, 'Due'),
    due,
    el('label', {}, 'Max score (used when no rubric)'),
    maxScore,
    el('label', {}, 'Rubric (optional)'),
    rubric.node,
    error,
    el('div', { class: 'dlg-foot' }, [
      button('Cancel', { onClick: close }),
      button('Post homework', {
        variant: 'gold',
        onClick: () => {
          if (!String(titleInput.value).trim()) {
            error.textContent = 'Enter a homework title.';
            return;
          }
          const item = actions.createHomework({
            classroomId: classroom.id,
            title: titleInput.value,
            instructions: instructions.value,
            due: due.value,
            maxScore: maxScore.value,
            rubric: rubric.value(),
          });
          if (item) close();
        },
      }),
    ]),
  ]);
}

export function renderManageHomework({ homeworkItem, actions, close }) {
  const error = errorLine();
  const closed = homeworkItem.status === HOMEWORK_STATUS.CLOSED;
  const badge = homeworkStatusBadge(homeworkItem.status);
  const titleInput = el('input', { type: 'text', value: homeworkItem.title ?? '', 'aria-label': 'Homework title' });
  const instructions = el('textarea', {
    rows: '4',
    value: homeworkItem.instructions ?? '',
    placeholder: 'What should learners do?',
    'aria-label': 'Instructions',
  });
  const due = el('input', { type: 'text', value: homeworkItem.due ?? '', 'aria-label': 'Due date' });
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
            maxScore: maxScore.value,
            rubric: rubric.value(),
          });
          if (ok) close();
        },
      }),
    ]),
    el('div', { class: 'arow' }, [
      closed
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

export function renderSubmitHomework({ homeworkItem, submission, actions, close }) {
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

export function renderGradeSubmission({ submission, homeworkItem, learnerName, actions, close }) {
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
