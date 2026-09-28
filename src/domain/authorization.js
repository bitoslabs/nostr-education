export const ACTION = Object.freeze({
  MANAGE_CLASSROOM: 'classroom:manage',
  SET_POLICY: 'classroom:policy',
  POST_HOMEWORK: 'homework:post',
  EDIT_HOMEWORK: 'homework:edit',
  GRADE: 'grade:submit',
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

/*
  Single source of truth for "who may do what". The client calls this today; the server
  is expected to import the same module so a request cannot be forged by the UI.
*/
export function authorize(action, { actor, classroom, academy } = {}) {
  if (!actor) return false;
  const isOwner = Boolean(academy) && actor === academy.ownerId;
  const isTeacher = Boolean(classroom) && actor === classroom.teacherId;

  switch (action) {
    case ACTION.MANAGE_CLASSROOM:
    case ACTION.POST_HOMEWORK:
    case ACTION.EDIT_HOMEWORK:
    case ACTION.GRADE:
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
