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
