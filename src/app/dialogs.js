import { el } from '../core/dom.js';
import { getPersona, getPersonaIds } from '../data/personas.js';
import { SEED_CONTACTS } from '../data/seed.js';
import {
  SUBMISSION_STATUS,
  assessmentRevisionsFor,
  classroomById,
  classroomsForAcademy,
  classroomsForTeacher,
  isHomeworkOpen,
  nextPendingSubmission,
  reviewQueue,
  subjectById,
  submissionFor,
  subjectsForAcademy,
  versionsFor,
} from '../domain/classroom.js';
import { identityName } from '../domain/identity.js';
import { conversationWith, conversationsForAccount } from '../domain/messaging.js';
import { ROLE } from '../domain/school.js';
import { walletBalance, zapsForAccount } from '../domain/wallet.js';
import { renderCreateAcademy } from '../ui/components/academy-dialog.js';
import { renderPrivateName } from '../ui/components/private-name-dialog.js';
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
  renderSubmissionView,
  renderSubmitHomework,
} from '../ui/components/classroom-dialogs.js';
import { renderComposer } from '../ui/components/composer.js';
import { renderThread } from '../ui/components/reply-dialog.js';
import { renderFileViewer } from '../ui/components/file-viewer.js';
import { inviteLinkPanel, renderInviteLink, renderInviteTeacher } from '../ui/components/invite-dialog.js';
import { renderNewMessage } from '../ui/components/new-message-dialog.js';
import { noteBox, button } from '../ui/components/primitives.js';
import { qrNode } from '../services/qr.js';
import { lnurlPayUrl } from '../services/lnurl.js';
import { renderCropper } from '../ui/components/image-cropper.js';
import { learnerDisplayName } from '../ui/private-name-view.js';
import { renderShare } from '../ui/components/share-dialog.js';
import { renderSign } from '../ui/components/sign-drawer.js';
import { renderZap } from '../ui/components/zap-dialog.js';
import { t } from '../services/i18n/index.js';

