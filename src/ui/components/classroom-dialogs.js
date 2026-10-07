import { el } from '../../core/dom.js';
import { formatDate } from '../../core/time.js';
import {
  CLASS_STATUS,
  HOMEWORK_STATUS,
  LATE_POLICY,
  canSubmitLate,
  classStatusBadge,
  homeworkStatusBadge,
  isHomeworkOpen,
  isLate,
  normalizeLatePolicy,
  submissionStatusBadge,
} from '../../domain/classroom.js';
import { normalizePolicy } from '../../domain/completion.js';
import { clearDraft, hasDraftContent, readDraft, writeDraft } from '../../domain/draft.js';
import { buildScoreSheet, normalizeRubric, rubricMax, scoresTotal } from '../../domain/rubric.js';
import { t } from '../../services/i18n/index.js';
import { loadDrafts, saveDrafts } from '../../services/storage.js';
import { button, fileChip, noteBox } from './primitives.js';
import { fileLink } from './file-viewer.js';
import { dangerSection, formFoot, formSection } from './form-fields.js';
import { inviteLinkPanel } from './invite-dialog.js';
import { statusBadge } from './status-badge.js';

function errorLine() {
  return el('p', { class: 'small danger', 'aria-live': 'polite' });
}

function preview(text, limit = 140) {
  const value = String(text ?? '').trim();
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}

function versionRows(versions = []) {
  return el(
    'div',
    { class: 'rows' },
    versions.map((entry) =>
      el('div', { class: 'row' }, [
        el(
          'span',
          { class: 'muted small' },
          t('teaching.versionMeta', {
            version: entry.version,
            date: formatDate(entry.eventCreatedAt ?? entry.submittedAt) ?? t('teaching.saved'),
          }),
        ),
        el('span', { class: 'quote' }, preview(entry.text) || t('teaching.noText')),
      ]),
    ),
  );
}

function historyBlock(versions = []) {
  if (!versions.length) return null;
  return el('div', {}, [
    el(
      'h3',
      {},
      versions.length === 1 ? t('teaching.historyOne') : t('teaching.history', { count: versions.length }),
    ),
    versionRows(versions),
  ]);
}

