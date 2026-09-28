import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDemoIdentity,
  deriveHandle,
  isKeyLike,
  isNpub,
  isNsec,
  maskKey,
  randomKey,
  signerType,
} from '../src/domain/account.js';
import {
  ENROLLMENT,
  MEMBERSHIP,
  REQUEST_STATUS,
  enrollmentStateFor,
  membershipBadge,
  pendingRequestCount,
} from '../src/domain/school.js';

test('randomKey generates prefixed keys of the requested length', () => {
  let calls = 0;
  const rng = () => {
    calls += 1;
    return 0.5;
  };
  const key = randomKey('npub1', { length: 8, rng });
  assert.equal(key.startsWith('npub1'), true);
  assert.equal(key.length, 13);
  assert.equal(calls, 8);
});

test('key validators distinguish npub and nsec', () => {
  const npub = 'npub1fjvzq4nd7xz2m9p8c3rk6t0w5yvhsagl4euxdt2qf8n3z7m8xk3';
  const nsec = 'nsec1fjvzq4nd7xz2m9p8c3rk6t0w5yvhsagl4euxdt2qf8n3z7m8xk3';
  assert.equal(isNpub(npub), true);
  assert.equal(isNsec(npub), false);
  assert.equal(isNsec(nsec), true);
  assert.equal(isKeyLike('not-a-key'), false);
});

test('createDemoIdentity builds a signable persona', () => {
  const identity = createDemoIdentity({ displayName: 'Rae Kim', role: 'student', rng: () => 0.3 });
  assert.equal(identity.displayName, 'Rae Kim');
  assert.equal(identity.id.startsWith('acct-rae-kim-'), true);
  assert.equal(isNpub(identity.npub), true);
  assert.equal(isNsec(identity.nsec), true);
  assert.equal(identity.handle, '');
});

test('deriveHandle and maskKey are stable helpers', () => {
  const npub = 'npub1fjvzq4nd7xz2m9p8c3rk6t0w5yvhsagl4euxdt2qf8n3z7m8xk3';
  assert.equal(deriveHandle(npub), 'user-8xk3');
  assert.equal(maskKey(npub), 'npub1fjvz…8xk3');
});

test('signerType falls back to the demo signer', () => {
  assert.equal(signerType('hardware').id, 'hardware');
  assert.equal(signerType('unknown').id, 'demo');
});

test('enrollmentStateFor reads the latest request per course', () => {
  const requests = [
    { learnerId: 'alice', courseId: 'CS-204', status: REQUEST_STATUS.DECLINED },
    { learnerId: 'alice', courseId: 'CS-204', status: REQUEST_STATUS.PENDING },
    { learnerId: 'bob', courseId: 'CS-204', status: REQUEST_STATUS.APPROVED },
  ];
  assert.equal(enrollmentStateFor(requests, 'alice', 'CS-204'), ENROLLMENT.PENDING);
  assert.equal(enrollmentStateFor(requests, 'bob', 'CS-204'), ENROLLMENT.APPROVED);
  assert.equal(enrollmentStateFor(requests, 'alice', 'CS-101'), ENROLLMENT.NONE);
});

test('membership and request badges plus pending counts', () => {
  assert.equal(membershipBadge(MEMBERSHIP.PENDING).tone, 'info');
  assert.equal(membershipBadge(MEMBERSHIP.ACTIVE).tone, 'ok');
  assert.equal(
    pendingRequestCount(
      [{ status: REQUEST_STATUS.PENDING }, { status: REQUEST_STATUS.APPROVED }],
      [{ status: REQUEST_STATUS.PENDING }],
    ),
    2,
  );
});
