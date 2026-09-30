import { CAPABILITY, isCapabilityActive } from './capability.js';

export const CLASS_STATUS = Object.freeze({
  DRAFT: 'draft',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
});

export const HOMEWORK_STATUS = Object.freeze({
  DRAFT: 'draft',
  PUBLISHED: 'published',
  CLOSED: 'closed',
});

export const SUBMISSION_STATUS = Object.freeze({
  SUBMITTED: 'submitted',
  GRADED: 'graded',
  REVISION: 'revision',
});

export const LATE_POLICY = Object.freeze({
  ACCEPT: 'accept',
  FLAG: 'flag',
  BLOCK: 'block',
});

export function normalizeLatePolicy(value) {
  const raw = String(value ?? '').toLowerCase();
  if (raw === LATE_POLICY.BLOCK) return LATE_POLICY.BLOCK;
  if (raw === LATE_POLICY.ACCEPT) return LATE_POLICY.ACCEPT;
  return LATE_POLICY.FLAG;
}

export function latePolicyLabel(policy) {
  const normalized = normalizeLatePolicy(policy);
  if (normalized === LATE_POLICY.BLOCK) return 'late work is refused';
  if (normalized === LATE_POLICY.ACCEPT) return 'late work accepted with no mark';
  return 'late work accepted and flagged';
}

// A homework is late when it has a real due time in the past. The server clock is
// authoritative in server mode; the caller passes `at` so tests are deterministic.
export function isLate(homework, at = Date.now()) {
  if (!homework?.dueAt) return false;
  const due = Date.parse(homework.dueAt);
  if (!Number.isFinite(due)) return false;
  return at > due;
}

export function canSubmitLate(classroom, homework, at = Date.now()) {
  return !isLate(homework, at) || normalizeLatePolicy(classroom?.latePolicy) !== LATE_POLICY.BLOCK;
}

export function lateBadge(submission) {
  if (!submission?.late && !submission?.lateFlag) return null;
  return { label: 'late', tone: 'warn' };
}

export function subjectsForAcademy(subjects = [], academyId) {
  return subjects.filter((subject) => subject.academyId === academyId);
}

export function subjectById(subjects = [], id) {
  return subjects.find((subject) => subject.id === id) ?? null;
}

export function classroomById(classrooms = [], id) {
  return classrooms.find((classroom) => classroom.id === id) ?? null;
}

export function classroomsForAcademy(classrooms = [], academyId) {
  return classrooms.filter((classroom) => classroom.academyId === academyId);
}

export function publishedClassrooms(classrooms = []) {
  return classrooms.filter((classroom) => classroom.status === CLASS_STATUS.PUBLISHED);
}

export function isEnrollable(classroom) {
  return Boolean(classroom) && classroom.status === CLASS_STATUS.PUBLISHED && Boolean(classroom.teacherId);
}

export function classroomsForSubject(classrooms = [], subjectId) {
  return classrooms.filter((classroom) => classroom.subjectId === subjectId);
}

// Signed capabilities are a roster source: a learner's classes come from the
// class roster and/or active enrollment grants, so a device that never synced
// `studentIds` still sees the right classes (see docs/architecture/nostr-native.md).
export function classroomIdsForCapability(capabilities = [], accountId, kind) {
  return new Set(
    (capabilities ?? [])
      .filter(
        (capability) =>
          capability &&
          capability.kind === kind &&
          capability.accountId === accountId &&
          capability.classroomId &&
          isCapabilityActive(capability),
      )
      .map((capability) => capability.classroomId),
  );
}

export function classroomsForTeacher(classrooms = [], teacherId, capabilities = []) {
  const assigned = classroomIdsForCapability(capabilities, teacherId, CAPABILITY.TEACHER_ASSIGNMENT);
  return classrooms.filter(
    (classroom) => classroom.teacherId === teacherId || assigned.has(classroom.id),
  );
}

export function classroomsForStudent(classrooms = [], studentId, capabilities = []) {
  const enrolled = classroomIdsForCapability(capabilities, studentId, CAPABILITY.ENROLLMENT);
  return classrooms.filter(
    (classroom) =>
      classroom.status === CLASS_STATUS.PUBLISHED &&
      ((classroom.studentIds ?? []).includes(studentId) || enrolled.has(classroom.id)),
  );
}

// Account ids holding an active enrollment capability for a classroom. This is
// the roster a teacher can address homework to even when it self-enrolled via a
// link and the class `studentIds` never synced to the teacher's device.
export function enrolledAccountIds(capabilities = [], classroomId) {
  return (capabilities ?? [])
    .filter(
      (capability) =>
        capability &&
        capability.kind === CAPABILITY.ENROLLMENT &&
        capability.classroomId === classroomId &&
        capability.accountId &&
        isCapabilityActive(capability),
    )
    .map((capability) => capability.accountId);
}

export function subjectInUse(classrooms = [], subjectId) {
  return classrooms.some((classroom) => classroom.subjectId === subjectId);
}

export function classroomActivity(homework = [], submissions = [], classroomId) {
  const work = homework.filter((item) => item.classroomId === classroomId);
  const homeworkIds = new Set(work.map((item) => item.id));
  const submissionsCount = submissions.filter((submission) => homeworkIds.has(submission.homeworkId)).length;
  return { homework: work.length, submissions: submissionsCount };
}

export function homeworkForClassroom(homework = [], classroomId) {
  return homework.filter((item) => item.classroomId === classroomId);
}

