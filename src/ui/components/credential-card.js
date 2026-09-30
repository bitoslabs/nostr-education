import { el } from '../../core/dom.js';
import { statusTone } from '../../domain/credential.js';
import { t } from '../../services/i18n/index.js';
import { button, row } from './primitives.js';
import { statusBadge } from './status-badge.js';

export function credentialCard(credential, { grants = [], onShare, onRevoke, onCopyProof, onCopyLink } = {}) {
  return el('article', { class: 'card' }, [
    el('div', { class: 'dhead' }, [
      el('h3', {}, credential.title),
      statusBadge(t('common.credentialStatus.' + credential.status), statusTone(credential.status)),
    ]),
    el(
      'p',
      { class: 'muted small' },
      t('credentials.cardIssuedBy', {
        issuer: credential.issuer?.displayName ?? t('credentials.theAcademy'),
      }),
      el('span', { class: 'mono' }, credential.expiresAt ?? t('credentials.noExpiry')),
    ),
    credential.meta ? el('p', { class: 'muted small' }, credential.meta) : null,
    credential.issuerNpub ? el('p', { class: 'mono small' }, credential.issuerNpub) : null,
    grantsList(grants, onRevoke),
    el('div', { class: 'arow' }, [
      button(t('credentials.shareAccess'), { variant: 'gold', onClick: () => onShare?.(credential) }),
      button(t('credentials.copyProof'), { small: true, onClick: () => onCopyProof?.(credential) }),
      button(t('credentials.copyLink'), { small: true, onClick: () => onCopyLink?.(credential) }),
    ]),
  ]);
}

function grantsList(grants, onRevoke) {
  if (!grants.length) return el('p', { class: 'muted small' }, t('credentials.noGrants'));

  return el('div', {}, [
    el('h3', {}, t('credentials.activeGrants')),
    el(
      'div',
      { class: 'rows' },
      grants.map((grant, index) =>
        row([
          el('span', { class: 'small' }, grant.to),
          el('span', { class: 'muted small' }, `· ${grant.duration}`),
          el('span', { class: 'spacer' }),
          button(t('credentials.revoke'), { small: true, onClick: () => onRevoke?.(index) }),
        ]),
      ),
    ),
  ]);
}
