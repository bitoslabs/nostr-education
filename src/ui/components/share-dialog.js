import { el } from '../../core/dom.js';
import { truncateNpub } from '../../domain/identity.js';
import { resolveRecipient } from '../../domain/handle.js';
import { t } from '../../services/i18n/index.js';
import { button, noteBox } from './primitives.js';

const DURATIONS = Object.freeze(['1 day', '7 days', '30 days']);

const DURATION_KEYS = Object.freeze({
  '1 day': 'credentials.share.duration1',
  '7 days': 'credentials.share.duration7',
  '30 days': 'credentials.share.duration30',
});

export function renderShare({ credential, contacts, actions, close }) {
  let resolved = null;
  const needsConfirm = { value: false };

  const confirmWrap = el('label', { class: 'check', hidden: true }, [
    el('input', { type: 'checkbox', onChange: (event) => { createButton.disabled = !event.target.checked; } }),
    el('span', {}, t('credentials.share.confirmRecipient')),
  ]);

  const result = el('div', { class: 'resolve', 'aria-live': 'polite' });
  const createButton = button(t('credentials.share.createGrant'), {
    variant: 'gold',
    disabled: true,
    onClick: () => actions.createGrant(resolved, duration.value, close),
  });

  const duration = el('select', {}, DURATIONS.map((value) =>
    el('option', { value, selected: value === '7 days' }, t(DURATION_KEYS[value])),
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
    placeholder: t('credentials.share.inputPlaceholder'),
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
            t('credentials.share.rawKey'),
            el('strong', {}, t('credentials.share.doubleCheck')),
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
            t('credentials.share.contactVerifiedNote'),
          ]));
          break;
        case 'lookalike':
          needsConfirm.value = true;
          apply(outcome, el('p', { class: 'warnbox' }, [
            '⚠ ',
            el('strong', {}, t('credentials.share.lookalike', { handle: outcome.handle, near: outcome.near })),
            t('credentials.share.lookalikeNote'),
          ]));
          break;
        default:
          needsConfirm.value = false;
          apply(null, el('p', { class: 'small danger' }, t('credentials.share.noHandleMatch')));
      }
    },
  });

  return [
    el('h2', {}, t('credentials.share.title')),
    el('p', { class: 'muted small' }, `${credential.title} · ${credential.issuer.displayName} ✓`),
    el('label', {}, t('credentials.share.recipient')),
    input,
    result,
    confirmWrap,
    el('label', {}, t('credentials.share.accessExpires')),
    duration,
    noteBox(t('credentials.share.revokeNote')),
    el('div', { class: 'dlg-foot' }, [button(t('common.actions.cancel'), { onClick: close }), createButton]),
  ];
}
