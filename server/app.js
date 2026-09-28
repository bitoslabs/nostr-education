import { createServer } from 'node:http';
import { ACTION, authorize } from '../src/domain/authorization.js';
import { evaluateCompletion, normalizePolicy } from '../src/domain/completion.js';
import { homeworkForClassroom } from '../src/domain/classroom.js';
import { verifyNip98 } from './auth.js';

const ROUTES = [
  { method: 'POST', pattern: /^\/api\/classrooms\/([^/]+)\/policy$/, scope: 'classroom', action: ACTION.SET_POLICY, run: runPolicy },
  { method: 'POST', pattern: /^\/api\/classrooms\/([^/]+)\/homework$/, scope: 'classroom', action: ACTION.POST_HOMEWORK, run: runHomework },
  { method: 'POST', pattern: /^\/api\/classrooms\/([^/]+)\/recommendations$/, scope: 'classroom', action: ACTION.RECOMMEND_COMPLETION, run: runRecommendation },
  { method: 'POST', pattern: /^\/api\/submissions\/([^/]+)\/grade$/, scope: 'submission', action: ACTION.GRADE, run: runGrade },
  { method: 'POST', pattern: /^\/api\/enrollments\/([^/]+)\/decision$/, scope: 'enrollment', action: ACTION.DECIDE_ENROLLMENT, run: runEnrollment },
  { method: 'POST', pattern: /^\/api\/credentials\/([^/]+)\/revoke$/, scope: 'credential', action: ACTION.REVOKE_CREDENTIAL, run: runRevoke },
];

function send(res, status, body) {
  const payload = JSON.stringify(body ?? {});
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let text = '';
    req.on('data', (chunk) => {
      text += chunk;
      if (text.length > 1_000_000) reject(new Error('payload too large'));
    });
    req.on('end', () => resolve(text));
    req.on('error', reject);
  });
}

function matchRoute(method, pathname) {
  if (method !== 'POST') return null;
  for (const route of ROUTES) {
    const match = route.pattern.exec(pathname);
    if (match) return { ...route, params: { id: decodeURIComponent(match[1]) } };
  }
  return null;
}

function contextFor(store, scope, id) {
  if (scope === 'classroom') {
    const classroom = store.classroomById(id);
    return { resource: classroom, classroom, academy: classroom ? store.academyById(classroom.academyId) : null };
  }
  if (scope === 'submission') {
    const submission = store.submissionById(id);
    const classroom = submission ? store.classroomById(submission.classroomId) : null;
    return { resource: submission, submission, classroom, academy: classroom ? store.academyById(classroom.academyId) : null };
  }
  if (scope === 'enrollment') {
    const enrollment = store.enrollmentById(id);
    const classroom = enrollment ? store.classroomById(enrollment.classroomId) : null;
    return { resource: enrollment, enrollment, classroom, academy: classroom ? store.academyById(classroom.academyId) : null };
  }
  if (scope === 'credential') {
    const credential = store.credentialById(id);
    return { resource: credential, credential, academy: credential ? store.academyById(credential.academyId) : null };
  }
  return { resource: null };
}

function runPolicy({ store, body, context }) {
  const policy = normalizePolicy(body.policy ?? body);
  store.upsert('classrooms', {
    ...context.classroom,
    completion: policy,
    completionVersion: (context.classroom.completionVersion ?? 0) + 1,
    completionUpdatedAt: new Date().toISOString(),
  });
  return { status: 200, body: { policy } };
}

function runHomework({ store, actor, body, context }) {
  if (!body?.id || !body?.title) return { status: 400, body: { error: 'id and title required' } };
  const item = {
    id: body.id,
    academyId: context.classroom.academyId,
    classroomId: context.classroom.id,
    subjectId: context.classroom.subjectId,
    title: String(body.title).trim(),
    instructions: String(body.instructions ?? '').trim(),
    due: String(body.due ?? '').trim() || 'no due date',
    maxScore: Number(body.maxScore ?? 100),
    rubric: Array.isArray(body.rubric) ? body.rubric : [],
    status: 'published',
    createdBy: actor,
  };
  store.upsert('homework', item);
  return { status: 201, body: { homework: item } };
}

