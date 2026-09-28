export const RUBRIC_CRITERIA = Object.freeze(['Correctness', 'Depth', 'Clarity']);
export const RUBRIC_MAX_PER_CRITERION = 4;

export const QUEUE_STATUS = Object.freeze({
  REVIEW: 'review',
  DRAFT: 'draft',
  FINAL: 'final',
});

export function rubricTotal(scores = []) {
  return scores.reduce((sum, value) => sum + (Number(value) || 0), 0);
}

export function rubricMax() {
  return RUBRIC_CRITERIA.length * RUBRIC_MAX_PER_CRITERION;
}

export function rubricPercent(scores = []) {
  const max = rubricMax();
  if (!max) return 0;
  return Math.round((rubricTotal(scores) / max) * 100);
}

export function isRubricComplete(scores = []) {
  return (
    scores.length === RUBRIC_CRITERIA.length && scores.every((value) => Number(value) > 0)
  );
}

export function formatScore(scores = []) {
  if (!isRubricComplete(scores)) return '–';
  return `${rubricTotal(scores)}/${rubricMax()} · ${rubricPercent(scores)}%`;
}

export function queueByStatus(queue, status) {
  return queue.filter((item) => item.status === status);
}

export function queueCounts(queue) {
  return {
    review: queueByStatus(queue, QUEUE_STATUS.REVIEW).length,
    draft: queueByStatus(queue, QUEUE_STATUS.DRAFT).length,
    final: queueByStatus(queue, QUEUE_STATUS.FINAL).length,
  };
}
