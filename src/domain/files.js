export const FILE_KIND = Object.freeze({
  IMAGE: 'image',
  PDF: 'pdf',
  OTHER: 'other',
});

const IMAGE_EXT = /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i;
const PDF_EXT = /\.pdf$/i;

// Prefer the declared MIME type, then fall back to the name/URL extension. A
// Blossom URL may not carry a reliable content type, and older attachments were
// stored with only a name, so both signals are needed to recognise a preview.
export function fileKind(file) {
  const type = String(file?.type ?? '').toLowerCase();
  if (type.startsWith('image/')) return FILE_KIND.IMAGE;
  if (type === 'application/pdf' || type.includes('pdf')) return FILE_KIND.PDF;
  const name = String(file?.name ?? file?.url ?? '');
  if (IMAGE_EXT.test(name)) return FILE_KIND.IMAGE;
  if (PDF_EXT.test(name)) return FILE_KIND.PDF;
  return FILE_KIND.OTHER;
}

// Images and PDFs can be rendered by the browser inside an overlay; anything
// else falls back to opening in a new tab or downloading.
export function isPreviewableFile(file) {
  return fileKind(file) !== FILE_KIND.OTHER;
}
