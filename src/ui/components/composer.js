import { el } from '../../core/dom.js';
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
      el('h2', {}, 'New post'),
      button('✕', { variant: 'ghost', small: true, onClick: close }),
    ]),
    el('label', {}, "What's happening?"),
    field,
    el('p', { class: 'small muted' }, [counter, ' characters left · public to your followers']),
    el('div', { class: 'dlg-foot' }, [
      button('Cancel', { onClick: close }),
      button('Post', { variant: 'gold', onClick: () => onPost(field.value, close) }),
    ]),
  ];
}
