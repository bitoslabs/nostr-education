import { el } from '../../core/dom.js';
import { statusLabel, statusTone } from '../../domain/credential.js';
import { identityChip } from '../components/identity-chip.js';
import { button, noteBox, pageTitle, row } from '../components/primitives.js';
import { statusBadge } from '../components/status-badge.js';

export function renderVerify({ store, app }) {
  const result = el('div', { class: 'verify__result', 'aria-live': 'polite' });
  const input = el('input', {
    type: 'search',
    placeholder: 'Credential id, e.g. cred-cs-bsc',
    'aria-label': 'Credential id',
  });

  function run() {
    const query = input.value.trim();
    result.replaceChildren();
    if (!query) return;

    const credential = store.getState().credentials.find((entry) => entry.id === query);
    if (!credential) {
      result.append(noteBox('No credential matched that id.', 'warn'));
      return;
    }

    result.append(
      el('div', { class: 'card' }, [
        el('h3', {}, credential.title),
        row([
          statusBadge(statusLabel(credential.status), statusTone(credential.status)),
          el('span', { class: 'spacer' }),
        ]),
        el('p', { class: 'muted small' }, 'Issuer'),
        identityChip(credential.issuer),
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
