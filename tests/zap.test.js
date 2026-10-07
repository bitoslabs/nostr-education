import assert from 'node:assert/strict';
import test from 'node:test';

import { bech32 } from '@scure/base';
import { ZAP_REQUEST_KIND, zapRequestTags } from '../src/domain/wallet.js';
import { decodeLud06, invoiceRequestUrl, lnurlPayUrl, lud16ToUrl } from '../src/services/lnurl.js';

test('lud16 resolves to an LNURL-pay endpoint', () => {
  assert.equal(lud16ToUrl('alice@example.com'), 'https://example.com/.well-known/lnurlp/alice');
  assert.equal(lud16ToUrl('weird+tag@sub.example.org'), 'https://sub.example.org/.well-known/lnurlp/weird%2Btag');
  assert.equal(lud16ToUrl('nodomain'), null);
  assert.equal(lud16ToUrl('@example.com'), null);
  assert.equal(lud16ToUrl('a@'), null);
});

test('lud06 decodes a bech32 LNURL and both resolve through lnurlPayUrl', () => {
  const url = 'https://example.com/.well-known/lnurlp/bob';
  const lud06 = bech32.encode('lnurl', bech32.toWords(new TextEncoder().encode(url)), 2000);
  assert.equal(decodeLud06(lud06), url);
  assert.equal(lnurlPayUrl({ lud06 }), url);
  assert.equal(lnurlPayUrl({ lud16: 'bob@example.com' }), 'https://example.com/.well-known/lnurlp/bob');
  assert.equal(lnurlPayUrl({}), null);
});

test('invoiceRequestUrl carries the amount and the signed zap request', () => {
  const url = new URL(
    invoiceRequestUrl('https://example.com/cb', { amountMsat: 21000, zapRequest: { kind: 9734, id: 'x' } }),
  );
  assert.equal(url.searchParams.get('amount'), '21000');
  assert.deepEqual(JSON.parse(url.searchParams.get('nostr')), { kind: 9734, id: 'x' });
});

test('zapRequestTags follows NIP-57 (millisats, relays, recipient, lnurl, e)', () => {
  assert.equal(ZAP_REQUEST_KIND, 9734);
  assert.deepEqual(
    zapRequestTags({
      recipient: 'pk',
      eventId: 'note1',
      amountSats: 21,
      relays: ['wss://r1', 'wss://r2'],
      lnurl: 'https://example.com/.well-known/lnurlp/alice',
    }),
    [
      ['relays', 'wss://r1', 'wss://r2'],
      ['amount', '21000'],
      ['p', 'pk'],
      ['lnurl', 'https://example.com/.well-known/lnurlp/alice'],
      ['e', 'note1'],
    ],
  );
});
