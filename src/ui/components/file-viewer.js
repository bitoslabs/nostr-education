import { el } from '../../core/dom.js';
import { FILE_KIND, fileKind, isPreviewableFile } from '../../domain/files.js';
import { t } from '../../services/i18n/index.js';
import { button, fileChip } from './primitives.js';

// A clickable attachment. Images and PDFs open in the in-app viewer; any other
// type keeps the browser's default open-in-new-tab behaviour.
export function fileLink(file, { onOpen } = {}) {
  const name = String(file?.name ?? t('teaching.fileFallbackName'));
  const url = String(file?.url ?? '');
  if (!url) return fileChip(name);
  const handleClick = (event) => {
    if (!onOpen || !isPreviewableFile(file)) return;
    event.preventDefault();
    onOpen(file);
  };
  return el(
    'a',
    {
      class: 'filelink',
      href: url,
      target: '_blank',
      rel: 'noreferrer',
      onClick: onOpen ? handleClick : null,
    },
    fileChip(name),
  );
}

// Full-screen-ish viewer for a single attachment. Rendered inside an overlay,
// so `close` is supplied by the dialog host.
export function renderFileViewer({ file, close }) {
  const name = String(file?.name ?? t('teaching.fileFallbackName'));
  const url = String(file?.url ?? '');
  const kind = fileKind(file);

  const media =
    kind === FILE_KIND.IMAGE
      ? el('img', { class: 'fileview__media', src: url, alt: name, loading: 'lazy' })
      : kind === FILE_KIND.PDF
        ? el('iframe', { class: 'fileview__frame', src: url, title: name })
        : el('p', { class: 'muted small' }, t('teaching.fileNoPreview'));

  return el('div', { class: 'fileview' }, [
    el('div', { class: 'fileview__head' }, [
      fileChip(name),
      el('span', { class: 'spacer' }),
      el(
        'a',
        { class: 'fileview__open', href: url, target: '_blank', rel: 'noreferrer' },
        t('teaching.fileOpenTab'),
      ),
    ]),
    el('div', { class: `fileview__body fileview__body--${kind}` }, [media]),
    el('div', { class: 'dlg-foot' }, [button(t('common.actions.close'), { onClick: close })]),
  ]);
}
