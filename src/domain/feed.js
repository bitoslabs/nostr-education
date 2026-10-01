import {
  HOMEWORK_STATUS,
  SUBMISSION_STATUS,
  classroomsForAcademy,
  classroomsForStudent,
  classroomsForTeacher,
  homeworkForClassroom,
  isLate,
  submissionIndex,
} from './classroom.js';
import { REQUEST_STATUS, ROLE } from './school.js';

export const FEED_TABS = Object.freeze([
  { id: 'foryou', label: 'For you' },
  { id: 'following', label: 'Following' },
  { id: 'latest', label: 'Latest' },
]);

export function isVisible(event, personaId) {
  if (event.audience === 'all') return true;
  return Array.isArray(event.audience) && event.audience.includes(personaId);
}

export function isActionNeededFor(event, personaId) {
  return Boolean(event.actionNeeded) && event.audience !== 'all' && isVisible(event, personaId);
}

// Display labels like 'now' or '3d' carry no absolute time. Resolve them
// relative to `now` so legacy cards still sort deterministically; cards created
// since the home-feed spec carry a real `occurredAt` ISO timestamp.
const LABEL_UNIT_MS = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };

export function eventOccurredAt(event, now = Date.now()) {
  const parsed = Date.parse(event?.occurredAt ?? '');
  if (Number.isFinite(parsed)) return parsed;
  const label = String(event?.time ?? '').trim().toLowerCase();
  if (label === 'now') return now;
  const match = label.match(/^(\d+)\s*([smhdw])$/);
  if (match) return now - Number(match[1]) * LABEL_UNIT_MS[match[2]];
  return null;
}

// Stable tie-breaker from docs/architecture/home-feed.md: `(occurred_at DESC,
// id DESC)` on every tab, so equal timestamps never shuffle across pages. Cards
// without any resolvable time sort last.
export function compareEvents(left, right, now = Date.now()) {
  const leftAt = eventOccurredAt(left, now);
  const rightAt = eventOccurredAt(right, now);
  if (leftAt == null && rightAt == null) return String(right.id).localeCompare(String(left.id));
  if (leftAt == null) return 1;
  if (rightAt == null) return -1;
  if (leftAt !== rightAt) return rightAt - leftAt;
  return String(right.id).localeCompare(String(left.id));
}

export function eventKeyOf(event) {
  return event?.eventKey ?? event?.id ?? null;
}

// One card per source event: a repeated projection collapses to its first
// occurrence in sort order.
export function dedupeEvents(events) {
  const seen = new Set();
  const unique = [];
  for (const event of events) {
    const key = eventKeyOf(event);
    if (key != null && seen.has(key)) continue;
    if (key != null) seen.add(key);
    unique.push(event);
  }
  return unique;
}

export function filterFeed(events, { personaId, tab = 'foryou', following = [], dismissed = [], context = null } = {}) {
  // Capture one `now` so label-derived times stay stable across a single sort.
  const now = Date.now();
  const hidden = new Set(dismissed);
  let list = events.filter((event) => isVisible(event, personaId));

  if (tab === 'following') {
    list = list.filter(
      (event) => event.author === personaId || following.includes(event.author),
    );
  }

  if (hidden.size) {
    // A dismissal hides an informational card only; required tasks stay until
    // their source record says they are done.
    list = list.filter((event) => isActionNeededFor(event, personaId) || !hidden.has(eventKeyOf(event)));
  }

  if (tab === 'foryou') {
    if (context) return rankForYou(list, personaId, context, now);
    const priority = (event) => (isActionNeededFor(event, personaId) ? 0 : 1);
    list = [...list].sort((left, right) => priority(left) - priority(right) || compareEvents(left, right, now));
  } else {
    list = [...list].sort((left, right) => compareEvents(left, right, now));
  }

  return dedupeEvents(list);
}

// Ranking version logged with every reason code for debugging; bump when the
// deterministic rules change (docs/architecture/home-feed.md).
export const RANKING_VERSION = 1;
const RECENT_WINDOW_MS = 7 * 86_400_000;
const MAX_PER_ACTOR = 2;
const MAX_PER_CLASS = 3;

