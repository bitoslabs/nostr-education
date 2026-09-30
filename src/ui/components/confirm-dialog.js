import { el } from '../../core/dom.js';
import { t } from '../../services/i18n/index.js';
import { button } from './primitives.js';

export function createConfirmHost({ bus, overlay }) {
  bus.on('confirm:request', ({ title, body, confirmLabel = t('common.actions.confirm'), resolve }) => {
    const entry = overlay.open({
      label: title,
      onClose: () => resolve(false),
      content: [
        el('h2', {}, title),
        el('div', { class: 'confirm__body' }, Array.isArray(body) ? body : [body]),
        el('div', { class: 'dlg-foot' }, [
          button(t('common.actions.cancel'), { onClick: () => { resolve(false); entry.close(); } }),
          button(confirmLabel, { variant: 'gold', onClick: () => { resolve(true); entry.close(); } }),
        ]),
      ],
    });
  });
}
