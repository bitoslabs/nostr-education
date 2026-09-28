import { DELIVERY_STATE } from '../domain/delivery.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createRelayService({ latencyMs = 1200 } = {}) {
  async function publish() {
    await wait(latencyMs);
    return { state: DELIVERY_STATE.DELIVERED, relays: 2 };
  }

  async function retry() {
    await wait(latencyMs);
    return { state: DELIVERY_STATE.DELIVERED, relays: 2 };
  }

  return { publish, retry };
}
