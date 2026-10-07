import assert from 'node:assert/strict';
import test from 'node:test';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';

import { createActions } from '../src/app/actions.js';
import { createEmitter } from '../src/core/emitter.js';
import { createStore } from '../src/core/store.js';
import {
  ZAP_DIRECTION,
  ZAP_RECEIPT_KIND,
  ZAP_REQUEST_KIND,
} from '../src/domain/wallet.js';

// Real keypairs: ingestZapReceipt verifies the receipt signature before
// settling, so the fixtures must be properly signed events.
const meSk = generateSecretKey();
const me = getPublicKey(meSk);
const peer = getPublicKey(generateSecretKey());
const serverSk = generateSecretKey();

function stubDom() {
  if (globalThis.document) return;
  class FakeNode {
    constructor() {
      this.style = {};
      this.dataset = {};
      this.children = [];
      this.className = '';
    }
    setAttribute() {}
    addEventListener() {}
    append(child) {
      this.children.push(child);
    }
  }
  globalThis.Node = FakeNode;
  globalThis.document = {
    createElement: () => new FakeNode(),
    createTextNode: (text) => ({ textContent: String(text) }),
  };
}

function makeApp() {
  stubDom();
  const store = createStore({
    personaId: me,
    accountId: me,
    zapsByAccount: {},
    socialNotificationsByAccount: {},
    events: [],
    profiles: {},
  });
  const subscriptions = [];
  const actions = createActions({
    store,
    bus: createEmitter(),
    signer: { canSign: () => true },
    confirm: { ask: async () => true },
    relay: {
      subscribe(filters, handlers) {
        subscriptions.push({ filters, handlers });
        return { close() {} };
      },
    },
  });
  return { store, actions, subscriptions };
}

function signedZapRequest() {
  return finalizeEvent(
    {
      kind: ZAP_REQUEST_KIND,
      content: '',
      tags: [
        ['relays', 'wss://relay.example'],
        ['amount', '21000'],
        ['p', peer],
      ],
      created_at: Math.floor(Date.now() / 1000),
    },
    meSk,
  );
}

// A receipt as published by the recipient's LNURL server for a zap the test
// account paid by QR: the account is NOT tagged (`P` is optional and often
// omitted), so the payer can only be recovered from the embedded request.
function signedReceipt({ request, requestId }) {
  return finalizeEvent(
    {
      kind: ZAP_RECEIPT_KIND,
      content: '',
      tags: [
        ['p', peer],
        ['bolt11', 'lnbc1example'],
        ['description', JSON.stringify(request ?? { id: requestId, pubkey: 'f'.repeat(64) })],
      ],
      created_at: Math.floor(Date.now() / 1000),
    },
    serverSk,
  );
}

test('watchZapSettlement subscribes to the peer’s receipts, not only our own tags', () => {
  const { actions, subscriptions } = makeApp();
  actions.watchZapSettlement({ requestId: 'req-1', peerId: peer, amountSats: 21 });
  const { filters } = subscriptions.at(-1);
  const peerFilter = filters.find((filter) => filter['#p']?.[0] === peer);
  assert.ok(peerFilter, `must watch receipts tagging the peer, got ${JSON.stringify(filters)}`);
  assert.deepEqual(peerFilter.kinds, [ZAP_RECEIPT_KIND]);
  assert.ok(typeof peerFilter.since === 'number', 'peer filter must be bounded by since');
});

test('a QR-paid zap settles the dialog when the receipt omits the P sender tag', () => {
  const { actions, subscriptions } = makeApp();
  const request = signedZapRequest();
  const settled = [];
  actions.watchZapSettlement({
    requestId: request.id,
    peerId: peer,
    amountSats: 21,
    onSettled: (zap) => settled.push(zap),
  });

  const { handlers } = subscriptions.at(-1);
  handlers.onEvent(signedReceipt({ request }));
  assert.equal(settled.length, 1, 'receipt without P tag must still settle');
  assert.equal(settled[0].direction, ZAP_DIRECTION.OUT);
  assert.equal(settled[0].peerId, peer);
  assert.equal(settled[0].amountSats, 21);
});

test('another user’s zap to the same peer does not settle our dialog', () => {
  const { actions, subscriptions } = makeApp();
  const request = signedZapRequest();
  const settled = [];
  actions.watchZapSettlement({
    requestId: request.id,
    peerId: peer,
    amountSats: 21,
    onSettled: (zap) => settled.push(zap),
  });

  const { handlers } = subscriptions.at(-1);
  handlers.onEvent(signedReceipt({ requestId: 'someone-else' }));
  assert.equal(settled.length, 0, 'a foreign receipt for the peer must be ignored');
});
