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

export function classroomsForTeacher(classrooms = [], teacherId) {
  return classrooms.filter((classroom) => classroom.teacherId === teacherId);
}

export function classroomsForStudent(classrooms = [], studentId) {
  return classrooms.filter(
    (classroom) =>
      classroom.status === CLASS_STATUS.PUBLISHED && (classroom.studentIds ?? []).includes(studentId),
  );
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

export function homeworkForStudent(homework = [], classrooms = [], studentId) {
  const enrolled = new Set(classroomsForStudent(classrooms, studentId).map((room) => room.id));
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
  if (status === CLASS_STATUS.DRAFT) return { label: 'draft — hidden from students', tone: 'info' };
  if (status === CLASS_STATUS.PUBLISHED) return { label: 'published ✓', tone: 'ok' };
  if (status === CLASS_STATUS.ARCHIVED) return { label: 'archived', tone: 'muted' };
  return null;
}

export function homeworkStatusBadge(status) {
  if (status === HOMEWORK_STATUS.DRAFT) return { label: 'draft', tone: 'info' };
  if (status === HOMEWORK_STATUS.PUBLISHED) return { label: 'published ✓', tone: 'ok' };
  if (status === HOMEWORK_STATUS.CLOSED) return { label: 'closed — no new submissions', tone: 'muted' };
  return null;
}

export function submissionStatusBadge(submission) {
  if (!submission) return { label: 'not submitted', tone: 'warn' };
  if (submission.status === SUBMISSION_STATUS.GRADED) {
    return { label: `✓ scored ${submission.score}/${submission.maxScore}`, tone: 'ok' };
  }
  if (submission.status === SUBMISSION_STATUS.REVISION) {
    return { label: '▲ revision requested', tone: 'warn' };
  }
  return { label: 'submitted · awaiting score', tone: 'info' };
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
