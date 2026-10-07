import qrcode from 'qrcode-generator';

// Always render dark-on-light regardless of theme: a QR that inverts with the
// app theme can fail on scanners. The white card is part of the contract, so
// the styling lives here rather than in the token sheet.
export function qrSvg(text, { cell = 6, margin = 3, level = 'M' } = {}) {
  const value = String(text ?? '').trim();
  if (!value) return null;
  const qr = qrcode(0, level); // typeNumber 0 = pick the smallest that fits
  qr.addData(value);
  qr.make();
  return qr.createSvgTag({ cellSize: cell, margin, scalable: true });
}

// Returns a wrapper element containing the SVG. Empty input yields an empty
// wrapper so callers can append unconditionally.
export function qrNode(text, options) {
  const wrap = document.createElement('div');
  wrap.className = 'qr';
  const svg = qrSvg(text, options);
  if (svg) {
    wrap.innerHTML = svg;
    const node = wrap.firstElementChild;
    if (node) {
      node.setAttribute('role', 'img');
      node.setAttribute('aria-label', text);
    }
  }
  return wrap;
}
