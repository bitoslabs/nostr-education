import { el } from '../../core/dom.js';
import { isNip05, normalizeUrl } from '../../domain/profile.js';
import { BLOSSOM_SERVERS } from '../../services/blossom.js';
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
    placeholder: 'alice',
  });
  const aboutInput = el('textarea', {
    id: 'edit-profile-about',
    rows: '3',
    value: persona.about ?? '',
    placeholder: 'A sentence about you…',
    maxlength: '480',
  });
  const handleInput = el('input', {
    id: 'edit-profile-nip05',
    type: 'text',
    value: persona.handle ?? '',
    placeholder: 'alice@bitos.id',
    autocomplete: 'off',
    spellcheck: 'false',
  });
  const lud16Input = el('input', {
    id: 'edit-profile-lud16',
    type: 'text',
    value: persona.lud16 ?? '',
    placeholder: 'alice@getalby.com',
    autocomplete: 'off',
    spellcheck: 'false',
  });
  const websiteInput = el('input', {
    id: 'edit-profile-website',
    type: 'url',
    value: persona.website ?? '',
    placeholder: 'https://alice.example',
    autocomplete: 'off',
    spellcheck: 'false',
  });
  const botToggle = el('input', { id: 'edit-profile-bot', type: 'checkbox', checked: persona.bot === true });

  const avatarPreview = el('span', { class: 'image-field__avatar' });
  const bannerImg = el('img', { class: 'image-field__banner-img', alt: '' });
  const bannerEmpty = el('span', { class: 'muted small' }, 'No banner yet');
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
      status.textContent = 'Choose an image file.';
      return;
    }
    busy.value = true;
    status.textContent = `Cropping ${label}…`;
    const blob = await cropImage({ file, aspect, title: `Crop ${label}`, outputWidth });
    if (!blob) {
      busy.value = false;
      status.textContent = '';
      return;
    }
    status.textContent = `Uploading ${label} to Blossom…`;
    const url = await actions.uploadImage(blob);
    busy.value = false;
    if (url) {
      apply(url);
      status.textContent = `${label} uploaded.`;
    } else {
      status.textContent = '';
    }
  };

  pictureFile.addEventListener('change', () => {
    const file = pictureFile.files?.[0];
    pictureFile.value = '';
    uploadKind(file, {
      label: 'profile picture',
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
      label: 'banner',
      aspect: 3,
      outputWidth: 1500,
      apply: (url) => {
        state.banner = url;
        renderBanner();
      },
    });
  });

  const submit = button('Save & publish', { variant: 'gold', type: 'submit' });

  const run = async () => {
    error.textContent = '';
    const displayName = String(nameInput.value).trim();
    if (!displayName) {
      error.textContent = 'Add a display name.';
      nameInput.focus();
      return;
    }
    const website = String(websiteInput.value).trim();
    if (website && !normalizeUrl(website)) {
      error.textContent = 'Website must be a full http(s) URL.';
      websiteInput.focus();
      return;
    }
    const nip05 = String(handleInput.value).trim();
    if (nip05 && !isNip05(nip05)) {
      error.textContent = 'NIP-05 handle must look like name@domain.';
      handleInput.focus();
      return;
    }
    const lud16 = String(lud16Input.value).trim();
    if (lud16 && !isNip05(lud16)) {
      error.textContent = 'Lightning address must look like name@domain.';
      lud16Input.focus();
      return;
    }
    setWorking(submit, true, 'Save & publish');
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
    setWorking(submit, false, 'Save & publish');
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
        formSection('Identity', [
          imageField({
            label: 'Profile picture',
            hint: 'Square. Uploads are signed and stored on Blossom.',
            preview: avatarPreview,
            fileInput: pictureFile,
            onUpload: () => pictureFile.click(),
            onRemove: () => {
              state.picture = '';
              renderAvatar();
            },
          }),
          imageField({
            label: 'Banner',
            hint: 'Wide 3:1 header image.',
            preview: bannerPreview,
            fileInput: bannerFile,
            onUpload: () => bannerFile.click(),
            onRemove: () => {
              state.banner = '';
              renderBanner();
            },
          }),
          fieldHead('Display name', 'edit-profile-name', charCount(nameInput, 64)),
          nameInput,
          el('label', { for: 'edit-profile-username' }, 'Username (optional)'),
          usernameInput,
          el('p', { class: 'field-hint' }, 'A short handle others can search for.'),
        ]),
        formSection('About', [
          fieldHead('Bio', 'edit-profile-about', charCount(aboutInput, 480)),
          aboutInput,
          el('label', { class: 'check', for: 'edit-profile-bot' }, [
            botToggle,
            el('span', {}, 'This is a bot account'),
          ]),
        ]),
        formSection('Links & discovery', [
          el('label', { for: 'edit-profile-nip05' }, 'NIP-05 handle'),
          handleInput,
          el('p', { class: 'field-hint' }, 'Your verified name@domain, used by Nostr clients to find you.'),
          el('label', { for: 'edit-profile-lud16' }, 'Lightning address'),
          lud16Input,
          el('p', { class: 'field-hint' }, 'Optional. Lets people send you sats.'),
          el('label', { for: 'edit-profile-website' }, 'Website'),
          websiteInput,
        ]),
        formSection('Uploads', [
          el('label', { for: 'edit-profile-server' }, 'Blossom image server'),
          serverSelect,
          el('p', { class: 'field-hint' }, 'Where uploaded pictures and banners are stored.'),
        ]),
        status,
        error,
        noteBox('Uploads need a connected signer: your key authorizes the blob, and the file is removed from this device after upload.'),
        formFoot([submit], true),
      ],
    ),
  ]);
}
