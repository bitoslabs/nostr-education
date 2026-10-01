import { HOMEWORK_STATUS, SUBMISSION_STATUS, submissionIndex } from './classroom.js';

export const DEFAULT_COMPLETION = Object.freeze({ minAverage: 0, requireAllHomework: true });

export function normalizePolicy(policy = {}) {
  const raw = Number(policy?.minAverage ?? DEFAULT_COMPLETION.minAverage);
  const minAverage = Number.isFinite(raw) ? Math.min(100, Math.max(0, Math.round(raw))) : 0;
  return {
    minAverage,
    requireAllHomework: policy?.requireAllHomework !== false,
  };
}

export function evaluateCompletion({ policy, homework = [], submissions = [], lookupSubmission, studentId } = {}) {
  const lookup = lookupSubmission ?? submissionIndex(submissions);
  const normalized = normalizePolicy(policy);
  const published = homework.filter((item) => item.status !== HOMEWORK_STATUS.DRAFT);
  const graded = published
    .map((item) => lookup(item.id, studentId))
    .filter((entry) => entry && entry.status === SUBMISSION_STATUS.GRADED && Number(entry.maxScore) > 0);

  const average = graded.length
    ? Math.round(
        (graded.reduce((sum, entry) => sum + Number(entry.score) / Number(entry.maxScore), 0) /
          graded.length) *
          100,
      )
    : null;

  const missing = published.filter(
    (item) => !graded.some((entry) => entry.homeworkId === item.id),
  );

  const meetsAverage = normalized.minAverage === 0 ? true : average != null && average >= normalized.minAverage;
  const meetsAll = !normalized.requireAllHomework || missing.length === 0;

  return {
    eligible: meetsAverage && meetsAll,
    average,
    gradedCount: graded.length,
    total: published.length,
    missing: missing.length,
    policy: normalized,
  };
}

export function completionBadge(result) {
  if (!result) return null;
  if (result.eligible) return { label: '✓ eligible for completion', tone: 'ok' };
  if (result.gradedCount === 0) return { label: 'no grades yet', tone: 'muted' };
  return { label: `pending · ${result.average ?? 0}% average`, tone: 'warn' };
}
