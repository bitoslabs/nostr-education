import { el } from '../../core/dom.js';
import { getPersona } from '../../data/personas.js';
import { identityName } from '../../domain/identity.js';
import { t } from '../../services/i18n/index.js';
import { notePreview } from './event-card.js';
import { icon } from './icon.js';
import { powControl } from './pow-control.js';
import { avatar, button, spinner } from './primitives.js';

const MAX_LENGTH = 280;

function replyCard(reply, { onOpenMedia } = {}) {
  const author = getPersona(reply.author);
  const openFile = (file) => (event) => {
    if (!onOpenMedia) return;
    event.preventDefault();
    onOpenMedia(file);
  };
  return el('div', { class: 'thread__reply' }, [
    avatar(author, 32),
    el('div', { class: 'thread__reply-body' }, [
      el('div', { class: 'thread__reply-head' }, [
        el('span', { class: 'note-head__name' }, identityName(author)),
        el('span', { class: 't' }, `· ${reply.time}`),
      ]),
      el('p', { class: 'cbody' }, reply.text),
      reply.files?.length
        ? el('div', { class: 'thread__reply-files' }, reply.files.map((file) =>
            el('a', {
              href: file.url,
              target: '_blank',
              rel: 'noopener noreferrer',
              onClick: onOpenMedia ? openFile(file) : null,
            }, el('img', { src: file.url, alt: file.name ?? '', loading: 'lazy', referrerpolicy: 'no-referrer' })),
          ))
        : null,
    ]),
  ]);
}

// Comment thread: the full original note on top, its replies below, and a reply
// composer pinned at the bottom. The replies list re-renders when `subscribe`
// fires (new replies stream in from the relay subscription).
export function renderThread({ note, getReplies, getStatus, subscribe, onReply, close, onOpenMedia } = {}) {
  const list = el('div', { class: 'thread__list' });

  const renderList = () => {
    const replies = getReplies?.() ?? [];
    const status = getStatus?.() ?? 'ready';
    if (!replies.length && status === 'loading') {
      list.replaceChildren(el('div', { class: 'thread__state' }, spinner(t('home.loadingReplies'))));
      return;
    }
    if (!replies.length) {
      list.replaceChildren(el('p', { class: 'muted small thread__state' }, t('home.noReplies')));
      return;
    }
    list.replaceChildren(...replies.map((reply) => replyCard(reply, { onOpenMedia })));
  };
  renderList();
  const unsubscribe = subscribe?.(renderList);

  const field = el('textarea', {
    class: 'composer__input reply__input',
    maxlength: String(MAX_LENGTH),
    rows: '2',
    placeholder: t('home.replyPlaceholder'),
    'aria-label': t('home.reply'),
    onKeydown: (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        replyButton.click();
      }
    },
  });
  const replyButton = button(t('home.reply'), { variant: 'gold', small: true, disabled: true });
  const pow = powControl({});
  let sending = false;
  const sync = () => {
    replyButton.disabled = sending || field.value.trim().length === 0;
    replyButton.textContent = sending ? t('home.composer.posting') : t('home.reply');
  };
  field.addEventListener('input', sync);
  replyButton.addEventListener('click', async () => {
    const text = field.value.trim();
    if (!text || sending) return;
    sending = true;
    sync();
    try {
      const ok = await onReply?.(text, pow.getValue());
      if (ok !== false) {
        field.value = '';
        field.style.height = 'auto';
      }
    } finally {
      sending = false;
      sync();
    }
  });
  sync();

  const node = el('div', { class: 'thread' }, [
    el('div', { class: 'composer__head' }, [
      el('div', { class: 'composer__who' }, [
        el('strong', {}, t('home.replies')),
        el('span', { class: 'muted small' }, t('home.threadSubtitle')),
      ]),
      el(
        'button',
        { class: 'composer__close', type: 'button', 'aria-label': t('common.actions.cancel'), onClick: () => close?.() },
        icon('lucide:x', { size: 18, fallback: '✕' }),
      ),
    ]),
    el('div', { class: 'thread__scroll' }, [
      note
        ? el('div', { class: 'thread__origin' }, [
            el('div', { class: 'thread__origin-label' }, [
              icon('lucide:quote', { size: 13, fallback: '❝' }),
              el('span', {}, t('home.originalPost')),
            ]),
            notePreview(note, { onOpenMedia }),
          ])
        : null,
      list,
    ]),
    el('div', { class: 'thread__compose' }, [
      field,
      pow.node,
      el('div', { class: 'thread__compose-foot' }, [replyButton]),
    ]),
  ]);

  setTimeout(() => field.focus(), 0);
  return { node, cleanup: () => unsubscribe?.() };
}
