import assert from 'node:assert/strict';
import test from 'node:test';

import {
  credentialFromProof,
  credentialPayload,
  credentialProofContent,
  credentialProofText,
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
