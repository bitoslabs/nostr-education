import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildScoreSheet,
  normalizeRubric,
  rubricMax,
  rubricPercent,
  scoresComplete,
  scoresTotal,
} from '../src/domain/rubric.js';

test('normalizeRubric trims labels, defaults ids, and drops invalid criteria', () => {
  const rubric = normalizeRubric([
    { label: ' Correctness ', max: '4' },
    { label: '', max: 4 },
    { label: 'Depth', max: 0 },
    { id: 'custom', label: 'Clarity', max: 2 },
  ]);
  assert.deepEqual(rubric.map((criterion) => criterion.label), ['Correctness', 'Clarity']);
  assert.equal(rubric[0].id, 'c1');
  assert.equal(rubric[1].id, 'custom');
  assert.equal(rubricMax(rubric), 6);
});

test('buildScoreSheet and scoresTotal compute a rubric percentage', () => {
  const rubric = normalizeRubric([
    { label: 'A', max: 4 },
    { label: 'B', max: 6 },
  ]);
  const sheet = buildScoreSheet(rubric, ['3', '6']);
  assert.equal(scoresTotal(sheet), 9);
  assert.equal(rubricPercent(sheet, rubric), 90);
  assert.equal(scoresComplete(sheet, rubric), true);
  assert.equal(scoresComplete(buildScoreSheet(rubric, ['3', '7']), rubric), false);
  assert.equal(rubricPercent([], []), 0);
});
