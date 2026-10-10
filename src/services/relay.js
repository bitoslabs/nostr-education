import { SimplePool } from 'nostr-tools/pool';
import { normalizeRelayList, relaysForKind } from '../domain/relay.js';
import { DEFAULT_RELAYS } from './nostr.js';

export const RELAY_STATE = Object.freeze({
  CONNECTED: 'connected',
  CONNECTING: 'connecting',
  OFFLINE: 'offline',
});

export const EOSE_MODE = Object.freeze({
  // onEose fires as soon as the primary relay answered. Fast for painting,
  // while the remaining relays keep merging events in the background.
  PRIMARY: 'primary',
  // onEose fires only after every relay answered (or timed out). Use this when
  // a caller concludes "nothing found" from EOSE, so a slow relay's records are
  // not missed.
  ALL: 'all',
});

const CONNECT_TIMEOUT_MS = 5000;
// The primary relay is queried first; the remaining relays join only after it
// answered or after this delay. One slow relay can never stall the first page
// of data, and startup spreads its REQs instead of firing them all at once.
export const PRIMARY_FALLBACK_MS = 2500;
// nostr-tools closes a subscription whose EOSE is late by this much. Without
// it, a relay that accepted the connection but never answers keeps the pooled
// EOSE from ever firing, so a fetch hangs until its outer timeout.
const DEFAULT_MAX_WAIT_MS = 10000;

export function createRelayService({ relays = DEFAULT_RELAYS, createPool = () => new SimplePool() } = {}) {
  let list = normalizeRelayList(relays, { defaults: DEFAULT_RELAYS });
  const pool = createPool();
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

  function subscribe(
    filters,
    { onEvent, onEose, onClose, eose = EOSE_MODE.PRIMARY, maxWaitMs = DEFAULT_MAX_WAIT_MS } = {},
  ) {
    const targets = relaysForKind(list, 'read');
    const requests = Array.isArray(filters) ? filters : [filters];
    if (!targets.length) {
      onEose?.();
      return { close() {} };
    }

    // nostr-tools 2.25 expects one Filter object here, not Filter[]. Passing
    // the array produces an invalid nested REQ command. Use one pooled
    // subscription per filter and expose them as a single closer.
    //
    // Read order is primary-first: the primary relay (first read relay) gets
    // the query immediately, the rest join once it answered (or after
    // PRIMARY_FALLBACK_MS) so events from every configured relay still merge.
    const primaryTargets = [targets[0]];
    const restTargets = targets.slice(1);
    const batchCount = restTargets.length ? 2 : 1;
    const expectedEose = requests.length * batchCount;
    let closed = false;
    let restStarted = !restTargets.length;
    let primaryEose = 0;
    let restEose = 0;
    let eoseFired = false;
    let closeFired = false;
    const subscriptions = [];
    const live = new Set();
    const closeReasons = [];
    let fallbackTimer = null;

    function fireEose() {
      if (eoseFired || closed) return;
      eoseFired = true;
      onEose?.();
    }

    function startRest() {
      if (restStarted || closed) return;
      restStarted = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      subscribeBatch(restTargets, true);
    }

    function subscribeBatch(targets, isRest) {
      for (const filter of requests) {
        const handle = { sub: null, isRest };
        live.add(handle);
        handle.sub = pool.subscribeMany(targets, filter, {
          maxWait: maxWaitMs,
          onevent(event) {
            if (!closed) onEvent?.(event);
          },
          oneose() {
            if (isRest) restEose += 1;
            else primaryEose += 1;
            if (primaryEose === requests.length) {
              if (eose === EOSE_MODE.PRIMARY) fireEose();
              // The primary answered; bring in the remaining relays so their
              // events still arrive (background merge).
              startRest();
            }
            if (eose === EOSE_MODE.ALL && primaryEose + restEose === expectedEose) fireEose();
          },
          onclose(reasons) {
            if (reasons?.length) closeReasons.push(...reasons);
            live.delete(handle);
            if (!closed && live.size === 0 && restStarted && !closeFired) {
              closeFired = true;
              onClose?.(closeReasons);
            }
          },
        });
        subscriptions.push(handle.sub);
      }
    }

    subscribeBatch(primaryTargets, false);
    if (restTargets.length) fallbackTimer = setTimeout(startRest, PRIMARY_FALLBACK_MS);

    return {
      close(reason) {
        if (closed) return;
        closed = true;
        if (fallbackTimer) clearTimeout(fallbackTimer);
        for (const handle of [...live]) {
          live.delete(handle);
          try {
            handle.sub?.close(reason);
          } catch {
            /* the subscription may already be closed */
          }
        }
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

  // Safari (and mobile browsers generally) can suspend a background tab and
  // leave its WebSockets half-open: the page still looks online but no relay
  // event is ever delivered again. Closing the pooled connections drops those
  // zombie sockets; the next subscription reconnects on fresh ones.
  function reconnect() {
    let urls = [];
    try {
      urls = list.map((relay) => relay.url);
      pool.close(urls);
    } catch {
      /* pool may already be closed */
    }
    for (const url of urls) {
      health.set(url, RELAY_STATE.CONNECTING);
      latency.delete(url);
    }
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
    return list.map((relay, index) => ({
      id: relay.id,
      url: relay.url,
      mode: relay.mode,
      health: health.get(relay.url) ?? RELAY_STATE.CONNECTING,
      latencyMs: latency.get(relay.url) ?? null,
      primary: index === 0,
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
    reconnect,
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
