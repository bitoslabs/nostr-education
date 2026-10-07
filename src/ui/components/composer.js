import { el } from '../../core/dom.js';
import { searchGifs, getCachedGifs } from '../../services/giphy.js';
import { t } from '../../services/i18n/index.js';
import { EMOJI_GROUPS } from './emoji.js';
import { icon } from './icon.js';
import { powControl } from './pow-control.js';
import { avatar, button, spinner } from './primitives.js';

const MAX_LENGTH = 280;
const GIF_LIMIT = 24;

function toolButton(name, fallback, label, onClick) {
  return el(
    'button',
    { class: 'composer__tool', type: 'button', 'aria-label': label, title: label, onClick },
    icon(name, { size: 19, fallback }),
  );
}

export function renderComposer({ onPost, close, uploadImage, uploadAttachment, persona, defaultPow = 0 } = {}) {
  const media = [];
  let posting = false;
  let openPanel = null;
  let gifQuery = '';
  let gifRequest = 0;
  let gifTimer = null;
  const pow = powControl({ value: defaultPow });

  const field = el('textarea', {
    class: 'composer__input',
    maxlength: String(MAX_LENGTH),
    rows: '3',
    'aria-label': t('home.composerPrompt'),
    onInput: () => {
      autoGrow();
      syncFoot();
    },
    onKeydown: (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        submit();
      }
    },
  });
  field.placeholder = t('home.composerPrompt');

  const counter = el('span', { class: 'composer__count' }, String(MAX_LENGTH));
  const mediaArea = el('div', { class: 'composer__media', hidden: true });
  const panelArea = el('div', { class: 'composer__panelarea', hidden: true });

  const pickFiles = (event) => {
    addFiles([...(event.target.files ?? [])]);
    event.target.value = '';
  };
  // Two pickers: media (images/video) and any file (PDF, docs, audio, zip…).
  const mediaInput = el('input', {
    type: 'file',
    accept: 'image/*,video/*',
    multiple: true,
    hidden: true,
    onChange: pickFiles,
  });
  const documentInput = el('input', {
    type: 'file',
    multiple: true,
    hidden: true,
    onChange: pickFiles,
  });

  const postButton = button(t('home.post'), {
    variant: 'gold',
    small: true,
    disabled: true,
    onClick: submit,
  });

  const mediaTool = toolButton('lucide:image-plus', '🖼', t('home.composer.media'), () => mediaInput.click());
  const fileTool = toolButton('lucide:paperclip', '📎', t('home.composer.attachFile'), () => documentInput.click());
  const gifTool = toolButton('lucide:clapperboard', '🎞', t('home.composer.gif'), () => togglePanel('gif'));
  const emojiTool = toolButton('lucide:smile', '🙂', t('home.composer.emoji'), () => togglePanel('emoji'));

  function autoGrow() {
    field.style.height = 'auto';
    field.style.height = `${Math.min(field.scrollHeight, 240)}px`;
  }

  function hasMedia() {
    return media.some((item) => item.status === 'done');
  }

  function uploading() {
    return media.some((item) => item.status === 'uploading');
  }

  function syncFoot() {
    const left = Math.max(0, MAX_LENGTH - field.value.length);
    counter.textContent = String(left);
    counter.classList.toggle('is-low', left <= 20);
    const ready = (field.value.trim().length > 0 || hasMedia()) && !uploading() && !posting;
    postButton.disabled = !ready;
    root?.classList.toggle('is-busy', posting);
    if (posting) postButton.replaceChildren(spinner(t('home.composer.posting')));
    else postButton.textContent = t('home.post');
  }

  function mediaThumb(item) {
    if (item.kind === 'file') {
      return el('span', { class: 'composer__file' }, [
        icon('lucide:file-text', { size: 18, fallback: '📄' }),
        el('span', { class: 'composer__filename' }, item.name ?? t('home.composer.file')),
      ]);
    }
    if (item.kind === 'video') {
      const video = el('video', {
        class: 'composer__tilevideo',
        src: item.previewUrl ?? item.url,
        muted: true,
        playsinline: true,
        preload: 'metadata',
      });
      return el('span', { class: 'composer__videowrap' }, [
        video,
        el('span', { class: 'composer__videoicon' }, icon('lucide:play', { size: 18, fallback: '▶' })),
      ]);
    }
    return el('img', { src: item.previewUrl ?? item.url, alt: item.name ?? '', loading: 'lazy' });
  }

  function renderMedia() {
    mediaArea.hidden = media.length === 0;
    mediaArea.replaceChildren(
      ...media.map((item) => {
        const remove = el(
          'button',
          {
            class: 'composer__rm',
            type: 'button',
            'aria-label': t('common.a11y.removeNamed', { name: item.name ?? item.kind }),
            onClick: () => removeMedia(item.id),
          },
          icon('lucide:x', { size: 14, fallback: '✕' }),
        );
        return el(
          'div',
          { class: `composer__tile${item.status === 'uploading' ? ' is-uploading' : ''}` },
          [
            mediaThumb(item),
            item.status === 'uploading' ? el('span', { class: 'composer__tilebusy' }, spinner('')) : null,
            remove,
          ],
        );
      }),
    );
  }

  function addMedia(item) {
    media.push(item);
    renderMedia();
    syncFoot();
    return item;
  }

  function removeMedia(id) {
    const index = media.findIndex((item) => item.id === id);
    if (index < 0) return;
    const [item] = media.splice(index, 1);
    if (item?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl);
    renderMedia();
    syncFoot();
  }

  async function addFiles(files) {
    for (const file of files) {
      const type = String(file.type ?? '').toLowerCase();
      const isImage = type.startsWith('image/');
      const isVideo = type.startsWith('video/');
      const id = `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
      const previewUrl = isImage || isVideo ? URL.createObjectURL(file) : null;
      const item = addMedia({
        id,
        kind: isImage ? 'image' : isVideo ? 'video' : 'file',
        name: file.name ?? (isImage ? t('home.composer.image') : t('home.composer.file')),
        type: file.type ?? null,
        previewUrl,
        url: null,
        status: 'uploading',
      });

      let result = null;
      if (isImage) {
        const url = uploadImage ? await uploadImage(file) : null;
        result = url ? { url } : null;
      } else {
        // Video and any other file go straight to Blossom as an attachment.
        result = uploadAttachment ? await uploadAttachment(file) : null;
      }
      if (!result?.url) {
        removeMedia(id);
        continue;
      }
      item.url = result.url;
      item.type = result.type ?? item.type;
      item.name = result.name ?? item.name;
      item.status = 'done';
      renderMedia();
      syncFoot();
    }
  }

  function addGif(gif) {
    addMedia({
      id: `gif-${gif.id}`,
      kind: 'gif',
      name: gif.title ?? 'GIF',
      type: 'image/gif',
      previewUrl: gif.previewUrl,
      url: gif.url,
      status: 'done',
    });
    togglePanel(null);
  }

  function insertEmoji(emoji) {
    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? start;
    field.value = field.value.slice(0, start) + emoji + field.value.slice(end);
    const caret = start + emoji.length;
    field.focus();
    field.setSelectionRange(caret, caret);
    autoGrow();
    syncFoot();
  }

  function togglePanel(panel) {
    openPanel = openPanel === panel ? null : panel;
    panelArea.hidden = openPanel === null;
    gifTool.classList.toggle('is-on', openPanel === 'gif');
    emojiTool.classList.toggle('is-on', openPanel === 'emoji');
    if (openPanel === 'gif') {
      panelArea.replaceChildren(gifPanel());
      loadGifs(gifQuery);
    } else if (openPanel === 'emoji') {
      panelArea.replaceChildren(emojiPanel());
    } else {
      panelArea.replaceChildren();
    }
  }

  function emojiPanel() {
    return el(
      'div',
      { class: 'composer__emoji', role: 'group', 'aria-label': t('home.composer.emoji') },
      EMOJI_GROUPS.map((group) =>
        el('div', { class: 'composer__emojigroup' }, [
          el('span', { class: 'composer__emojilabel' }, t(group.labelKey)),
          el(
            'div',
            { class: 'composer__emojigrid' },
            group.emojis.map((emoji) =>
              el(
                'button',
                {
                  class: 'composer__emojiitem',
                  type: 'button',
                  'aria-label': emoji,
                  onClick: () => insertEmoji(emoji),
                },
                emoji,
              ),
            ),
          ),
        ]),
      ),
    );
  }

  function gifPanel() {
    const input = el('input', {
      class: 'composer__gifsearch',
      type: 'search',
      placeholder: t('home.composer.gifSearch'),
      'aria-label': t('home.composer.gifSearch'),
      autocomplete: 'off',
      onInput: (event) => {
        gifQuery = event.target.value;
        clearTimeout(gifTimer);
        gifTimer = setTimeout(() => loadGifs(gifQuery), 320);
      },
    });
    return el('div', { class: 'composer__gif' }, [
      el('div', { class: 'composer__gifhead' }, [
        icon('lucide:search', { size: 16, fallback: '⌕' }),
        input,
      ]),
      el('div', { class: 'composer__gifgrid', 'data-gif-grid': 'true' }, spinner(t('home.composer.gifLoading'))),
    ]);
  }

  function renderGifs(grid, results) {
    grid.replaceChildren(
      ...(results.length
        ? results.map((gif) =>
            el(
              'button',
              {
                class: 'composer__gifitem',
                type: 'button',
                title: gif.title,
                'aria-label': gif.title,
                onClick: () => addGif(gif),
              },
              el('img', { src: gif.previewUrl, alt: gif.title, loading: 'lazy' }),
            ),
          )
        : [el('p', { class: 'muted small' }, t('home.composer.gifEmpty'))]),
    );
  }

  async function loadGifs(query) {
    const grid = panelArea.querySelector('[data-gif-grid]');
    if (!grid) return;
    const token = (gifRequest += 1);
    // Show cached results instantly, then refresh from the network.
    const cached = getCachedGifs(query);
    if (cached?.length) renderGifs(grid, cached);
    else grid.replaceChildren(spinner(t('home.composer.gifLoading')));
    try {
      const results = await searchGifs(query, { limit: GIF_LIMIT });
      if (token !== gifRequest || !grid.isConnected) return;
      renderGifs(grid, results);
    } catch {
      if (token !== gifRequest || !grid.isConnected) return;
      if (!cached?.length) grid.replaceChildren(el('p', { class: 'muted small' }, t('home.composer.gifError')));
    }
  }

  async function submit() {
    if (posting || uploading()) return;
    const text = field.value.trim();
    if (!text && !hasMedia()) return;
    posting = true;
    syncFoot();
    const payload = {
      text,
      pow: pow.getValue(),
      media: media
        .filter((item) => item.status === 'done')
        .map(({ kind, url, type, name }) => ({ kind, url, type, name })),
    };
    try {
      const ok = await onPost?.(payload);
      if (ok !== false) close?.();
    } finally {
      posting = false;
      syncFoot();
    }
  }

  const root = el('div', { class: 'composer' }, [
    el('div', { class: 'composer__head' }, [
      persona ? avatar(persona, 40) : null,
      el('div', { class: 'composer__who' }, [
        el('strong', {}, persona?.displayName ?? t('home.composer.title')),
        el('span', { class: 'muted small' }, t('home.composer.audience')),
      ]),
      el(
        'button',
        { class: 'composer__close', type: 'button', 'aria-label': t('common.actions.cancel'), onClick: () => close?.() },
        icon('lucide:x', { size: 18, fallback: '✕' }),
      ),
    ]),
    field,
    mediaArea,
    panelArea,
    pow.node,
    el('div', { class: 'composer__toolbar' }, [
      el('div', { class: 'composer__tools' }, [mediaTool, fileTool, gifTool, emojiTool]),
      el('div', { class: 'composer__right' }, [
        el('span', { class: 'composer__counter' }, [counter, t('home.charactersLeft')]),
        postButton,
      ]),
    ]),
    mediaInput,
    documentInput,
  ]);

  autoGrow();
  syncFoot();
  setTimeout(() => field.focus(), 0);
  return root;
}