// The only inputs ranking may use: viewer scope derived from current state.
// Grades, student identities, demographic traits, and message text are
// deliberately absent from this context.
export function feedContext(state, persona) {
  const personaId = persona?.id;
  const context = {
    personaId,
    following: [],
    enrolledClassroomIds: new Set(),
    taughtClassroomIds: new Set(),
    academyIds: new Set(),
    homeworkClassroomIds: new Map(),
    classroomAcademyIds: new Map(),
    readKeys: new Set(),
    mutedActors: new Set(),
  };
  if (!personaId) return context;

  context.following = state.following?.[personaId] ?? [];
  const rooms = state.classrooms ?? [];
  for (const room of rooms) {
    context.classroomAcademyIds.set(room.id, room.academyId ?? null);
  }
  for (const item of state.homework ?? []) {
    context.homeworkClassroomIds.set(item.id, item.classroomId ?? null);
  }
  for (const room of classroomsForStudent(rooms, personaId, state.capabilities ?? [])) {
    context.enrolledClassroomIds.add(room.id);
    if (room.academyId) context.academyIds.add(room.academyId);
  }
  if (persona.role !== ROLE.STUDENT) {
    for (const room of authorityClassrooms(state, persona)) {
      context.taughtClassroomIds.add(room.id);
      if (room.academyId) context.academyIds.add(room.academyId);
    }
  }
  const owned = state.academies?.[personaId];
  if (owned) context.academyIds.add(owned.id);

  const mine = state.feedStates?.[personaId] ?? {};
  context.readKeys = new Set(
    Object.entries(mine)
      .filter(([, value]) => value?.readAt)
      .map(([key]) => key),
  );
  context.mutedActors = new Set(state.feedMutes?.[personaId] ?? []);
  return context;
}

// Resolve the classroom a card projects, if any: direct id, homework, or a
// course (enrollment events use the classroom id as `courseId`).
function eventClassroomId(event, context) {
  return (
    event.classroomId ??
    (event.homeworkId ? context.homeworkClassroomIds.get(event.homeworkId) : null) ??
    event.courseId ??
    null
  );
}

// Deterministic first-pass score from the spec: enrolled or taught class +40,
// followed actor +20, same academy +10, recent +0..20 with a seven-day decay,
// already read -15. Muted sources are excluded earlier, never down-ranked.
export function forYouRank(event, context, now = Date.now()) {
  const reasons = [];
  let score = 0;

  const classroomId = eventClassroomId(event, context);
  if (classroomId && (context.enrolledClassroomIds.has(classroomId) || context.taughtClassroomIds.has(classroomId))) {
    score += 40;
    reasons.push('your-class');
  }
  if (event.author === context.personaId || context.following.includes(event.author)) {
    score += 20;
    reasons.push('followed');
  }
  const academyId = (classroomId ? context.classroomAcademyIds.get(classroomId) : null) ?? event.academyId ?? null;
  if (academyId && context.academyIds.has(academyId)) {
    score += 10;
    reasons.push('your-academy');
  }
  const at = eventOccurredAt(event, now);
  if (at != null) {
    const age = now - at;
    if (age >= 0 && age < RECENT_WINDOW_MS) {
      const recency = Math.round(20 * (1 - age / RECENT_WINDOW_MS));
      score += recency;
      if (recency > 0) reasons.push('recent');
    }
  }
  const key = eventKeyOf(event);
  if (key != null && context.readKeys.has(key)) {
    score -= 15;
    reasons.push('read');
  }
  return { score, reasons, version: RANKING_VERSION };
}

// Mutes affect presentation on this tab only: a muted actor's cards drop out
// of For you but stay in Latest/Following, and required tasks are never muted.
function rankForYou(list, personaId, context, now) {
  const ranked = list
    .filter((event) => isActionNeededFor(event, personaId) || !context.mutedActors.has(event.author))
    .map((event) => ({ event, rank: forYouRank(event, context, now) }));

  ranked.sort(
    (left, right) =>
      Number(isActionNeededFor(right.event, personaId)) - Number(isActionNeededFor(left.event, personaId)) ||
      right.rank.score - left.rank.score ||
      compareEvents(left.event, right.event, now),
  );

  // Cap repeated cards from one actor or class within a page and backfill the
  // tail with the overflow, keeping its sorted order. Required tasks bypass
  // the cap so a queue can never be pushed off the page.
  const perActor = new Map();
  const perClass = new Map();
  const kept = [];
  const tail = [];
  for (const entry of ranked) {
    if (isActionNeededFor(entry.event, personaId)) {
      kept.push(entry);
      continue;
    }
    const actor = entry.event.author;
    const classroomId = eventClassroomId(entry.event, context);
    const actorCount = perActor.get(actor) ?? 0;
    const classCount = classroomId ? perClass.get(classroomId) ?? 0 : 0;
    if (actorCount >= MAX_PER_ACTOR || classCount >= MAX_PER_CLASS) {
      tail.push(entry);
      continue;
    }
    perActor.set(actor, actorCount + 1);
    if (classroomId) perClass.set(classroomId, classCount + 1);
    kept.push(entry);
  }

  return dedupeEvents([...kept, ...tail].map(({ event, rank }) => ({ ...event, ranking: rank })));
}

