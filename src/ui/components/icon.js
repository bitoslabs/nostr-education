import { el } from '../../core/dom.js';
import { createIconifyLoader, iconUrl, normalizeIconName } from '../../services/iconify.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SYMBOL_ATTRIBUTES = [
  'viewBox',
  'fill',
  'fill-rule',
  'clip-rule',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
  'stroke-dashoffset',
];

let loader = createIconifyLoader();
let sprite = null;
const symbols = new Map();
const pending = new Map();

export function setIconLoader(nextLoader) {
  loader = nextLoader;
  symbols.clear();
  pending.clear();
  if (sprite) sprite.replaceChildren();
}

export function preloadIcons(names) {
  const list = Array.isArray(names) ? names : [names];
  return Promise.all(list.map((name) => ensureSymbol(normalizeIconName(name))));
}

function spriteRoot() {
  if (!sprite) {
    sprite = el('svg', {
      'aria-hidden': 'true',
      focusable: 'false',
      style: { position: 'absolute', width: 0, height: 0, overflow: 'hidden' },
    });
    (document.body ?? document.documentElement).append(sprite);
  }
  return sprite;
}

function symbolId(normalized) {
  return `icon-${normalized.replace(/[^a-z0-9]+/gi, '-')}`;
}

function registerSymbol(normalized, svg) {
  const symbol = document.createElementNS(SVG_NS, 'symbol');
  symbol.setAttribute('id', symbolId(normalized));
  for (const attribute of SYMBOL_ATTRIBUTES) {
    if (svg.hasAttribute(attribute)) symbol.setAttribute(attribute, svg.getAttribute(attribute));
  }
  symbol.append(...svg.childNodes);
  spriteRoot().append(symbol);
  return symbol.id;
}

function ensureSymbol(normalized) {
  if (!normalized) return Promise.resolve(null);
  if (symbols.has(normalized)) return Promise.resolve(symbols.get(normalized));
  if (pending.has(normalized)) return pending.get(normalized);

  const promise = loader
    .load(normalized)
    .then((svgText) => {
      const svg = sanitizeSvg(svgText);
      const id = svg ? registerSymbol(normalized, svg) : null;
      symbols.set(normalized, id);
      return id;
    })
    .catch(() => {
      symbols.set(normalized, null);
      return null;
    })
    .finally(() => pending.delete(normalized));

  pending.set(normalized, promise);
  return promise;
}

function useIcon(id) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#${id}`);
  svg.append(use);
  return svg;
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

  if (symbols.get(normalized)) {
    node.replaceChildren(useIcon(symbols.get(normalized)));
    return node;
  }

  if (symbols.has(normalized)) {
    node.classList.add('icon--failed');
    return node;
  }

  ensureSymbol(normalized).then((id) => {
    if (id) node.replaceChildren(useIcon(id));
    else node.classList.add('icon--failed');
  });

  return node;
}
