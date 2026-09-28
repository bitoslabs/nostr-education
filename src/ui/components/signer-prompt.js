import { el } from '../../core/dom.js';
import { icon } from './icon.js';
import { button, spinner } from './primitives.js';

const SETTLE_MS = 900;

export function createSignerPromptHost({ bus, overlay }) {
  bus.on('signer:request', ({ title, action, detail, resolve }) => {
    const footer = el('div', { class: 'dlg-foot' });
    const entry = overlay.open({
      label: 'Signature request',
      onClose: () => resolve({ approved: false }),
      content: [
        el('p', { class: 'signer-app' }, [
          icon('lucide:key', { size: '1em', fallback: '◆' }),
          ' BitOS Education (this app)',
        ]),
        el('h2', {}, title),
        el('p', {}, 'Your signer is asked to approve:'),
        el('div', { class: 'signer-action' }, action),
        detail ? el('p', { class: 'muted small' }, detail) : null,
        el('p', { class: 'keyline' }, 'Your key never leaves your signer. Apps only receive a signature.'),
        footer,
      ],
    });

    footer.append(
      button('Reject', { onClick: () => { resolve({ approved: false }); entry.close(); } }),
      button('Approve once', {
        variant: 'violet',
        onClick: () => {
          footer.replaceChildren(spinner('Waiting for your signer…'));
          setTimeout(() => {
            resolve({ approved: true });
            entry.close();
          }, SETTLE_MS);
        },
      }),
    );
  });
}
