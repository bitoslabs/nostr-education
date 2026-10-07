import { el } from '../../core/dom.js';
import { t } from '../../services/i18n/index.js';
import { icon } from './icon.js';

// In-browser mining is CPU-bound, so 20 bits (avg ~1M hashes) is the practical
// ceiling; higher targets can take tens of seconds. The mock's slider goes to
// 32, which no browser can mine in a comment flow.
export const POW_MAX = 20;

function bitsLabel(bits) {
  return t(bits === 1 ? 'home.powBit' : 'home.powBits', { bits });
}

// Slider + live bits readout for NIP-13 proof of work. Returns the node and a
// getter so callers read the current target at submit time.
export function powControl({ value = 0, onChange } = {}) {
  let current = Math.max(0, Math.min(POW_MAX, Math.round(Number(value) || 0)));

  const out = el('b', { class: 'mono' }, bitsLabel(current));
  const range = el('input', {
    class: 'pow-slider',
    type: 'range',
    min: '0',
    max: String(POW_MAX),
    step: '1',
    value: String(current),
    'aria-label': t('home.composer.pow'),
    onInput: (event) => {
      current = Number(event.target.value) || 0;
      paint();
      onChange?.(current);
    },
  });

  const paint = () => {
    range.style.setProperty('--fill', `${(current / POW_MAX) * 100}%`);
    range.setAttribute('aria-valuetext', bitsLabel(current));
    out.textContent = bitsLabel(current);
    node.classList.toggle('is-on', current > 0);
  };

  const node = el('div', { class: 'powrow' }, [
    icon('lucide:shield-check', { size: 15, fallback: '⛏' }),
    el('span', { class: 'powrow__label' }, 'PoW'),
    range,
    out,
  ]);
  paint();

  return { node, getValue: () => current };
}
