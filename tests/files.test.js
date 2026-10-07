import assert from 'node:assert/strict';
import test from 'node:test';

import { FILE_KIND, fileKind, isPreviewableFile } from '../src/domain/files.js';

test('fileKind prefers the declared MIME type', () => {
  assert.equal(fileKind({ type: 'image/png', name: 'x' }), FILE_KIND.IMAGE);
  assert.equal(fileKind({ type: 'video/mp4', name: 'x' }), FILE_KIND.VIDEO);
  assert.equal(fileKind({ type: 'application/pdf', name: 'x' }), FILE_KIND.PDF);
  assert.equal(fileKind({ type: 'text/plain', name: 'x' }), FILE_KIND.OTHER);
});

test('fileKind falls back to the name or URL extension', () => {
  assert.equal(fileKind({ name: 'homework.JPG' }), FILE_KIND.IMAGE);
  assert.equal(fileKind({ url: 'https://blossom.test/abc.pdf' }), FILE_KIND.PDF);
  assert.equal(fileKind({ name: 'notes.pdf', type: 'application/octet-stream' }), FILE_KIND.PDF);
  assert.equal(fileKind({ name: 'clip.mov' }), FILE_KIND.VIDEO);
  assert.equal(fileKind({ url: 'https://blossom.test/lesson.webm' }), FILE_KIND.VIDEO);
  assert.equal(fileKind({ name: 'archive.zip' }), FILE_KIND.OTHER);
  assert.equal(fileKind(null), FILE_KIND.OTHER);
});

test('isPreviewableFile accepts images, video, and PDFs', () => {
  assert.equal(isPreviewableFile({ type: 'image/webp' }), true);
  assert.equal(isPreviewableFile({ type: 'video/mp4' }), true);
  assert.equal(isPreviewableFile({ name: 'clip.webm' }), true);
  assert.equal(isPreviewableFile({ name: 'slide.pdf' }), true);
  assert.equal(isPreviewableFile({ name: 'sheet.xlsx' }), false);
});
