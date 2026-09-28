import { ROLE } from './school.js';

export const ACADEMY_TYPES = Object.freeze([
  { id: 'school', label: 'School' },
  { id: 'college', label: 'College or university' },
  { id: 'training', label: 'Training provider' },
]);

export const INVITE_STATUS = Object.freeze({
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REVOKED: 'revoked',
});

const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const CODE_LENGTH = 10;
const CODE_PATTERN = /^[a-z0-9]{6,32}$/;

export function academyTypeLabel(id) {
  return ACADEMY_TYPES.find((type) => type.id === id)?.label ?? 'School';
}

export function findAcademyById(academies = {}, id) {
  const list = Array.isArray(academies) ? academies : Object.values(academies ?? {});
  return list.find((academy) => academy?.id === id) ?? null;
}

export function createInviteCode({ rng = Math.random, length = CODE_LENGTH } = {}) {
  let code = '';
  for (let index = 0; index < length; index += 1) {
    code += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
  }
  return code;
}

export function normalizeInviteCode(value) {
  const code = String(value ?? '')
    .trim()
    .toLowerCase();
  return CODE_PATTERN.test(code) ? code : null;
}

export function parseInviteReference(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return null;

  const marker = value.indexOf('#/join/');
  if (marker >= 0) {
    return normalizeInviteCode(value.slice(marker + '#/join/'.length).split(/[?&#/]/)[0]);
  }
  if (value.startsWith('/join/')) {
    return normalizeInviteCode(value.slice('/join/'.length).split(/[?&#/]/)[0]);
  }
  return normalizeInviteCode(value);
}

export function inviteUrl(code, base = '') {
  const clean = normalizeInviteCode(code) ?? String(code ?? '').trim();
  const trimmed = String(base ?? '')
    .replace(/#.*$/, '')
    .replace(/\/+$/, '');
  return `${trimmed}/#/join/${clean}`;
}

export function createInvite({
  id,
  academyId,
  role = ROLE.STUDENT,
  target = '',
  name = '',
  code,
  createdBy,
  time = 'now',
} = {}) {
  return {
    id,
    academyId,
    role,
    target: String(target ?? '').trim(),
    name: String(name ?? '').trim(),
    code: code ?? createInviteCode(),
    status: INVITE_STATUS.PENDING,
    createdBy: createdBy ?? null,
    time,
    acceptedBy: null,
  };
}

export function findInviteByCode(invites = [], code) {
  const clean = normalizeInviteCode(code);
  if (!clean) return null;
  return invites.find((invite) => invite.code === clean) ?? null;
}

export function inviteBadge(status) {
  if (status === INVITE_STATUS.PENDING) return { label: 'invite pending', tone: 'info' };
  if (status === INVITE_STATUS.ACCEPTED) return { label: 'accepted ✓', tone: 'ok' };
  if (status === INVITE_STATUS.REVOKED) return { label: 'revoked', tone: 'err' };
  return null;
}

export function inviteRoleLabel(role) {
  if (role === ROLE.TEACHER) return 'teacher';
  if (role === ROLE.OWNER) return 'admin';
  return 'learner';
}

export function isOpenInvite(invite) {
  return Boolean(invite) && !invite.target && invite.role === ROLE.STUDENT;
}

export function orgProfileContent(academy = {}) {
  const content = {
    name: String(academy.name ?? '').trim(),
    about: String(academy.about ?? '').trim(),
  };
  const picture = String(academy.picture ?? '').trim();
  if (picture) content.picture = picture;
  const handle = String(academy.handle ?? '').trim();
  if (handle) content.nip05 = handle;
  return content;
}
