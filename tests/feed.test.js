import assert from 'node:assert/strict';
import test from 'node:test';

import {
  filterFeed,
  forYouRank,
  feedContext,
  feedEventFromNote,
  threadEventFromNote,
  isActionNeededFor,
  isVisible,
  nextActions,
  RANKING_VERSION,
  eventKeyOf,
  eventOccurredAt,
  oldestNoteCursor,
} from '../src/domain/feed.js';
import { ROLE } from '../src/domain/school.js';

const events = [
  { id: 'a', author: 'bob', audience: ['alice'], actionNeeded: true, time: 'now' },
  { id: 'b', author: 'mia', audience: 'all', time: '1d' },
  { id: 'c', author: 'carol', audience: ['bob'], time: '2d' },
  { id: 'd', author: 'alice', audience: 'all', time: '3d' },
];

test('isVisible respects audience and broadcast', () => {
  assert.equal(isVisible(events[0], 'alice'), true);
  assert.equal(isVisible(events[0], 'bob'), false);
  assert.equal(isVisible(events[1], 'nadia'), true);
});

test('isActionNeededFor is persona-scoped', () => {
  assert.equal(isActionNeededFor(events[0], 'alice'), true);
  assert.equal(isActionNeededFor(events[0], 'bob'), false);
});

test('filterFeed sorts action-needed items first for "for you"', () => {
  const result = filterFeed(events, { personaId: 'alice', tab: 'foryou' });
  assert.deepEqual(
    result.map((event) => event.id),
    ['a', 'b', 'd'],
  );
});

test('filterFeed "following" limits to followed authors and self', () => {
  const result = filterFeed(events, {
    personaId: 'alice',
    tab: 'following',
    following: ['mia'],
  });
  assert.deepEqual(
    result.map((event) => event.id),
    ['b', 'd'],
  );
});

test('eventOccurredAt prefers real timestamps and derives legacy display labels', () => {
  const now = Date.parse('2026-10-01T12:00:00Z');
  assert.equal(eventOccurredAt({ occurredAt: '2026-09-30T08:00:00Z' }, now), Date.parse('2026-09-30T08:00:00Z'));
  assert.equal(eventOccurredAt({ time: 'now' }, now), now);
  assert.equal(eventOccurredAt({ time: '2d' }, now), now - 2 * 86_400_000);
  assert.equal(eventOccurredAt({ time: '5h' }, now), now - 5 * 3_600_000);
  assert.equal(eventOccurredAt({ time: 'yesterday, maybe' }, now), null);
});

test('filterFeed sorts latest by occurred time with a stable id tie-break', () => {
  const stamp = (id, at) => ({ id, author: 'x', audience: 'all', occurredAt: at });
  const shuffled = [
    stamp('c', '2026-10-01T08:00:00Z'),
    stamp('b', '2026-10-01T10:00:00Z'),
    stamp('a', '2026-10-01T10:00:00Z'),
    stamp('d', '2026-09-30T10:00:00Z'),
  ];
  const result = filterFeed(shuffled, { personaId: 'p', tab: 'latest' });
  // Same timestamp: id DESC breaks the tie so pages never shuffle.
  assert.deepEqual(
    result.map((event) => event.id),
    ['b', 'a', 'c', 'd'],
  );
});

test('filterFeed deduplicates repeated projections of one source event', () => {
  const repeated = [
    { id: 'x1', eventKey: 'homework-h1-v2', author: 'x', audience: 'all', time: '1d' },
    { id: 'x2', eventKey: 'homework-h1-v2', author: 'x', audience: 'all', time: '1d' },
    { id: 'y', author: 'x', audience: 'all', time: '2d' },
  ];
  const result = filterFeed(repeated, { personaId: 'p', tab: 'latest' });
  // Equal times tie-break id DESC, so the later projection wins and collapses.
  assert.deepEqual(result.map((event) => event.id), ['x2', 'y']);
  assert.equal(eventKeyOf({ id: 'z' }), 'z');
});

test('dismissal hides informational cards but never action-needed tasks', () => {
  const mixed = [
    { id: 'task', author: 'bob', audience: ['alice'], actionNeeded: true, time: 'now' },
    { id: 'info', author: 'mia', audience: 'all', time: '1d' },
    { id: 'other', author: 'zoe', audience: 'all', time: '2d' },
  ];
  const result = filterFeed(mixed, {
    personaId: 'alice',
    tab: 'foryou',
    dismissed: ['info', 'task'],
  });
  assert.deepEqual(
    result.map((event) => event.id),
    ['task', 'other'],
  );
});

const STUDENT = { id: 'alice', role: ROLE.STUDENT, displayName: 'Alice' };
const TEACHER = { id: 'bob', role: ROLE.TEACHER, displayName: 'Bob' };
const OWNER = { id: 'nadia', role: ROLE.OWNER, displayName: 'Nadia' };

