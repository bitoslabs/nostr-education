import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GIFT_WRAP_KIND,
  RECORD_RUMOR_KIND,
  RUMOR_KIND,
  unwrapGiftWrap,
  wrapForRecipient,
} from '../src/services/giftwrap.js';
import { generateKeyPair, localSigner } from '../src/services/nostr.js';

test('gift wrap hides the author and round-trips the content', async () => {
  const sender = generateKeyPair();
  const recipient = generateKeyPair();
  const senderSigner = localSigner(sender.secretKey);
  const recipientSigner = localSigner(recipient.secretKey);

  const wrap = await wrapForRecipient({
    content: '{"hello":"world"}',
    recipient: recipient.pubkey,
    signer: senderSigner,
    now: 1_800_000_000,
  });

  assert.equal(wrap.kind, GIFT_WRAP_KIND);
  assert.deepEqual(wrap.tags, [['p', recipient.pubkey]]);
  assert.notEqual(wrap.pubkey, sender.pubkey);

  const unwrapped = await unwrapGiftWrap({ wrap, signer: recipientSigner });
  assert.equal(unwrapped.author, sender.pubkey);
  assert.equal(unwrapped.content, '{"hello":"world"}');
});

test('a rumor carries its kind, tags, and the real (non-randomized) timestamp', async () => {
  const sender = generateKeyPair();
  const recipient = generateKeyPair();
  const now = 1_800_000_000;
  const wrap = await wrapForRecipient({
    content: 'hello',
    recipient: recipient.pubkey,
    signer: localSigner(sender.secretKey),
    tags: [
      ['p', recipient.pubkey],
      ['client', 'm1'],
    ],
    now,
  });
  const unwrapped = await unwrapGiftWrap({ wrap, signer: localSigner(recipient.secretKey) });
  assert.equal(unwrapped.kind, RUMOR_KIND);
  assert.deepEqual(unwrapped.tags, [['p', recipient.pubkey], ['client', 'm1']]);
  assert.equal(unwrapped.createdAt, now);
  // Only the rumor keeps the true time; the outer wrap is backdated.
  assert.ok(wrap.created_at <= now);
});

test('records travel under a distinct rumor kind so they cannot be read as chat', async () => {
  const sender = generateKeyPair();
  const recipient = generateKeyPair();
  const wrap = await wrapForRecipient({
    content: '{"type":"academy","id":"x"}',
    recipient: recipient.pubkey,
    signer: localSigner(sender.secretKey),
    kind: RECORD_RUMOR_KIND,
    now: 1_800_000_000,
  });
  const unwrapped = await unwrapGiftWrap({ wrap, signer: localSigner(recipient.secretKey) });
  assert.equal(unwrapped.kind, RECORD_RUMOR_KIND);
  assert.notEqual(unwrapped.kind, RUMOR_KIND);
});

test('only the addressed recipient can unwrap', async () => {
  const sender = generateKeyPair();
  const recipient = generateKeyPair();
  const wrap = await wrapForRecipient({
    content: 'secret',
    recipient: recipient.pubkey,
    signer: localSigner(sender.secretKey),
    now: 1_800_000_000,
  });
  const stranger = localSigner(generateKeyPair().secretKey);
  assert.equal(await unwrapGiftWrap({ wrap, signer: stranger }), null);
});

test('wrapForRecipient needs content, a recipient, and a capable signer', async () => {
  const sender = generateKeyPair();
  assert.equal(await wrapForRecipient({ content: '', recipient: 'abc', signer: localSigner(sender.secretKey) }), null);
  assert.equal(await wrapForRecipient({ content: 'x', recipient: 'abc', signer: null }), null);
  assert.equal(await unwrapGiftWrap({ wrap: null, signer: null }), null);
});
