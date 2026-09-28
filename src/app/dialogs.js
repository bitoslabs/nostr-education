import { SEED_CONTACTS } from '../data/seed.js';
import { renderAssignment } from '../ui/components/assignment-drawer.js';
import { renderComposer } from '../ui/components/composer.js';
import { renderReview } from '../ui/components/review-drawer.js';
import { renderShare } from '../ui/components/share-dialog.js';
import { renderSign } from '../ui/components/sign-drawer.js';

export function createDialogs({ overlay, store, actions, contacts = SEED_CONTACTS }) {
  const handles = {};

  function openNamed(name, options) {
    handles[name]?.close();
    const handle = overlay.open({
      ...options,
      onClose: () => {
        handles[name] = null;
      },
    });
    handles[name] = handle;
    return handle;
  }

  const closeNamed = (name) => () => handles[name]?.close();

  function openAssignment() {
    const { assignment } = store.getState();
    return openNamed('assignment', {
      kind: 'drawer',
      label: 'Assignment detail',
      content: renderAssignment({
        assignment,
        actions,
        close: closeNamed('assignment'),
        reopen: openAssignment,
      }),
    });
  }

  function openReview(queueId, mode = 'review') {
    const item = store.getState().queue.find((entry) => entry.id === queueId);
    if (!item) return null;
    return openNamed('review', {
      kind: 'drawer-wide',
      label: 'Review and score',
      content: renderReview({ item, mode, actions, close: closeNamed('review') }),
    });
  }

  function openSign(signId) {
    const item = store.getState().signQueue.find((entry) => entry.id === signId);
    if (!item) return null;
    return openNamed('sign', {
      kind: 'drawer',
      label: 'Review and sign',
      content: renderSign({ item, actions, close: closeNamed('sign') }),
    });
  }

  function openShare(credentialId) {
    const state = store.getState();
    const credential = state.credentials.find((entry) => entry.id === credentialId) ?? state.credentials[0];
    if (!credential) return null;
    return openNamed('share', {
      label: 'Share access',
      content: renderShare({
        credential,
        contacts,
        actions,
        close: closeNamed('share'),
      }),
    });
  }

  function openComposer() {
    return openNamed('composer', {
      label: 'New post',
      content: renderComposer({
        close: closeNamed('composer'),
        onPost: (text, close) => {
          actions.postNote(text);
          close();
        },
      }),
    });
  }

  return { openAssignment, openReview, openSign, openShare, openComposer };
}
