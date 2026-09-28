import { el } from '../../core/dom.js';
import { truncateNpub } from '../../domain/identity.js';
import { resolveRecipient } from '../../domain/handle.js';
import { button, noteBox } from './primitives.js';

const DURATIONS = Object.freeze(['1 day', '7 days', '30 days']);

export function renderShare({ credential, contacts, actions, close }) {
  let resolved = null;
  const needsConfirm = { value: false };

  const confirmWrap = el('label', { class: 'check', hidden: true }, [
    el('input', { type: 'checkbox', onChange: (event) => { createButton.disabled = !event.target.checked; } }),
    el('span', {}, 'I checked this recipient — this is who I mean.'),
  ]);

  const result = el('div', { class: 'resolve', 'aria-live': 'polite' });
  const createButton = button('Create grant', {
    variant: 'gold',
    disabled: true,
    onClick: () => actions.createGrant(resolved, duration.value, close),
  });

  const duration = el('select', {}, DURATIONS.map((value) =>
    el('option', { value, selected: value === '7 days' }, value),
  ));

  function apply(next, node) {
    resolved = next;
    result.replaceChildren(...(Array.isArray(node) ? node : [node]));
    confirmWrap.hidden = !needsConfirm.value;
    confirmWrap.querySelector('input').checked = false;
    createButton.disabled = !next || needsConfirm.value;
  }

  const input = el('input', {
    type: 'text',
    placeholder: '@handle or npub1…',
    autocomplete: 'off',
    spellcheck: 'false',
    onInput: (event) => {
      const outcome = resolveRecipient(event.target.value, contacts, { truncate: truncateNpub });
      switch (outcome.kind) {
        case 'empty':
          apply(null, '');
          break;
        case 'npub':
          needsConfirm.value = true;
          apply(outcome, el('p', { class: 'small' }, [
            'Raw key — no verified handle. ',
            el('strong', {}, 'Double-check it belongs to the right person.'),
          ]));
          break;
        case 'known':
          needsConfirm.value = false;
          apply(outcome, el('p', { class: 'small' }, [
            el('strong', {}, outcome.contact.name),
            outcome.contact.verified ? el('span', { class: 'vmark' }, ' ✓') : null,
            ' · ',
            el('span', { class: 'mono' }, `@${outcome.handle}`),
            el('br'),
            'A verified handle proves control of the key — not an endorsement.',
          ]));
          break;
        case 'lookalike':
          needsConfirm.value = true;
          apply(outcome, el('p', { class: 'warnbox' }, [
            '⚠ ',
            el('strong', {}, `@${outcome.handle} is not @${outcome.near}`),
            ' — different identities with similar-looking handles. Compare full keys or scan a QR from the person directly.',
          ]));
          break;
        default:
          needsConfirm.value = false;
          apply(null, el('p', { class: 'small danger' }, '✕ No verified handle found. Check the spelling or paste their npub.'));
      }
    },
  });

  return [
    el('h2', {}, 'Share access'),
    el('p', { class: 'muted small' }, `${credential.title} · ${credential.issuer.displayName} ✓`),
    el('label', {}, 'Recipient'),
    input,
    result,
    confirmWrap,
    el('label', {}, 'Access expires'),
    duration,
    noteBox('Recipients receive the whole credential in this prototype. You can revoke access anytime — already-downloaded copies cannot be recalled.'),
    el('div', { class: 'dlg-foot' }, [button('Cancel', { onClick: close }), createButton]),
  ];
}