const baseState = {
  classrooms: [
    { id: 'cls1', academyId: 'acad1', teacherId: 'bob', status: 'published', studentIds: ['alice'] },
    { id: 'cls2', academyId: 'acad2', teacherId: 'zoe', status: 'published', studentIds: ['alice'] },
  ],
  homework: [
    { id: 'h1', classroomId: 'cls1', title: 'Essay', status: 'published', dueAt: '2026-09-01T00:00:00Z' },
    { id: 'h2', classroomId: 'cls1', title: 'Quiz', status: 'published', dueAt: '2026-12-01T00:00:00Z' },
    { id: 'h3', classroomId: 'cls1', title: 'Draft', status: 'draft' },
    { id: 'h4', classroomId: 'cls2', title: 'Other class', status: 'published' },
  ],
  submissions: [
    { id: 's1', homeworkId: 'h4', classroomId: 'cls2', studentId: 'alice', status: 'submitted', submittedAt: '2026-09-28T09:00:00Z' },
    { id: 's2', homeworkId: 'h1', classroomId: 'cls1', studentId: 'carol', status: 'submitted', submittedAt: '2026-09-29T09:00:00Z' },
  ],
  academies: { nadia: { id: 'acad1', ownerId: 'nadia', name: 'Alpha Academy' } },
  joinRequests: [
    { id: 'jr1', academyId: 'acad1', accountId: 'eve', displayName: 'Eve', status: 'pending' },
    { id: 'jr2', academyId: 'acad2', accountId: 'fin', displayName: 'Fin', status: 'pending' },
    { id: 'jr3', academyId: 'acad1', accountId: 'gil', displayName: 'Gil', status: 'approved' },
  ],
  enrollRequests: [
    { id: 'er1', learnerId: 'hal', learnerName: 'Hal', courseId: 'cls1', courseTitle: 'Grade 1 Math', academyId: 'acad1', status: 'pending' },
    { id: 'er2', learnerId: 'ida', learnerName: 'Ida', courseId: 'cls2', courseTitle: 'Other', academyId: 'acad2', status: 'pending' },
  ],
  capabilities: [],
};

test('nextActions lists a student due homework and revision requests from enrolled classes', () => {
  const state = {
    ...baseState,
    submissions: [
      ...baseState.submissions,
      { id: 's3', homeworkId: 'h2', classroomId: 'cls1', studentId: 'alice', status: 'revision' },
    ],
  };
  const now = Date.parse('2026-10-01T00:00:00Z');
  const tasks = nextActions(state, STUDENT, now);
  assert.deepEqual(
    tasks.map((task) => task.kind),
    ['assignment.due', 'assignment.revise'],
  );
  // Overdue h1 sorts first; draft homework and other classes are excluded.
  const [due] = tasks;
  assert.equal(due.homeworkId, 'h1');
  assert.equal(due.overdue, true);
  assert.equal(due.open.type, 'homework');
});

test('nextActions omits submitted, graded, and closed student work', () => {
  const state = {
    ...baseState,
    homework: baseState.homework.map((item) =>
      item.id === 'h1' ? { ...item, status: 'closed' } : item,
    ),
    submissions: [
      ...baseState.submissions,
      { id: 's3', homeworkId: 'h2', classroomId: 'cls1', studentId: 'alice', status: 'graded', score: 9, maxScore: 10 },
    ],
  };
  assert.deepEqual(nextActions(state, STUDENT), []);
});

test('nextActions scopes teacher review work to assigned classes', () => {
  const tasks = nextActions(baseState, TEACHER);
  assert.deepEqual(
    tasks.map((task) => task.id),
    ['review-s2'],
  );
  assert.equal(tasks[0].classroomId, 'cls1');
  assert.equal(tasks[0].open.type, 'submission');
});

test('nextActions scopes owner requests to academies and classes they control', () => {
  const tasks = nextActions(baseState, OWNER);
  // s2 is reviewable because the owner grades across their academy; jr1 and
  // er1 belong to acad1/cls1, jr2/er2 do not.
  assert.deepEqual(
    tasks.map((task) => task.id),
    ['review-s2', 'join-jr1', 'enroll-er1'],
  );
});

// ---- For-you ranking (docs/architecture/home-feed.md, Ranking and ordering) ----

const NOW = Date.parse('2026-10-01T12:00:00Z');

function rankContext(overrides = {}) {
  return {
    personaId: 'alice',
    following: [],
    enrolledClassroomIds: new Set(['cls1']),
    taughtClassroomIds: new Set(),
    academyIds: new Set(['acad1']),
    homeworkClassroomIds: new Map([['h1', 'cls1']]),
    classroomAcademyIds: new Map([['cls1', 'acad1'], ['cls9', 'acad9']]),
    readKeys: new Set(),
    mutedActors: new Set(),
    ...overrides,
  };
}

