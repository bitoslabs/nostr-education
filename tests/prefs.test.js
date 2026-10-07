import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_PREFS,
  DM_POLICY,
  LOW_POW_THRESHOLD,
  allowsIncomingMessage,
  defaultPow,
  normalizePrefs,
  setPrivacy,
  setSubscription,
  setZap,
  subscriptionEnabled,
  zapAmounts,
} from '../src/domain/prefs.js';

test('normalizePrefs fills defaults for empty input', () => {
  const prefs = normalizePrefs(undefined);
  assert.equal(prefs.privacy.dmPolicy, DM_POLICY.EVERYONE);
  assert.equal(prefs.privacy.defaultPow, 0);
  assert.equal(prefs.privacy.refuseLowPow, false);
  assert.deepEqual(prefs.zap.amounts, DEFAULT_PREFS.zap.amounts);
  assert.equal(prefs.network.maxConnections, 8);
  assert.equal(subscriptionEnabled(prefs, 1), true);
});

test('normalizePrefs rejects an unknown dm policy and snaps PoW', () => {
  const prefs = normalizePrefs({
    privacy: { dmPolicy: 'everyone-on-tuesdays', defaultPow: 18 },
  });
  assert.equal(prefs.privacy.dmPolicy, DM_POLICY.EVERYONE);
  assert.equal(prefs.privacy.defaultPow, 16);
});

test('zap amounts are clamped to four valid values', () => {
  const prefs = normalizePrefs({ zap: { amounts: [0, -5, 21, 1000001] } });
  assert.equal(prefs.zap.amounts.length, 4);
  assert.ok(prefs.zap.amounts.every((value) => value >= 1 && value <= 1_000_000));
  assert.deepEqual(setZap(prefs, { amounts: [50, 200, 500, 1000] }).zap.amounts, [50, 200, 500, 1000]);
});

test('subscription toggles persist per kind and default on', () => {
  const off = setSubscription(DEFAULT_PREFS, 9735, false);
  assert.equal(subscriptionEnabled(off, 9735), false);
  assert.equal(subscriptionEnabled(off, 1), true);
  assert.equal(subscriptionEnabled(off, 999999), true);
});

test('allowsIncomingMessage honours the DM policy', () => {
  const base = { selfId: 'me', following: ['friend'] };
  assert.equal(allowsIncomingMessage({ privacy: { dmPolicy: DM_POLICY.EVERYONE } }, { ...base, peerId: 'stranger' }), true);
  assert.equal(
    allowsIncomingMessage({ privacy: { dmPolicy: DM_POLICY.FOLLOWED } }, { ...base, peerId: 'stranger' }),
    false,
  );
  assert.equal(
    allowsIncomingMessage({ privacy: { dmPolicy: DM_POLICY.FOLLOWED } }, { ...base, peerId: 'friend' }),
    true,
  );
  assert.equal(allowsIncomingMessage({ privacy: { dmPolicy: DM_POLICY.NOBODY } }, { ...base, peerId: 'friend' }), false);
  assert.equal(allowsIncomingMessage({ privacy: { dmPolicy: DM_POLICY.NOBODY } }, { ...base, peerId: 'me' }), true);
});

test('defaultPow snaps to an allowed choice', () => {
  assert.equal(defaultPow(setPrivacy(DEFAULT_PREFS, { defaultPow: 20 })), 20);
  assert.equal(defaultPow(setPrivacy(DEFAULT_PREFS, { defaultPow: 17 })), 16);
  assert.ok(LOW_POW_THRESHOLD > 0);
});
