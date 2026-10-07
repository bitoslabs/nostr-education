import { el } from '../../core/dom.js';
import { truncateNpub } from '../../domain/identity.js';
import { isNip05, normalizeUrl } from '../../domain/profile.js';
import { BLOSSOM_SERVERS } from '../../services/blossom.js';
import { t } from '../../services/i18n/index.js';
import { icon } from './icon.js';
import { avatar, button, noteBox } from './primitives.js';
import { charCount, fieldHead, formSection, setWorking } from './form-fields.js';

export function renderEditProfile({ persona, actions, close, cropImage, blossomServer }) {
  const state = {
    picture: persona.picture ?? '',
    banner: persona.banner ?? '',
  };
  let bot = persona.bot === true;

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

  const pictureFile = el('input', { type: 'file', accept: 'image/*', hidden: true });
  const bannerFile = el('input', { type: 'file', accept: 'image/*', hidden: true });

  const status = el('p', { class: 'small muted', 'aria-live': 'polite' });
  const error = el('p', { class: 'small danger', 'aria-live': 'polite' });
  const busy = { value: false };

  // ---- live preview ------------------------------------------------------
  const previewName = el('strong', { class: 'pedit-hero__name' });
  const previewHandle = el('span', { class: 'pedit-hero__handle' });
  const coverImg = el('img', { class: 'pedit-hero__cover-img', alt: '', hidden: true });
  const coverEmpty = el('span', { class: 'pedit-hero__cover-empty' }, [
    icon('lucide:image', { size: 16, fallback: '🖼' }),
    t('settings.profile.addBanner'),
  ]);
  const coverEditLabel = el('span', {}, t('settings.profile.changeBanner'));
  const coverEdit = el(
    'button',
    {
      class: 'pedit-hero__cover-btn',
      type: 'button',
      'aria-label': t('settings.profile.changeBanner'),
      onClick: () => bannerFile.click(),
    },
    [icon('lucide:camera', { size: 14, fallback: '📷' }), coverEditLabel],
  );
  const avatarRing = el('span', { class: 'pedit-hero__avatar-ring' });
  const avatarBtn = el(
    'button',
    {
      class: 'pedit-hero__avatar-btn',
      type: 'button',
      'aria-label': t('settings.profile.changePhoto'),
      onClick: () => pictureFile.click(),
    },
    [
      avatarRing,
      el('span', { class: 'pedit-hero__avatar-badge' }, icon('lucide:camera', { size: 12, fallback: '📷' })),
    ],
  );

  const removePhotoBtn = button(t('settings.profile.removePhoto'), {
    small: true,
    variant: 'ghost',
    onClick: () => {
      state.picture = '';
      renderAvatar();
      afterMediaChange();
    },
  });
  const removeBannerBtn = button(t('settings.profile.removeBanner'), {
    small: true,
    variant: 'ghost',
    onClick: () => {
      state.banner = '';
      renderBanner();
      afterMediaChange();
    },
  });
  const heroActions = el('div', { class: 'pedit-hero__actions' }, [removePhotoBtn, removeBannerBtn]);

  const hero = el('div', { class: 'pedit-hero' }, [
    el('div', { class: 'pedit-hero__cover' }, [coverImg, coverEmpty, coverEdit]),
    el('div', { class: 'pedit-hero__body' }, [
      avatarBtn,
      el('div', { class: 'pedit-hero__meta' }, [previewName, previewHandle]),
    ]),
    heroActions,
  ]);

  const renderAvatar = () => {
    avatarRing.replaceChildren(avatar({ avatar: persona.avatar, picture: state.picture }, 76));
  };

  const renderBanner = () => {
    const has = Boolean(state.banner);
    coverImg.hidden = !has;
    coverEmpty.hidden = has;
    const label = has ? t('settings.profile.changeBanner') : t('settings.profile.addBanner');
    coverEditLabel.textContent = label;
    coverEdit.setAttribute('aria-label', label);
    if (has) coverImg.src = state.banner;
    else coverImg.removeAttribute('src');
  };

  const refreshHeroActions = () => {
    removePhotoBtn.hidden = !state.picture;
    removeBannerBtn.hidden = !state.banner;
    heroActions.hidden = !state.picture && !state.banner;
  };

  const syncPreview = () => {
    previewName.textContent = nameInput.value.trim() || t('settings.profile.previewEmptyName');
    const username = usernameInput.value.trim().replace(/^@/, '');
    const nip05 = handleInput.value.trim();
    previewHandle.textContent = username ? `@${username}` : nip05 || truncateNpub(persona.npub);
  };

  const afterMediaChange = () => {
    refreshHeroActions();
    refreshDirty();
  };

  // ---- bot switch --------------------------------------------------------
  const botSwitch = el(
    'button',
    {
      class: 'switch',
      type: 'button',
      role: 'switch',
      'aria-checked': String(bot),
      'aria-label': t('settings.profile.botAccount'),
      onClick: () => {
        bot = !bot;
        refreshBot();
        refreshDirty();
      },
    },
    el('span', { class: 'switch__dot', 'aria-hidden': 'true' }),
  );
  const refreshBot = () => {
    botSwitch.classList.toggle('is-on', bot);
    botSwitch.setAttribute('aria-checked', String(bot));
  };

  // ---- uploads -----------------------------------------------------------
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
        afterMediaChange();
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
        afterMediaChange();
      },
    });
  });

  // ---- dirty tracking ----------------------------------------------------
  const collect = () => ({
    name: nameInput.value.trim(),
    username: usernameInput.value.trim(),
    about: aboutInput.value,
    nip05: handleInput.value.trim(),
    lud16: lud16Input.value.trim(),
    website: websiteInput.value.trim(),
    picture: state.picture,
    banner: state.banner,
    bot,
  });
  const initial = collect();
  const unsaved = el(
    'span',
    { class: 'pedit-foot__unsaved', role: 'status', 'aria-live': 'polite', hidden: true },
    [icon('lucide:circle-dot', { size: 12, fallback: '•' }), t('settings.profile.unsaved')],
  );
  const submit = button(t('settings.profile.savePublish'), { variant: 'gold', type: 'submit', disabled: true });

  function refreshDirty() {
    const current = collect();
    const dirty = Object.keys(initial).some((key) => current[key] !== initial[key]);
    submit.disabled = !dirty;
    unsaved.hidden = !dirty;
  }

  [nameInput, usernameInput, aboutInput, handleInput, lud16Input, websiteInput].forEach((input) => {
    input.addEventListener('input', () => {
      syncPreview();
      refreshDirty();
    });
  });

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
      bot,
    });
    setWorking(submit, false, t('settings.profile.savePublish'));
    if (ok) close();
    else refreshDirty();
  };

  const serverSelect = el(
    'select',
    { id: 'edit-profile-server', onChange: (event) => actions.setBlossomServer(event.target.value) },
    BLOSSOM_SERVERS.map((url) =>
      el('option', { value: url, selected: url === blossomServer }, url.replace(/^https?:\/\//, '')),
    ),
  );

  // ---- advanced (uploads) disclosure ------------------------------------
  const advancedBody = el('div', { class: 'pedit-advanced__body', hidden: true }, [
    el('label', { for: 'edit-profile-server' }, t('settings.profile.blossomServer')),
    serverSelect,
    el('p', { class: 'field-hint' }, t('settings.profile.blossomServerHint')),
    noteBox(t('settings.profile.uploadNote')),
  ]);
  const advanced = el('div', { class: 'pedit-advanced' }, [
    el(
      'button',
      {
        class: 'pedit-advanced__head',
        type: 'button',
        'aria-expanded': 'false',
        onClick: (event) => {
          const open = event.currentTarget.getAttribute('aria-expanded') === 'true';
          event.currentTarget.setAttribute('aria-expanded', String(!open));
          advancedBody.hidden = open;
        },
      },
      [
        el('span', { class: 'pedit-advanced__chev' }, icon('lucide:chevron-right', { size: 16, fallback: '›' })),
        el('span', {}, t('settings.profile.sectionUploads')),
        el('span', { class: 'spacer' }),
        el('span', { class: 'pedit-advanced__hint' }, t('settings.profile.advancedHint')),
      ],
    ),
    advancedBody,
  ]);

  renderAvatar();
  renderBanner();
  refreshHeroActions();
  refreshBot();
  syncPreview();
  refreshDirty();

  return el('div', { class: 'pedit' }, [
    el(
      'form',
      {
        onSubmit: (event) => {
          event.preventDefault();
          run();
        },
      },
      [
        hero,
        formSection(t('settings.profile.sectionIdentity'), [
          fieldHead(t('settings.profile.displayName'), 'edit-profile-name', charCount(nameInput, 64)),
          nameInput,
          el('label', { for: 'edit-profile-username' }, t('settings.profile.usernameLabel')),
          usernameInput,
          el('p', { class: 'field-hint' }, t('settings.profile.usernameHint')),
        ]),
        formSection(t('settings.profile.sectionAbout'), [
          fieldHead(t('settings.profile.bio'), 'edit-profile-about', charCount(aboutInput, 480)),
          aboutInput,
          el('div', { class: 'row pedit-bot' }, [
            el('span', { class: 'switch__label' }, t('settings.profile.botAccount')),
            el('span', { class: 'spacer' }),
            botSwitch,
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
        advanced,
        status,
        error,
        el('div', { class: 'pedit-foot' }, [unsaved, submit]),
      ],
    ),
    pictureFile,
    bannerFile,
  ]);
}
