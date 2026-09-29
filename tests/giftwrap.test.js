import assert from 'node:assert/strict';
import test from 'node:test';

import { GIFT_WRAP_KIND, unwrapGiftWrap, wrapForRecipient } from '../src/services/giftwrap.js';
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
