import { CAPABILITY, hasCapability } from './capability.js';

export const ACTION = Object.freeze({
  MANAGE_CLASSROOM: 'classroom:manage',
  SET_POLICY: 'classroom:policy',
  POST_HOMEWORK: 'homework:post',
  EDIT_HOMEWORK: 'homework:edit',
  GRADE: 'grade:submit',
  SUBMIT: 'submission:submit',
  FINALIZE_ASSESSMENT: 'assessment:finalize',
  CORRECT_ASSESSMENT: 'assessment:correct',
  RECOMMEND_COMPLETION: 'completion:recommend',
  DECIDE_ENROLLMENT: 'enrollment:decide',
  ISSUE_CREDENTIAL: 'credential:issue',
  REVOKE_CREDENTIAL: 'credential:revoke',
});

export function academyById(academies, academyId) {
  const list = Array.isArray(academies) ? academies : Object.values(academies ?? {});
  return list.find((academy) => academy?.id === academyId) ?? null;
}

export function academyForClassroom(academies, classroom) {
  return academyById(academies, classroom?.academyId);
}

// An active student is on the class roster, or holds a signed enrollment
// capability for it (the Nostr-native source of truth).
export function isActiveStudent(classroom, actor, capabilities = []) {
  if (!classroom || !actor) return false;
  if ((classroom.studentIds ?? []).includes(actor)) return true;
  return hasCapability(capabilities, {
    kind: CAPABILITY.ENROLLMENT,
    academyId: classroom.academyId,
    accountId: actor,
    classroomId: classroom.id,
  });
}

export function isAssignedTeacher(classroom, actor, capabilities = []) {
  if (!classroom || !actor) return false;
  if (actor === classroom.teacherId) return true;
  return hasCapability(capabilities, {
    kind: CAPABILITY.TEACHER_ASSIGNMENT,
    academyId: classroom.academyId,
    accountId: actor,
    classroomId: classroom.id,
  });
}

/*
  Single source of truth for "who may do what". The client calls this today; the server
  is expected to import the same module so a request cannot be forged by the UI.
*/
export function authorize(action, { actor, classroom, academy, capabilities = [] } = {}) {
  if (!actor) return false;
  const isOwner =
    Boolean(academy) &&
    (actor === academy.ownerId ||
      hasCapability(capabilities, {
        kind: CAPABILITY.MEMBERSHIP,
        academyId: academy.id,
        accountId: actor,
        role: 'owner',
      }));
  const isTeacher = isAssignedTeacher(classroom, actor, capabilities);
  // Only the enrolled student may submit their own work. Being the owner or
  // teacher does not grant submission rights.
  const isEnrolledStudent = isActiveStudent(classroom, actor, capabilities);

  switch (action) {
    case ACTION.SUBMIT:
      return isEnrolledStudent;
    case ACTION.MANAGE_CLASSROOM:
    case ACTION.POST_HOMEWORK:
    case ACTION.EDIT_HOMEWORK:
    case ACTION.GRADE:
    case ACTION.FINALIZE_ASSESSMENT:
    case ACTION.CORRECT_ASSESSMENT:
    case ACTION.RECOMMEND_COMPLETION:
    case ACTION.DECIDE_ENROLLMENT:
      return isOwner || isTeacher;
    case ACTION.SET_POLICY:
    case ACTION.ISSUE_CREDENTIAL:
    case ACTION.REVOKE_CREDENTIAL:
      return isOwner;
    default:
      return false;
  }
}
