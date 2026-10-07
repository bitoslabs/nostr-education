import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ZAP_DIRECTION,
  ZAP_RECEIPT_KIND,
  ZAP_STATUS,
  mergeZap,
  mergeZapReceipt,
  upsertZap,
  walletBalance,
  zapFromReceipt,
  zapRequestFromReceipt,
} from '../src/domain/wallet.js';

const ME = 'a'.repeat(64);
const PEER = 'b'.repeat(64);

function receipt({
  recipient = ME,
  sender = PEER,
  msat = 21_000,
  content = 'nice',
  id = 'r1',
  createdAt = 1_700_000_000,
  requestId = null,
  eventId = null,
} = {}) {
  const tags = [
    ['p', recipient],
    ['P', sender],
    ['bolt11', 'lnbc1example'],
    [
      'description',
      JSON.stringify({
        id: requestId,
        pubkey: sender,
        content,
        tags: [['amount', String(msat)]],
      }),
    ],
  ];
  if (eventId) tags.push(['e', eventId]);
  return {
    id,
    kind: ZAP_RECEIPT_KIND,
    pubkey: 'c'.repeat(64),
    created_at: createdAt,
    tags,
    content: '',
  };
}

test('zapFromReceipt maps an incoming receipt', () => {
  const zap = zapFromReceipt(receipt(), ME);
  assert.equal(zap.direction, ZAP_DIRECTION.IN);
  assert.equal(zap.amountSats, 21);
  assert.equal(zap.peerId, PEER);
  assert.equal(zap.note, 'nice');
  assert.equal(zap.status, ZAP_STATUS.SETTLED);
  assert.equal(zap.createdAt, new Date(1_700_000_000 * 1000).toISOString());
});

test('zapFromReceipt maps our own outgoing receipt', () => {
  const zap = zapFromReceipt(receipt({ recipient: PEER, sender: ME, msat: 100_000 }), ME);
  assert.equal(zap.direction, ZAP_DIRECTION.OUT);
  assert.equal(zap.amountSats, 100);
  assert.equal(zap.peerId, PEER);
});

test('zapFromReceipt ignores receipts that do not involve the account', () => {
  const other = receipt({ recipient: 'd'.repeat(64), sender: 'e'.repeat(64) });
  assert.equal(zapFromReceipt(other, ME), null);
});

test('zapFromReceipt rejects a receipt without a usable amount', () => {
  const event = receipt();
  event.tags = event.tags.filter(([name]) => name !== 'description');
  assert.equal(zapFromReceipt(event, ME), null);
});

test('zapFromReceipt falls back to a receipt amount tag', () => {
  const event = receipt();
  event.tags = event.tags.filter(([name]) => name !== 'description');
  event.tags.push(['amount', '5000']);
  assert.equal(zapFromReceipt(event, ME).amountSats, 5);
});

test('zapFromReceipt uses the zap request author when the P tag is absent', () => {
  const event = receipt();
  event.tags = event.tags.filter(([name]) => name !== 'P');
  assert.equal(zapFromReceipt(event, ME).peerId, PEER);
});

test('mergeZap dedupes by receipt id and sorts newest first', () => {
  const older = zapFromReceipt(receipt({ id: 'r1', createdAt: 1_700_000_000 }), ME);
  const newer = zapFromReceipt(receipt({ id: 'r2', createdAt: 1_700_000_500 }), ME);
  const list = mergeZap(mergeZap([], older), newer);
  assert.deepEqual(list.map((zap) => zap.id), ['r2', 'r1']);
  assert.equal(mergeZap(list, newer), list);
  assert.equal(walletBalance(list), 42);
});

test('zapFromReceipt maps our own outgoing receipt when the server omits the P tag', () => {
  const event = receipt({ recipient: PEER, sender: ME, msat: 100_000 });
  event.tags = event.tags.filter(([name]) => name !== 'P');
  const zap = zapFromReceipt(event, ME);
  assert.equal(zap.direction, ZAP_DIRECTION.OUT);
  assert.equal(zap.peerId, PEER);
  assert.equal(zap.amountSats, 100);
});

test('zapFromReceipt carries the request id and zapped note id', () => {
  const event = receipt({ requestId: 'req-1', eventId: 'note-1' });
  const zap = zapFromReceipt(event, ME);
  assert.equal(zap.requestId, 'req-1');
  assert.equal(zap.eventId, 'note-1');
  assert.equal(zapRequestFromReceipt(event).id, 'req-1');
});

test('zapFromReceipt accepts only the requested request id when supplied', () => {
  const event = receipt({ requestId: 'req-1' });
  assert.ok(zapFromReceipt(event, ME, { requestId: 'req-1' }));
  assert.equal(zapFromReceipt(event, ME, { requestId: 'other' }), null);
});

test('mergeZapReceipt evicts the optimistic entry for the same request', () => {
  const optimistic = {
    id: 'zlocal1',
    direction: ZAP_DIRECTION.OUT,
    amountSats: 21,
    status: ZAP_STATUS.SETTLED,
    peerId: PEER,
    note: '',
    createdAt: new Date().toISOString(),
    requestId: 'req-1',
    eventId: null,
  };
  const settled = zapFromReceipt(receipt({ recipient: PEER, sender: ME, requestId: 'req-1', id: 'r9' }), ME);
  const list = mergeZapReceipt([optimistic], settled);
  assert.deepEqual(list.map((zap) => zap.id), ['r9']);
  // A repeated receipt for the same id is a no-op (same reference).
  assert.equal(mergeZapReceipt(list, settled), list);
});

test('upsertZap replaces by id and by request id', () => {
  const first = { id: 'z1', requestId: 'req-1', amountSats: 21, createdAt: '2026-01-01T00:00:00Z' };
  const second = { id: 'z2', requestId: 'req-1', amountSats: 21, createdAt: '2026-01-01T00:00:01Z' };
  assert.deepEqual(upsertZap([first], second).map((zap) => zap.id), ['z2']);
});