function runRecommendation({ store, actor, body, context }) {
  const studentId = body?.studentId;
  if (!studentId) return { status: 400, body: { error: 'studentId required' } };
  const homework = homeworkForClassroom(store.state.homework ?? [], context.classroom.id);
  const result = evaluateCompletion({
    policy: context.classroom.completion,
    homework,
    submissions: store.state.submissions ?? [],
    studentId,
  });
  if (!result.eligible) return { status: 422, body: { error: 'not_eligible', result } };
  const recommendation = {
    id: body.id ?? `rec-${studentId}`,
    academyId: context.classroom.academyId,
    classroomId: context.classroom.id,
    studentId,
    learnerName: body.learnerName ?? 'Learner',
    course: body.course ?? '',
    grade: result.average,
    recommendedBy: actor,
    status: 'recommended',
  };
  store.upsert('recommendations', recommendation);
  return { status: 201, body: { recommendation } };
}

function runGrade({ store, actor, body, context }) {
  const score = Number(body?.score);
  const max = Number(context.submission.maxScore ?? 100);
  if (!Number.isFinite(score) || score < 0 || score > max) {
    return { status: 422, body: { error: 'invalid_score', max } };
  }
  const submission = {
    ...context.submission,
    score,
    feedback: String(body.feedback ?? '').trim(),
    status: 'graded',
    gradedBy: actor,
  };
  store.upsert('submissions', submission);
  return { status: 200, body: { submission } };
}

function runEnrollment({ store, body, context }) {
  const decision = String(body?.decision ?? '');
  if (!['approve', 'decline'].includes(decision)) {
    return { status: 400, body: { error: 'decision must be approve or decline' } };
  }
  const status = decision === 'approve' ? 'approved' : 'declined';
  store.upsert('enrollments', { ...context.enrollment, status });
  if (decision === 'approve' && context.classroom) {
    const studentIds = new Set(context.classroom.studentIds ?? []);
    studentIds.add(context.enrollment.learnerId);
    store.upsert('classrooms', { ...context.classroom, studentIds: [...studentIds] });
    store.state.memberships = { ...store.state.memberships, [context.enrollment.learnerId]: 'active' };
  }
  return { status: 200, body: { status } };
}

function runRevoke({ store, context }) {
  store.upsert('credentials', { ...context.credential, status: 'revoked' });
  return { status: 200, body: { status: 'revoked' } };
}

export function createApiHandler({ store, now } = {}) {
  if (!store) throw new Error('createApiHandler requires a store');

  return async function handler(req, res) {
    try {
      const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
      const route = matchRoute(req.method, url.pathname);
      if (!route) return send(res, 404, { error: 'not_found' });

      const bodyText = await readBody(req);
      const auth = await verifyNip98({
        header: req.headers.authorization,
        url: `${url.origin}${url.pathname}`,
        method: req.method,
        body: bodyText,
        now: now?.(),
      });
      if (!auth.ok) return send(res, 401, { error: 'unauthorized', reason: auth.reason });

      let body = {};
      if (bodyText) {
        try {
          body = JSON.parse(bodyText);
        } catch {
          return send(res, 400, { error: 'bad_json' });
        }
      }

      const context = contextFor(store, route.scope, route.params.id);
      if (!context.resource) return send(res, 404, { error: 'not_found' });
      if (!authorize(route.action, { actor: auth.pubkey, classroom: context.classroom, academy: context.academy })) {
        return send(res, 403, { error: 'forbidden' });
      }

      const result = await route.run({ store, actor: auth.pubkey, body, context });
      return send(res, result.status, result.body);
    } catch (error) {
      return send(res, 500, { error: 'server_error', message: String(error?.message ?? error) });
    }
  };
}

export function createApiServer(options = {}) {
  return createServer(createApiHandler(options));
}
