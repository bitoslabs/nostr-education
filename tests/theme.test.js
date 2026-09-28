import assert from 'node:assert/strict';
import test from 'node:test';

import { createThemeService } from '../src/services/theme.js';

function fakeRoot() {
  const attrs = new Set();
  return {
    dataset: {},
    style: { props: {}, setProperty(key, value) { this.props[key] = value; } },
    offsetWidth: 0,
    setAttribute: (key) => attrs.add(key),
    removeAttribute: (key) => attrs.delete(key),
    hasAttribute: (key) => attrs.has(key),
  };
}

function fakeStorage(seed = {}) {
  const data = new Map(Object.entries(seed));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
}

test('initial paint applies the theme without animating', () => {
  const root = fakeRoot();
  const theme = createThemeService({ root, storage: fakeStorage({ 'bitbee-theme': 'dark' }) });

  theme.init();

  assert.equal(root.dataset.theme, 'dark');
  assert.equal(root.hasAttribute('data-theme-anim'), false);
});

test('switching theme turns the crossfade on, then clears it', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const root = fakeRoot();
  const theme = createThemeService({ root, storage: fakeStorage({ 'bitbee-theme': 'dark' }) });
  theme.init();

  theme.setTheme('light');

  assert.equal(root.dataset.theme, 'light');
  assert.equal(root.hasAttribute('data-theme-anim'), true);

  t.mock.timers.tick(500);
  assert.equal(root.hasAttribute('data-theme-anim'), false);
});

test('changing accent animates but toggling a flag does not', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const root = fakeRoot();
  const theme = createThemeService({ root, storage: fakeStorage({ 'bitbee-theme': 'dark' }) });
  theme.init();

  theme.setFlag('compact', true);
  assert.equal(root.hasAttribute('data-theme-anim'), false, 'flag toggle must not animate');

  theme.setAccent('blue');
  assert.equal(root.hasAttribute('data-theme-anim'), true, 'accent change should animate');
});

test('reduce motion suppresses the crossfade', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const root = fakeRoot();
  const theme = createThemeService({ root, storage: fakeStorage({ 'bitbee-theme': 'dark' }) });
  theme.init();
  theme.setFlag('reduceMotion', true);

  theme.setTheme('light');

  assert.equal(root.dataset.theme, 'light');
  assert.equal(root.hasAttribute('data-theme-anim'), false);
});
