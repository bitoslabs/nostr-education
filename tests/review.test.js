import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatScore,
  isRubricComplete,
  queueCounts,
  rubricPercent,
  rubricTotal,
} from '../src/domain/review.js';

test('rubric math totals and percent', () => {
  assert.equal(rubricTotal([4, 3, 3]), 10);
  assert.equal(rubricPercent([4, 3, 3]), 83);
  assert.equal(rubricPercent([4, 4, 4]), 100);
});

test('isRubricComplete requires every criterion scored above zero', () => {
  assert.equal(isRubricComplete([4, 3, 3]), true);
  assert.equal(isRubricComplete([4, 3, 0]), false);
  assert.equal(isRubricComplete([4, 3]), false);
});

test('formatScore shows a placeholder until complete', () => {
  assert.equal(formatScore([4, 3, 3]), '10/12 · 83%');
  assert.equal(formatScore([0, 0, 0]), '–');
});

test('queueCounts groups by status', () => {
  const counts = queueCounts([
    { status: 'review' },
    { status: 'review' },
    { status: 'draft' },
    { status: 'final' },
  ]);
  assert.deepEqual(counts, { review: 2, draft: 1, final: 1 });
});
