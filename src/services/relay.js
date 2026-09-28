import { SimplePool } from 'nostr-tools/pool';
import { normalizeRelayList, relaysForKind } from '../domain/relay.js';
import { DEFAULT_RELAYS } from './nostr.js';

export const RELAY_STATE = Object.freeze({
  CONNECTED: 'connected',
  CONNECTING: 'connecting',
  OFFLINE: 'offline',
});

const CONNECT_TIMEOUT_MS = 5000;

export function createRelayService({ relays = DEFAULT_RELAYS } = {}) {
  let list = normalizeRelayList(relays, { defaults: DEFAULT_RELAYS });
  const pool = new SimplePool();
  const health = new Map();
  const latency = new Map();
  for (const relay of list) health.set(relay.url, RELAY_STATE.CONNECTING);

  function mark(url, state, latencyMs) {
    health.set(url, state);
    if (typeof latencyMs === 'number') latency.set(url, latencyMs);
  }

  async function publishTo(url, event) {
    const started = Date.now();
    try {
      await Promise.all(pool.publish([url], event));
      mark(url, RELAY_STATE.CONNECTED, Date.now() - started);
      return true;
    } catch {
      mark(url, RELAY_STATE.OFFLINE);
      return false;
    }
  }

  async function publish(event) {
    const targets = relaysForKind(list, 'write');
    const results = await Promise.all(targets.map((url) => publishTo(url, event)));
    const ok = targets.filter((_, index) => results[index]);
    const failed = targets.filter((_, index) => !results[index]);
    return { ok, failed, count: ok.length, total: targets.length };
  }

  function subscribe(filters, { onEvent, onEose, onClose } = {}) {
    const targets = relaysForKind(list, 'read');
    const requests = Array.isArray(filters) ? filters : [filters];
    if (!targets.length) {
      onEose?.();
      return { close() {} };
    }

    // nostr-tools 2.25 expects one Filter object here, not Filter[]. Passing
    // the array produces an invalid nested REQ command. Use one pooled
    // subscription per filter and expose them as a single closer.
    let eoseCount = 0;
    let closeCount = 0;
    const closeReasons = [];
      const subscriptions = requests.map((filter) => pool.subscribeMany(targets, filter, {
        onevent(event) {
          onEvent?.(event);
        },
        oneose() {
          eoseCount += 1;
          if (eoseCount !== requests.length) return;
          onEose?.();
        },
        onclose(reasons) {
          closeCount += 1;
          closeReasons.push(...(reasons ?? []));
          if (closeCount !== requests.length) return;
          onClose?.(closeReasons);
        },
      }));

    return {
      close(reason) {
        for (const subscription of subscriptions) subscription.close(reason);
      },
    };
  }

  async function check(urls) {
    const targets = Array.isArray(urls) && urls.length ? urls : list.map((relay) => relay.url);
    await Promise.all(
      targets.map(async (url) => {
        const started = Date.now();
        try {
          const relay = await pool.ensureRelay(url, { connectionTimeout: CONNECT_TIMEOUT_MS });
          if (relay?.connected === false) throw new Error('not connected');
          mark(url, RELAY_STATE.CONNECTED, Date.now() - started);
        } catch {
          mark(url, RELAY_STATE.OFFLINE);
        }
      }),
    );
    return statuses();
  }

  function setRelays(next) {
    list = normalizeRelayList(next, { defaults: DEFAULT_RELAYS });
    const active = new Set(list.map((relay) => relay.url));
    for (const url of [...health.keys()]) if (!active.has(url)) health.delete(url);
    for (const url of [...latency.keys()]) if (!active.has(url)) latency.delete(url);
    for (const relay of list) {
      if (!health.has(relay.url)) health.set(relay.url, RELAY_STATE.CONNECTING);
    }
    return list;
  }

  function statuses() {
    return list.map((relay) => ({
      id: relay.id,
      url: relay.url,
      mode: relay.mode,
      health: health.get(relay.url) ?? RELAY_STATE.CONNECTING,
      latencyMs: latency.get(relay.url) ?? null,
    }));
  }

  function close() {
    try {
      pool.close(list.map((relay) => relay.url));
    } catch {
      /* pool may already be closed */
    }
  }

  return {
    publish,
    subscribe,
    check,
    setRelays,
    statuses,
    close,
    get config() {
      return list.map((relay) => ({ ...relay }));
    },
    get relays() {
      return list.map((relay) => relay.url);
    },
  };
}
