import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACADEMY_TYPES,
  INVITE_STATUS,
  academyTypeLabel,
  createInvite,
  createInviteCode,
  findAcademyById,
  findInviteByCode,
  inviteBadge,
  inviteRoleLabel,
  inviteUrl,
  isOpenInvite,
  normalizeInviteCode,
  orgProfileContent,
  parseInviteReference,
} from '../src/domain/academy.js';

test('createInviteCode uses the unambiguous alphabet and requested length', () => {
  const code = createInviteCode({ rng: () => 0.5, length: 8 });
  assert.equal(code.length, 8);
  assert.match(code, /^[abcdefghjkmnpqrstuvwxyz23456789]+$/);
  assert.doesNotMatch(code, /[0o1l]/);
});

test('normalizeInviteCode rejects short or malformed codes', () => {
  assert.equal(normalizeInviteCode('  ABCD1234 '), 'abcd1234');
  assert.equal(normalizeInviteCode('abc'), null);
  assert.equal(normalizeInviteCode('bad code!'), null);
  assert.equal(normalizeInviteCode(''), null);
});

test('parseInviteReference accepts links, paths, and raw codes', () => {
  assert.equal(parseInviteReference('https://bitos.id/#/join/abcd1234'), 'abcd1234');
  assert.equal(parseInviteReference('https://bitos.id/#/join/ABCD1234?x=1'), 'abcd1234');
  assert.equal(parseInviteReference('/join/abcd1234'), 'abcd1234');
  assert.equal(parseInviteReference('abcd1234'), 'abcd1234');
  assert.equal(parseInviteReference('npm install'), null);
});

test('inviteUrl normalizes the base and the code', () => {
  assert.equal(inviteUrl('ABCD1234', 'https://bitos.id/'), 'https://bitos.id/#/join/abcd1234');
  assert.equal(inviteUrl('abcd1234', 'https://bitos.id/app#/home'), 'https://bitos.id/app/#/join/abcd1234');
});

test('createInvite fills defaults and findInviteByCode is case-insensitive', () => {
  const invite = createInvite({ id: 'inv1', academyId: 'org1', code: 'abcd1234', createdBy: 'nadia' });
  assert.equal(invite.status, INVITE_STATUS.PENDING);
  assert.equal(invite.role, 'student');
  assert.equal(invite.acceptedBy, null);

  const invites = [invite];
  assert.equal(findInviteByCode(invites, 'ABCD1234'), invite);
  assert.equal(findInviteByCode(invites, 'nope1234'), null);
});

test('invite helpers describe status, role, and open links', () => {
  assert.equal(inviteBadge(INVITE_STATUS.PENDING).tone, 'info');
  assert.equal(inviteBadge(INVITE_STATUS.ACCEPTED).tone, 'ok');
  assert.equal(inviteBadge(INVITE_STATUS.REVOKED).tone, 'err');
  assert.equal(inviteRoleLabel('teacher'), 'teacher');
  assert.equal(inviteRoleLabel('student'), 'learner');
  assert.equal(isOpenInvite(createInvite({ role: 'student' })), true);
  assert.equal(isOpenInvite(createInvite({ role: 'teacher', target: 'bob@bitos.id' })), false);
});

test('academyTypeLabel falls back to School', () => {
  assert.equal(ACADEMY_TYPES.length > 0, true);
  assert.equal(academyTypeLabel('college'), 'College or university');
  assert.equal(academyTypeLabel('unknown'), 'School');
});

test('orgProfileContent builds the public kind:0 body from academy fields', () => {
  assert.deepEqual(orgProfileContent({ name: 'Northgate', about: 'A college', picture: 'https://x/y.png' }), {
    name: 'Northgate',
    about: 'A college',
    picture: 'https://x/y.png',
  });
  assert.deepEqual(orgProfileContent({ name: '  Solo  ' }), { name: 'Solo', about: '' });
  assert.equal('picture' in orgProfileContent({ name: 'Solo', picture: '   ' }), false);
  assert.equal(orgProfileContent({ name: 'Org', handle: 'org@bitos.id' }).nip05, 'org@bitos.id');
});

test('findAcademyById searches the owner-keyed academy map', () => {
  const academies = { pk1: { id: 'org1', name: 'Northgate' }, pk2: { id: 'org2', name: 'Southgate' } };
  assert.equal(findAcademyById(academies, 'org2').name, 'Southgate');
  assert.equal(findAcademyById(academies, 'missing'), null);
  assert.equal(findAcademyById(undefined, 'org1'), null);
});
