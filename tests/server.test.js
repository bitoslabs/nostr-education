import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';

import { createApiServer } from '../server/app.js';
import { sha256Hex } from '../server/auth.js';
import { createStore } from '../server/store.js';

const ownerKey = generateSecretKey();
const teacherKey = generateSecretKey();
const learnerKey = generateSecretKey();
const owner = getPublicKey(ownerKey);
const teacher = getPublicKey(teacherKey);
const learner = getPublicKey(learnerKey);

function seedStore() {
  return createStore({
    academies: [{ id: 'org1', ownerId: owner, name: 'Northgate' }],
    classrooms: [{ id: 'cls1', academyId: 'org1', teacherId: teacher, subjectId: 'sub1' }],
    homework: [{ id: 'hw1', classroomId: 'cls1', status: 'published', maxScore: 100 }],
    submissions: [{ id: 'sub1', classroomId: 'cls1', homeworkId: 'hw1', studentId: learner, maxScore: 100 }],
    enrollments: [{ id: 'enr1', classroomId: 'cls1', learnerId: learner, status: 'pending' }],
    credentials: [{ id: 'cred1', academyId: 'org1', status: 'active' }],
  });
}

async function withServer(run) {
  const server = createApiServer({ store: seedStore() });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  try {
    await run(base);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

async function authHeader(secretKey, { method, url, body }) {
  const tags = [
    ['u', url],
    ['method', method],
  ];
  if (body) tags.push(['payload', await sha256Hex(body)]);
  const event = finalizeEvent(
    { kind: 27235, created_at: Math.floor(Date.now() / 1000), tags, content: '' },
    secretKey,
  );
  return `Nostr ${Buffer.from(JSON.stringify(event)).toString('base64')}`;
}

async function call(base, path, { key, method = 'POST', body } = {}) {
  const text = body ? JSON.stringify(body) : '';
  const url = `${base}${path}`;
  const headers = { 'content-type': 'application/json' };
  if (key) headers.authorization = await authHeader(key, { method, url, body: text });
  const response = await fetch(url, { method, headers, body: text || undefined });
  return { status: response.status, json: await response.json() };
}

test('private API rejects requests without NIP-98 auth', async () => {
  await withServer(async (base) => {
    const result = await call(base, '/api/classrooms/cls1/policy', {
      body: { minAverage: 60 },
    });
    assert.equal(result.status, 401);
    assert.equal(result.json.error, 'unauthorized');
  });
});

test('owner can set policy but the class teacher cannot', async () => {
  await withServer(async (base) => {
    const asOwner = await call(base, '/api/classrooms/cls1/policy', {
      key: ownerKey,
      body: { minAverage: 80, requireAllHomework: true },
    });
    assert.equal(asOwner.status, 200);
    assert.equal(asOwner.json.policy.minAverage, 80);

    const asTeacher = await call(base, '/api/classrooms/cls1/policy', {
      key: teacherKey,
      body: { minAverage: 10 },
    });
    assert.equal(asTeacher.status, 403);
  });
});

test('teacher can post homework, learner cannot', async () => {
  await withServer(async (base) => {
    const posted = await call(base, '/api/classrooms/cls1/homework', {
      key: teacherKey,
      body: { id: 'hw2', title: 'Vectors' },
    });
    assert.equal(posted.status, 201);
    assert.equal(posted.json.homework.title, 'Vectors');

    const denied = await call(base, '/api/classrooms/cls1/homework', {
      key: learnerKey,
      body: { id: 'hw3', title: 'Nope' },
    });
    assert.equal(denied.status, 403);
  });
});

test('grading requires the teacher or owner and validates the score', async () => {
  await withServer(async (base) => {
    const bad = await call(base, '/api/submissions/sub1/grade', {
      key: teacherKey,
      body: { score: 200 },
    });
    assert.equal(bad.status, 422);

    const denied = await call(base, '/api/submissions/sub1/grade', {
      key: learnerKey,
      body: { score: 90 },
    });
    assert.equal(denied.status, 403);

    const graded = await call(base, '/api/submissions/sub1/grade', {
      key: teacherKey,
      body: { score: 90, feedback: 'Good' },
    });
    assert.equal(graded.status, 200);
    assert.equal(graded.json.submission.status, 'graded');
  });
});

test('recommendation enforces completion eligibility server-side', async () => {
  await withServer(async (base) => {
    const strict = await call(base, '/api/classrooms/cls1/recommendations', {
      key: teacherKey,
      body: { id: 'rec1', studentId: learner },
    });
    assert.equal(strict.status, 422);

    await call(base, '/api/classrooms/cls1/policy', {
      key: ownerKey,
      body: { minAverage: 0, requireAllHomework: false },
    });
    const ok = await call(base, '/api/classrooms/cls1/recommendations', {
      key: teacherKey,
      body: { id: 'rec1', studentId: learner, learnerName: 'Alice' },
    });
    assert.equal(ok.status, 201);
    assert.equal(ok.json.recommendation.status, 'recommended');
  });
});

test('enrollment decision enrolls the learner and is owner/teacher only', async () => {
  await withServer(async (base) => {
    const denied = await call(base, '/api/enrollments/enr1/decision', {
      key: learnerKey,
      body: { decision: 'approve' },
    });
    assert.equal(denied.status, 403);

    const approved = await call(base, '/api/enrollments/enr1/decision', {
      key: ownerKey,
      body: { decision: 'approve' },
    });
    assert.equal(approved.status, 200);
    assert.equal(approved.json.status, 'approved');
  });
});

test('credential revocation is owner-only', async () => {
  await withServer(async (base) => {
    const denied = await call(base, '/api/credentials/cred1/revoke', { key: teacherKey });
    assert.equal(denied.status, 403);

    const revoked = await call(base, '/api/credentials/cred1/revoke', { key: ownerKey });
    assert.equal(revoked.status, 200);
    assert.equal(revoked.json.status, 'revoked');
  });
});

test('only an enrolled learner can submit and resubmit; versions are kept', async () => {
  await withServer(async (base) => {
    const denied = await call(base, '/api/homework/hw1/submissions', {
      key: learnerKey,
      body: { text: 'not enrolled yet' },
    });
    assert.equal(denied.status, 403);

    await call(base, '/api/enrollments/enr1/decision', {
      key: ownerKey,
      body: { decision: 'approve' },
    });

    const submitted = await call(base, '/api/homework/hw1/submissions', {
      key: learnerKey,
      body: { id: 'subX', text: 'first answer' },
    });
    assert.equal(submitted.status, 201);
    assert.equal(submitted.json.submission.version, 1);

    const resubmit = await call(base, '/api/submissions/subX/versions', {
      key: learnerKey,
      body: { text: 'second answer' },
    });
    assert.equal(resubmit.status, 201);
    assert.equal(resubmit.json.version, 2);

    const teacherDenied = await call(base, '/api/submissions/subX/versions', {
      key: teacherKey,
      body: { text: 'tampering' },
    });
    assert.equal(teacherDenied.status, 403);
  });
});

test('finalize and correction append assessment revisions', async () => {
  await withServer(async (base) => {
    const denied = await call(base, '/api/submissions/sub1/assessments', {
      key: learnerKey,
      body: { score: 90 },
    });
    assert.equal(denied.status, 403);

    const finalized = await call(base, '/api/submissions/sub1/assessments', {
      key: teacherKey,
      body: { score: 90, feedback: 'Good' },
    });
    assert.equal(finalized.status, 201);
    assert.equal(finalized.json.revision.status, 'finalized');
    assert.equal(finalized.json.revision.score, 90);

    const missingReason = await call(
      base,
      `/api/assessments/${finalized.json.revision.id}/corrections`,
      { key: teacherKey, body: { score: 95 } },
    );
    assert.equal(missingReason.status, 400);

    const corrected = await call(
      base,
      `/api/assessments/${finalized.json.revision.id}/corrections`,
      { key: teacherKey, body: { score: 95, reason: 'Missed a point' } },
    );
    assert.equal(corrected.status, 201);
    assert.equal(corrected.json.revision.replaces, finalized.json.revision.id);
    assert.equal(corrected.json.revision.score, 95);
  });
});

test('a tampered payload hash is rejected', async () => {
  await withServer(async (base) => {
    const path = '/api/classrooms/cls1/policy';
    const url = `${base}${path}`;
    const signedBody = JSON.stringify({ minAverage: 80 });
    const auth = await authHeader(ownerKey, { method: 'POST', url, body: signedBody });
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: auth },
      body: JSON.stringify({ minAverage: 5 }),
    });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).reason, 'payload');
  });
});
