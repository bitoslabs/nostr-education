import assert from 'node:assert/strict';
import test from 'node:test';

import { clearRegistry, getPersona, registerPersona } from '../src/data/personas.js';

test('registerPersona keeps the display-name fallback when a profile omits one', () => {
  clearRegistry();

  // Extension and bare-nsec sign-ins register with no profile, so `displayName`
  // is explicitly undefined. It must not clobber the placeholder fallback, or
  // the UI renders raw `{name}` tokens.
  registerPersona({ id: 'pk1', npub: 'npub1pk1', displayName: undefined });
  assert.equal(getPersona('pk1').displayName, 'pk1');

  registerPersona({ id: 'pk1', npub: 'npub1pk1', displayName: null });
  assert.equal(getPersona('pk1').displayName, 'pk1');

  registerPersona({ id: 'pk1', npub: 'npub1pk1', displayName: '' });
  assert.equal(getPersona('pk1').displayName, 'pk1');

  registerPersona({ id: 'pk1', npub: 'npub1pk1', displayName: 'Ada' });
  assert.equal(getPersona('pk1').displayName, 'Ada');
});

test('registerPersona keeps computed defaults alongside extra profile fields', () => {
  clearRegistry();
  const entry = registerPersona({ id: 'pk2', displayName: 'Ada', custom: 'x' });
  assert.equal(entry.custom, 'x');
  assert.equal(entry.loaded, true);
  assert.equal(entry.handle, null);
  assert.equal(entry.role, null);
});
