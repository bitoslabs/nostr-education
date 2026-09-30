import { el } from '../../core/dom.js';
import { t } from '../../services/i18n/index.js';
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
          el('span', { class: 'signer__app' }, t('common.appName')),
          el('span', { class: 'signer__origin muted small' }, t('settings.signerPrompt.origin', { app: t('common.appName') })),
        ]),
        el(
          'button',
          {
            class: 'signer__close',
            type: 'button',
            'aria-label': t('settings.signerPrompt.close'),
            onClick: () => entry?.close(),
          },
          icon('lucide:x', { size: 18, fallback: '✕' }),
        ),
      ]),
      el('span', { class: 'field-label signer__eyebrow' }, t('settings.signerPrompt.title')),
      el('h2', { class: 'signer__title' }, title),
      el('p', { class: 'signer__lede muted' }, t('settings.signerPrompt.askedApprove')),
      el('div', { class: 'signer-action' }, [
        el('span', { class: 'field-label' }, t('settings.signerPrompt.requestDetails')),
        el('div', { class: 'signer-action__body' }, action),
      ]),
      detail ? el('p', { class: 'muted small' }, detail) : null,
      el('ul', { class: 'signer__facts' }, [
        trustFact('lucide:lock', '🔒', t('settings.signerPrompt.keyNeverLeaves')),
        trustFact('lucide:shield-check', '🛡', t('settings.signerPrompt.appsReceiveSignature')),
      ]),
      footer,
    ];

    entry = overlay.open({
      label: t('settings.signerPrompt.title'),
      onClose: () => resolve({ approved: false }),
      content,
    });

    footer.append(
      button(t('settings.signerPrompt.reject'), { onClick: () => { resolve({ approved: false }); entry.close(); } }),
      button([icon('lucide:check', { size: 18, fallback: '✓' }), t('settings.signerPrompt.approveOnce')], {
        variant: 'gold',
        onClick: () => {
          footer.replaceChildren(
            el('div', { class: 'signer__waiting' }, spinner(t('settings.signerPrompt.waiting'))),
          );
          resolve({ approved: true });
          entry.close();
        },
      }),
    );

    footer.querySelector('button')?.focus();
  });
}
