import { el } from '../../core/dom.js';
import { ACADEMY_TYPES } from '../../domain/academy.js';
import { avatar, button, noteBox } from './primitives.js';
import { charCount, fieldHead, formFoot, formSection, imageField, setWorking } from './form-fields.js';

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
    maxlength: '80',
  });
  const typeSelect = el('select', { id: 'create-academy-type' }, typeOptions(ACADEMY_TYPES[0].id));
  const timeZone = el('input', {
    id: 'create-academy-timezone',
    type: 'text',
    value: localTimeZone(),
  });
  const error = el('p', { class: 'small danger', 'aria-live': 'polite' });
  const cancel = button('Cancel', { onClick: close });
  const submit = button('Create academy', { variant: 'gold', type: 'submit' });

  const run = async () => {
    if (!String(nameInput.value).trim()) {
      error.textContent = 'Enter an academy name.';
      nameInput.focus();
      return;
    }
    error.textContent = '';
    setWorking(submit, true, 'Create academy');
    const ok = await actions.createAcademy({
      name: nameInput.value,
      type: typeSelect.value,
      timeZone: timeZone.value,
    });
    setWorking(submit, false, 'Create academy');
    if (ok) close();
  };

  return el('div', {}, [
    el('h2', {}, 'Create your academy'),
    el('p', { class: 'muted small' }, 'You become the owner. You can refine these details later.'),
    roleNotice,
    el(
      'form',
      {
        onSubmit: (event) => {
          event.preventDefault();
          run();
        },
      },
      [
        formSection('Academy', [
          el('label', { for: 'create-academy-name' }, 'Academy name'),
          nameInput,
          el('p', { class: 'field-hint' }, 'Shown to learners and on every credential you issue.'),
          el('label', { for: 'create-academy-type' }, 'Type'),
          typeSelect,
        ]),
        formSection('Region', [
          el('label', { for: 'create-academy-timezone' }, 'Time zone'),
          timeZone,
          el('p', { class: 'field-hint' }, 'Used for deadlines and dates across the academy.'),
        ]),
        error,
        noteBox('An owner administers the academy. Issuing credentials still needs a separately authorized signer.'),
        formFoot([cancel, submit]),
      ],
    ),
  ]);
}

export function renderEditAcademy({ academy, actions, close, cropImage }) {
  const state = { picture: academy.picture ?? '' };

  const nameInput = el('input', {
    id: 'edit-academy-name',
    type: 'text',
    value: academy.name ?? '',
    autocomplete: 'organization',
    maxlength: '80',
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
    maxlength: '240',
  });
  const logoFile = el('input', { type: 'file', accept: 'image/*', hidden: true });
  const logoPreview = el('span', { class: 'image-field__avatar' });

  const renderLogo = () => logoPreview.replaceChildren(avatar({ avatar: '🏫', picture: state.picture }, 64));
  renderLogo();

  const status = el('p', { class: 'small muted', 'aria-live': 'polite' });
  const error = el('p', { class: 'small danger', 'aria-live': 'polite' });
  const busy = { value: false };

  logoFile.addEventListener('change', async () => {
    const file = logoFile.files?.[0];
    logoFile.value = '';
    if (!file || busy.value) return;
    if (!file.type.startsWith('image/')) {
      status.textContent = 'Choose an image file.';
      return;
    }
    busy.value = true;
    status.textContent = 'Cropping logo…';
    const blob = await cropImage({ file, aspect: 1, title: 'Crop academy logo', outputWidth: 512 });
    if (!blob) {
      busy.value = false;
      status.textContent = '';
      return;
    }
    status.textContent = 'Uploading logo…';
    const url = await actions.uploadImage(blob);
    busy.value = false;
    if (url) {
      state.picture = url;
      renderLogo();
      status.textContent = 'Logo uploaded.';
    } else {
      status.textContent = '';
    }
  });

  const submit = button('Save & publish', { variant: 'gold', type: 'submit' });

  const run = async () => {
    if (!String(nameInput.value).trim()) {
      error.textContent = 'Enter an academy name.';
      nameInput.focus();
      return;
    }
    error.textContent = '';
    setWorking(submit, true, 'Save & publish');
    const ok = await actions.updateAcademyInfo({
      name: nameInput.value,
      about: aboutInput.value,
      picture: state.picture,
      type: typeSelect.value,
      timeZone: timeZone.value,
    });
    setWorking(submit, false, 'Save & publish');
    if (ok) close();
  };

  return el('div', {}, [
    el(
      'form',
      {
        onSubmit: (event) => {
          event.preventDefault();
          run();
        },
      },
      [
        formSection('Basics', [
          el('label', { for: 'edit-academy-name' }, 'Academy name'),
          nameInput,
          el('label', { for: 'edit-academy-type' }, 'Type'),
          typeSelect,
        ]),
        formSection('Branding', [
          imageField({
            label: 'Logo',
            hint: 'Square image. Uploads are signed and stored on Blossom.',
            preview: logoPreview,
            fileInput: logoFile,
            onUpload: () => logoFile.click(),
            onRemove: () => {
              state.picture = '';
              renderLogo();
            },
          }),
        ]),
        formSection('About', [
          fieldHead('Description', 'edit-academy-about', charCount(aboutInput, 240)),
          aboutInput,
        ]),
        formSection('Region', [
          el('label', { for: 'edit-academy-timezone' }, 'Time zone'),
          timeZone,
          el('p', { class: 'field-hint' }, 'Used for deadlines and dates across the academy.'),
        ]),
        el('span', { class: 'field-label', style: { marginTop: '12px' } }, 'Organization key (npub)'),
        el('p', { class: 'mono small' }, academy.orgNpub ?? 'Generated on first publish'),
        status,
        error,
        noteBox('The organization key is separate from your personal key. Invitations and admin access never grant signing power.'),
        formFoot([submit], true),
      ],
    ),
  ]);
}
