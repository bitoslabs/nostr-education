import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ENROLLMENT,
  MEMBERSHIP,
  REQUEST_STATUS,
  enrollmentStateFor,
  membershipBadge,
  pendingRequestCount,
} from '../src/domain/school.js';
import { isKeyLike, isNpub, isNsec, maskKey, signerType } from '../src/domain/account.js';
import {
  backupNsecForPubkey,
  buildEvent,
  decodeKey,
  encodeNpub,
  extensionSigner,
  generateKeyPair,
  hasExtension,
  localSigner,
  publicKeyFromSecret,
  verify,
} from '../src/services/nostr.js';

test('generateKeyPair produces a matching npub/nsec pair', () => {
  const pair = generateKeyPair();
  assert.match(pair.npub, /^npub1[0-9a-z]+$/);
  assert.match(pair.nsec, /^nsec1[0-9a-z]+$/);
  assert.equal(publicKeyFromSecret(pair.secretKey), pair.pubkey);
  assert.equal(encodeNpub(pair.pubkey), pair.npub);
});

test('decodeKey round-trips npub, nsec, and raw hex', () => {
  const pair = generateKeyPair();
  const npub = decodeKey(pair.npub);
  assert.equal(npub.type, 'npub');
  assert.equal(npub.pubkey, pair.pubkey);

  const nsec = decodeKey(pair.nsec);
  assert.equal(nsec.type, 'nsec');
  assert.equal(nsec.pubkey, pair.pubkey);

  assert.equal(decodeKey(pair.pubkey).type, 'pubkey');
  assert.equal(decodeKey('not-a-key'), null);
});

test('backup only reveals the secret for the expected public key', () => {
  const account = generateKeyPair();
  const other = generateKeyPair();
  assert.equal(backupNsecForPubkey(account.secretKey, account.pubkey), account.nsec);
  assert.equal(backupNsecForPubkey(account.secretKey, other.pubkey), null);
  assert.equal(backupNsecForPubkey(null, account.pubkey), null);
});

test('a local signer signs a verifiable event', async () => {
  const pair = generateKeyPair();
  const signer = localSigner(pair.secretKey);
  assert.equal(await signer.getPublicKey(), pair.pubkey);

  const signed = await signer.signEvent(buildEvent({ kind: 1, content: 'hello nostr' }));
  assert.equal(signed.pubkey, pair.pubkey);
  assert.equal(verify(signed), true);
});

test('an extension signer stops calling a disconnected extension bridge', async () => {
  const previousWindow = globalThis.window;
  let calls = 0;
  globalThis.window = {
    nostr: {
      signEvent() {},
      getPublicKey() {
        calls += 1;
        throw new Error('Could not establish connection. Receiving end does not exist.');
      },
    },
  };

  try {
    const signer = extensionSigner();
    await assert.rejects(() => signer.getPublicKey(), /Receiving end does not exist/);
    await assert.rejects(() => signer.getPublicKey(), /extension is disconnected/);
    assert.equal(calls, 1);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('the extension can be disabled with a query parameter for diagnostics', async () => {
  const previousWindow = globalThis.window;
  let calls = 0;
  globalThis.window = {
    location: { search: '?disableNostrExtension=1' },
    nostr: {
      signEvent() {},
      getPublicKey() {
        calls += 1;
        return 'pubkey';
      },
    },
  };

  try {
    assert.equal(hasExtension(), false);
    await assert.rejects(() => extensionSigner().getPublicKey(), /No Nostr extension/);
    assert.equal(calls, 0);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('key validators recognise real bech32 keys', () => {
  const pair = generateKeyPair();
  assert.equal(isNpub(pair.npub), true);
  assert.equal(isNsec(pair.npub), false);
  assert.equal(isNsec(pair.nsec), true);
  assert.equal(isKeyLike(pair.pubkey), true);
  assert.equal(isKeyLike('not-a-key'), false);
});

test('maskKey hides the middle of a key', () => {
  const pair = generateKeyPair();
  assert.equal(maskKey(pair.npub), `${pair.npub.slice(0, 9)}…${pair.npub.slice(-4)}`);
});

test('signerType falls back to the local signer', () => {
  assert.equal(signerType('extension').id, 'extension');
  assert.equal(signerType('unknown').id, 'local');
});

test('enrollmentStateFor reads the latest request per course', () => {
  const requests = [
    { learnerId: 'a', courseId: 'CS-204', status: REQUEST_STATUS.DECLINED },
    { learnerId: 'a', courseId: 'CS-204', status: REQUEST_STATUS.PENDING },
    { learnerId: 'b', courseId: 'CS-204', status: REQUEST_STATUS.APPROVED },
  ];
  assert.equal(enrollmentStateFor(requests, 'a', 'CS-204'), ENROLLMENT.PENDING);
  assert.equal(enrollmentStateFor(requests, 'b', 'CS-204'), ENROLLMENT.APPROVED);
  assert.equal(enrollmentStateFor(requests, 'a', 'CS-101'), ENROLLMENT.NONE);
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
