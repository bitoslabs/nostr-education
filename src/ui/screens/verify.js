import { el } from '../../core/dom.js';
import {
  credentialFromProof,
  statusLabel,
  statusTone,
  verifyCredential,
} from '../../domain/credential.js';
import { verify } from '../../services/nostr.js';
import { identityChip } from '../components/identity-chip.js';
import { button, noteBox, pageTitle, row } from '../components/primitives.js';
import { statusBadge } from '../components/status-badge.js';

export function renderVerify({ store, app }) {
  const result = el('div', { class: 'verify__result', 'aria-live': 'polite' });
  const input = el('textarea', {
    rows: '4',
    placeholder: 'Paste a credential id or a shared credential proof (JSON)',
    'aria-label': 'Credential id or proof',
  });

  function run() {
    const query = input.value.trim();
    result.replaceChildren();
    if (!query) return;

    const local = store.getState().credentials.find((entry) => entry.id === query);
    const pasted = local ? null : credentialFromProof(query);
    const credential = local ?? pasted;
    if (!credential) {
      result.append(
        noteBox('No credential matched that id, and this is not a valid proof. Paste the id or the shared proof (JSON).', 'warn'),
      );
      return;
    }

    const check = verifyCredential(credential, verify);
    result.append(
      el('div', { class: 'card' }, [
        el('h3', {}, credential.title),
        row([
          statusBadge(statusLabel(credential.status), statusTone(credential.status)),
          statusBadge(check.valid ? '✓ signature valid' : '⚠ signature not verified', check.valid ? 'ok' : 'warn'),
          el('span', { class: 'spacer' }),
        ]),
        el('p', { class: 'muted small' }, check.reason),
        credential.course ? el('p', { class: 'muted small' }, credential.course) : null,
        el('p', { class: 'muted small' }, 'Issuer'),
        credential.issuer ? identityChip(credential.issuer) : null,
        credential.issuerPubkey || credential.issuerNpub
          ? el('p', { class: 'mono small' }, credential.issuerNpub ?? credential.issuerPubkey)
          : null,
        pasted ? el('p', { class: 'muted small' }, 'Checked from a shared proof — status is not included in the proof.') : null,
        noteBox('A valid signature alone is not endorsement. Check status and freshness.'),
      ]),
    );
  }

  return el('section', { class: 'screen' }, [
    pageTitle('Verify'),
    el('p', { class: 'muted' }, 'Inspect a credential before making a trust decision.'),
    el('div', { class: 'verify__form' }, [
      input,
      button('Check', { variant: 'gold', onClick: run }),
    ]),
    result,
    button('Back to credentials', { variant: 'ghost', small: true, onClick: () => app.navigate('/credentials') }),
  ]);
}
