import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isNip05,
  normalizePicture,
  normalizeUrl,
  parseProfileMeta,
  profileContent,
} from '../src/domain/profile.js';

test('normalizeUrl keeps http(s) URLs and rejects the rest', () => {
  assert.equal(normalizeUrl('https://cdn.example.com/a.png'), 'https://cdn.example.com/a.png');
  assert.equal(normalizeUrl('http://cdn.example.com/a.png'), 'http://cdn.example.com/a.png');
  assert.equal(normalizeUrl('javascript:alert(1)'), null);
  assert.equal(normalizeUrl('not a url'), null);
  assert.equal(normalizeUrl(''), null);
  assert.equal(normalizeUrl(null), null);
  assert.equal(normalizePicture, normalizeUrl);
});

test('isNip05 accepts name@domain and rejects malformed handles', () => {
  assert.equal(isNip05('alice@bitos.id'), true);
  assert.equal(isNip05('alice'), false);
  assert.equal(isNip05('alice@'), false);
  assert.equal(isNip05('a b@domain.com'), false);
});

test('profileContent maps a persona to full kind:0 fields', () => {
  const content = profileContent({
    displayName: '  Alice  ',
    about: '  Cryptography learner  ',
    picture: 'https://cdn.example.com/alice.png',
    banner: 'https://cdn.example.com/banner.png',
    handle: 'alice@bitos.id',
    lud16: 'alice@getalby.com',
    website: 'https://alice.example',
    bot: true,
  });
  assert.deepEqual(content, {
    name: 'Alice',
    display_name: 'Alice',
    about: 'Cryptography learner',
    picture: 'https://cdn.example.com/alice.png',
    banner: 'https://cdn.example.com/banner.png',
    nip05: 'alice@bitos.id',
    lud16: 'alice@getalby.com',
    website: 'https://alice.example',
    bot: true,
  });
});

test('profileContent uses the username for name and keeps display_name separate', () => {
  const content = profileContent({ displayName: 'Alice Smith', name: 'alice' });
  assert.equal(content.name, 'alice');
  assert.equal(content.display_name, 'Alice Smith');
});

test('profileContent omits empty fields, drops bad URLs, and preserves raw extras', () => {
  const content = profileContent({
    displayName: 'Bob',
    about: '',
    picture: 'ftp://x/y.png',
    banner: 'not a url',
    raw: { lud17: 'kept', about: 'stale', picture: 'stale' },
  });
  assert.deepEqual(content, { lud17: 'kept', name: 'Bob', display_name: 'Bob' });
});

test('parseProfileMeta reads a JSON string and prefers display_name for the shown name', () => {
  const meta = parseProfileMeta(
    JSON.stringify({ name: 'alice', display_name: 'Alice', about: 'Hi', nip05: 'alice@bitos.id' }),
  );
  assert.equal(meta.name, 'alice');
  assert.equal(meta.displayName, 'Alice');
  assert.equal(meta.about, 'Hi');
  assert.equal(meta.handle, 'alice@bitos.id');
  assert.equal(meta.picture, null);
  assert.equal(meta.raw.name, 'alice');
});

test('parseProfileMeta reads banner, lightning, website and bot', () => {
  const meta = parseProfileMeta({
    picture: 'https://x/y.png',
    banner: 'https://x/b.png',
    lud16: 'alice@getalby.com',
    website: 'https://alice.example',
    bot: true,
  });
  assert.equal(meta.banner, 'https://x/b.png');
  assert.equal(meta.lud16, 'alice@getalby.com');
  assert.equal(meta.website, 'https://alice.example');
  assert.equal(meta.bot, true);
});

test('parseProfileMeta falls back to name and returns null for junk', () => {
  assert.equal(parseProfileMeta({ name: 'Alice' }).displayName, 'Alice');
  assert.equal(parseProfileMeta('{not json'), null);
  assert.equal(parseProfileMeta(null), null);
  assert.equal(parseProfileMeta([1, 2]), null);
});
