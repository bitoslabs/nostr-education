import { el } from '../../core/dom.js';
import { icon } from './icon.js';
import { button, spinner } from './primitives.js';

function trustFact(iconName, fallback, text) {
  return el('li', { class: 'signer__fact' }, [
    icon(iconName, { size: 15, fallback }),
    el('span', {}, text),
  ]);
}

export function createSignerPromptHost({ bus, overlay }) {
  bus.on('signer:request', ({ title, action, detail, resolve }) => {
    const footer = el('div', { class: 'dlg-foot' });
    let entry = null;

    const content = [
      el('div', { class: 'signer__head' }, [
        el(
          'span',
          { class: 'hex-plate signer__ico' },
          icon('lucide:key-round', { size: 20, fallback: '🔑' }),
        ),
        el('span', { class: 'signer__id' }, [
          el('span', { class: 'signer__app' }, 'BitOS Education'),
          el('span', { class: 'signer__origin muted small' }, 'your signer · BitOS Education'),
        ]),
        el(
          'button',
          {
            class: 'signer__close',
            type: 'button',
            'aria-label': 'Close signature request',
            onClick: () => entry?.close(),
          },
          icon('lucide:x', { size: 18, fallback: '✕' }),
        ),
      ]),
      el('span', { class: 'field-label signer__eyebrow' }, 'Signature request'),
      el('h2', { class: 'signer__title' }, title),
      el('p', { class: 'signer__lede muted' }, 'Your signer is asked to approve:'),
      el('div', { class: 'signer-action' }, [
        el('span', { class: 'field-label' }, 'Request details'),
        el('div', { class: 'signer-action__body' }, action),
      ]),
      detail ? el('p', { class: 'muted small' }, detail) : null,
      el('ul', { class: 'signer__facts' }, [
        trustFact('lucide:lock', '🔒', 'Your key never leaves your signer.'),
        trustFact('lucide:shield-check', '🛡', 'Apps receive a signature, never your key.'),
      ]),
      footer,
    ];

    entry = overlay.open({
      label: 'Signature request',
      onClose: () => resolve({ approved: false }),
      content,
    });

    footer.append(
      button('Reject', { onClick: () => { resolve({ approved: false }); entry.close(); } }),
      button([icon('lucide:check', { size: 18, fallback: '✓' }), 'Approve once'], {
        variant: 'gold',
        onClick: () => {
          footer.replaceChildren(
            el('div', { class: 'signer__waiting' }, spinner('Waiting for your signer…')),
          );
          resolve({ approved: true });
          entry.close();
        },
      }),
    );

    footer.querySelector('button')?.focus();
  });
}
