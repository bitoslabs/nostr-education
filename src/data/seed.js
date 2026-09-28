import { DELIVERY_STATE, RELAY_HEALTH } from '../domain/delivery.js';
import { MEMBERSHIP, REQUEST_STATUS } from '../domain/school.js';
import { PEOPLE } from './personas.js';

export const SEED_CREDENTIALS = Object.freeze([
  {
    id: 'cred-cs-bsc',
    title: 'Bachelor of Computer Science',
    issuer: PEOPLE.academy,
    status: 'active',
    privacyLevel: 'L2',
    expiresAt: '2029-06-30',
    meta: 'Public (L0): degree, issuer, dates · Private (L2): grades, student ID',
  },
  {
    id: 'cred-cs101',
    title: 'CS-101 Applied Cryptography — Certificate',
    issuer: PEOPLE.academy,
    status: 'active',
    privacyLevel: 'L1',
    expiresAt: null,
    meta: 'Course completion · verifiable by anyone you share it with',
  },
]);

export const SEED_EVENTS = Object.freeze([
  {
    id: 'e10',
    type: 'joinreq',
    author: 'priya',
    time: '4h',
    context: 'BitOS Academy',
    audience: ['nadia'],
    requestId: 'jr1',
    text: 'requested to join BitOS Academy as a learner.',
  },
  {
    id: 'e9',
    type: 'draft',
    author: 'bob',
    time: '1d',
    context: 'CS-101 ▸ A1',
    audience: ['bob'],
    text: 'Draft score saved — Dave · 10/12 · 83%. Drafts stay private to you until finalized.',
  },
  {
    id: 'e8',
    type: 'submission',
    author: 'carol',
    time: '1d',
    context: 'CS-101 ▸ A1',
    audience: ['bob'],
    text: 'Submitted version 2 — intro essay.',
    files: ['essay-v2.pdf'],
    queueId: 'q2',
  },
  {
    id: 'e7',
    type: 'revision',
    author: 'bob',
    time: '2h',
    context: 'CS-101 ▸ A2',
    audience: ['alice'],
    text: 'Requested a revision on your submission.',
    quote: "Section 3 doesn't cover collision resistance — revise and resubmit.",
    actionNeeded: true,
  },
  {
    id: 'e6',
    type: 'submission',
    author: 'alice',
    time: 'Mar 11',
    context: 'CS-101 ▸ A2',
    audience: ['bob'],
    text: 'Submitted version 1 — hash functions.',
    files: ['hashes.pdf', 'data.csv'],
    queueId: 'q1',
  },
  {
    id: 'e5',
    type: 'social',
    author: 'vera',
    time: '1d',
    audience: 'all',
    text: 'Explaining Merkle trees with a shoebox and 8 sticky notes. Thread 🧵',
    counts: { likes: 56, bitz: 8, replies: 3 },
  },
  {
    id: 'e4',
    type: 'course',
    author: 'academy',
    time: '2d',
    context: 'CS-204',
    audience: 'all',
    text: 'Applied Cryptography II opens Monday · 4 assignments · Certificate on completion.',
    courseId: 'CS-204',
  },
  {
    id: 'e3',
    type: 'social',
    author: 'kojo',
    time: '2d',
    audience: 'all',
    text: 'Zap a note, get a bit back. The Bitz economy is kindness with receipts. ⚡',
    counts: { likes: 34, bitz: 5, replies: 9 },
  },
  {
    id: 'e2',
    type: 'social',
    author: 'mia',
    time: '3d',
    audience: 'all',
    text: 'Day 40 of posting one sketch a day. 🐝',
    counts: { likes: 89, bitz: 12, replies: 7 },
  },
  {
    id: 'e1',
    type: 'enrollreq',
    author: 'carol',
    time: '3d',
    context: 'CS-204',
    audience: ['nadia'],
    requestId: 'er1',
    text: 'requested enrollment in CS-204.',
  },
]);

export const SEED_QUEUE = Object.freeze([
  {
    id: 'q1',
    learner: 'alice',
    learnerName: 'Alice',
    title: 'A2 · Hash functions',
    version: 'v1',
    time: '2h',
    status: 'review',
    files: ['hashes.pdf', 'data.csv'],
  },
  {
    id: 'q2',
    learner: 'carol',
    learnerName: 'Carol',
    title: 'A1 · Intro essay',
    version: 'v2',
    time: '1d',
    status: 'review',
    files: ['essay-v2.pdf'],
  },
  {
    id: 'q3',
    learner: 'dave',
    learnerName: 'Dave',
    title: 'A1 · Intro essay',
    version: 'v1',
    time: '2d',
    status: 'draft',
    scores: [4, 3, 3],
    score: '10/12 · 83%',
    pct: 83,
    files: ['essay.pdf'],
  },
]);

