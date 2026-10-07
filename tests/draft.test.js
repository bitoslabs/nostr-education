import assert from 'node:assert/strict';
import test from 'node:test';

// Minimal localStorage so the storage service has a backing store in Node.
const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key),
};

const { clearDraft, draftKey, hasDraftContent, readDraft, writeDraft } = await import(
  '../src/domain/draft.js'
);
const { clearState, loadDrafts, saveDrafts } = await import('../src/services/storage.js');

test('draftKey scopes a draft to the account and homework', () => {
  assert.equal(draftKey('acct-a', 'hw-1'), 'acct-a::hw-1');
  assert.equal(draftKey(null, 'hw-1'), 'anon::hw-1');
});

test('writeDraft stores content and readDraft resolves it per account', () => {
  const drafts = writeDraft({}, 'acct-a', 'hw-1', { text: 'answer', link: '', files: [] });
  assert.equal(readDraft(drafts, 'acct-a', 'hw-1').text, 'answer');
  assert.equal(readDraft(drafts, 'acct-b', 'hw-1'), null);
});

test('an empty draft is removed rather than stored', () => {
  const withDraft = writeDraft({}, 'acct-a', 'hw-1', { text: 'hi' });
  const cleared = writeDraft(withDraft, 'acct-a', 'hw-1', { text: '   ', link: '', files: [] });
  assert.equal(readDraft(cleared, 'acct-a', 'hw-1'), null);
});

test('hasDraftContent detects text, link, or files', () => {
  assert.equal(hasDraftContent(null), false);
  assert.equal(hasDraftContent({ text: ' ' }), false);
  assert.equal(hasDraftContent({ text: 'x' }), true);
  assert.equal(hasDraftContent({ link: 'https://a' }), true);
  assert.equal(hasDraftContent({ files: [{ name: 'a' }] }), true);
});

test('clearDraft drops only the target draft', () => {
  let drafts = writeDraft({}, 'a', 'hw-1', { text: 'one' });
  drafts = writeDraft(drafts, 'a', 'hw-2', { text: 'two' });
  drafts = clearDraft(drafts, 'a', 'hw-1');
  assert.equal(readDraft(drafts, 'a', 'hw-1'), null);
  assert.equal(readDraft(drafts, 'a', 'hw-2').text, 'two');
});

test('drafts persist through the storage service and clear with state', () => {
  memory.clear();
  const drafts = writeDraft({}, 'a', 'hw-1', {
    text: 'keep me',
    files: [{ name: 'a.pdf', url: 'u' }],
  });
  saveDrafts(drafts);
  const reloaded = readDraft(loadDrafts(), 'a', 'hw-1');
  assert.equal(reloaded.text, 'keep me');
  assert.equal(reloaded.files.length, 1);

  clearState();
  assert.deepEqual(loadDrafts(), {});
});