test('forYouRank applies the deterministic score components', () => {
  const event = {
    id: 'e1',
    author: 'bob',
    audience: 'all',
    classroomId: 'cls1',
    occurredAt: new Date(NOW - 86_400_000).toISOString(), // 1 day old
  };
  const { score, reasons, version } = forYouRank(
    event,
    rankContext({ following: ['bob'] }),
    NOW,
  );
  // your class +40, followed +20, same academy +10, recency 20*(6/7)≈17
  assert.equal(version, RANKING_VERSION);
  assert.equal(score, 40 + 20 + 10 + 17);
  assert.deepEqual(reasons, ['your-class', 'followed', 'your-academy', 'recent']);
});

test('forYouRank recency decays to zero across the seven-day window and beyond', () => {
  const rank = (at) =>
    forYouRank({ id: 'e', author: 'x', audience: 'all', occurredAt: at }, rankContext(), NOW).score;
  assert.equal(rank(new Date(NOW).toISOString()), 20);
  assert.equal(rank(new Date(NOW - 3.5 * 86_400_000).toISOString()), 10);
  assert.equal(rank(new Date(NOW - 7 * 86_400_000).toISOString()), 0);
  assert.equal(rank(new Date(NOW - 30 * 86_400_000).toISOString()), 0);
});

test('forYouRank penalizes read cards and counts the viewer as followed', () => {
  const read = forYouRank(
    { id: 'mine', author: 'alice', audience: 'all', time: '2d' },
    rankContext({ readKeys: new Set(['mine']) }),
    NOW,
  );
  // self +20, recency round(20*5/7)=14, read -15
  assert.equal(read.score, 20 + 14 - 15);
  assert.deepEqual(read.reasons, ['followed', 'recent', 'read']);
});

test('feedContext derives viewer scope from state only', () => {
  const state = {
    ...baseState,
    following: { alice: ['mia'] },
    feedStates: { alice: { seen: { readAt: '2026-09-30T00:00:00Z' }, gone: { dismissedAt: '2026-09-30T00:00:00Z' } } },
    feedMutes: { alice: ['zoe'] },
    homework: [...baseState.homework, { id: 'h1x', classroomId: 'cls1' }],
  };
  const context = feedContext(state, STUDENT);
  assert.deepEqual([...context.enrolledClassroomIds], ['cls1', 'cls2']);
  assert.deepEqual([...context.taughtClassroomIds], []);
  assert.ok(context.academyIds.has('acad1') && context.academyIds.has('acad2'));
  assert.equal(context.homeworkClassroomIds.get('h1x'), 'cls1');
  assert.deepEqual([...context.readKeys], ['seen']);
  assert.deepEqual([...context.mutedActors], ['zoe']);
  assert.deepEqual(context.following, ['mia']);
});

test('filterFeed ranks For you by score with a diversity cap and backfill', () => {
  const events = [
    { id: 'p1', author: 'poster', audience: 'all', time: 'now' },
    { id: 'p2', author: 'poster', audience: 'all', time: '1h' },
    { id: 'p3', author: 'poster', audience: 'all', time: '2h' },
    { id: 'class1', author: 'bob', audience: 'all', classroomId: 'cls1', time: '1d' },
    { id: 'class2', author: 'carol', audience: 'all', classroomId: 'cls1', time: '2d' },
    { id: 'class3', author: 'dan', audience: 'all', classroomId: 'cls1', time: '3d' },
    { id: 'class4', author: 'eve', audience: 'all', classroomId: 'cls1', time: '4d' },
  ];
  const result = filterFeed(events, { personaId: 'alice', tab: 'foryou', context: rankContext() });
  const ids = result.map((event) => event.id);
  // Three same-class cards stay; the fourth (class4) is deferred past the
  // uncapped recent posts, and poster's third card backfills the tail.
  assert.deepEqual(ids, ['class1', 'class2', 'class3', 'p1', 'p2', 'class4', 'p3']);
  // Ranked cards carry their reason codes for the why-line.
  assert.deepEqual(result[0].ranking.reasons, ['your-class', 'your-academy', 'recent']);
});

test('mutes drop a muted actor from For you but keep Latest and required tasks', () => {
  const events = [
    { id: 'm1', author: 'poster', audience: 'all', time: '1h' },
    { id: 'm2', author: 'bob', audience: 'all', time: '2d' },
    { id: 'task', author: 'poster', audience: ['alice'], actionNeeded: true, time: 'now' },
  ];
  const context = rankContext({ mutedActors: new Set(['poster']) });
  const forYou = filterFeed(events, { personaId: 'alice', tab: 'foryou', context });
  assert.deepEqual(forYou.map((event) => event.id), ['task', 'm2']);
  const latest = filterFeed(events, { personaId: 'alice', tab: 'latest', context });
  assert.deepEqual(latest.map((event) => event.id), ['task', 'm1', 'm2']);
});

