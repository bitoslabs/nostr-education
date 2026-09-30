import { el } from '../../core/dom.js';
import { t } from '../../services/i18n/index.js';
import { button } from './primitives.js';

export function formSection(title, children) {
  const items = (Array.isArray(children) ? children : [children]).filter(Boolean);
  return el('div', { class: 'form-section' }, [
    el('span', { class: 'form-section__title' }, title),
    ...items,
  ]);
}

// A visually separated, red-tinted variant of formSection for irreversible
// actions (archive, close, delete), so they never sit flush with save/cancel.
export function dangerSection(title, children) {
  const node = formSection(title, children);
  node.classList.add('form-section--danger');
  return node;
}

export function fieldHead(labelText, htmlFor, counter) {
  return el('div', { class: 'field-head' }, [
    el('label', { for: htmlFor }, labelText),
    counter ?? null,
  ]);
}

export function charCount(input, max) {
  const node = el('span', { class: 'field-count' }, `0/${max}`);
  const update = () => {
    const length = String(input.value ?? '').length;
    node.textContent = `${length}/${max}`;
    node.classList.toggle('is-max', length >= max);
  };
  input.addEventListener('input', update);
  update();
  return node;
}

export function imageField({ label, hint, preview, fileInput, onUpload, onRemove }) {
  return el('div', { class: 'image-field' }, [
    preview,
    el('div', { class: 'image-field__body' }, [
      el('span', { class: 'field-label' }, label),
      hint ? el('p', { class: 'small muted', style: { margin: '0 0 8px' } }, hint) : null,
      el('div', { class: 'image-field__actions' }, [
        button(t('common.actions.uploadCrop'), { small: true, variant: 'gold', onClick: onUpload }),
        button(t('common.actions.remove'), { small: true, onClick: onRemove }),
      ]),
      fileInput,
    ]),
  ]);
}

export function formFoot(children, embedded = false) {
  return el('div', { class: `form-foot${embedded ? ' form-foot--static' : ''}` }, children);
}

export function setWorking(control, working, label) {
  control.disabled = working;
  if (label) control.textContent = working ? t('common.spinner.working') : label;
}
