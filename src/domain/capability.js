// Signed capabilities are the Nostr-native authorization primitive: the academy
// (or its teacher) signs a grant, and any client can verify it without calling a
// server. Server mode can treat the same records as a cache of the roster.
// See docs/architecture/nostr-native.md.

export const CAPABILITY = Object.freeze({
  MEMBERSHIP: 'membership',
  TEACHER_ASSIGNMENT: 'teacher-assignment',
  ENROLLMENT: 'enrollment',
});

export function capabilityId(kind, { academyId, accountId, classroomId = null } = {}) {
  return [kind, academyId, classroomId, accountId].filter(Boolean).join(':');
}

export function createCapability({
  kind,
  academyId,
  accountId,
  classroomId = null,
  role = null,
  issuedBy = null,
  issuedAt = 'now',
  expiresAt = null,
} = {}) {
  if (!kind || !academyId || !accountId) return null;
  return {
    id: capabilityId(kind, { academyId, accountId, classroomId }),
    kind,
    academyId,
    accountId,
    classroomId,
    role,
    issuedBy,
    issuedAt,
    expiresAt,
    status: 'active',
  };
}

export function revokeCapability(capability, { revokedBy = null, revokedAt = 'now' } = {}) {
  if (!capability) return null;
  return { ...capability, status: 'revoked', revokedBy, revokedAt };
}

export function isCapabilityActive(capability, at = Date.now()) {
  if (!capability || capability.status !== 'active') return false;
  if (!capability.expiresAt) return true;
  const expiry = Date.parse(capability.expiresAt);
  return !Number.isFinite(expiry) || at <= expiry;
}

export function hasCapability(
  capabilities = [],
  { kind, academyId, accountId, classroomId, role } = {},
  at = Date.now(),
) {
  if (!kind || !accountId) return false;
  return capabilities.some((capability) => {
    if (!isCapabilityActive(capability, at)) return false;
    if (capability.kind !== kind) return false;
    if (academyId !== undefined && capability.academyId !== academyId) return false;
    if (capability.accountId !== accountId) return false;
    if (classroomId !== undefined && capability.classroomId !== classroomId) return false;
    if (role !== undefined && capability.role !== role) return false;
    return true;
  });
}
