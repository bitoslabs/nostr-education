import { el } from '../../core/dom.js';
import { ACADEMY_TYPES } from '../../domain/academy.js';
import { t } from '../../services/i18n/index.js';
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
    el('option', { value: type.id, selected: type.id === selectedId }, t(`organization.academyTypes.${type.id}`)),
  );
}

export function renderCreateAcademy({ actions, close, roleNotice = null }) {
  const nameInput = el('input', {
    id: 'create-academy-name',
    type: 'text',
    placeholder: t('organization.academyNamePlaceholder'),
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
  const cancel = button(t('common.actions.cancel'), { onClick: close });
  const submitLabel = t('organization.create.action');
  const submit = button(submitLabel, { variant: 'gold', type: 'submit' });

  const run = async () => {
    if (!String(nameInput.value).trim()) {
      error.textContent = t('organization.academyNameRequired');
      nameInput.focus();
      return;
    }
    error.textContent = '';
    setWorking(submit, true, submitLabel);
    const ok = await actions.createAcademy({
      name: nameInput.value,
      type: typeSelect.value,
      timeZone: timeZone.value,
    });
    setWorking(submit, false, submitLabel);
    if (ok) close();
  };

  return el('div', {}, [
    el('h2', {}, t('organization.create.title')),
    el('p', { class: 'muted small' }, t('organization.create.subtitle')),
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
        formSection(t('organization.create.sectionAcademy'), [
          el('label', { for: 'create-academy-name' }, t('organization.academyName')),
          nameInput,
          el('p', { class: 'field-hint' }, t('organization.create.nameHint')),
          el('label', { for: 'create-academy-type' }, t('organization.typeLabel')),
          typeSelect,
        ]),
        formSection(t('organization.sectionRegion'), [
          el('label', { for: 'create-academy-timezone' }, t('organization.timeZone')),
          timeZone,
          el('p', { class: 'field-hint' }, t('organization.timeZoneHint')),
        ]),
        error,
        noteBox(t('organization.create.note')),
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
    placeholder: t('organization.editAcademy.aboutPlaceholder'),
    maxlength: '240',
  });
  const handleInput = el('input', {
    id: 'edit-academy-nip05',
    type: 'text',
    value: academy.handle ?? '',
    placeholder: t('organization.editAcademy.handlePlaceholder'),
    autocomplete: 'off',
    spellcheck: 'false',
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
      status.textContent = t('organization.editAcademy.chooseImage');
      return;
    }
    busy.value = true;
    status.textContent = t('organization.editAcademy.cropping');
    const blob = await cropImage({ file, aspect: 1, title: t('organization.editAcademy.cropTitle'), outputWidth: 512 });
    if (!blob) {
      busy.value = false;
      status.textContent = '';
      return;
    }
    status.textContent = t('organization.editAcademy.uploading');
    const url = await actions.uploadImage(blob);
    busy.value = false;
    if (url) {
      state.picture = url;
      renderLogo();
      status.textContent = t('organization.editAcademy.logoUploaded');
    } else {
      status.textContent = '';
    }
  });

  const submitLabel = t('organization.editAcademy.submit');
  const submit = button(submitLabel, { variant: 'gold', type: 'submit' });

  const run = async () => {
    if (!String(nameInput.value).trim()) {
      error.textContent = t('organization.academyNameRequired');
      nameInput.focus();
      return;
    }
    error.textContent = '';
    setWorking(submit, true, submitLabel);
    const ok = await actions.updateAcademyInfo({
      name: nameInput.value,
      about: aboutInput.value,
      picture: state.picture,
      type: typeSelect.value,
      timeZone: timeZone.value,
      handle: handleInput.value,
    });
    setWorking(submit, false, submitLabel);
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
        formSection(t('organization.editAcademy.sectionBasics'), [
          el('label', { for: 'edit-academy-name' }, t('organization.academyName')),
          nameInput,
          el('label', { for: 'edit-academy-type' }, t('organization.typeLabel')),
          typeSelect,
        ]),
        formSection(t('organization.editAcademy.sectionBranding'), [
          imageField({
            label: t('organization.editAcademy.logo'),
            hint: t('organization.editAcademy.logoHint'),
            preview: logoPreview,
            fileInput: logoFile,
            onUpload: () => logoFile.click(),
            onRemove: () => {
              state.picture = '';
              renderLogo();
            },
          }),
        ]),
        formSection(t('organization.editAcademy.sectionAbout'), [
          fieldHead(t('organization.editAcademy.description'), 'edit-academy-about', charCount(aboutInput, 240)),
          aboutInput,
        ]),
        formSection(t('organization.sectionRegion'), [
          el('label', { for: 'edit-academy-timezone' }, t('organization.timeZone')),
          timeZone,
          el('p', { class: 'field-hint' }, t('organization.timeZoneHint')),
        ]),
        formSection(t('organization.editAcademy.sectionDiscovery'), [
          el('label', { for: 'edit-academy-nip05' }, t('organization.editAcademy.nip05Label')),
          handleInput,
          el('p', { class: 'field-hint' }, t('organization.editAcademy.nip05Hint')),
        ]),
        el('span', { class: 'field-label', style: { marginTop: '12px' } }, t('organization.editAcademy.orgKeyLabel')),
        el('p', { class: 'mono small' }, academy.orgNpub ?? t('organization.editAcademy.orgKeyPending')),
        status,
        error,
        noteBox(t('organization.editAcademy.note')),
        formFoot([submit], true),
      ],
    ),
  ]);
}