export const SEED_RELAYS = Object.freeze([
  { id: 'r1', url: 'wss://relay.damus.io', mode: 'read+write', latencyMs: 120, health: RELAY_HEALTH.CONNECTED },
  { id: 'r2', url: 'wss://nos.lol', mode: 'read', latencyMs: 210, health: RELAY_HEALTH.CONNECTED },
  { id: 'r3', url: 'wss://bitos.relay', mode: 'read+write', latencyMs: null, health: RELAY_HEALTH.CONNECTING },
  { id: 'r4', url: 'wss://relay.example', mode: 'read', latencyMs: null, health: RELAY_HEALTH.OFFLINE },
]);

export const SEED_DELIVERIES = Object.freeze([
  { id: 'd1', label: "Carol's completion event", state: DELIVERY_STATE.FAILED },
  { id: 'd2', label: 'Degree status check', state: DELIVERY_STATE.STALE, staleDays: 6 },
]);

export const SEED_COURSES = Object.freeze([
  {
    id: 'CS-101',
    title: 'Applied Cryptography',
    status: 'live',
    teacherId: 'bob',
    assignments: 4,
    progress: '3/4',
    certificate: true,
  },
  {
    id: 'CS-204',
    title: 'Applied Cryptography II',
    status: 'draft',
    teacherId: 'bob',
    assignments: 4,
    progress: null,
    certificate: true,
  },
  {
    id: 'CS-105',
    title: 'Planned',
    status: 'planned',
    teacherId: null,
    assignments: 0,
    progress: null,
    certificate: false,
  },
]);

export const SEED_ASSIGNMENT = Object.freeze({
  id: 'CS-101-A2',
  courseId: 'CS-101',
  title: 'A2 — Hash functions',
  due: 'Mar 14, 23:59',
  late: 'late accepted +48h',
  status: 'revision',
  feedback: "Section 3 doesn't cover collision resistance — revise and resubmit.",
  reviewer: 'bob',
  reviewedAt: 'Mar 12',
  files: ['hashes.pdf', 'data.csv'],
  versions: 1,
  grade: null,
  history: ['v1 · Mar 11 · submitted', 'revision requested · Mar 12'],
});

export const SEED_GRANTS = Object.freeze([]);

export const SEED_FOLLOWING = Object.freeze({
  alice: ['bob', 'academy', 'mia', 'kojo'],
  bob: ['academy', 'vera', 'alice'],
  nadia: ['academy', 'kojo', 'bob'],
});

export const SEED_CONTACTS = Object.freeze({
  'recruiter.hires.example': { name: 'Recruiter', verified: true },
  'bob@bitos.id': { name: 'Bob', verified: true },
});

export const SEED_MEMBERSHIPS = Object.freeze({
  alice: MEMBERSHIP.ACTIVE,
  bob: MEMBERSHIP.ACTIVE,
  nadia: MEMBERSHIP.ACTIVE,
  carol: MEMBERSHIP.ACTIVE,
  dave: MEMBERSHIP.ACTIVE,
});

export const SEED_JOIN_REQUESTS = Object.freeze([
  {
    id: 'jr1',
    accountId: 'priya',
    displayName: 'Priya',
    handle: 'priya@bitos.id',
    academy: 'BitOS Academy',
    role: 'student',
    time: '4h',
    status: REQUEST_STATUS.PENDING,
  },
]);

export const SEED_ENROLL_REQUESTS = Object.freeze([
  {
    id: 'er0',
    learnerId: 'alice',
    learnerName: 'Alice',
    courseId: 'CS-101',
    courseTitle: 'Applied Cryptography',
    time: 'Jan 8',
    status: REQUEST_STATUS.APPROVED,
  },
  {
    id: 'er1',
    learnerId: 'carol',
    learnerName: 'Carol',
    courseId: 'CS-204',
    courseTitle: 'Applied Cryptography II',
    time: '3d',
    status: REQUEST_STATUS.PENDING,
  },
]);
