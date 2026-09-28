export function normalizeRubric(rubric = []) {
  return (Array.isArray(rubric) ? rubric : [])
    .map((criterion, index) => ({
      id: String(criterion?.id ?? `c${index + 1}`),
      label: String(criterion?.label ?? '').trim(),
      max: Number(criterion?.max ?? 0),
    }))
    .filter((criterion) => criterion.label && Number.isFinite(criterion.max) && criterion.max > 0);
}

export function rubricMax(rubric = []) {
  return normalizeRubric(rubric).reduce((sum, criterion) => sum + criterion.max, 0);
}

export function buildScoreSheet(rubric = [], values = []) {
  return normalizeRubric(rubric).map((criterion, index) => ({
    criterionId: criterion.id,
    label: criterion.label,
    max: criterion.max,
    score: Number(values[index]) || 0,
  }));
}

export function scoresTotal(sheet = []) {
  return sheet.reduce((sum, entry) => sum + (Number(entry.score) || 0), 0);
}

export function scoresComplete(sheet = [], rubric = []) {
  const criteria = normalizeRubric(rubric);
  return (
    sheet.length === criteria.length &&
    criteria.every((criterion, index) => {
      const entry = sheet[index];
      return entry && Number(entry.score) >= 0 && Number(entry.score) <= criterion.max;
    })
  );
}

export function rubricPercent(sheet = [], rubric = []) {
  const max = rubricMax(rubric);
  if (!max) return 0;
  return Math.round((scoresTotal(sheet) / max) * 100);
}
