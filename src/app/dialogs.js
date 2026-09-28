import { el } from '../core/dom.js';
import { getPersona, getPersonaIds } from '../data/personas.js';
import { SEED_CONTACTS } from '../data/seed.js';
import { classroomById, subjectById, submissionFor, subjectsForAcademy } from '../domain/classroom.js';
import { ROLE } from '../domain/school.js';
import { renderCreateAcademy } from '../ui/components/academy-dialog.js';
import {
  renderCompletionPolicy,
  renderCreateClassroom,
  renderCreateHomework,
  renderCreateSubject,
  renderEditSubject,
  renderGradeSubmission,
  renderInviteClassTeacher,
  renderInviteStudent,
  renderManageClassroom,
  renderManageHomework,
  renderSubmitHomework,
} from '../ui/components/classroom-dialogs.js';
import { renderComposer } from '../ui/components/composer.js';
import { inviteLinkPanel, renderInviteLink, renderInviteTeacher } from '../ui/components/invite-dialog.js';
import { noteBox } from '../ui/components/primitives.js';
import { renderCropper } from '../ui/components/image-cropper.js';
import { renderShare } from '../ui/components/share-dialog.js';
import { renderSign } from '../ui/components/sign-drawer.js';

export function createDialogs({ overlay, store, actions, contacts = SEED_CONTACTS }) {
  const handles = {};

  function openNamed(name, options) {
    handles[name]?.close();
    const handle = overlay.open({
      ...options,
      onClose: () => {
        handles[name] = null;
      },
    });
    handles[name] = handle;
    return handle;
  }

  const closeNamed = (name) => () => handles[name]?.close();

  function openSign(signId) {
    const item = store.getState().signQueue.find((entry) => entry.id === signId);
    if (!item) return null;
    return openNamed('sign', {
      kind: 'drawer',
      label: 'Review and sign',
      content: renderSign({ item, actions, close: closeNamed('sign') }),
    });
  }

  function openShare(credentialId) {
    const state = store.getState();
    const credential = state.credentials.find((entry) => entry.id === credentialId) ?? state.credentials[0];
    if (!credential) return null;
    return openNamed('share', {
      label: 'Share access',
      content: renderShare({
        credential,
        contacts,
        actions,
        close: closeNamed('share'),
      }),
    });
  }

  function openCreateAcademy() {
    const state = store.getState();
    const persona = getPersona(state.personaId);
    const roleNotice =
      persona.role === ROLE.TEACHER
        ? noteBox(
            'Creating an academy makes you its owner and switches your workspace from Teaching to Organization. Classes assigned to you stay assigned.',
            'warn',
          )
        : null;
    return openNamed('academy', {
      label: 'Create academy',
      content: renderCreateAcademy({ actions, close: closeNamed('academy'), roleNotice }),
    });
  }

  function openInviteTeacher() {
    return openNamed('invite-teacher', {
      label: 'Invite teacher',
      content: renderInviteTeacher({ actions, close: closeNamed('invite-teacher') }),
    });
  }

  function openInviteLink(role = ROLE.STUDENT) {
    const invite = actions.createInviteLink(role);
    if (!invite) return null;
    return openNamed('invite-link', {
      label: 'Join link',
      content: renderInviteLink({ invite, actions, close: closeNamed('invite-link') }),
    });
  }

  function openCreateSubject() {
    return openNamed('subject', {
      label: 'New subject',
      content: renderCreateSubject({ actions, close: closeNamed('subject') }),
    });
  }

  function openEditSubject(subjectId) {
    const subject = subjectById(store.getState().subjects ?? [], subjectId);
    if (!subject) return null;
    return openNamed('edit-subject', {
      label: `Edit · ${subject.name}`,
      content: renderEditSubject({ subject, actions, close: closeNamed('edit-subject') }),
    });
  }

  function openCreateClassroom() {
    const state = store.getState();
    const academy = state.academies?.[state.personaId];
    const teachers = getPersonaIds()
      .map(getPersona)
      .filter((persona) => persona.role === ROLE.TEACHER);
    return openNamed('classroom', {
      label: 'New classroom',
      content: renderCreateClassroom({
        actions,
        close: closeNamed('classroom'),
        subjects: subjectsForAcademy(state.subjects ?? [], academy?.id),
        teachers,
      }),
    });
  }

  function openManageClassroom(classroomId) {
    const state = store.getState();
    const academy = state.academies?.[state.personaId];
    const classroom = classroomById(state.classrooms ?? [], classroomId);
    if (!classroom || !academy) return null;
    const teachers = getPersonaIds()
      .map(getPersona)
      .filter((persona) => persona.role === ROLE.TEACHER);
    return openNamed('manage-classroom', {
      label: `Manage · ${classroom.name}`,
      content: renderManageClassroom({
        classroom,
        subjects: subjectsForAcademy(state.subjects ?? [], academy.id),
        teachers,
        actions,
        close: closeNamed('manage-classroom'),
      }),
    });
  }

  function openCompletionPolicy(classroomId) {
    const classroom = classroomById(store.getState().classrooms ?? [], classroomId);
    if (!classroom) return null;
    return openNamed('completion-policy', {
      label: `Completion rules · ${classroom.name}`,
      content: renderCompletionPolicy({ classroom, actions, close: closeNamed('completion-policy') }),
    });
  }

  function openInviteStudent(classroomId) {
    const classroom = classroomById(store.getState().classrooms ?? [], classroomId);
    if (!classroom) return null;
    return openNamed('invite-student', {
      label: `Invite learner · ${classroom.name}`,
      content: renderInviteStudent({ classroom, actions, close: closeNamed('invite-student') }),
    });
  }

  function openInviteClassTeacher(classroomId) {
    const classroom = classroomById(store.getState().classrooms ?? [], classroomId);
    if (!classroom) return null;
    return openNamed('invite-class-teacher', {
      label: `Invite teacher · ${classroom.name}`,
      content: renderInviteClassTeacher({ classroom, actions, close: closeNamed('invite-class-teacher') }),
    });
  }

  function openClassLink(classroomId) {
    const invite = actions.createClassLink(classroomId);
    if (!invite) return null;
    return openNamed('class-link', {
      label: 'Class join link',
      content: el('div', {}, inviteLinkPanel({ invite, copyText: actions.copyText, actions, close: closeNamed('class-link') })),
    });
  }

  function openCreateHomework(classroomId) {
    const state = store.getState();
    const classroom = classroomById(state.classrooms ?? [], classroomId);
    if (!classroom) return null;
    const subject = subjectById(state.subjects ?? [], classroom.subjectId);
    return openNamed('homework', {
      label: `Post homework · ${classroom.name}`,
      content: renderCreateHomework({
        classroom,
        subject,
        actions,
        close: closeNamed('homework'),
      }),
    });
  }

  function openSubmitHomework(homeworkId) {
    const state = store.getState();
    const homeworkItem = (state.homework ?? []).find((entry) => entry.id === homeworkId);
    if (!homeworkItem) return null;
    const submission = submissionFor(state.submissions ?? [], homeworkId, state.personaId);
    return openNamed('submit-homework', {
      label: `Submit · ${homeworkItem.title}`,
      content: renderSubmitHomework({
        homeworkItem,
        submission,
        actions,
        close: closeNamed('submit-homework'),
      }),
    });
  }

  function openManageHomework(homeworkId) {
    const state = store.getState();
    const homeworkItem = (state.homework ?? []).find((entry) => entry.id === homeworkId);
    if (!homeworkItem) return null;
    return openNamed('manage-homework', {
      label: `Manage · ${homeworkItem.title}`,
      content: renderManageHomework({
        homeworkItem,
        actions,
        close: closeNamed('manage-homework'),
      }),
    });
  }

  function openGradeSubmission(submissionId) {
    const state = store.getState();
    const submission = (state.submissions ?? []).find((entry) => entry.id === submissionId);
    if (!submission) return null;
    const homeworkItem = (state.homework ?? []).find((entry) => entry.id === submission.homeworkId);
    return openNamed('grade', {
      label: `Score · ${submission.id}`,
      content: renderGradeSubmission({
        submission,
        homeworkItem: homeworkItem ?? { title: 'Homework' },
        learnerName: getPersona(submission.studentId).displayName,
        actions,
        close: closeNamed('grade'),
      }),
    });
  }

  function cropImage({ file, aspect = 1, title, outputWidth = 512 }) {
    const url = URL.createObjectURL(file);
    return new Promise((resolve) => {
      let settled = false;
      const settle = (value) => {
        if (settled) return;
        settled = true;
        URL.revokeObjectURL(url);
        resolve(value);
      };
      const handle = overlay.open({
        label: title ?? 'Crop image',
        content: renderCropper({
          imageUrl: url,
          aspect,
          title,
          outputWidth,
          onApply: (blob) => {
            settle(blob);
            handle.close();
          },
          onCancel: () => {
            settle(null);
            handle.close();
          },
        }),
        onClose: () => settle(null),
      });
    });
  }

  function openComposer() {
    return openNamed('composer', {
      label: 'New post',
      content: renderComposer({
        close: closeNamed('composer'),
        onPost: (text, close) => {
          actions.postNote(text);
          close();
        },
      }),
    });
  }

  return {
    openSign,
    openShare,
    cropImage,
    openComposer,
    openCreateAcademy,
    openInviteTeacher,
    openInviteLink,
    openCreateSubject,
    openEditSubject,
    openCreateClassroom,
    openManageClassroom,
    openCompletionPolicy,
    openInviteStudent,
    openInviteClassTeacher,
    openClassLink,
    openCreateHomework,
    openManageHomework,
    openSubmitHomework,
    openGradeSubmission,
  };
}
