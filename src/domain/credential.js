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

/* ---------- Verifiable credential payload ---------- */

export function credentialPayload({
  academyName,
  academyPubkey,
  academyNip05 = null,
  holderName,
  course,
  average = null,
  policyVersion = null,
  issuedAt = null,
} = {}) {
  return {
    v: 1,
    title: `${academyName ?? 'Academy'} Certificate`,
    course: course ?? '',
    holder: holderName ?? '',
    average,
    policyVersion,
    issuer: academyPubkey ?? null,
    issuerNip05: academyNip05,
    issuedAt,
  };
}

export function credentialProofContent(payload) {
  return JSON.stringify(payload);
}

export function verifyCredential(credential, verifyFn) {
  const proof = credential?.proof;
  if (!proof?.sig) return { valid: false, reason: 'No signature on this credential.' };
  if (typeof verifyFn !== 'function' || !verifyFn(proof)) {
    return { valid: false, reason: 'The signature does not verify.' };
  }
  if (credential.issuerPubkey && proof.pubkey !== credential.issuerPubkey) {
    return { valid: false, reason: 'The signing key does not match the issuer.' };
  }
  if (proof.content !== credentialProofContent(credential.payload)) {
    return { valid: false, reason: 'The signed payload does not match this credential.' };
  }
  return { valid: true, reason: 'Signature verified against the issuer key.' };
}

export function credentialProofText(credential) {
  return JSON.stringify({
    id: credential.id,
    title: credential.title,
    course: credential.course ?? null,
    issuedAt: credential.issuedAt ?? null,
    issuer: credential.issuerPubkey ?? null,
    payload: credential.payload ?? null,
    proof: credential.proof ?? null,
  });
}

export function credentialFromProof(text) {
  try {
    const data = JSON.parse(text);
    const proof = data?.proof;
    const payload = data?.payload;
    if (!proof?.sig || !payload) return null;
    return {
      id: data.id ?? proof.id ?? null,
      title: data.title ?? payload.title ?? 'Credential',
      course: data.course ?? payload.course ?? null,
      issuedAt: data.issuedAt ?? payload.issuedAt ?? null,
      issuerPubkey: data.issuer ?? proof.pubkey ?? null,
      issuerNpub: null,
      issuer: null,
      payload,
      proof,
      status: CREDENTIAL_STATUS.ACTIVE,
    };
  } catch {
    return null;
  }
}

export function revocationPayload({ credentialId, issuer, revokedAt } = {}) {
  return { v: 1, credentialId, issuer: issuer ?? null, status: 'revoked', revokedAt: revokedAt ?? null };
}

export function encodeProofFragment(text) {
  try {
    const bytes = new TextEncoder().encode(String(text));
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch {
    return null;
  }
}

export function decodeProofFragment(fragment) {
  try {
    const normalized = String(fragment).replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(normalized);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

export function credentialFromEvent(event) {
  if (!event?.sig) return null;
  let payload;
  try {
    payload = JSON.parse(event.content ?? '{}');
  } catch {
    return null;
  }
  const d = (event.tags ?? []).find((tag) => tag[0] === 'd')?.[1] ?? null;
  if (payload.status === CREDENTIAL_STATUS.REVOKED) {
    return {
      kind: 'status',
      id: payload.credentialId ?? d,
      status: CREDENTIAL_STATUS.REVOKED,
      proof: event,
    };
  }
  if (!payload.title || !d) return null;
  return {
    kind: 'credential',
    credential: {
      id: d,
      title: payload.title,
      issuer: null,
      issuerPubkey: event.pubkey,
      issuerNpub: null,
      status: CREDENTIAL_STATUS.ACTIVE,
      privacyLevel: 'L1',
      expiresAt: null,
      meta: payload.course ? `${payload.course} completion` : 'Course completion',
      recipient: { name: payload.holder ?? 'Learner', handle: null, pubkey: null },
      course: payload.course || null,
      payload,
      proof: event,
      issuedAt: payload.issuedAt ?? null,
      delivery: 'delivered',
    },
  };
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
