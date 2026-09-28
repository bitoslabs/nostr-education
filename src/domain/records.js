import { MEMBERSHIP } from './school.js';

export const RECORD_TYPES = Object.freeze({
  ACADEMY: 'academy',
  SUBJECT: 'subject',
  CLASSROOM: 'classroom',
  HOMEWORK: 'homework',
  SUBMISSION: 'submission',
  GRADE: 'grade',
  INVITE: 'invite',
  JOIN_REQUEST: 'joinreq',
  MEMBER: 'member',
});

export const PUBLIC_RECORD_TYPES = Object.freeze([
  RECORD_TYPES.ACADEMY,
  RECORD_TYPES.SUBJECT,
  RECORD_TYPES.CLASSROOM,
]);

export const PRIVATE_RECORD_TYPES = Object.freeze([
  RECORD_TYPES.HOMEWORK,
  RECORD_TYPES.SUBMISSION,
  RECORD_TYPES.GRADE,
  RECORD_TYPES.INVITE,
  RECORD_TYPES.JOIN_REQUEST,
  RECORD_TYPES.MEMBER,
]);

function upsert(list = [], item) {
  const index = list.findIndex((entry) => entry.id === item.id);
  if (index < 0) return [item, ...list];
  const next = [...list];
  next[index] = { ...next[index], ...item };
  return next;
}

function removeById(list = [], id) {
  return list.filter((entry) => entry.id !== id);
}

export function applyRecord(state, record) {
  if (!record?.type || !record.id) return null;

  switch (record.type) {
    case RECORD_TYPES.ACADEMY:
      if (!record.ownerId) return null;
      return { academies: { ...state.academies, [record.ownerId]: { ...record } } };
    case RECORD_TYPES.SUBJECT:
      if (record.deleted) return { subjects: removeById(state.subjects ?? [], record.id) };
      return { subjects: upsert(state.subjects ?? [], record) };
    case RECORD_TYPES.CLASSROOM:
      if (record.deleted) return { classrooms: removeById(state.classrooms ?? [], record.id) };
      return { classrooms: upsert(state.classrooms ?? [], record) };
    case RECORD_TYPES.HOMEWORK:
      return { homework: upsert(state.homework ?? [], record) };
    case RECORD_TYPES.SUBMISSION:
      return { submissions: upsert(state.submissions ?? [], record) };
    case RECORD_TYPES.GRADE: {
      if (!record.submissionId) return null;
      const submissions = (state.submissions ?? []).map((submission) =>
        submission.id === record.submissionId
          ? {
              ...submission,
              score: record.score,
              feedback: record.feedback ?? submission.feedback,
              status: 'graded',
              gradedAt: record.gradedAt ?? submission.gradedAt,
              gradedBy: record.gradedBy ?? submission.gradedBy,
            }
          : submission,
      );
      return { submissions };
    }
    case RECORD_TYPES.INVITE:
      return { invites: upsert(state.invites ?? [], record) };
    case RECORD_TYPES.JOIN_REQUEST:
      return { joinRequests: upsert(state.joinRequests ?? [], record) };
    case RECORD_TYPES.MEMBER: {
      if (!record.memberId) return null;
      return {
        memberships: { ...state.memberships, [record.memberId]: record.status ?? MEMBERSHIP.ACTIVE },
      };
    }
    default:
      return null;
  }
}