export function homeworkForStudent(homework = [], classrooms = [], studentId, capabilities = []) {
  const enrolled = new Set(
    classroomsForStudent(classrooms, studentId, capabilities).map((room) => room.id),
  );
  return homework
    .filter((item) => enrolled.has(item.classroomId))
    .filter((item) => item.status !== HOMEWORK_STATUS.DRAFT);
}

export function isHomeworkOpen(homework) {
  return homework?.status === HOMEWORK_STATUS.PUBLISHED;
}

export function submissionsForHomework(submissions = [], homeworkId) {
  return submissions.filter((submission) => submission.homeworkId === homeworkId);
}

export function submissionFor(submissions = [], homeworkId, studentId) {
  return (
    [...submissions]
      .reverse()
      .find((submission) => submission.homeworkId === homeworkId && submission.studentId === studentId) ?? null
  );
}

export function versionsFor(submissionVersions = [], submissionId) {
  return submissionVersions
    .filter((entry) => entry.submissionId === submissionId)
    .sort((a, b) => (Number(a.version) || 0) - (Number(b.version) || 0));
}

export function latestVersion(submissionVersions = [], submissionId) {
  const versions = versionsFor(submissionVersions, submissionId);
  return versions.length ? versions[versions.length - 1] : null;
}

export function assessmentRevisionsFor(assessmentRevisions = [], submissionId) {
  return assessmentRevisions
    .filter((entry) => entry.submissionId === submissionId)
    .sort((a, b) => (Number(a.version) || 0) - (Number(b.version) || 0));
}

export function latestAssessmentRevision(assessmentRevisions = [], submissionId) {
  const revisions = assessmentRevisionsFor(assessmentRevisions, submissionId);
  return revisions.length ? revisions[revisions.length - 1] : null;
}

export function isValidScore(value, maxScore = 100) {
  const numeric = Number(value);
  const max = Number(maxScore);
  return Number.isFinite(numeric) && Number.isFinite(max) && numeric >= 0 && numeric <= max;
}

export function scorePercent(submission) {
  if (!submission || submission.score == null || !submission.maxScore) return null;
  return Math.round((submission.score / submission.maxScore) * 100);
}

export function classStatusBadge(status) {
  if (status === CLASS_STATUS.DRAFT) return { key: 'common.badge.classDraft', label: 'draft — hidden from students', tone: 'info' };
  if (status === CLASS_STATUS.PUBLISHED) return { key: 'common.badge.published', label: 'published ✓', tone: 'ok' };
  if (status === CLASS_STATUS.ARCHIVED) return { key: 'common.badge.archived', label: 'archived', tone: 'muted' };
  return null;
}

export function homeworkStatusBadge(status) {
  if (status === HOMEWORK_STATUS.DRAFT) return { key: 'common.badge.draft', label: 'draft', tone: 'info' };
  if (status === HOMEWORK_STATUS.PUBLISHED) return { key: 'common.badge.published', label: 'published ✓', tone: 'ok' };
  if (status === HOMEWORK_STATUS.CLOSED) return { key: 'common.badge.closed', label: 'closed — no new submissions', tone: 'muted' };
  return null;
}

export function submissionStatusBadge(submission) {
  if (!submission) return { key: 'common.badge.notSubmitted', label: 'not submitted', tone: 'warn' };
  if (submission.status === SUBMISSION_STATUS.GRADED) {
    // Older submissions may not carry a max score; still surface the value.
    if (Number(submission.maxScore) > 0) {
      return {
        key: 'common.badge.scored',
        params: { score: submission.score, maxScore: submission.maxScore },
        label: `✓ scored ${submission.score}/${submission.maxScore}`,
        tone: 'ok',
      };
    }
    return {
      key: 'common.badge.scoredNoMax',
      params: { score: submission.score },
      label: `✓ scored ${submission.score}`,
      tone: 'ok',
    };
  }
  if (submission.status === SUBMISSION_STATUS.REVISION) {
    return { key: 'common.badge.revisionRequested', label: '▲ revision requested', tone: 'warn' };
  }
  return { key: 'common.badge.submittedAwaitingScore', label: 'submitted · awaiting score', tone: 'info' };
}

export function gradingProgress(submissions = [], studentIds = []) {
  const graded = submissions.filter((submission) => submission.status === SUBMISSION_STATUS.GRADED).length;
  return { graded, total: studentIds.length };
}

export function reviewQueue(submissions = [], homework = [], classrooms = []) {
  const byClassroom = new Map(classrooms.map((room) => [room.id, room]));
  const byHomework = new Map(homework.map((item) => [item.id, item]));
  return submissions
    .map((submission) => ({
      submission,
      homework: byHomework.get(submission.homeworkId) ?? null,
      classroom: byClassroom.get(submission.classroomId) ?? null,
    }))
    .filter((entry) => entry.homework && entry.classroom);
}

export function reviewCounts(queue = []) {
  const pending = queue.filter((entry) => entry.submission.status === SUBMISSION_STATUS.SUBMITTED).length;
  const graded = queue.filter((entry) => entry.submission.status === SUBMISSION_STATUS.GRADED).length;
  return { pending, graded };
}

export function submissionsForClassroom(submissions = [], classroomId) {
  return submissions.filter((submission) => submission.classroomId === classroomId);
}

export function averagePercent(submissions = []) {
  const graded = submissions.filter(
    (submission) => submission.status === SUBMISSION_STATUS.GRADED && Number(submission.maxScore) > 0,
  );
  if (!graded.length) return null;
  const total = graded.reduce(
    (sum, submission) => sum + Number(submission.score) / Number(submission.maxScore),
    0,
  );
  return Math.round((total / graded.length) * 100);
}
