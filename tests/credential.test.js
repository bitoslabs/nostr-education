import assert from 'node:assert/strict';
import test from 'node:test';

import {
  credentialFromEvent,
  credentialFromProof,
  credentialPayload,
  credentialProofContent,
  credentialProofText,
  decodeProofFragment,
  encodeProofFragment,
  revocationPayload,
  verifyCredential,
} from '../src/domain/credential.js';

test('credentialPayload keeps only public, shareable fields', () => {
  const payload = credentialPayload({
    academyName: 'Northgate',
    academyPubkey: 'pk',
    holderName: 'Alice',
    course: 'Maths',
    average: 88,
    policyVersion: 2,
    issuedAt: 123,
  });
  assert.equal(payload.title, 'Northgate Certificate');
  assert.equal(payload.issuer, 'pk');
  assert.deepEqual(Object.keys(payload).sort(), [
    'average',
    'course',
    'holder',
    'issuedAt',
    'issuer',
    'issuerNip05',
    'policyVersion',
    'title',
    'v',
  ]);
});

test('verifyCredential checks signature, issuer, and payload match', () => {
  const payload = credentialPayload({
    academyName: 'Northgate',
    academyPubkey: 'pk',
    holderName: 'Alice',
    course: 'Maths',
  });
  const proof = { sig: 'sig', pubkey: 'pk', content: credentialProofContent(payload) };
  const credential = { issuerPubkey: 'pk', payload, proof };

  assert.equal(verifyCredential(credential, () => true).valid, true);
  assert.equal(verifyCredential(credential, () => false).valid, false);
  assert.equal(verifyCredential({ ...credential, issuerPubkey: 'other' }, () => true).valid, false);
  assert.equal(
    verifyCredential({ ...credential, proof: { ...proof, content: '{}' } }, () => true).valid,
    false,
  );
  assert.equal(verifyCredential({ payload, proof: { pubkey: 'pk' } }, () => true).valid, false);
});

test('credentialFromProof round-trips a shareable proof', () => {
  const payload = credentialPayload({
    academyName: 'Northgate',
    academyPubkey: 'pk',
    holderName: 'Alice',
    course: 'Maths',
    issuedAt: 1,
  });
  const text = credentialProofText({
    id: 'c1',
    title: payload.title,
    course: payload.course,
    issuedAt: payload.issuedAt,
    issuerPubkey: 'pk',
    payload,
    proof: { sig: 's', pubkey: 'pk', content: credentialProofContent(payload) },
  });
  const parsed = credentialFromProof(text);
  assert.equal(parsed.id, 'c1');
  assert.equal(parsed.issuerPubkey, 'pk');
  assert.equal(verifyCredential(parsed, () => true).valid, true);
  assert.equal(credentialFromProof('not json'), null);
  assert.equal(credentialFromProof(JSON.stringify({ payload })), null);
});

test('revocationPayload carries the revoked status', () => {
  assert.deepEqual(revocationPayload({ credentialId: 'c1', issuer: 'pk', revokedAt: 5 }), {
    v: 1,
    credentialId: 'c1',
    issuer: 'pk',
    status: 'revoked',
    revokedAt: 5,
  });
});

test('credential payload carries no roster or per-homework grades', () => {
  const payload = credentialPayload({
    academyName: 'Northgate',
    academyPubkey: 'pk',
    holderName: 'Alice',
    course: 'Maths',
    average: 90,
  });
  for (const forbidden of ['studentIds', 'students', 'submissions', 'grades', 'homework', 'roster']) {
    assert.equal(forbidden in payload, false);
  }
  assert.equal(payload.average, 90);
});

test('credentialFromEvent parses issuance and revocation events', () => {
  const payload = credentialPayload({
    academyName: 'Northgate',
    academyPubkey: 'pk',
    holderName: 'Alice',
    course: 'Maths',
    issuedAt: 10,
  });
  const issue = {
    kind: 30080,
    pubkey: 'pk',
    sig: 's',
    content: credentialProofContent(payload),
    tags: [
      ['d', 'c1'],
      ['p', 'learner'],
    ],
  };
  const parsed = credentialFromEvent(issue);
  assert.equal(parsed.kind, 'credential');
  assert.equal(parsed.credential.id, 'c1');
  assert.equal(parsed.credential.issuerPubkey, 'pk');
  assert.equal(parsed.credential.recipient.name, 'Alice');

  const revoke = {
    kind: 30080,
    pubkey: 'pk',
    sig: 's',
    content: JSON.stringify(revocationPayload({ credentialId: 'c1', issuer: 'pk', revokedAt: 11 })),
    tags: [['d', 'c1'], ['status', 'revoked']],
  };
  const status = credentialFromEvent(revoke);
  assert.equal(status.kind, 'status');
  assert.equal(status.id, 'c1');
  assert.equal(status.status, 'revoked');

  assert.equal(credentialFromEvent({ sig: 's', content: 'not json' }), null);
  assert.equal(credentialFromEvent(null), null);
});

test('proof fragments round-trip for share links', () => {
  const text = JSON.stringify({ sig: 's', nested: { a: 1 } });
  const fragment = encodeProofFragment(text);
  assert.equal(typeof fragment, 'string');
  assert.equal(decodeProofFragment(fragment), text);
  assert.equal(decodeProofFragment('!!!not-base64'), null);
});
