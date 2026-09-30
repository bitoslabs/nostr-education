import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { availableLocales, getLocale, has, setLocale, t } from '../src/services/i18n/index.js';

const SRC = fileURLToPath(new URL('../src', import.meta.url));

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith('.js')) out.push(full);
  }
  return out;
}

test('t resolves nested keys and interpolates params', () => {
  assert.equal(t('common.actions.save'), 'Save');
  assert.equal(t('common.badge.graded', { grade: 91 }), '✓ graded 91%');
  assert.equal(t('common.a11y.removeNamed', { name: 'math.pdf' }), 'Remove math.pdf');
});

test('missing keys fall back to the key itself', () => {
  assert.equal(t('does.not.exist'), 'does.not.exist');
  assert.equal(has('does.not.exist'), false);
});

test('unknown locales fall back to the default locale', () => {
  assert.ok(availableLocales().includes('en'));
  setLocale('zz');
  assert.equal(getLocale(), 'en');
  setLocale('en');
});

test('every static t() key used in src resolves to a dictionary entry', () => {
  const keyRe = /\bt\(\s*'([^']+)'/g;
  const missing = [];
  for (const file of walk(SRC)) {
    if (file.includes('/services/i18n/')) continue;
    const text = readFileSync(file, 'utf8');
    let match;
    while ((match = keyRe.exec(text))) {
      const key = match[1];
      // Keys built by concatenation end with a dot; skip those here.
      if (key.endsWith('.') || key.includes('${')) continue;
      if (!has(key)) missing.push(`${file}: ${key}`);
    }
  }
  assert.deepEqual(missing, []);
});
