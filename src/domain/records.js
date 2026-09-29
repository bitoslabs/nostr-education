import { MEMBERSHIP } from './school.js';

export const RECORD_TYPES = Object.freeze({
  ACADEMY: 'academy',
  SUBJECT: 'subject',
  CLASSROOM: 'classroom',
  HOMEWORK: 'homework',
  SUBMISSION: 'submission',
  SUBMISSION_VERSION: 'submission-ver',
  GRADE: 'grade',
  REVISION: 'revision',
  ASSESSMENT_REVISION: 'assessment-rev',
  RECOMMENDATION: 'recommendation',
  CAPABILITY: 'capability',
  INVITE: 'invite',
  JOIN_LINK: 'joinlink',
  JOIN_REQUEST: 'joinreq',
  MEMBER: 'member',
});

export const PUBLIC_RECORD_TYPES = Object.freeze([
  RECORD_TYPES.ACADEMY,
  RECORD_TYPES.SUBJECT,
  RECORD_TYPES.CLASSROOM,
  RECORD_TYPES.JOIN_LINK,
]);

export const PRIVATE_RECORD_FIELDS = Object.freeze(['studentIds']);

export function isPublicRecord(record) {
  return Boolean(record?.type) && PUBLIC_RECORD_TYPES.includes(record.type);
}

export function toPublicRecord(record) {
  if (!record || typeof record !== 'object') return record;
  const copy = { ...record };
  for (const field of PRIVATE_RECORD_FIELDS) delete copy[field];
  return copy;
}

export const PRIVATE_RECORD_TYPES = Object.freeze([
  RECORD_TYPES.HOMEWORK,
  RECORD_TYPES.SUBMISSION,
  RECORD_TYPES.SUBMISSION_VERSION,
  RECORD_TYPES.GRADE,
  RECORD_TYPES.REVISION,
  RECORD_TYPES.ASSESSMENT_REVISION,
  RECORD_TYPES.RECOMMENDATION,
  RECORD_TYPES.CAPABILITY,
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
      return {
        academies: {
          ...state.academies,
          [record.ownerId]: {
            ...record,
            type: record.academyType ?? 'school',
          },
        },
      };
    case RECORD_TYPES.SUBJECT:
      if (record.deleted) return { subjects: removeById(state.subjects ?? [], record.id) };
      return { subjects: upsert(state.subjects ?? [], record) };
    case RECORD_TYPES.CLASSROOM:
      if (record.deleted) return { classrooms: removeById(state.classrooms ?? [], record.id) };
      return { classrooms: upsert(state.classrooms ?? [], record) };
    case RECORD_TYPES.HOMEWORK:
      if (record.deleted) return { homework: removeById(state.homework ?? [], record.id) };
      return { homework: upsert(state.homework ?? [], record) };
    case RECORD_TYPES.SUBMISSION:
      return { submissions: upsert(state.submissions ?? [], record) };
    case RECORD_TYPES.SUBMISSION_VERSION: {
      if (!record.submissionId) return null;
      const submissionVersions = upsert(state.submissionVersions ?? [], record);
      const list = state.submissions ?? [];
      const exists = list.some((submission) => submission.id === record.submissionId);
      const submissions = exists
        ? list.map((submission) => {
            if (submission.id !== record.submissionId) return submission;
            const incoming = Number(record.version) || 0;
            if (incoming < (Number(submission.version) || 0)) return submission;
            return {
              ...submission,
              version: incoming,
              text: record.text ?? submission.text,
              submittedAt: record.submittedAt ?? submission.submittedAt,
            };
          })
        : [
            {
              id: record.submissionId,
              homeworkId: record.homeworkId ?? null,
              classroomId: record.classroomId ?? null,
              studentId: record.studentId ?? null,
              text: record.text ?? '',
              version: Number(record.version) || 1,
              status: 'submitted',
              score: null,
              scores: null,
              maxScore: record.maxScore ?? null,
              feedback: '',
              submittedAt: record.submittedAt ?? null,
              gradedAt: null,
              gradedBy: null,
            },
            ...list,
          ];
      return { submissionVersions, submissions };
    }
    case RECORD_TYPES.ASSESSMENT_REVISION: {
      if (!record.submissionId) return null;
      const assessmentRevisions = upsert(state.assessmentRevisions ?? [], record);
      const submissions = (state.submissions ?? []).map((submission) => {
        if (submission.id !== record.submissionId) return submission;
        if (record.status === 'revision') {
          return {
            ...submission,
            status: 'revision',
            score: null,
            scores: null,
            feedback: record.feedback ?? submission.feedback,
            gradedAt: null,
            gradedBy: null,
          };
        }
        if (record.status === 'finalized') {
          return {
            ...submission,
            score: record.score,
            scores: record.scores ?? submission.scores,
            maxScore: record.maxScore ?? submission.maxScore,
            feedback: record.feedback ?? submission.feedback,
            status: 'graded',
            gradedAt: record.gradedAt ?? submission.gradedAt,
            gradedBy: record.gradedBy ?? submission.gradedBy,
          };
        }
        return submission;
      });
      return { assessmentRevisions, submissions };
    }
    case RECORD_TYPES.GRADE: {
      if (!record.submissionId) return null;
      const submissions = (state.submissions ?? []).map((submission) =>
        submission.id === record.submissionId
          ? {
              ...submission,
              score: record.score,
              scores: record.scores ?? submission.scores,
              feedback: record.feedback ?? submission.feedback,
              status: 'graded',
              gradedAt: record.gradedAt ?? submission.gradedAt,
              gradedBy: record.gradedBy ?? submission.gradedBy,
            }
          : submission,
      );
      return { submissions };
    }
    case RECORD_TYPES.REVISION: {
      if (!record.submissionId) return null;
      const submissions = (state.submissions ?? []).map((submission) =>
        submission.id === record.submissionId
          ? {
              ...submission,
              status: 'revision',
              score: null,
              scores: null,
              feedback: record.feedback ?? submission.feedback,
              gradedAt: null,
              gradedBy: null,
            }
          : submission,
      );
      return { submissions };
    }
    case RECORD_TYPES.INVITE:
      return { invites: upsert(state.invites ?? [], record) };
    case RECORD_TYPES.JOIN_LINK: {
      const { v, type, ...invite } = record;
      return { invites: upsert(state.invites ?? [], invite) };
    }
    case RECORD_TYPES.JOIN_REQUEST:
      return { joinRequests: upsert(state.joinRequests ?? [], record) };
    case RECORD_TYPES.MEMBER: {
      if (!record.memberId) return null;
      const academyMemberships = record.academyId
        ? [
            ...(state.academyMemberships ?? []).filter(
              (entry) => !(entry.accountId === record.memberId && entry.academyId === record.academyId),
            ),
            {
              academyId: record.academyId,
              accountId: record.memberId,
              role: record.role ?? 'student',
              status: record.status ?? MEMBERSHIP.ACTIVE,
            },
          ]
        : state.academyMemberships ?? [];
      return {
        memberships: { ...state.memberships, [record.memberId]: record.status ?? MEMBERSHIP.ACTIVE },
        academyMemberships,
      };
    }
    case RECORD_TYPES.RECOMMENDATION: {
      if (!record.studentId) return null;
      const known = (state.recommendations ?? []).some((entry) => entry.id === record.id);
      const recommendations = upsert(state.recommendations ?? [], record);
      if (known) return { recommendations };
      const signId = `sign-${record.id}`;
      const hasSign = (state.signQueue ?? []).some((entry) => entry.id === signId);
      return {
        recommendations,
        ...(hasSign
          ? {}
          : {
              signQueue: [
                {
                  id: signId,
                  learnerName: record.learnerName ?? 'Learner',
                  course: record.course ?? 'Course',
                  academyName: record.academyName ?? null,
                  policyVersion: record.policyVersion ?? null,
                  time: 'now',
                  status: 'pending',
                  grade: record.grade ?? null,
                },
                ...(state.signQueue ?? []),
              ],
            }),
      };
    }
    case RECORD_TYPES.CAPABILITY: {
      if (!record.accountId || !record.academyId) return null;
      return { capabilities: upsert(state.capabilities ?? [], record) };
    }
    default:
      return null;
  }
}

