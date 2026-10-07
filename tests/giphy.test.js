import assert from 'node:assert/strict';
import test from 'node:test';

import { giphySearchUrl, mapGif } from '../src/services/giphy.js';

test('giphySearchUrl builds a search URL for a query and trending otherwise', () => {
  const search = new URL(giphySearchUrl('bitcoin'));
  assert.equal(`${search.origin}${search.pathname}`, 'https://api.giphy.com/v1/gifs/search');
  assert.equal(search.searchParams.get('q'), 'bitcoin');
  assert.equal(search.searchParams.get('rating'), 'pg-13');
  assert.ok(search.searchParams.get('api_key'));

  const trending = new URL(giphySearchUrl('   '));
  assert.ok(trending.pathname.endsWith('/trending'));
  assert.equal(trending.searchParams.get('q'), null);
});

test('mapGif prefers the ~200px rendition and rejects empty images', () => {
  const gif = {
    id: 'x',
    title: 'Hi',
    images: {
      original: { url: 'https://g/o.gif' },
      fixed_height: { url: 'https://g/h200.gif' },
      fixed_height_small: { url: 'https://g/s.gif' },
    },
  };
  assert.deepEqual(mapGif(gif), {
    id: 'x',
    url: 'https://g/h200.gif',
    previewUrl: 'https://g/s.gif',
    title: 'Hi',
    type: 'image/gif',
  });
  // Falls back to original only when no bounded rendition exists.
  assert.equal(mapGif({ id: 'y', images: { original: { url: 'https://g/o.gif' } } }).url, 'https://g/o.gif');
  assert.equal(mapGif({ images: {} }), null);
  assert.equal(mapGif(null), null);
});
