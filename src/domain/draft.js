// Device-local homework answer drafts. A draft is unsent, private work, so it
// stays out of the synced record set (relays, gift wrap, credentials) and lives
// only in this browser. Pure helpers keep the merge/clear logic testable.

export function draftKey(accountId, homeworkId) {
  return `${accountId ?? 'anon'}::${homeworkId ?? ''}`;
}

export function readDraft(drafts, accountId, homeworkId) {
  const entry = drafts?.[draftKey(accountId, homeworkId)];
  return entry && typeof entry === 'object' ? entry : null;
}

export function hasDraftContent(draft) {
  if (!draft) return false;
  return Boolean(
    String(draft.text ?? '').trim() ||
      String(draft.link ?? '').trim() ||
      (Array.isArray(draft.files) ? draft.files.length : 0),
  );
}

// Returns a new drafts map. Empty drafts are removed rather than stored, so an
// answer the learner cleared does not linger as a phantom "draft restored".
export function writeDraft(drafts, accountId, homeworkId, value) {
  const next = { ...(drafts ?? {}) };
  if (!hasDraftContent(value)) {
    delete next[draftKey(accountId, homeworkId)];
    return next;
  }
  next[draftKey(accountId, homeworkId)] = {
    text: String(value?.text ?? ''),
    link: String(value?.link ?? ''),
    files: Array.isArray(value?.files) ? value.files : [],
    updatedAt: new Date().toISOString(),
  };
  return next;
}

export function clearDraft(drafts, accountId, homeworkId) {
  const next = { ...(drafts ?? {}) };
  delete next[draftKey(accountId, homeworkId)];
  return next;
}
