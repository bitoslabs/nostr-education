import { el } from '../../core/dom.js';
import { isNip05, normalizeUrl } from '../../domain/profile.js';
import { BLOSSOM_SERVERS } from '../../services/blossom.js';
import { t } from '../../services/i18n/index.js';
import { avatar, button, noteBox } from './primitives.js';
import { charCount, fieldHead, formFoot, formSection, imageField, setWorking } from './form-fields.js';

export function renderEditProfile({ persona, actions, close, cropImage, blossomServer }) {
  const state = {
    picture: persona.picture ?? '',
    banner: persona.banner ?? '',
  };

  const nameInput = el('input', {
    id: 'edit-profile-name',
    type: 'text',
    value: persona.displayName ?? '',
    autocomplete: 'nickname',
    maxlength: '64',
  });
  const usernameInput = el('input', {
    id: 'edit-profile-username',
    type: 'text',
    value: persona.name ?? '',
    autocomplete: 'username',
    maxlength: '64',
    placeholder: t('settings.profile.usernamePlaceholder'),
  });
  const aboutInput = el('textarea', {
    id: 'edit-profile-about',
    rows: '3',
    value: persona.about ?? '',
    placeholder: t('settings.profile.aboutPlaceholder'),
    maxlength: '480',
  });
  const handleInput = el('input', {
    id: 'edit-profile-nip05',
    type: 'text',
    value: persona.handle ?? '',
    placeholder: t('settings.profile.nip05Placeholder'),
    autocomplete: 'off',
    spellcheck: 'false',
  });
  const lud16Input = el('input', {
    id: 'edit-profile-lud16',
    type: 'text',
    value: persona.lud16 ?? '',
    placeholder: t('settings.profile.lud16Placeholder'),
    autocomplete: 'off',
    spellcheck: 'false',
  });
  const websiteInput = el('input', {
    id: 'edit-profile-website',
    type: 'url',
    value: persona.website ?? '',
    placeholder: t('settings.profile.websitePlaceholder'),
    autocomplete: 'off',
    spellcheck: 'false',
  });
  const botToggle = el('input', { id: 'edit-profile-bot', type: 'checkbox', checked: persona.bot === true });

  const avatarPreview = el('span', { class: 'image-field__avatar' });
  const bannerImg = el('img', { class: 'image-field__banner-img', alt: '' });
  const bannerEmpty = el('span', { class: 'muted small' }, t('settings.profile.noBanner'));
  const bannerPreview = el('div', { class: 'image-field__banner' }, [bannerImg, bannerEmpty]);

  const renderAvatar = () => {
    avatarPreview.replaceChildren(avatar({ avatar: persona.avatar, picture: state.picture }, 64));
  };
  const renderBanner = () => {
    const has = Boolean(state.banner);
    bannerImg.hidden = !has;
    bannerEmpty.hidden = has;
    if (has) bannerImg.src = state.banner;
  };
  renderAvatar();
  renderBanner();

  const pictureFile = el('input', { type: 'file', accept: 'image/*', hidden: true });
  const bannerFile = el('input', { type: 'file', accept: 'image/*', hidden: true });

  const status = el('p', { class: 'small muted', 'aria-live': 'polite' });
  const error = el('p', { class: 'small danger', 'aria-live': 'polite' });
  const busy = { value: false };

  const uploadKind = async (file, { label, aspect, outputWidth, apply }) => {
    if (!file || busy.value) return;
    if (!file.type.startsWith('image/')) {
      status.textContent = t('settings.profile.chooseImage');
      return;
    }
    busy.value = true;
    status.textContent = t('settings.profile.cropping', { label });
    const blob = await cropImage({ file, aspect, title: t('settings.profile.cropTitle', { label }), outputWidth });
    if (!blob) {
      busy.value = false;
      status.textContent = '';
      return;
    }
    status.textContent = t('settings.profile.uploading', { label });
    const url = await actions.uploadImage(blob);
    busy.value = false;
    if (url) {
      apply(url);
      status.textContent = t('settings.profile.uploaded', { label });
    } else {
      status.textContent = '';
    }
  };

  pictureFile.addEventListener('change', () => {
    const file = pictureFile.files?.[0];
    pictureFile.value = '';
    uploadKind(file, {
      label: t('settings.profile.picture'),
      aspect: 1,
      outputWidth: 512,
      apply: (url) => {
        state.picture = url;
        renderAvatar();
      },
    });
  });

  bannerFile.addEventListener('change', () => {
    const file = bannerFile.files?.[0];
    bannerFile.value = '';
    uploadKind(file, {
      label: t('settings.profile.banner'),
      aspect: 3,
      outputWidth: 1500,
      apply: (url) => {
        state.banner = url;
        renderBanner();
      },
    });
  });

  const submit = button(t('settings.profile.savePublish'), { variant: 'gold', type: 'submit' });

  const run = async () => {
    error.textContent = '';
    const displayName = String(nameInput.value).trim();
    if (!displayName) {
      error.textContent = t('settings.profile.addDisplayName');
      nameInput.focus();
      return;
    }
    const website = String(websiteInput.value).trim();
    if (website && !normalizeUrl(website)) {
      error.textContent = t('settings.profile.invalidWebsite');
      websiteInput.focus();
      return;
    }
    const nip05 = String(handleInput.value).trim();
    if (nip05 && !isNip05(nip05)) {
      error.textContent = t('settings.profile.invalidNip05');
      handleInput.focus();
      return;
    }
    const lud16 = String(lud16Input.value).trim();
    if (lud16 && !isNip05(lud16)) {
      error.textContent = t('settings.profile.invalidLud16');
      lud16Input.focus();
      return;
    }
    setWorking(submit, true, t('settings.profile.savePublish'));
    const ok = await actions.updateProfile({
      displayName,
      name: usernameInput.value,
      about: aboutInput.value,
      picture: state.picture,
      banner: state.banner,
      handle: nip05,
      lud16,
      website,
      bot: botToggle.checked,
    });
    setWorking(submit, false, t('settings.profile.savePublish'));
    if (ok) close();
  };

  const serverSelect = el(
    'select',
    { id: 'edit-profile-server', onChange: (event) => actions.setBlossomServer(event.target.value) },
    BLOSSOM_SERVERS.map((url) =>
      el('option', { value: url, selected: url === blossomServer }, url.replace(/^https?:\/\//, '')),
    ),
  );

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
        formSection(t('settings.profile.sectionIdentity'), [
          imageField({
            label: t('settings.profile.pictureLabel'),
            hint: t('settings.profile.pictureHint'),
            preview: avatarPreview,
            fileInput: pictureFile,
            onUpload: () => pictureFile.click(),
            onRemove: () => {
              state.picture = '';
              renderAvatar();
            },
          }),
          imageField({
            label: t('settings.profile.bannerLabel'),
            hint: t('settings.profile.bannerHint'),
            preview: bannerPreview,
            fileInput: bannerFile,
            onUpload: () => bannerFile.click(),
            onRemove: () => {
              state.banner = '';
              renderBanner();
            },
          }),
          fieldHead(t('settings.profile.displayName'), 'edit-profile-name', charCount(nameInput, 64)),
          nameInput,
          el('label', { for: 'edit-profile-username' }, t('settings.profile.usernameLabel')),
          usernameInput,
          el('p', { class: 'field-hint' }, t('settings.profile.usernameHint')),
        ]),
        formSection(t('settings.profile.sectionAbout'), [
          fieldHead(t('settings.profile.bio'), 'edit-profile-about', charCount(aboutInput, 480)),
          aboutInput,
          el('label', { class: 'check', for: 'edit-profile-bot' }, [
            botToggle,
            el('span', {}, t('settings.profile.botAccount')),
          ]),
        ]),
        formSection(t('settings.profile.sectionLinks'), [
          el('label', { for: 'edit-profile-nip05' }, t('settings.profile.nip05Label')),
          handleInput,
          el('p', { class: 'field-hint' }, t('settings.profile.nip05Hint')),
          el('label', { for: 'edit-profile-lud16' }, t('settings.profile.lud16Label')),
          lud16Input,
          el('p', { class: 'field-hint' }, t('settings.profile.lud16Hint')),
          el('label', { for: 'edit-profile-website' }, t('settings.profile.websiteLabel')),
          websiteInput,
        ]),
        formSection(t('settings.profile.sectionUploads'), [
          el('label', { for: 'edit-profile-server' }, t('settings.profile.blossomServer')),
          serverSelect,
          el('p', { class: 'field-hint' }, t('settings.profile.blossomServerHint')),
        ]),
        status,
        error,
        noteBox(t('settings.profile.uploadNote')),
        formFoot([submit], true),
      ],
    ),
  ]);
}
