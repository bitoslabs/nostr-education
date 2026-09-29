import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CAPABILITY,
  capabilityId,
  createCapability,
  hasCapability,
  isCapabilityActive,
  revokeCapability,
} from '../src/domain/capability.js';

test('createCapability builds a stable id and requires academy and account', () => {
  const cap = createCapability({
    kind: CAPABILITY.ENROLLMENT,
    academyId: 'org1',
    accountId: 'stu',
    classroomId: 'cls1',
    role: 'student',
    issuedBy: 'owner',
  });
  assert.equal(cap.id, 'enrollment:org1:cls1:stu');
  assert.equal(cap.status, 'active');
  assert.equal(cap.classroomId, 'cls1');

  assert.equal(createCapability({ kind: CAPABILITY.ENROLLMENT, academyId: 'org1' }), null);
  assert.equal(
    capabilityId(CAPABILITY.MEMBERSHIP, { academyId: 'org1', accountId: 'stu' }),
    'membership:org1:stu',
  );
});

test('hasCapability matches active grants and ignores wrong scope', () => {
  const cap = createCapability({
    kind: CAPABILITY.ENROLLMENT,
    academyId: 'org1',
    accountId: 'stu',
    classroomId: 'cls1',
  });
  const query = { kind: CAPABILITY.ENROLLMENT, academyId: 'org1', accountId: 'stu' };
  assert.equal(hasCapability([cap], { ...query, classroomId: 'cls1' }), true);
  assert.equal(hasCapability([cap], { ...query, classroomId: 'cls2' }), false);
  assert.equal(hasCapability([cap], { ...query, accountId: 'other' }), false);
  assert.equal(hasCapability([cap], { ...query, academyId: 'org2' }), false);
  assert.equal(hasCapability([cap], { ...query, classroomId: undefined }), true);
});

test('revoked and expired capabilities are inactive', () => {
  const cap = createCapability({
    kind: CAPABILITY.MEMBERSHIP,
    academyId: 'org1',
    accountId: 'stu',
    role: 'student',
  });
  const revoked = revokeCapability(cap, { revokedBy: 'owner' });
  assert.equal(isCapabilityActive(revoked), false);
  assert.equal(hasCapability([revoked], { kind: CAPABILITY.MEMBERSHIP, academyId: 'org1', accountId: 'stu' }), false);

  const expired = { ...cap, expiresAt: '2020-01-01T00:00:00Z' };
  assert.equal(isCapabilityActive(expired, Date.parse('2026-01-01T00:00:00Z')), false);
  assert.equal(isCapabilityActive(expired, Date.parse('2019-01-01T00:00:00Z')), true);
});

test('hasCapability filters by role when asked', () => {
  const owner = createCapability({
    kind: CAPABILITY.MEMBERSHIP,
    academyId: 'org1',
    accountId: 'pk1',
    role: 'owner',
  });
  assert.equal(
    hasCapability([owner], { kind: CAPABILITY.MEMBERSHIP, academyId: 'org1', accountId: 'pk1', role: 'owner' }),
    true,
  );
  assert.equal(
    hasCapability([owner], { kind: CAPABILITY.MEMBERSHIP, academyId: 'org1', accountId: 'pk1', role: 'student' }),
    false,
  );
});
