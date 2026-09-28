export const ROLE = Object.freeze({
  STUDENT: 'student',
  TEACHER: 'teacher',
  OWNER: 'owner',
});

const ROLE_SPACE = Object.freeze({
  [ROLE.STUDENT]: 'Education',
  [ROLE.TEACHER]: 'Teaching',
  [ROLE.OWNER]: 'Organization',
});

const ROLE_SPACE_SHORT = Object.freeze({
  [ROLE.STUDENT]: 'Edu',
  [ROLE.TEACHER]: 'Teach',
  [ROLE.OWNER]: 'Org',
});

export const ENROLLMENT = Object.freeze({
  NONE: 'none',
  PENDING: 'pending',
  APPROVED: 'approved',
});

export const MEMBERSHIP = Object.freeze({
  NONE: 'none',
  PENDING: 'pending',
  ACTIVE: 'active',
});

export const REQUEST_STATUS = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  DECLINED: 'declined',
});

export function roleSpaceLabel(role) {
  return ROLE_SPACE[role] ?? 'Workspace';
}

export function roleSpaceShort(role) {
  return ROLE_SPACE_SHORT[role] ?? 'Space';
}

export function enrollmentBadge(state) {
  if (state === ENROLLMENT.PENDING) return { label: 'enrollment pending', tone: 'info' };
  if (state === ENROLLMENT.APPROVED) return { label: 'enrolled ✓', tone: 'ok' };
  return null;
}

export function membershipBadge(status) {
  if (status === MEMBERSHIP.PENDING) return { label: 'membership pending', tone: 'info' };
  if (status === MEMBERSHIP.ACTIVE) return { label: 'academy member ✓', tone: 'ok' };
  return null;
}

export function requestBadge(status) {
  if (status === REQUEST_STATUS.PENDING) return { label: 'pending', tone: 'info' };
  if (status === REQUEST_STATUS.APPROVED) return { label: 'approved ✓', tone: 'ok' };
  if (status === REQUEST_STATUS.DECLINED) return { label: 'declined', tone: 'err' };
  return null;
}

export function enrollmentStateFor(requests = [], learnerId, courseId) {
  const request = [...requests]
    .reverse()
    .find((entry) => entry.learnerId === learnerId && entry.courseId === courseId);
  if (!request) return ENROLLMENT.NONE;
  if (request.status === REQUEST_STATUS.PENDING) return ENROLLMENT.PENDING;
  if (request.status === REQUEST_STATUS.APPROVED) return ENROLLMENT.APPROVED;
  return ENROLLMENT.NONE;
}

export function pendingRequestCount(joinRequests = [], enrollRequests = []) {
  const pending = (list) => list.filter((entry) => entry.status === REQUEST_STATUS.PENDING).length;
  return pending(joinRequests) + pending(enrollRequests);
}


export const ASSIGNMENT_STATUS = Object.freeze({
  REVISION: 'revision',
  SUBMITTED: 'submitted',
  FINAL: 'final',
  CORRECTED: 'corrected',
});

export function assignmentBadge(assignment) {
  switch (assignment.status) {
    case ASSIGNMENT_STATUS.REVISION:
      return { label: '▲ revision requested', tone: 'warn' };
    case ASSIGNMENT_STATUS.SUBMITTED:
      return { label: 'submitted · awaiting review', tone: 'info' };
    case ASSIGNMENT_STATUS.FINAL:
      return { label: `✓ graded ${assignment.grade}%`, tone: 'ok' };
    case ASSIGNMENT_STATUS.CORRECTED:
      return { label: `✓ graded ${assignment.grade}% (corrected)`, tone: 'ok' };
    default:
      return { label: 'unknown', tone: 'muted' };
  }
}