// Next actions are computed live from domain state, never stored as feed rows:
// a card leaves the section only when the underlying workflow is complete or
// no longer authorized (docs/architecture/home-feed.md).
export function nextActions(state, persona, now = Date.now()) {
  const personaId = persona?.id;
  if (!personaId) return [];
  if (persona.role === ROLE.STUDENT) return studentActions(state, personaId, now);
  const actions = [...reviewActions(state, persona)];
  if (persona.role === ROLE.OWNER) actions.push(...ownerActions(state, personaId));
  return actions;
}

function studentActions(state, studentId, now) {
  const lookup = submissionIndex(state.submissions ?? []);
  const actions = [];
  for (const room of classroomsForStudent(state.classrooms ?? [], studentId, state.capabilities ?? [])) {
    for (const item of homeworkForClassroom(state.homework ?? [], room.id)) {
      if (item.status !== HOMEWORK_STATUS.PUBLISHED) continue;
      const submission = lookup(item.id, studentId);
      if (submission && submission.status !== SUBMISSION_STATUS.REVISION) continue;
      actions.push({
        id: submission ? `revise-${submission.id}` : `submit-${item.id}`,
        kind: submission ? 'assignment.revise' : 'assignment.due',
        classroomId: room.id,
        homeworkId: item.id,
        title: item.title,
        context: room.name,
        dueAt: item.dueAt ?? null,
        overdue: isLate(item, now),
        open: { type: 'homework', homeworkId: item.id },
      });
    }
  }
  // Overdue first, then soonest due; undated work keeps a stable id order.
  return actions.sort(
    (left, right) =>
      Number(right.overdue ?? false) - Number(left.overdue ?? false) ||
      (left.dueAt ? Date.parse(left.dueAt) : Infinity) -
        (right.dueAt ? Date.parse(right.dueAt) : Infinity) ||
      String(left.id).localeCompare(String(right.id)),
  );
}

// The review scope mirrors the Teaching screen: an owner grades across their
// academy; anyone else grades classes they teach or hold a teacher grant for.
function authorityClassrooms(state, persona) {
  const owned = state.academies?.[persona.id];
  if (persona.role === ROLE.OWNER && owned) {
    return classroomsForAcademy(state.classrooms ?? [], owned.id);
  }
  return classroomsForTeacher(state.classrooms ?? [], persona.id, state.capabilities ?? []);
}

function reviewActions(state, persona) {
  const rooms = authorityClassrooms(state, persona);
  const byHomework = new Map((state.homework ?? []).map((item) => [item.id, item]));
  const byClassroom = new Map(rooms.map((room) => [room.id, room]));
  const actions = [];
  for (const submission of state.submissions ?? []) {
    if (submission.status !== SUBMISSION_STATUS.SUBMITTED) continue;
    const item = byHomework.get(submission.homeworkId);
    const room = byClassroom.get(submission.classroomId);
    if (!item || !room) continue;
    actions.push({
      id: `review-${submission.id}`,
      kind: 'submission.review',
      classroomId: room.id,
      homeworkId: item.id,
      title: item.title,
      context: room.name,
      studentId: submission.studentId,
      requestedAt: submission.submittedEventAt ?? submission.submittedAt ?? null,
      open: { type: 'submission', submissionId: submission.id },
    });
  }
  // Oldest submission first so nothing lingers at the back of the queue.
  return actions.sort(
    (left, right) =>
      String(left.requestedAt ?? '').localeCompare(String(right.requestedAt ?? '')) ||
      String(left.id).localeCompare(String(right.id)),
  );
}

function ownerActions(state, ownerId) {
  const academies = Object.values(state.academies ?? {});
  const actions = [];
  for (const request of state.joinRequests ?? []) {
    if (request.status !== REQUEST_STATUS.PENDING) continue;
    const academy = request.academyId
      ? academies.find((entry) => entry.id === request.academyId)
      : academies.find((entry) => entry.name === request.academy);
    if (!academy || academy.ownerId !== ownerId) continue;
    actions.push({
      id: `join-${request.id}`,
      kind: 'member.request',
      requestId: request.id,
      actorName: request.displayName,
      context: academy.name,
      open: { type: 'join', requestId: request.id },
    });
  }
  for (const request of state.enrollRequests ?? []) {
    if (request.status !== REQUEST_STATUS.PENDING) continue;
    const classroom = (state.classrooms ?? []).find((room) => room.id === request.courseId);
    const academy = classroom
      ? academies.find((entry) => entry.id === classroom.academyId)
      : null;
    const decider = classroom?.teacherId === ownerId || academy?.ownerId === ownerId;
    if (!decider) continue;
    actions.push({
      id: `enroll-${request.id}`,
      kind: 'enrollment.request',
      requestId: request.id,
      actorName: request.learnerName,
      title: request.courseTitle,
      context: classroom?.name ?? request.courseTitle,
      open: { type: 'enroll', requestId: request.id },
    });
  }
  return actions;
}
