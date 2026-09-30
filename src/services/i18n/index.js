import { en } from './locales/en/index.js';

// Add future locale dictionaries here, for example `fr` from './locales/fr/index.js'.
const DICTIONARIES = Object.freeze({ en });

export const FALLBACK_LOCALE = 'en';

let currentLocale = FALLBACK_LOCALE;
const listeners = new Set();

function resolve(dictionary, key) {
  if (!dictionary) return undefined;
  return key
    .split('.')
    .reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), dictionary);
}

function interpolate(template, params) {
  if (!params) return template;
  return String(template).replace(/\{(\w+)\}/g, (match, name) =>
    params[name] == null ? match : String(params[name]),
  );
}

export function t(key, params) {
  const value = resolve(DICTIONARIES[currentLocale], key) ?? resolve(DICTIONARIES[FALLBACK_LOCALE], key);
  if (value == null) return key;
  return interpolate(value, params);
}

export function has(key) {
  return (
    resolve(DICTIONARIES[currentLocale], key) != null ||
    resolve(DICTIONARIES[FALLBACK_LOCALE], key) != null
  );
}

export function getLocale() {
  return currentLocale;
}

export function availableLocales() {
  return Object.keys(DICTIONARIES);
}

export function onLocaleChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setLocale(locale) {
  const next = DICTIONARIES[locale] ? locale : FALLBACK_LOCALE;
  if (next === currentLocale) return next;
  currentLocale = next;
  applyDocumentLang(next);
  applyStaticTranslations();
  listeners.forEach((listener) => listener(next));
  return next;
}

function applyDocumentLang(locale) {
  if (typeof document === 'undefined' || !document.documentElement) return;
  document.documentElement.lang = locale;
}

// Translates static markup, for example:
//   <span data-i18n="common.skipToContent"></span>
//   <input data-i18n="auth.handle" data-i18n-attr="placeholder,aria-label" />
export function applyStaticTranslations(root) {
  if (typeof document === 'undefined') return;
  const scope = root ?? document;

  scope.querySelectorAll('[data-i18n]').forEach((node) => {
    const key = node.getAttribute('data-i18n');
    if (!key) return;
    const attrs = node.getAttribute('data-i18n-attr');
    const value = t(key);
    if (attrs) {
      for (const attr of attrs.split(',').map((entry) => entry.trim()).filter(Boolean)) {
        node.setAttribute(attr, value);
      }
      return;
    }
    node.textContent = value;
  });
}
