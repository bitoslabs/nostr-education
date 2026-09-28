import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizePicture, parseProfileMeta, profileContent } from '../src/domain/profile.js';

test('normalizePicture keeps http(s) URLs and rejects the rest', () => {
  assert.equal(normalizePicture('https://cdn.example.com/a.png'), 'https://cdn.example.com/a.png');
  assert.equal(normalizePicture('http://cdn.example.com/a.png'), 'http://cdn.example.com/a.png');
  assert.equal(normalizePicture('javascript:alert(1)'), null);
  assert.equal(normalizePicture('not a url'), null);
  assert.equal(normalizePicture(''), null);
  assert.equal(normalizePicture(null), null);
});

test('profileContent maps a persona to kind:0 fields', () => {
  const content = profileContent({
    displayName: '  Alice  ',
    about: '  Cryptography learner  ',
    picture: 'https://cdn.example.com/alice.png',
    handle: 'alice@bitos.id',
  });
  assert.deepEqual(content, {
    name: 'Alice',
    about: 'Cryptography learner',
    picture: 'https://cdn.example.com/alice.png',
    nip05: 'alice@bitos.id',
  });
});

test('profileContent omits empty fields and drops bad pictures', () => {
  assert.deepEqual(profileContent({ displayName: 'Bob', about: '', picture: 'ftp://x/y.png' }), {
    name: 'Bob',
  });
});

test('parseProfileMeta reads a JSON string and prefers name over display_name', () => {
  const meta = parseProfileMeta(JSON.stringify({ name: 'Alice', about: 'Hi', nip05: 'alice@bitos.id' }));
  assert.equal(meta.displayName, 'Alice');
  assert.equal(meta.about, 'Hi');
  assert.equal(meta.handle, 'alice@bitos.id');
  assert.equal(meta.picture, null);
});

test('parseProfileMeta falls back to display_name and returns null for junk', () => {
  assert.equal(parseProfileMeta({ display_name: 'Alice' }).displayName, 'Alice');
  assert.equal(parseProfileMeta('{not json'), null);
  assert.equal(parseProfileMeta(null), null);
  assert.equal(parseProfileMeta([1, 2]), null);
});