export function createDialogs({ overlay, store, actions, contacts = SEED_CONTACTS }) {
  const handles = {};

  function openNamed(name, options) {
    handles[name]?.close();
    const { onClose, ...rest } = options;
    const handle = overlay.open({
      ...rest,
      onClose: (result) => {
        handles[name] = null;
        onClose?.(result);
      },
    });
    handles[name] = handle;
    return handle;
  }

  const closeNamed = (name) => () => handles[name]?.close();

  // The grading backlog visible to the signed-in teacher/owner, used to offer
  // "Save & next" so a teacher works through a large class without closing and
  // hunting for each row.
  function scopedReviewQueue(state) {
    const persona = getPersona(state.personaId);
    const owned = state.academies?.[persona.id];
    const classrooms =
      persona.role === ROLE.OWNER && owned
        ? classroomsForAcademy(state.classrooms ?? [], owned.id)
        : classroomsForTeacher(state.classrooms ?? [], persona.id, state.capabilities ?? []);
    return reviewQueue(state.submissions ?? [], state.homework ?? [], classrooms);
  }

  function openSign(signId) {
    const item = store.getState().signQueue.find((entry) => entry.id === signId);
    if (!item) return null;
    return openNamed('sign', {
      kind: 'drawer',
      label: t('actions.reviewAndSign'),
      content: renderSign({ item, actions, close: closeNamed('sign') }),
    });
  }

  function openShare(credentialId) {
    const state = store.getState();
    const credential = state.credentials.find((entry) => entry.id === credentialId) ?? state.credentials[0];
    if (!credential) return null;
    return openNamed('share', {
      label: t('actions.shareAccess'),
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
            t('actions.creatingAcademyNotice'),
            'warn',
          )
        : null;
    return openNamed('academy', {
      label: t('actions.createAcademy'),
      content: renderCreateAcademy({ actions, close: closeNamed('academy'), roleNotice }),
    });
  }

  function openPrivateName(role) {
    const state = store.getState();
    const persona = getPersona(state.personaId);
    const profile = state.privateNames?.[persona.id] ?? null;
    return openNamed('private-name', {
      label: t('credentials.privateName.title'),
      content: renderPrivateName({
        profile,
        role: role ?? persona.role,
        actions,
        close: closeNamed('private-name'),
      }),
    });
  }

  function openInviteTeacher() {
    return openNamed('invite-teacher', {
      label: t('actions.inviteTeacherTitle'),
      content: renderInviteTeacher({ actions, close: closeNamed('invite-teacher') }),
    });
  }

  function openInviteLink(role = ROLE.STUDENT) {
    const invite = actions.createInviteLink(role);
    if (!invite) return null;
    return openNamed('invite-link', {
      label: t('actions.joinLink'),
      content: renderInviteLink({ invite, actions, close: closeNamed('invite-link') }),
    });
  }

  function openCreateSubject() {
    return openNamed('subject', {
      label: t('actions.newSubject'),
      content: renderCreateSubject({ actions, close: closeNamed('subject') }),
    });
  }

  function openEditSubject(subjectId) {
    const subject = subjectById(store.getState().subjects ?? [], subjectId);
    if (!subject) return null;
    return openNamed('edit-subject', {
      label: t('actions.editNamed', { name: subject.name }),
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
      label: t('actions.newClassroom'),
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
      label: t('actions.manageNamed', { name: classroom.name }),
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
      label: t('actions.completionRulesNamed', { name: classroom.name }),
      content: renderCompletionPolicy({ classroom, actions, close: closeNamed('completion-policy') }),
    });
  }

  function openInviteStudent(classroomId) {
    const classroom = classroomById(store.getState().classrooms ?? [], classroomId);
    if (!classroom) return null;
    return openNamed('invite-student', {
      label: t('actions.inviteLearnerNamed', { name: classroom.name }),
      content: renderInviteStudent({ classroom, actions, close: closeNamed('invite-student') }),
    });
  }

  function openInviteClassTeacher(classroomId) {
    const classroom = classroomById(store.getState().classrooms ?? [], classroomId);
    if (!classroom) return null;
    return openNamed('invite-class-teacher', {
      label: t('actions.inviteTeacherNamed', { name: classroom.name }),
      content: renderInviteClassTeacher({ classroom, actions, close: closeNamed('invite-class-teacher') }),
    });
  }

  function openClassLink(classroomId) {
    const invite = actions.createClassLink(classroomId);
    if (!invite) return null;
    return openNamed('class-link', {
      label: t('actions.classJoinLink'),
      content: el('div', {}, inviteLinkPanel({ invite, copyText: actions.copyText, actions, close: closeNamed('class-link') })),
    });
  }

  function openCreateHomework(classroomId) {
    const state = store.getState();
    const classroom = classroomById(state.classrooms ?? [], classroomId);
    if (!classroom) return null;
    const subject = subjectById(state.subjects ?? [], classroom.subjectId);
    return openNamed('homework', {
      label: t('actions.postHomeworkNamed', { name: classroom.name }),
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
    // A closed (or draft) homework must never open the submit form, even if a
    // stale button or deep link calls in; the action re-checks on submit too.
    if (!isHomeworkOpen(homeworkItem)) return null;
    const submission = submissionFor(state.submissions ?? [], homeworkId, state.personaId);
    const versions = versionsFor(state.submissionVersions ?? [], submission?.id);
    const classroom = classroomById(state.classrooms ?? [], homeworkItem.classroomId);
    return openNamed('submit-homework', {
      label: t('actions.submitNamed', { name: homeworkItem.title }),
      content: renderSubmitHomework({
        homeworkItem,
        submission,
        versions,
        classroom,
        accountId: state.personaId,
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
      label: t('actions.manageNamed', { name: homeworkItem.title }),
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
    const nextSubmissionId =
      submission.status === SUBMISSION_STATUS.SUBMITTED
        ? nextPendingSubmission(scopedReviewQueue(state), submissionId)
        : null;
    return openNamed('grade', {
      label: t('actions.scoreNamed', { name: submission.id }),
      content: renderGradeSubmission({
        submission,
        homeworkItem: homeworkItem ?? { title: t('actions.homeworkFallback') },
        learnerName: learnerDisplayName(state, getPersona(state.personaId), submission.studentId),
        versions: versionsFor(state.submissionVersions ?? [], submission.id),
        revisions: assessmentRevisionsFor(state.assessmentRevisions ?? [], submission.id),
        actions,
        onOpenFile: openFileViewer,
        nextSubmissionId,
        onNext: (id) => {
          closeNamed('grade')();
          openGradeSubmission(id);
        },
        close: closeNamed('grade'),
      }),
    });
  }

  function openViewSubmission(submissionId) {
    const state = store.getState();
    const submission = (state.submissions ?? []).find((entry) => entry.id === submissionId);
    if (!submission) return null;
    const homeworkItem = (state.homework ?? []).find((entry) => entry.id === submission.homeworkId);
    const classroom = classroomById(state.classrooms ?? [], submission.classroomId);
    return openNamed('view-submission', {
      label: t('actions.viewNamed', { name: submission.id }),
      content: renderSubmissionView({
        submission,
        homeworkItem: homeworkItem ?? { title: t('actions.homeworkFallback') },
        classroom,
        learnerName: learnerDisplayName(state, getPersona(state.personaId), submission.studentId),
        versions: versionsFor(state.submissionVersions ?? [], submission.id),
        revisions: assessmentRevisionsFor(state.assessmentRevisions ?? [], submission.id),
        onOpenFile: openFileViewer,
        onGrade: () => {
          closeNamed('view-submission')();
          openGradeSubmission(submissionId);
        },
        close: closeNamed('view-submission'),
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
        label: title ?? t('actions.cropImage'),
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

  function openFileViewer(file) {
    if (!file?.url) return null;
    return openNamed('file-viewer', {
      kind: 'drawer-wide',
      label: String(file.name ?? t('actions.filePreview')),
      content: renderFileViewer({ file, close: closeNamed('file-viewer') }),
    });
  }

  function openComposer() {
    const persona = getPersona(store.getState().personaId);
    return openNamed('composer', {
      label: t('common.a11y.newPost'),
      content: renderComposer({
        persona,
        close: closeNamed('composer'),
        onPost: (payload) => actions.postNote(payload),
        uploadImage: (blob) => actions.uploadImage(blob),
        uploadAttachment: (file) => actions.uploadAttachment(file),
        defaultPow: actions.defaultPow?.() ?? 0,
      }),
    });
  }

  function findNote(noteId) {
    const current = store.getState();
    return (
      (current.events ?? []).find((entry) => entry.id === noteId) ??
      (current.profileTimeline?.events ?? []).find((entry) => entry.id === noteId) ??
      null
    );
  }

  function openThread(noteId) {
    const note = findNote(noteId);
    if (!note) return null;
    actions.loadThread(noteId);
    const { node, cleanup } = renderThread({
      note,
      getReplies: () => store.getState().threads?.[noteId]?.replies ?? [],
      getStatus: () => store.getState().threads?.[noteId]?.status ?? 'loading',
      subscribe: (listener) => store.subscribe(listener),
      onReply: (text, pow) => actions.replyPost(noteId, text, pow),
      onOpenMedia: (file) => openFileViewer(file),
      close: closeNamed('thread'),
    });
    return openNamed('thread', {
      kind: 'drawer',
      label: t('home.replies'),
      content: node,
      onClose: () => {
        cleanup?.();
        actions.closeThread?.(noteId);
      },
    });
  }

  function openNewMessage() {
    return openNamed('new-message', {
      label: t('messages.newMessage'),
      content: renderNewMessage({ actions, close: closeNamed('new-message') }),
    });
  }

  // Shared zap dialog. `registerCleanup` lets the dialog tear down its live
  // receipt subscription whether it closes itself (auto-detect settlement) or
  // the user dismisses it (backdrop / Escape).
  function openZapDialog({ peer, eventId = null }) {
    const state = store.getState();
    let cleanup = null;
    return openNamed('zap', {
      label: t('wallet.zap.heading', { name: identityName(peer) }),
      content: renderZap({
        peer,
        eventId,
        presets: actions.zapPresets?.(),
        hasAddress: !!lnurlPayUrl(peer),
        anonymousDefault: !!state.prefs?.zap?.anonymousZaps,
        balance: walletBalance(zapsForAccount(state, state.accountId)),
        actions,
        close: closeNamed('zap'),
        registerCleanup: (fn) => {
          cleanup = fn;
        },
      }),
      onClose: () => cleanup?.(),
    });
  }

  function openZap(eventId) {
    const event = findNote(eventId);
    if (!event) return null;
    if (event.author === store.getState().personaId) {
      actions.toast?.(t('wallet.zap.self'), 'warn');
      return null;
    }
    return openZapDialog({ peer: getPersona(event.author), eventId });
  }

  function openZapPeer(peerId) {
    if (peerId === store.getState().personaId) {
      actions.toast?.(t('wallet.zap.self'), 'warn');
      return null;
    }
    const peer = getPersona(peerId);
    if (!peer?.id) return null;
    return openZapDialog({ peer });
  }

  // Open the existing thread with this person, or start a new one. Used by the
  // "Message" action on a post or profile.
  function openMessageTo(peerId) {
    const peer = getPersona(peerId);
    if (!peer?.id) return null;
    const state = store.getState();
    const existing = conversationWith(conversationsForAccount(state, state.accountId), peerId);
    if (existing) {
      actions.setActiveConversation(existing.id);
      actions.navigate('/messages');
      return null;
    }
    return openNamed('new-message', {
      label: t('messages.newMessage'),
      content: renderNewMessage({ actions, close: closeNamed('new-message'), recipient: peer }),
    });
  }

  function openQr({ text, label, description } = {}) {
    const value = String(text ?? '').trim();
    if (!value) return null;
    return openNamed('qr', {
      label: label ?? t('settings.identity.qrTitle'),
      content: el('div', { class: 'qr-dialog' }, [
        qrNode(value, { cell: 6, margin: 2 }),
        description ? el('p', { class: 'muted small' }, description) : null,
        el('p', { class: 'mono small qr-dialog__value' }, value),
        button(t('common.actions.copy'), { small: true, onClick: () => actions.copyText(value) }),
      ]),
    });
  }

  return {
    openSign,
    openShare,
    openQr,
    cropImage,
    openComposer,
    openThread,
    openNewMessage,
    openMessageTo,
    openZap,
    openZapPeer,
    openCreateAcademy,
    openInviteTeacher,
    openInviteLink,
    openPrivateName,
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
    openViewSubmission,
    openFileViewer,
  };
}
