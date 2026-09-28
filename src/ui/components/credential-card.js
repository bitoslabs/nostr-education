import { el } from '../../core/dom.js';
import { statusLabel, statusTone } from '../../domain/credential.js';
import { button, row } from './primitives.js';
import { statusBadge } from './status-badge.js';

export function credentialCard(credential, { grants = [], onShare, onRevoke, onCopyProof, onCopyLink } = {}) {
  return el('article', { class: 'card' }, [
    el('div', { class: 'dhead' }, [
      el('h3', {}, credential.title),
      statusBadge(statusLabel(credential.status), statusTone(credential.status)),
    ]),
    el(
      'p',
      { class: 'muted small' },
      `Issued by ${credential.issuer?.displayName ?? 'the academy'} ✓ · expires `,
      el('span', { class: 'mono' }, credential.expiresAt ?? 'no expiry'),
    ),
    credential.meta ? el('p', { class: 'muted small' }, credential.meta) : null,
    credential.issuerNpub ? el('p', { class: 'mono small' }, credential.issuerNpub) : null,
    grantsList(grants, onRevoke),
    el('div', { class: 'arow' }, [
      button('Share access…', { variant: 'gold', onClick: () => onShare?.(credential) }),
      button('Copy proof', { small: true, onClick: () => onCopyProof?.(credential) }),
      button('Copy link', { small: true, onClick: () => onCopyLink?.(credential) }),
    ]),
  ]);
}

function grantsList(grants, onRevoke) {
  if (!grants.length) return el('p', { class: 'muted small' }, 'No active grants.');

  return el('div', {}, [
    el('h3', {}, 'Active grants'),
    el(
      'div',
      { class: 'rows' },
      grants.map((grant, index) =>
        row([
          el('span', { class: 'small' }, grant.to),
          el('span', { class: 'muted small' }, `· ${grant.duration}`),
          el('span', { class: 'spacer' }),
          button('Revoke', { small: true, onClick: () => onRevoke?.(index) }),
        ]),
      ),
    ),
  ]);
}
