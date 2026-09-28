import { el } from '../../core/dom.js';
import { createIconifyLoader, iconUrl, normalizeIconName } from '../../services/iconify.js';

let loader = createIconifyLoader();

export function setIconLoader(nextLoader) {
  loader = nextLoader;
}

export function preloadIcons(names) {
  const list = Array.isArray(names) ? names : [names];
  return Promise.all(list.map((name) => loader.load(name)));
}

function toCssSize(size) {
  return typeof size === 'number' ? `${size}px` : size;
}

function sanitizeSvg(svgText) {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  if (doc.querySelector('parsererror')) return null;

  const svg = doc.querySelector('svg');
  if (!svg) return null;

  for (const node of [svg, ...svg.querySelectorAll('*')]) {
    const tag = node.tagName.toLowerCase();
    if (tag === 'script' || tag === 'foreignobject') {
      node.remove();
      continue;
    }

    for (const attribute of [...node.attributes]) {
      const name = attribute.name.toLowerCase();
      const isExternalReference =
        (name === 'href' || name === 'xlink:href') && !attribute.value.startsWith('#');

      if (name.startsWith('on') || isExternalReference) node.removeAttribute(attribute.name);
    }
  }

  return document.importNode(svg, true);
}

export function icon(name, { size, color, label, mode = 'svg', fallback = '', class: className } = {}) {
  const normalized = normalizeIconName(name);

  const node = el(
    'span',
    {
      class: ['icon', `icon--${mode}`, className].filter(Boolean).join(' '),
      role: label ? 'img' : null,
      'aria-label': label ?? null,
      'aria-hidden': label ? null : 'true',
    },
    fallback ? el('span', { class: 'icon__fallback' }, fallback) : null,
  );

  if (size) node.style.setProperty('--icon-size', toCssSize(size));
  if (color) node.style.setProperty('--icon-color', color);
  if (!normalized) return node;

  if (mode === 'css' || mode === 'bg') {
    node.style.setProperty('--icon-url', `url("${iconUrl(normalized)}")`);
    return node;
  }

  loader
    .load(normalized)
    .then((svgText) => {
      const svg = sanitizeSvg(svgText);
      if (svg) node.replaceChildren(svg);
      else node.classList.add('icon--failed');
    })
    .catch(() => node.classList.add('icon--failed'));

  return node;
}
