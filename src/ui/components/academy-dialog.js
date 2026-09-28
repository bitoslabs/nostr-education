import { el } from '../../core/dom.js';
import { ACADEMY_TYPES } from '../../domain/academy.js';
import { button, noteBox } from './primitives.js';

function localTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
  } catch {
    return 'UTC';
  }
}

function typeOptions(selectedId) {
  return ACADEMY_TYPES.map((type) =>
    el('option', { value: type.id, selected: type.id === selectedId }, type.label),
  );
}

export function renderCreateAcademy({ actions, close, roleNotice = null }) {
  const nameInput = el('input', {
    id: 'create-academy-name',
    type: 'text',
    placeholder: 'Northgate College',
    autocomplete: 'organization',
  });
  const typeSelect = el('select', { id: 'create-academy-type' }, typeOptions(ACADEMY_TYPES[0].id));
  const timeZone = el('input', {
    id: 'create-academy-timezone',
    type: 'text',
    value: localTimeZone(),
  });
  const error = el('p', { class: 'small danger', 'aria-live': 'polite' });

  const submit = async () => {
    if (!String(nameInput.value).trim()) {
      error.textContent = 'Enter an academy name.';
      nameInput.focus();
      return;
    }
    const ok = await actions.createAcademy({
      name: nameInput.value,
      type: typeSelect.value,
      timeZone: timeZone.value,
    });
    if (ok) close();
  };

  return el('div', {}, [
    el('h2', {}, 'Create your academy'),
    el('p', { class: 'muted small' }, 'You become the owner. Set a name now — you can change details later.'),
    roleNotice,
    el(
      'form',
      {
        onSubmit: (event) => {
          event.preventDefault();
          submit();
        },
      },
      [
        el('label', { for: 'create-academy-name' }, 'Academy name'),
        nameInput,
        el('label', { for: 'create-academy-type' }, 'Type'),
        typeSelect,
        el('label', { for: 'create-academy-timezone' }, 'Time zone'),
        timeZone,
        error,
        noteBox('An owner administers the academy. Issuing credentials still needs a separately authorized signer.'),
        el('div', { class: 'dlg-foot' }, [
          button('Cancel', { onClick: close }),
          button('Create academy', { variant: 'gold', type: 'submit' }),
        ]),
      ],
    ),
  ]);
}

export function renderEditAcademy({ academy, actions, close }) {
  const nameInput = el('input', {
    id: 'edit-academy-name',
    type: 'text',
    value: academy.name ?? '',
    autocomplete: 'organization',
  });
  const typeSelect = el('select', { id: 'edit-academy-type' }, typeOptions(academy.type));
  const timeZone = el('input', {
    id: 'edit-academy-timezone',
    type: 'text',
    value: academy.timeZone || localTimeZone(),
  });
  const aboutInput = el('textarea', {
    id: 'edit-academy-about',
    rows: '3',
    value: academy.about ?? '',
    placeholder: 'What this academy offers…',
  });
  const pictureInput = el('input', {
    id: 'edit-academy-picture',
    type: 'url',
    value: academy.picture ?? '',
    placeholder: 'https://…/logo.png',
    autocomplete: 'off',
    spellcheck: 'false',
  });
  const error = el('p', { class: 'small danger', 'aria-live': 'polite' });

  const submit = async () => {
    if (!String(nameInput.value).trim()) {
      error.textContent = 'Enter an academy name.';
      nameInput.focus();
      return;
    }
    const ok = await actions.updateAcademyInfo({
      name: nameInput.value,
      about: aboutInput.value,
      picture: pictureInput.value,
      type: typeSelect.value,
      timeZone: timeZone.value,
    });
    if (ok) close();
  };

  return el('div', {}, [
    el('h2', {}, 'Academy info'),
    el('p', { class: 'muted small' }, 'These public fields are published as a kind:0 profile signed by the academy key.'),
    el(
      'form',
      {
        onSubmit: (event) => {
          event.preventDefault();
          submit();
        },
      },
      [
        el('label', { for: 'edit-academy-name' }, 'Academy name'),
        nameInput,
        el('label', { for: 'edit-academy-type' }, 'Type'),
        typeSelect,
        el('label', { for: 'edit-academy-timezone' }, 'Time zone'),
        timeZone,
        el('label', { for: 'edit-academy-about' }, 'About'),
        aboutInput,
        el('label', { for: 'edit-academy-picture' }, 'Logo URL'),
        pictureInput,
        el('span', { class: 'field-label', style: { marginTop: '12px' } }, 'Organization key (npub)'),
        el('p', { class: 'mono small' }, academy.orgNpub ?? 'Generated on first publish'),
        error,
        noteBox('The organization key is separate from your personal key. Invitations and admin access never grant signing power.'),
        el('div', { class: 'dlg-foot' }, [
          button('Cancel', { onClick: close }),
          button('Save & publish', { variant: 'gold', type: 'submit' }),
        ]),
      ],
    ),
  ]);
}
