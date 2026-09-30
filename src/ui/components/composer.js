import { el } from '../../core/dom.js';
import { t } from '../../services/i18n/index.js';
import { button } from './primitives.js';

const MAX_LENGTH = 280;

export function renderComposer({ onPost, close }) {
  const counter = el('span', {}, String(MAX_LENGTH));
  const field = el('textarea', {
    maxlength: String(MAX_LENGTH),
    onInput: (event) => {
      counter.textContent = String(MAX_LENGTH - event.target.value.length);
    },
  });

  setTimeout(() => field.focus(), 0);

  return [
    el('div', { class: 'dhead' }, [
      el('h2', {}, t('common.a11y.newPost')),
      button('✕', { variant: 'ghost', small: true, onClick: close }),
    ]),
    el('label', {}, t('home.composerPrompt')),
    field,
    el('p', { class: 'small muted' }, [counter, t('home.charactersLeft')]),
    el('div', { class: 'dlg-foot' }, [
      button(t('common.actions.cancel'), { onClick: close }),
      button(t('home.post'), { variant: 'gold', onClick: () => onPost(field.value, close) }),
    ]),
  ];
}