// Collapsible earlier submissions so a teacher can compare what changed without
// leaving the grading form. The head version is already shown above, so only the
// versions before it are listed here.
function previousVersions(versions = []) {
  const earlier = versions.slice(0, -1);
  if (!earlier.length) return null;
  return el('details', { class: 'acc' }, [
    el('summary', {}, [
      el('span', { class: 'who' }, t('teaching.previousVersions')),
      el('span', { class: 'spacer' }),
      el('span', { class: 'muted small' }, t('teaching.history', { count: earlier.length })),
    ]),
    el('div', { class: 'acc__body' }, versionRows(earlier)),
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
        dangerSection(t('teaching.sectionDanger'), [
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
  const linkInput = el('input', { type: 'url', placeholder: t('teaching.placeholderLink'), 'aria-label': t('teaching.linkLabel') });

  const cover = { url: '' };
  const coverPreview = el('span', { class: 'homework-cover__preview' });
  const renderCover = () =>
    coverPreview.replaceChildren(
      cover.url
        ? el('img', { src: cover.url, alt: '', style: { maxHeight: '72px', borderRadius: '8px' } })
        : el('span', { 'aria-hidden': 'true' }, '🖼'),
    );
  renderCover();
  const coverFile = el('input', { type: 'file', accept: 'image/*', hidden: true });
  coverFile.addEventListener('change', async () => {
    const file = coverFile.files?.[0];
    coverFile.value = '';
    if (!file) return;
    const url = await actions.uploadImage?.(file);
    if (url) {
      cover.url = url;
      renderCover();
    }
  });

  const attachments = [];
  const chipRow = el('div', { class: 'files' });
  const renderChips = () => chipRow.replaceChildren(...attachments.map((file) => fileChip(file.name)));
  const fileInput = el('input', { type: 'file', multiple: true, hidden: true });
  const attachBtn = button(t('teaching.attachFile'), { small: true, onClick: () => fileInput.click() });
  let busy = false;
  fileInput.addEventListener('change', async () => {
    const picked = [...(fileInput.files ?? [])];
    fileInput.value = '';
    if (!picked.length || busy) return;
    busy = true;
    attachBtn.disabled = true;
    for (const file of picked) {
      const uploaded = await actions.uploadAttachment?.(file);
      if (uploaded) {
        attachments.push(uploaded);
        renderChips();
      }
    }
    busy = false;
    attachBtn.disabled = false;
  });

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
      link: linkInput.value,
      cover: cover.url,
      files: attachments,
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
    el('label', {}, t('teaching.fieldCover')),
    el('div', { class: 'arow' }, [
      coverPreview,
      button(t('teaching.addCover'), { small: true, onClick: () => coverFile.click() }),
      coverFile,
    ]),
    el('label', {}, t('teaching.linkLabel')),
    linkInput,
    el('label', {}, t('teaching.attachments')),
    el('div', { class: 'arow' }, [attachBtn, fileInput]),
    chipRow,
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

  const cancel = button(t('common.actions.cancel'), { onClick: close });
  const submit = button(t('teaching.saveChanges'), { variant: 'gold', type: 'submit' });

  const run = () => {
    if (!String(titleInput.value).trim()) {
      error.textContent = t('teaching.errHomeworkTitle');
      titleInput.focus();
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
  };

  // The lifecycle action is one contextual control with a hint that spells out
  // its consequence, rather than three always-visible buttons.
  const lifecycle = isDraft
    ? {
        hint: t('teaching.hintPublishHomework'),
        control: button(t('teaching.publishToLearners'), {
          variant: 'gold',
          small: true,
          onClick: () => { actions.publishHomework(homeworkItem.id); close(); },
        }),
      }
    : closed
      ? {
          hint: t('teaching.hintReopenSubmissions'),
          control: button(t('teaching.reopenSubmissions'), {
            variant: 'gold',
            small: true,
            onClick: () => { actions.reopenHomework(homeworkItem.id); close(); },
          }),
        }
      : {
          hint: t('teaching.hintCloseSubmissions'),
          control: button(t('teaching.closeSubmissions'), {
            small: true,
            onClick: () => { actions.closeHomework(homeworkItem.id); close(); },
          }),
        };

  return el('div', {}, [
    el('h2', {}, t('teaching.manageTitle', { name: homeworkItem.title })),
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
        formSection(t('teaching.sectionHomework'), [
          el('label', {}, t('teaching.fieldTitle')),
          titleInput,
          el('label', {}, t('teaching.fieldInstructions')),
          instructions,
          el('label', {}, t('teaching.fieldDue')),
          due,
          el('label', {}, t('teaching.fieldDueDateTime')),
          dueAt,
        ]),
        formSection(t('teaching.sectionGrading'), [
          el('label', {}, t('teaching.fieldMaxScore')),
          maxScore,
          el('label', {}, t('teaching.fieldRubricOptional')),
          rubric.node,
        ]),
        error,
        formSection(t('teaching.sectionSubmissions'), [
          el('p', { class: 'field-hint' }, lifecycle.hint),
          el('div', { class: 'arow' }, [lifecycle.control]),
        ]),
        dangerSection(t('teaching.sectionDanger'), [
          el('p', { class: 'muted small' }, t('teaching.homeworkDangerBlurb')),
          el('div', { class: 'arow' }, [
            button(t('teaching.deleteHomework'), {
              variant: 'danger',
              small: true,
              onClick: async () => {
                const ok = await actions.deleteHomework(homeworkItem.id);
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

export function renderSubmitHomework({ homeworkItem, submission, versions = [], classroom, accountId, actions, close }) {
  const error = errorLine();
  const open = isHomeworkOpen(homeworkItem);
  const pastDue = isLate(homeworkItem);
  const lateAccepted = canSubmitLate(classroom, homeworkItem);
  // Blocked up front (not only on submit) so a learner never types an answer
  // that the late policy would silently reject at publish time.
  const blocked = !open || (pastDue && !lateAccepted);
  const willBeLate = open && pastDue && lateAccepted;

  // Last submitted state, used to reset the form and to tell whether the current
  // input is worth keeping as a draft.
  const saved = {
    text: submission?.text ?? '',
    link: submission?.link ?? '',
    files: Array.isArray(submission?.files) ? [...submission.files] : [],
  };
  const restoredDraft = readDraft(loadDrafts(), accountId, homeworkItem.id);
  const hasRestored = hasDraftContent(restoredDraft);
  const initial = hasRestored ? restoredDraft : saved;

  const body = el('textarea', {
    rows: '6',
    placeholder: t('teaching.placeholderAnswer'),
    'aria-label': t('teaching.yourAnswer'),
    readOnly: blocked,
  });
  body.value = initial.text ?? '';

  const linkInput = el('input', {
    type: 'url',
    placeholder: t('teaching.placeholderLink'),
    'aria-label': t('teaching.linkLabel'),
    readOnly: blocked,
  });
  linkInput.value = initial.link ?? '';

  let saveTimer = null;
  const sameFiles = () =>
    attachments.length === saved.files.length &&
    attachments.every(
      (file, index) =>
        (file?.url ?? file?.name) === (saved.files[index]?.url ?? saved.files[index]?.name),
    );
  const isDirty = () =>
    String(body.value).trim() !== String(saved.text).trim() ||
    String(linkInput.value).trim() !== String(saved.link).trim() ||
    !sameFiles();
  const persistDraft = () => {
    if (blocked) return;
    const drafts = loadDrafts();
    saveDrafts(
      isDirty()
        ? writeDraft(drafts, accountId, homeworkItem.id, {
            text: body.value,
            link: linkInput.value,
            files: attachments,
          })
        : clearDraft(drafts, accountId, homeworkItem.id),
    );
  };
  const scheduleDraft = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persistDraft, 500);
  };
  const discardDraft = () => {
    clearTimeout(saveTimer);
    saveDrafts(clearDraft(loadDrafts(), accountId, homeworkItem.id));
    body.value = saved.text;
    linkInput.value = saved.link;
    attachments.splice(0, attachments.length, ...saved.files);
    renderChips();
    draftBanner.hidden = true;
  };

  const attachments = Array.isArray(initial.files) ? [...initial.files] : [];
  const chipRow = el('div', { class: 'files' });
  let busy = false;
  const renderChips = () =>
    chipRow.replaceChildren(
      ...attachments.map((file, index) =>
        fileChip(file.name, {
          onRemove:
            blocked || busy
              ? null
              : () => {
                  attachments.splice(index, 1);
                  renderChips();
                  scheduleDraft();
                },
        }),
      ),
    );
  renderChips();

  const draftBanner = el('div', { class: 'arow', hidden: !hasRestored }, [
    noteBox(t('teaching.draftRestored')),
    button(t('teaching.discardDraft'), { small: true, onClick: discardDraft }),
  ]);

  const fileInput = el('input', { type: 'file', multiple: true, hidden: true });
  const attachBtn = button(t('teaching.attachFile'), {
    small: true,
    disabled: blocked,
    onClick: () => fileInput.click(),
  });
  fileInput.addEventListener('change', async () => {
    const picked = [...(fileInput.files ?? [])];
    fileInput.value = '';
    if (!picked.length || busy || blocked) return;
    busy = true;
    attachBtn.disabled = true;
    for (const file of picked) {
      const uploaded = await actions.uploadAttachment?.(file);
      if (uploaded) {
        attachments.push(uploaded);
        renderChips();
      }
    }
    busy = false;
    attachBtn.disabled = false;
    renderChips();
    scheduleDraft();
  });

  body.addEventListener('input', scheduleDraft);
  linkInput.addEventListener('input', scheduleDraft);

  const runSubmit = () => {
    if (blocked) return;
    const ok = actions.submitHomework({
      homeworkId: homeworkItem.id,
      text: body.value,
      link: linkInput.value,
      files: attachments,
    });
    if (ok) {
      clearTimeout(saveTimer);
      saveDrafts(clearDraft(loadDrafts(), accountId, homeworkItem.id));
      close();
    } else {
      error.textContent = t('teaching.errAnswerOrAttachment');
    }
  };

  const primaryLabel = willBeLate
    ? t('teaching.submitLate')
    : submission
      ? t('teaching.submitNewVersion')
      : t('teaching.submitHomework');

  const node = el('div', {}, [
    el('h2', {}, homeworkItem.title),
    el('p', { class: 'muted small' }, t('teaching.submitDueMeta', { due: homeworkItem.due, maxScore: homeworkItem.maxScore })),
    homeworkItem.instructions ? el('p', {}, homeworkItem.instructions) : null,
    !open
      ? noteBox(t('actions.homeworkClosed'), 'warn')
      : pastDue && !lateAccepted
        ? noteBox(t('teaching.submitLateBlocked'), 'warn')
        : willBeLate
          ? noteBox(t('teaching.submitLateWarning'), 'warn')
          : null,
    draftBanner,
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
    el('label', {}, t('teaching.linkLabel')),
    linkInput,
    el('div', { class: 'arow' }, [attachBtn, fileInput]),
    chipRow,
    error,
    !blocked ? el('p', { class: 'field-hint' }, t('teaching.keyboardSubmitHint')) : null,
    el('div', { class: 'dlg-foot' }, [
      button(t('common.actions.cancel'), { onClick: close }),
      button(primaryLabel, {
        variant: willBeLate ? 'default' : 'gold',
        disabled: blocked,
        onClick: runSubmit,
      }),
    ]),
  ]);

  node.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      runSubmit();
    }
  });
  return node;
}

export function renderSubmissionView({
  submission,
  homeworkItem,
  classroom,
  learnerName,
  versions = [],
  revisions = [],
  onGrade,
  onOpenFile,
  close,
}) {
  const token = submissionStatusBadge(submission);
  const finalized = revisions.filter((entry) => entry.status === 'finalized');
  const submitted = formatDate(submission.submittedEventAt ?? submission.submittedAt);
  const meta = [
    learnerName,
    classroom?.name,
    t('teaching.versionShort', { version: submission.version }),
    submitted ? t('teaching.submittedAt', { date: submitted }) : null,
    submission.late ? t('teaching.late') : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return el('div', {}, [
    el('h2', {}, homeworkItem.title),
    el('p', { class: 'muted small' }, meta),
    el('div', { class: 'arow' }, [statusBadge(t(token.key, token.params), token.tone)]),
    el('h3', {}, t('teaching.submissionHeading')),
    el('blockquote', { class: 'quote' }, submission.text || t('teaching.noText')),
    submission.link
      ? el('p', {}, el('a', { href: submission.link, target: '_blank', rel: 'noreferrer' }, submission.link))
      : null,
    submission.files?.length
      ? el(
          'div',
          { class: 'files' },
          submission.files.map((file) => fileLink(file, { onOpen: onOpenFile })),
        )
      : null,
    finalized.length ? el('h3', {}, t('teaching.assessmentHistory')) : null,
    ...finalized.map((entry) =>
      el(
        'p',
        { class: 'muted small' },
        Number(entry.maxScore) > 0
          ? t('teaching.assessmentEntry', { version: entry.version, score: entry.score, max: entry.maxScore })
          : t('teaching.assessmentEntryNoMax', { version: entry.version, score: entry.score }),
      ),
    ),
    submission.feedback ? el('blockquote', { class: 'quote' }, `"${submission.feedback}"`) : null,
    historyBlock(versions),
    el('div', { class: 'dlg-foot' }, [
      button(t('common.actions.close'), { onClick: close }),
      onGrade ? button(t('teaching.setScore'), { variant: 'gold', onClick: () => onGrade() }) : null,
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
  onOpenFile,
  nextSubmissionId = null,
  onNext,
  close,
}) {
  const error = errorLine();
  const criteria = normalizeRubric(homeworkItem.rubric);
  const usesRubric = criteria.length > 0;
  const maxScore = homeworkItem.maxScore ?? submission.maxScore ?? 100;
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
    max: String(maxScore),
    value: submission.score == null ? '' : String(submission.score),
    'aria-label': t('teaching.ariaScore'),
  });
  const feedback = el('textarea', {
    rows: '3',
    placeholder: t('teaching.placeholderFeedback'),
    'aria-label': t('teaching.feedback'),
  });
  if (submission.feedback) feedback.value = submission.feedback;

  // Live total: the sum is otherwise only computed on save, so without this the
  // teacher cannot see the running score while filling in rubric criteria.
  const rubricTotalValue = el('b', {}, '0');
  const rubricTotal = el('p', { class: 'rubric-total' }, [
    el('span', { class: 'muted small' }, t('teaching.rubricTotalLabel')),
    rubricTotalValue,
    el('span', { class: 'muted small' }, ` / ${rubricMax(criteria)}`),
  ]);
  const updateRubricTotal = () => {
    const sum = rubricInputs.reduce((total, input) => total + (Number(input.value) || 0), 0);
    rubricTotalValue.textContent = String(Math.round(sum * 100) / 100);
  };
  if (usesRubric) {
    for (const input of rubricInputs) input.addEventListener('input', updateRubricTotal);
    updateRubricTotal();
  }

  const scoringBlock = usesRubric
    ? el('div', {}, [
        ...criteria.flatMap((criterion, index) => [
          el('label', {}, t('teaching.criterionRange', { label: criterion.label, max: criterion.max })),
          rubricInputs[index],
        ]),
        rubricTotal,
      ])
    : el('div', {}, [el('label', {}, t('teaching.scoreRange', { max: maxScore })), score]);

  // After a successful save, advance to the next pending submission when the
  // teacher asked for it; otherwise just close.
  const finishSave = (advance) => {
    if (advance && nextSubmissionId && onNext) onNext(nextSubmissionId);
    else close();
  };
  const saveScore = (advance = false) => {
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
      if (!ok) {
        error.textContent = t('teaching.errRubricScores');
        return;
      }
      finishSave(advance);
      return;
    }
    const ok = actions.gradeSubmission({
      submissionId: submission.id,
      score: score.value,
      feedback: feedback.value,
    });
    if (!ok) {
      error.textContent = t('teaching.errScoreRange', { max: maxScore });
      return;
    }
    finishSave(advance);
  };

  const requestRevision = () => {
    const ok = actions.requestRevision({ submissionId: submission.id, feedback: feedback.value });
    if (ok) close();
    else error.textContent = t('teaching.errRevisionFeedback');
  };

  const node = el('div', {}, [
    el('h2', {}, t('teaching.scoreTitle', { name: learnerName })),
    el(
      'p',
      { class: 'muted small' },
      usesRubric
        ? t('teaching.rubricOutOf', { title: homeworkItem.title, max: rubricMax(criteria) })
        : t('teaching.outOf', { title: homeworkItem.title, max: maxScore }),
    ),
    el('h3', {}, t('teaching.submissionHeading')),
    el('blockquote', { class: 'quote' }, submission.text || t('teaching.noText')),
    submission.link
      ? el(
          'p',
          {},
          el('a', { href: submission.link, target: '_blank', rel: 'noreferrer' }, submission.link),
        )
      : null,
    submission.files?.length
      ? el(
          'div',
          { class: 'files' },
          submission.files.map((file) => fileLink(file, { onOpen: onOpenFile })),
        )
      : null,
    previousVersions(versions),
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
      nextSubmissionId
        ? button(t('teaching.saveScore'), { onClick: () => saveScore(false) })
        : null,
      button(nextSubmissionId ? t('teaching.saveAndNext') : t('teaching.saveScore'), {
        variant: 'gold',
        onClick: () => saveScore(Boolean(nextSubmissionId)),
      }),
    ]),
    el('p', { class: 'field-hint' }, t('teaching.keyboardSaveHint')),
  ]);

  node.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      saveScore(Boolean(nextSubmissionId));
    }
  });
  return node;
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
