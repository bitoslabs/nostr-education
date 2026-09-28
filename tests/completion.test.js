import assert from 'node:assert/strict';
import test from 'node:test';

import { completionBadge, evaluateCompletion, normalizePolicy } from '../src/domain/completion.js';

const homework = [
  { id: 'h1', status: 'published' },
  { id: 'h2', status: 'published' },
];

test('normalizePolicy clamps the average and defaults requireAllHomework', () => {
  assert.deepEqual(normalizePolicy({ minAverage: 150 }), { minAverage: 100, requireAllHomework: true });
  assert.deepEqual(normalizePolicy({ minAverage: -5, requireAllHomework: false }), {
    minAverage: 0,
    requireAllHomework: false,
  });
  assert.deepEqual(normalizePolicy(), { minAverage: 0, requireAllHomework: true });
});

test('evaluateCompletion checks the minimum average and graded coverage', () => {
  const submissions = [
    { id: 's1', homeworkId: 'h1', studentId: 'a', status: 'graded', score: 80, maxScore: 100 },
    { id: 's2', homeworkId: 'h2', studentId: 'a', status: 'graded', score: 90, maxScore: 100 },
  ];
  const all = evaluateCompletion({
    policy: { minAverage: 70, requireAllHomework: true },
    homework,
    submissions,
    studentId: 'a',
  });
  assert.equal(all.eligible, true);
  assert.equal(all.average, 85);
  assert.equal(all.missing, 0);

  const partial = evaluateCompletion({
    policy: { minAverage: 70, requireAllHomework: true },
    homework,
    submissions: [submissions[0]],
    studentId: 'a',
  });
  assert.equal(partial.eligible, false);
  assert.equal(partial.missing, 1);

  const low = evaluateCompletion({
    policy: { minAverage: 95, requireAllHomework: false },
    homework,
    submissions,
    studentId: 'a',
  });
  assert.equal(low.eligible, false);

  const none = evaluateCompletion({
    policy: { minAverage: 0, requireAllHomework: true },
    homework,
    submissions: [],
    studentId: 'a',
  });
  assert.equal(none.eligible, false);
  assert.equal(none.gradedCount, 0);
});

test('completionBadge reflects eligibility', () => {
  assert.equal(completionBadge({ eligible: true }).tone, 'ok');
  assert.equal(completionBadge({ eligible: false, gradedCount: 0 }).tone, 'muted');
  assert.equal(completionBadge({ eligible: false, gradedCount: 1, average: 40 }).tone, 'warn');
  assert.equal(completionBadge(null), null);
});