// Older builds stored one mutable submission row per (homework, student) and one
// mutable grade on it. Backfill the append-only history so v1 state keeps its
// first version and first assessment without losing anything.
export function migrateSubmissionHistory(state = {}) {
  const submissions = state.submissions ?? [];
  let submissionVersions = state.submissionVersions ?? [];
  let assessmentRevisions = state.assessmentRevisions ?? [];
  let changed = false;

  const versioned = new Set(submissionVersions.map((entry) => entry.submissionId));
  const revised = new Set(assessmentRevisions.map((entry) => entry.submissionId));

  for (const submission of submissions) {
    if (!submission?.id) continue;
    if (!versioned.has(submission.id)) {
      submissionVersions = upsert(submissionVersions, {
        id: `ver-${submission.id}-1`,
        type: RECORD_TYPES.SUBMISSION_VERSION,
        submissionId: submission.id,
        homeworkId: submission.homeworkId,
        classroomId: submission.classroomId,
        studentId: submission.studentId,
        version: Number(submission.version) || 1,
        text: submission.text ?? '',
        submittedAt: submission.submittedAt ?? null,
      });
      changed = true;
    }
    if (!revised.has(submission.id) && submission.status === 'graded' && submission.score != null) {
      assessmentRevisions = upsert(assessmentRevisions, {
        id: `asmt-${submission.id}-1`,
        type: RECORD_TYPES.ASSESSMENT_REVISION,
        submissionId: submission.id,
        homeworkId: submission.homeworkId,
        studentId: submission.studentId,
        version: 1,
        status: 'finalized',
        score: submission.score,
        scores: submission.scores ?? null,
        maxScore: submission.maxScore ?? null,
        feedback: submission.feedback ?? '',
        gradedAt: submission.gradedAt ?? null,
        gradedBy: submission.gradedBy ?? null,
      });
      changed = true;
    }
  }

  if (!changed) return null;
  return { submissionVersions, assessmentRevisions };
}
