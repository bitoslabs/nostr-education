export const CREDENTIAL_STATUS = Object.freeze({
  ACTIVE: 'active',
  REVOKED: 'revoked',
  SUPERSEDED: 'superseded',
});

const STATUS_COPY = Object.freeze({
  [CREDENTIAL_STATUS.ACTIVE]: 'Active',
  [CREDENTIAL_STATUS.REVOKED]: 'Revoked',
  [CREDENTIAL_STATUS.SUPERSEDED]: 'Superseded',
});

const STATUS_TONE = Object.freeze({
  [CREDENTIAL_STATUS.ACTIVE]: 'ok',
  [CREDENTIAL_STATUS.REVOKED]: 'err',
  [CREDENTIAL_STATUS.SUPERSEDED]: 'muted',
});

export function isUsable(credential) {
  return credential?.status === CREDENTIAL_STATUS.ACTIVE;
}

export function statusLabel(status) {
  return STATUS_COPY[status] ?? status;
}

export function statusTone(status) {
  return STATUS_TONE[status] ?? 'muted';
}

export function privacyLevelLabel(level) {
  return String(level ?? '').toUpperCase();
}

/* ---------- Issuer timeline (owner "Issued by your organization") ---------- */

export const ISSUED_FILTERS = Object.freeze([
  { id: 'all', label: 'All' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'pending', label: 'Pending' },
]);

export function normalizeIssued(credential = {}) {
  const recipient = credential.recipient ?? {};
  return {
    kind: 'issued',
    id: credential.id,
    title: credential.title ?? 'Credential',
    course: credential.course ?? credential.meta ?? '',
    recipientName: recipient.name ?? credential.holderName ?? 'Learner',
    recipientHandle: recipient.handle ?? null,
    recipientPubkey: recipient.pubkey ?? null,
    status: credential.status ?? CREDENTIAL_STATUS.ACTIVE,
    delivery: credential.delivery ?? 'delivered',
    issuedAt: credential.issuedAt ?? null,
    privacyLevel: credential.privacyLevel ?? null,
  };
}

export function normalizeAwaiting(item = {}) {
  return {
    kind: 'awaiting',
    id: item.id,
    signId: item.id,
    title: 'Completion to sign',
    course: item.course ?? '',
    recipientName: item.learnerName ?? 'Learner',
    recipientHandle: null,
    recipientPubkey: null,
    grade: item.grade ?? null,
    time: item.time ?? 'now',
  };
}

export function buildIssuedTimeline(credentials = [], signQueue = []) {
  const awaiting = (signQueue ?? [])
    .filter((item) => item.status === 'pending')
    .map(normalizeAwaiting);
  const issued = (credentials ?? [])
    .map(normalizeIssued)
    .sort((a, b) => (b.issuedAt ?? 0) - (a.issuedAt ?? 0));
  return [...awaiting, ...issued];
}

export function filterIssuedEntries(entries = [], tab = 'all', query = '') {
  const needle = String(query ?? '').trim().toLowerCase();
  const matches = (entry) =>
    !needle ||
    [entry.recipientName, entry.recipientHandle, entry.title, entry.course, entry.id]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle));

  return entries.filter((entry) => {
    if (tab === 'delivered') return entry.kind === 'issued' && entry.delivery === 'delivered';
    if (tab === 'pending') {
      return entry.kind === 'awaiting' || (entry.kind === 'issued' && entry.delivery !== 'delivered');
    }
    return true;
  }).filter(matches);
}

export function issuedFilterCounts(entries = []) {
  return {
    all: entries.length,
    delivered: entries.filter((entry) => entry.kind === 'issued' && entry.delivery === 'delivered').length,
    pending: entries.filter(
      (entry) => entry.kind === 'awaiting' || (entry.kind === 'issued' && entry.delivery !== 'delivered'),
    ).length,
  };
}

export function issuedStats(entries = []) {
  const issued = entries.filter((entry) => entry.kind === 'issued');
  const awaiting = entries.filter((entry) => entry.kind === 'awaiting');
  const learners = new Set(
    issued.map((entry) => entry.recipientHandle || entry.recipientPubkey || entry.recipientName),
  );
  return {
    issued: issued.length,
    delivered: issued.filter((entry) => entry.delivery === 'delivered').length,
    pending: awaiting.length,
    learners: learners.size,
  };
}