test('oldestNoteCursor returns the oldest source timestamp for paging', () => {
  const notes = [
    { id: 'a', occurredAt: '2026-10-01T10:00:00Z', raw: { created_at: 1_700_000_500 } },
    { id: 'b', occurredAt: '2026-09-01T10:00:00Z', raw: { created_at: 1_690_000_000 } },
    { id: 'c', occurredAt: '2026-09-15T10:00:00Z', raw: { created_at: 1_695_000_000 } },
  ];
  assert.equal(oldestNoteCursor(notes), 1_690_000_000);
  // Falls back to the projected ISO time when the raw event is unavailable,
  // and ignores entries that carry no usable timestamp.
  assert.equal(
    oldestNoteCursor([{ occurredAt: '2026-09-30T00:00:00Z' }, { id: 'x' }]),
    Math.floor(Date.parse('2026-09-30T00:00:00Z') / 1000),
  );
  assert.equal(oldestNoteCursor([]), null);
  assert.equal(oldestNoteCursor(undefined), null);
});

test('feedEventFromNote projects top-level kind:1 notes and skips replies', () => {
  const now = Date.UTC(2026, 0, 2, 0, 0, 0);
  const note = {
    id: 'n1',
    pubkey: 'pk1',
    created_at: Math.floor(now / 1000) - 3600,
    tags: [],
    content: '  Hello relays.  ',
  };
  const mapped = feedEventFromNote(note, now);
  assert.equal(mapped.id, 'n1');
  assert.equal(mapped.type, 'social');
  assert.equal(mapped.author, 'pk1');
  assert.equal(mapped.audience, 'all');
  assert.equal(mapped.text, 'Hello relays.');
  assert.equal(mapped.time, '1h');
  assert.equal(mapped.occurredAt, new Date(note.created_at * 1000).toISOString());
  assert.deepEqual(mapped.counts, { likes: 0, reposts: 0, bitz: 0, replies: 0 });

  // A reply carries an `e` tag and belongs to threads, not the feed.
  assert.equal(feedEventFromNote({ ...note, tags: [['e', 'parent']] }, now), null);
  // Empty content and malformed events are dropped.
  assert.equal(feedEventFromNote({ ...note, content: '   ' }, now), null);
  assert.equal(feedEventFromNote({ pubkey: 'pk1' }, now), null);
});

test('feedEventFromNote lifts NIP-92 imeta media into files and strips the URLs from text', () => {
  const note = {
    id: 'n2',
    pubkey: 'pk1',
    created_at: 1_700_000_000,
    tags: [
      ['t', 'bitos-education'],
      ['imeta', 'url https://cdn.example/a.png', 'm image/png', 'alt diagram'],
      ['imeta', 'url https://cdn.example/b.gif', 'm image/gif'],
    ],
    content: 'Look at this\n\nhttps://cdn.example/a.png\n\nhttps://cdn.example/b.gif',
  };
  const mapped = feedEventFromNote(note);
  assert.equal(mapped.text, 'Look at this');
  assert.deepEqual(mapped.files, [
    { url: 'https://cdn.example/a.png', type: 'image/png', name: 'diagram' },
    { url: 'https://cdn.example/b.gif', type: 'image/gif', name: 'b.gif' },
  ]);
});

test('feedEventFromNote keeps a media-only note and still drops replies', () => {
  const mediaOnly = {
    id: 'n3',
    pubkey: 'pk1',
    created_at: 1_700_000_000,
    tags: [['imeta', 'url https://cdn.example/c.png', 'm image/png']],
    content: 'https://cdn.example/c.png',
  };
  const mapped = feedEventFromNote(mediaOnly);
  assert.equal(mapped.text, '');
  assert.equal(mapped.files.length, 1);

  const reply = { ...mediaOnly, id: 'n4', tags: [...mediaOnly.tags, ['e', 'parent']] };
  assert.equal(feedEventFromNote(reply), null);
});

test('threadEventFromNote keeps replies and records the event it answers', () => {
  const reply = {
    id: 'r1',
    pubkey: 'pk2',
    kind: 1,
    created_at: 1_700_000_100,
    tags: [
      ['e', 'root1', '', 'root'],
      ['e', 'parent1', '', 'reply'],
      ['p', 'pk1'],
    ],
    content: 'Nice note!',
  };
  assert.equal(feedEventFromNote(reply), null); // replies are not feed items
  const mapped = threadEventFromNote(reply);
  assert.equal(mapped.id, 'r1');
  assert.equal(mapped.text, 'Nice note!');
  assert.equal(mapped.replyTo, 'root1');
});
