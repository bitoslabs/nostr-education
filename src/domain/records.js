import { CLASS_STATUS, compareRevisions } from './classroom.js';
import { MEMBERSHIP, REQUEST_STATUS } from './school.js';

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
  PRIVATE_NAME: 'private-name',
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
  RECORD_TYPES.PRIVATE_NAME,
]);

// The owner's original draft and the teacher's published assignment share an
// id but are authored by different keys, so both can arrive. Never let a stale
// draft downgrade a class that is already published/staffed.
function mergeClassroom(existing, incoming) {
  if (!existing) return incoming;
  const next = { ...existing, ...incoming };
  if (existing.status !== CLASS_STATUS.DRAFT && incoming.status === CLASS_STATUS.DRAFT) {
    next.status = existing.status;
  }
  if (!incoming.teacherId && existing.teacherId) next.teacherId = existing.teacherId;
  return next;
}

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
    case RECORD_TYPES.CLASSROOM: {
      if (record.deleted) return { classrooms: removeById(state.classrooms ?? [], record.id) };
      const existing = (state.classrooms ?? []).find((entry) => entry.id === record.id);
      return { classrooms: upsert(state.classrooms ?? [], mergeClassroom(existing, record)) };
    }
    case RECORD_TYPES.HOMEWORK: {
      if (record.deleted) return { homework: removeById(state.homework ?? [], record.id) };
      const existing = (state.homework ?? []).find((entry) => entry.id === record.id);
      // Homework is delivered gift-wrapped, whose inner `created_at` is
      // randomized into the past, so relay `created_at` cannot order updates.
      // Every real edit/close/reopen stamps a payload `updatedAt` from the
      // author's clock; refuse an older (or stale, unstamped) replay so a
      // leftover `published` copy cannot re-open a `closed` homework.
      const incomingUpdated = Date.parse(record.updatedAt);
      const storedUpdated = Date.parse(existing?.updatedAt);
      if (
        existing &&
        Number.isFinite(storedUpdated) &&
        (!Number.isFinite(incomingUpdated) || incomingUpdated < storedUpdated)
      ) {
        return null;
      }
      // The record is republished on every edit, so the earliest raw event time
      // is its creation and the latest is its last update. Keep both across
      // out-of-order relay replays.
      const times = [existing?.eventCreatedAt, existing?.eventUpdatedAt, record.eventCreatedAt]
        .map(Number)
        .filter((value) => Number.isFinite(value) && value > 0);
      const incoming = times.length
        ? { ...record, eventCreatedAt: Math.min(...times), eventUpdatedAt: Math.max(...times) }
        : record;
      return { homework: upsert(state.homework ?? [], incoming) };
    }
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
              link: record.link ?? submission.link ?? null,
              files: record.files ?? submission.files ?? [],
              submittedAt: record.submittedAt ?? submission.submittedAt,
              // Raw Nostr created_at of the latest submission version.
              submittedEventAt: record.eventCreatedAt ?? submission.submittedEventAt,
            };
          })
        : [
            {
              id: record.submissionId,
              homeworkId: record.homeworkId ?? null,
              classroomId: record.classroomId ?? null,
              studentId: record.studentId ?? null,
              text: record.text ?? '',
              link: record.link ?? null,
              files: record.files ?? [],
              version: Number(record.version) || 1,
              status: 'submitted',
              score: null,
              scores: null,
              maxScore: record.maxScore ?? null,
              feedback: '',
              submittedAt: record.submittedAt ?? null,
              submittedEventAt: record.eventCreatedAt ?? null,
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
      // Revisions are append-only and can arrive out of order (relay replay, a
      // refetch, or a late delivery). Drive the submission from the latest
      // revision by authored time, then version, so the learner always sees the
      // *last* score the teacher set, never whichever record arrived last. A
      // version counter can reset across a teacher's devices, so it is not used
      // to reject an update; `latest` already includes any existing head.
      const related = assessmentRevisions.filter((entry) => entry.submissionId === record.submissionId);
      const latest = related.reduce(
        (best, entry) => (compareRevisions(entry, best) > 0 ? entry : best),
        related[0] ?? record,
      );
      const latestVersion = Number(latest.version) || 0;
      const list = state.submissions ?? [];
      const index = list.findIndex((submission) => submission.id === record.submissionId);

      // A grade can arrive on a device that never had the submission (a fresh
      // browser, or a late refetch). Materialize a submission so the score is
      // still visible instead of being dropped.
      if (index === -1) {
        const classroomId =
          (state.homework ?? []).find((item) => item.id === (latest.homeworkId ?? record.homeworkId))
            ?.classroomId ?? null;
        const revision = latest.status === 'revision';
        return {
          assessmentRevisions,
          submissions: [
            {
              id: record.submissionId,
              homeworkId: latest.homeworkId ?? record.homeworkId ?? null,
              classroomId,
              studentId: latest.studentId ?? record.studentId ?? null,
              text: '',
              link: null,
              files: [],
              version: latestVersion || 1,
              status: revision ? 'revision' : 'graded',
              score: revision ? null : latest.score ?? null,
              scores: revision ? null : latest.scores ?? null,
              maxScore: latest.maxScore ?? null,
              feedback: latest.feedback ?? '',
              late: false,
              submittedAt: null,
              gradedAt: latest.gradedAt ?? null,
              gradedBy: latest.gradedBy ?? null,
              assessmentVersion: latestVersion,
            },
            ...list,
          ],
        };
      }

      const submissions = list.map((submission) => {
        if (submission.id !== record.submissionId) return submission;
        if (latest.status === 'revision') {
          return {
            ...submission,
            status: 'revision',
            score: null,
            scores: null,
            feedback: latest.feedback ?? submission.feedback,
            gradedAt: null,
            gradedBy: null,
            assessmentVersion: latestVersion,
          };
        }
        if (latest.status === 'finalized') {
          return {
            ...submission,
            score: latest.score,
            scores: latest.scores ?? submission.scores,
            maxScore: latest.maxScore ?? submission.maxScore,
            feedback: latest.feedback ?? submission.feedback,
            status: 'graded',
            gradedAt: latest.gradedAt ?? submission.gradedAt,
            gradedBy: latest.gradedBy ?? submission.gradedBy,
            assessmentVersion: latestVersion,
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
      const status = record.status ?? MEMBERSHIP.ACTIVE;
      const previous = state.memberships?.[record.memberId] ?? MEMBERSHIP.NONE;
      const matchesAcademy = (entry) =>
        !(record.academyId && entry.academyId) || entry.academyId === record.academyId;
      const pendingMatch = (state.joinRequests ?? []).some(
        (entry) =>
          entry.accountId === record.memberId &&
          entry.status === REQUEST_STATUS.PENDING &&
          matchesAcademy(entry),
      );
      const academyMemberships = record.academyId
        ? [
            ...(state.academyMemberships ?? []).filter(
              (entry) => !(entry.accountId === record.memberId && entry.academyId === record.academyId),
            ),
            {
              academyId: record.academyId,
              accountId: record.memberId,
              role: record.role ?? 'student',
              status,
            },
          ]
        : state.academyMemberships ?? [];
      // The owner's decision arrives as a private member record. Resolve the
      // matching pending request on the same event that grants membership, so
      // the learner stops seeing "waiting for approval".
      const joinRequests = (state.joinRequests ?? []).map((entry) => {
        if (entry.accountId !== record.memberId || entry.status !== REQUEST_STATUS.PENDING) return entry;
        if (!matchesAcademy(entry)) return entry;
        return {
          ...entry,
          status: status === MEMBERSHIP.ACTIVE ? REQUEST_STATUS.APPROVED : REQUEST_STATUS.DECLINED,
        };
      });
      const events = state.events ?? [];
      const eventId = `member-${record.academyId ?? record.memberId}-${status}`;
      const notify = (previous !== status || pendingMatch) && !events.some((entry) => entry.id === eventId);
      const academy = record.academyId
        ? Object.values(state.academies ?? {}).find((entry) => entry.id === record.academyId)
        : null;
      return {
        memberships: { ...state.memberships, [record.memberId]: status },
        academyMemberships,
        joinRequests,
        events: notify
          ? [
              {
                id: eventId,
                type: 'member',
                author: 'academy',
                time: 'now',
                context: academy?.name ?? '',
                audience: [record.memberId],
                memberStatus: status,
                text: '',
              },
              ...events,
            ]
          : events,
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
    case RECORD_TYPES.PRIVATE_NAME: {
      // Academy-scoped private name, delivered encrypted to an authorized
      // viewer (the person themselves or an assigned teacher). It is never a
      // public record, so it only ever lands in `privateNames`.
      const subjectId = record.subjectId ?? record.id;
      if (!subjectId) return null;
      return { privateNames: { ...(state.privateNames ?? {}), [subjectId]: { ...record, subjectId } } };
    }
    default:
      return null;
  }
}

// Older builds could number a revision request and its follow-up grade with the
// same version, and the submission head was then resolved with an unreliable
// tie-break (a gift-wrapped record's `created_at` is randomized). Recompute each
// head from its revisions on load so persisted state shows the actual last score.
export function reconcileAssessmentHeads(state = {}) {
  const revisions = state.assessmentRevisions ?? [];
  const submissions = state.submissions ?? [];
  if (!revisions.length || !submissions.length) return null;

  let changed = false;
  const next = submissions.map((submission) => {
    const related = revisions.filter((entry) => entry.submissionId === submission.id);
    if (!related.length) return submission;
    const latest = related.reduce(
      (best, entry) => (compareRevisions(entry, best) > 0 ? entry : best),
      related[0],
    );
    const version = Number(latest.version) || 0;
    const revision = latest.status === 'revision';
    const score = revision ? null : latest.score ?? null;
    const scores = revision ? null : latest.scores ?? submission.scores ?? null;
    const feedback = latest.feedback ?? submission.feedback;
    const status = revision ? 'revision' : 'graded';
    const gradedAt = revision ? null : latest.gradedAt ?? submission.gradedAt ?? null;
    const gradedBy = revision ? null : latest.gradedBy ?? submission.gradedBy ?? null;
    const maxScore = latest.maxScore ?? submission.maxScore;
    const same =
      submission.score === score &&
      submission.status === status &&
      submission.assessmentVersion === version &&
      submission.feedback === feedback &&
      submission.gradedAt === gradedAt &&
      submission.gradedBy === gradedBy &&
      JSON.stringify(submission.scores ?? null) === JSON.stringify(scores);
    if (same) return submission;
    changed = true;
    return { ...submission, score, scores, status, feedback, gradedAt, gradedBy, maxScore, assessmentVersion: version };
  });

  return changed ? { submissions: next } : null;
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
