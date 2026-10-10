import assert from 'node:assert/strict';
import test from 'node:test';

import { EOSE_MODE, PRIMARY_FALLBACK_MS, createRelayService } from '../src/services/relay.js';

const { mock } = test;

// A stand-in for nostr-tools' SimplePool that records every subscribeMany
// batch and lets each test drive oneose/onclose by hand.
function fakePool() {
  const batches = [];
  return {
    batches,
    closed: [],
    subscribeMany(targets, filter, params) {
      const batch = { targets: [...targets], filter, params, closed: false };
      batches.push(batch);
      return {
        close(reason) {
          batch.closed = true;
          batch.reason = reason;
        },
      };
    },
    close(urls) {
      this.closed.push(urls);
    },
    ensureRelay: async () => {
      throw new Error('offline');
    },
  };
}

function service(relays) {
  const pool = fakePool();
  const svc = createRelayService({ relays, createPool: () => pool });
  return { svc, pool };
}

test('subscribe queries the primary relay first and fires onEose when it answers', () => {
  const { svc, pool } = service(['wss://a.example', 'wss://b.example', 'wss://c.example']);
  const events = [];
  let eose = 0;
  const sub = svc.subscribe([{ kinds: [78] }], {
    onEvent: (event) => events.push(event),
    onEose: () => {
      eose += 1;
    },
  });

  // Only the primary is queried until it answers.
  assert.equal(pool.batches.length, 1);
  assert.deepEqual(pool.batches[0].targets, ['wss://a.example']);

  pool.batches[0].params.onevent({ id: 'e1' });
  assert.deepEqual(events, [{ id: 'e1' }]);

  pool.batches[0].params.oneose();
  assert.equal(eose, 1);
  // The primary answered, so the remaining relays join for the background merge.
  assert.equal(pool.batches.length, 2);
  assert.deepEqual(pool.batches[1].targets, ['wss://b.example', 'wss://c.example']);

  // A second EOSE from the primary batch must not re-fire onEose.
  pool.batches[0].params.oneose();
  assert.equal(eose, 1);

  sub.close();
});

test('subscribe falls back to the remaining relays when the primary stays silent', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { svc, pool } = service(['wss://a.example', 'wss://b.example']);
    const sub = svc.subscribe([{ kinds: [78] }], { onEose() {} });

    mock.timers.tick(PRIMARY_FALLBACK_MS);
    assert.equal(pool.batches.length, 2);
    assert.deepEqual(pool.batches[1].targets, ['wss://b.example']);
    sub.close();
  } finally {
    mock.timers.reset();
  }
});

test('eose all waits for every relay before firing onEose', () => {
  const { svc, pool } = service(['wss://a.example', 'wss://b.example']);
  let eose = 0;
  const sub = svc.subscribe([{ kinds: [78] }, { kinds: [30078] }], {
    eose: EOSE_MODE.ALL,
    onEose: () => {
      eose += 1;
    },
  });

  // Two filters over the primary = two subscriptions that must both answer.
  assert.equal(pool.batches.length, 2);
  pool.batches[0].params.oneose();
  pool.batches[1].params.oneose();
  assert.equal(eose, 0);
  assert.equal(pool.batches.length, 4); // the rest batch started

  pool.batches[2].params.oneose();
  assert.equal(eose, 0);
  pool.batches[3].params.oneose();
  assert.equal(eose, 1);
  sub.close();
});

test('close stops events, the fallback timer, and every pooled subscription', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { svc, pool } = service(['wss://a.example', 'wss://b.example']);
    const events = [];
    const sub = svc.subscribe([{ kinds: [78] }], {
      onEvent: (event) => events.push(event),
      onEose() {},
    });

    sub.close('done');
    pool.batches[0].params.onevent({ id: 'late' });
    assert.deepEqual(events, []);

    mock.timers.tick(PRIMARY_FALLBACK_MS + 100);
    assert.equal(pool.batches.length, 1); // the fallback never started the rest
  } finally {
    mock.timers.reset();
  }
});

test('reconnect drops the pooled sockets and marks every relay connecting', () => {
  const { svc, pool } = service(['wss://a.example', 'wss://b.example']);
  const statuses = svc.reconnect();
  assert.deepEqual(pool.closed, [['wss://a.example', 'wss://b.example']]);
  assert.ok(statuses.every((relay) => relay.health === 'connecting'));
  assert.equal(statuses[0].primary, true);
  assert.equal(statuses[1].primary, false);
});

test('statuses flags the first relay as primary', () => {
  const { svc } = service(['wss://a.example', 'wss://b.example']);
  const statuses = svc.statuses();
  assert.deepEqual(statuses.map((relay) => relay.primary), [true, false]);
});
