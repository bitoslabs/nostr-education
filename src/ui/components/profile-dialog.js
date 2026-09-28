import { el } from '../../core/dom.js';
import { avatar, button, noteBox } from './primitives.js';

export function renderEditProfile({ persona, actions, close }) {
  const nameInput = el('input', {
    id: 'edit-profile-name',
    type: 'text',
    value: persona.displayName ?? '',
    autocomplete: 'nickname',
    maxlength: '64',
  });
  const aboutInput = el('textarea', {
    id: 'edit-profile-about',
    rows: '3',
    value: persona.about ?? '',
    placeholder: 'A sentence about you…',
    maxlength: '480',
  });
  const pictureInput = el('input', {
    id: 'edit-profile-picture',
    type: 'url',
    value: persona.picture ?? '',
    placeholder: 'https://…/avatar.png',
    autocomplete: 'off',
    spellcheck: 'false',
  });
  const preview = el(
    'span',
    { class: 'profile-edit__preview' },
    avatar({ avatar: persona.avatar, picture: persona.picture }, 56),
  );
  const error = el('p', { class: 'small danger', 'aria-live': 'polite' });

  pictureInput.addEventListener('input', () => {
    preview.replaceChildren(avatar({ avatar: persona.avatar, picture: pictureInput.value }, 56));
  });

  const submit = async () => {
    if (!String(nameInput.value).trim()) {
      error.textContent = 'Add a display name.';
      nameInput.focus();
      return;
    }
    const ok = await actions.updateProfile({
      displayName: nameInput.value,
      about: aboutInput.value,
      picture: pictureInput.value,
    });
    if (ok) close();
  };

  return el('div', {}, [
    el('h2', {}, 'Edit profile'),
    el('p', { class: 'muted small' }, 'These fields are published as a public kind:0 metadata event signed by your key.'),
    el(
      'form',
      {
        onSubmit: (event) => {
          event.preventDefault();
          submit();
        },
      },
      [
        el('div', { class: 'profile-edit' }, [
          preview,
          el('div', { class: 'profile-edit__fields' }, [
            el('label', { for: 'edit-profile-name' }, 'Display name'),
            nameInput,
            el('label', { for: 'edit-profile-about' }, 'About'),
            aboutInput,
            el('label', { for: 'edit-profile-picture' }, 'Picture URL'),
            pictureInput,
          ]),
        ]),
        error,
        noteBox('Relays cache metadata; other clients may take a moment to show changes. Keys and credentials are unaffected.'),
        el('div', { class: 'dlg-foot' }, [
          button('Cancel', { onClick: close }),
          button('Save & publish', { variant: 'gold', type: 'submit' }),
        ]),
      ],
    ),
  ]);
}
