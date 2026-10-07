export const FILE_KIND = Object.freeze({
  IMAGE: 'image',
  VIDEO: 'video',
  PDF: 'pdf',
  OTHER: 'other',
});

const IMAGE_EXT = /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i;
const VIDEO_EXT = /\.(mp4|m4v|mov|webm|ogv|ogg|avi|mkv)$/i;
const PDF_EXT = /\.pdf$/i;

// Prefer the declared MIME type, then fall back to the name/URL extension. A
// Blossom URL may not carry a reliable content type, and older attachments were
// stored with only a name, so both signals are needed to recognise a preview.
export function fileKind(file) {
  const type = String(file?.type ?? '').toLowerCase();
  if (type.startsWith('image/')) return FILE_KIND.IMAGE;
  if (type.startsWith('video/')) return FILE_KIND.VIDEO;
  if (type === 'application/pdf' || type.includes('pdf')) return FILE_KIND.PDF;
  const name = String(file?.name ?? file?.url ?? '');
  if (IMAGE_EXT.test(name)) return FILE_KIND.IMAGE;
  if (VIDEO_EXT.test(name)) return FILE_KIND.VIDEO;
  if (PDF_EXT.test(name)) return FILE_KIND.PDF;
  return FILE_KIND.OTHER;
}

// Images, video, and PDFs can be rendered by the browser inside an overlay;
// anything else falls back to opening in a new tab or downloading.
export function isPreviewableFile(file) {
  return fileKind(file) !== FILE_KIND.OTHER;
}
