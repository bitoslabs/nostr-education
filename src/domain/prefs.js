// Local user preferences that are not protocol records: privacy, zap, and
// network tuning. Persisted with the rest of app state (services/storage.js) and
// read from the reactive store, so a change re-renders every observer.
//
// Nothing here is an authorization decision. A preference can shape what this
// client shows or asks relays for, but it never grants or removes a capability.

export const DM_POLICY = Object.freeze({
  EVERYONE: 'everyone',
  FOLLOWED: 'followed',
  NOBODY: 'nobody',
});

export const DM_POLICIES = Object.freeze([DM_POLICY.EVERYONE, DM_POLICY.FOLLOWED, DM_POLICY.NOBODY]);

// In-browser mining is CPU-bound; keep the ceiling aligned with pow-control.js.
export const POW_CHOICES = Object.freeze([0, 8, 16, 20]);
// Notes below this many bits are considered low-effort when "refuse low-PoW" is
// on. Matches the docs copy ("Hide incoming notes below 8 bits").
export const LOW_POW_THRESHOLD = 8;

export const ZAP_AMOUNT_DEFAULTS = Object.freeze([21, 100, 500, 1000]);
export const ZAP_AMOUNT_COUNT = 4;
export const ZAP_AMOUNT_MIN = 1;
export const ZAP_AMOUNT_MAX = 1_000_000;

export const CONNECTION_CHOICES = Object.freeze([4, 8, 16, 32]);

// Relay event kinds the client subscribes to, mapped to a human label key.
export const SUBSCRIPTION_KINDS = Object.freeze([
  { kind: 1, labelKey: 'settings.network.kindNote' },
  { kind: 3, labelKey: 'settings.network.kindFollow' },
  { kind: 7, labelKey: 'settings.network.kindReaction' },
  { kind: 6, labelKey: 'settings.network.kindRepost' },
  { kind: 9735, labelKey: 'settings.network.kindZap' },
  { kind: 1059, labelKey: 'settings.network.kindDm' },
]);

export const DEFAULT_PREFS = Object.freeze({
  privacy: Object.freeze({
    dmPolicy: DM_POLICY.EVERYONE,
    defaultPow: 0,
    refuseLowPow: false,
  }),
  zap: Object.freeze({
    amounts: ZAP_AMOUNT_DEFAULTS,
    nonZapReactions: true,
    anonymousZaps: false,
    autoZapFollow: false,
  }),
  network: Object.freeze({
    maxConnections: 8,
    subscriptions: Object.freeze({ 1: true, 6: true, 7: true, 1059: true, 9735: true }),
  }),
});

function clampPow(value) {
  const bits = Math.round(Number(value));
  if (!Number.isFinite(bits)) return 0;
  if (POW_CHOICES.includes(bits)) return bits;
  // Snap to the nearest allowed step so a stale value from an older build still
  // renders sensibly.
  return POW_CHOICES.reduce((best, choice) =>
    Math.abs(choice - bits) < Math.abs(best - bits) ? choice : best,
  );
}

function normalizeAmounts(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const cleaned = list
    .map((value) => Math.round(Number(value)))
    .filter((value) => Number.isFinite(value) && value >= ZAP_AMOUNT_MIN && value <= ZAP_AMOUNT_MAX);
  if (cleaned.length >= ZAP_AMOUNT_COUNT) return cleaned.slice(0, ZAP_AMOUNT_COUNT);
  const fill = ZAP_AMOUNT_DEFAULTS.filter((value) => !cleaned.includes(value));
  return [...cleaned, ...fill].slice(0, ZAP_AMOUNT_COUNT);
}

function normalizeSubscriptions(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const next = {};
  for (const { kind } of SUBSCRIPTION_KINDS) {
    next[kind] = source[kind] === undefined ? true : Boolean(source[kind]);
  }
  return next;
}

export function normalizePrefs(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const privacy = source.privacy && typeof source.privacy === 'object' ? source.privacy : {};
  const zap = source.zap && typeof source.zap === 'object' ? source.zap : {};
  const network = source.network && typeof source.network === 'object' ? source.network : {};
  return {
    privacy: {
      dmPolicy: DM_POLICIES.includes(privacy.dmPolicy) ? privacy.dmPolicy : DM_POLICY.EVERYONE,
      defaultPow: clampPow(privacy.defaultPow),
      refuseLowPow: Boolean(privacy.refuseLowPow),
    },
    zap: {
      amounts: normalizeAmounts(zap.amounts),
      nonZapReactions: zap.nonZapReactions === undefined ? true : Boolean(zap.nonZapReactions),
      anonymousZaps: Boolean(zap.anonymousZaps),
      autoZapFollow: Boolean(zap.autoZapFollow),
    },
    network: {
      maxConnections: CONNECTION_CHOICES.includes(Number(network.maxConnections))
        ? Number(network.maxConnections)
        : DEFAULT_PREFS.network.maxConnections,
      subscriptions: normalizeSubscriptions(network.subscriptions),
    },
  };
}

export function setPrivacy(prefs, patch = {}) {
  return normalizePrefs({ ...prefs, privacy: { ...prefs?.privacy, ...patch } });
}

export function setZap(prefs, patch = {}) {
  return normalizePrefs({ ...prefs, zap: { ...prefs?.zap, ...patch } });
}

export function setNetwork(prefs, patch = {}) {
  return normalizePrefs({ ...prefs, network: { ...prefs?.network, ...patch } });
}

export function setSubscription(prefs, kind, enabled) {
  const key = String(kind);
  return setNetwork(prefs, { subscriptions: { ...prefs?.network?.subscriptions, [key]: Boolean(enabled) } });
}

// Whether a kind is currently subscribed, defaulting to on for an unknown kind
// (a new feature must not silently stop fetching because prefs are older).
export function subscriptionEnabled(prefs, kind) {
  const value = prefs?.network?.subscriptions?.[kind];
  return value === undefined ? true : Boolean(value);
}

export function zapAmounts(prefs) {
  return prefs?.zap?.amounts ?? ZAP_AMOUNT_DEFAULTS;
}

export function defaultPow(prefs) {
  return clampPow(prefs?.privacy?.defaultPow);
}

// A DM is accepted only when the peer clears the current policy. `following` is
// the viewer's follow list (actor ids). Self-messages are always allowed so a
// user can keep notes to themselves.
export function allowsIncomingMessage(prefs, { peerId, selfId, following = [] } = {}) {
  if (!peerId) return false;
  if (peerId === selfId) return true;
  const policy = prefs?.privacy?.dmPolicy ?? DM_POLICY.EVERYONE;
  if (policy === DM_POLICY.NOBODY) return false;
  if (policy === DM_POLICY.FOLLOWED) return following.includes(peerId);
  return true;
}
