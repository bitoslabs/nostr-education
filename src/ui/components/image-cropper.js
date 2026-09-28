import { el } from '../../core/dom.js';
import { button } from './primitives.js';

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), type, quality));
}

function preferredType(canvas) {
  try {
    return canvas.toDataURL('image/webp').startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg';
  } catch {
    return 'image/jpeg';
  }
}

/* Drag-to-pan, slider-to-zoom cropper. The frame is exactly what gets exported,
   so avatar uses aspect 1 and banner uses a wide aspect. */
export function renderCropper({
  imageUrl,
  aspect = 1,
  title = 'Crop image',
  outputWidth = 512,
  onApply,
  onCancel,
}) {
  const available = Math.max(180, (window.innerWidth || 360) - 96);
  const viewWidth = Math.min(aspect >= 1.5 ? 340 : 280, available);
  const viewHeight = Math.max(96, Math.round(viewWidth / aspect));
  const dpr = Math.min(2, window.devicePixelRatio || 1);

  const canvas = el('canvas', { class: 'cropper__canvas' });
  canvas.width = Math.round(viewWidth * dpr);
  canvas.height = Math.round(viewHeight * dpr);
  canvas.style.width = `${viewWidth}px`;
  canvas.style.height = `${viewHeight}px`;
  const ctx = canvas.getContext('2d');

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.decoding = 'async';

  let base = 1;
  let zoom = 1;
  let ox = 0;
  let oy = 0;
  let ready = false;

  const clamp = () => {
    const scale = base * zoom;
    const maxX = Math.max(0, (img.naturalWidth * scale - viewWidth) / 2);
    const maxY = Math.max(0, (img.naturalHeight * scale - viewHeight) / 2);
    ox = Math.min(maxX, Math.max(-maxX, ox));
    oy = Math.min(maxY, Math.max(-maxY, oy));
  };

  const draw = () => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewWidth, viewHeight);
    if (!ready) return;
    const scale = base * zoom;
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    ctx.drawImage(img, viewWidth / 2 + ox - w / 2, viewHeight / 2 + oy - h / 2, w, h);
  };

  img.addEventListener('load', () => {
    base = Math.max(viewWidth / img.naturalWidth, viewHeight / img.naturalHeight);
    zoom = 1;
    ox = 0;
    oy = 0;
    ready = true;
    clamp();
    draw();
  });
  img.addEventListener('error', () => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewWidth, viewHeight);
    ctx.fillStyle = '#ef4444';
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Could not load this image', viewWidth / 2, viewHeight / 2);
  });
  img.src = imageUrl;

  let pointerId = null;
  let lastX = 0;
  let lastY = 0;
  canvas.addEventListener('pointerdown', (event) => {
    if (!ready) return;
    pointerId = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      /* capture is best-effort */
    }
  });
  canvas.addEventListener('pointermove', (event) => {
    if (pointerId !== event.pointerId) return;
    ox += event.clientX - lastX;
    oy += event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    clamp();
    draw();
  });
  const release = (event) => {
    if (pointerId === event.pointerId) pointerId = null;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  const slider = el('input', {
    class: 'cropper__range',
    type: 'range',
    min: '1',
    max: '4',
    step: '0.01',
    value: '1',
    'aria-label': 'Zoom',
    onInput: (event) => {
      zoom = Number(event.target.value) || 1;
      clamp();
      draw();
    },
  });

  const apply = async () => {
    if (!ready) return;
    const outWidth = Math.max(1, Math.round(outputWidth));
    const outHeight = Math.max(1, Math.round(outputWidth / aspect));
    const out = document.createElement('canvas');
    out.width = outWidth;
    out.height = outHeight;
    const octx = out.getContext('2d');
    const ratio = outWidth / viewWidth;
    const scale = base * zoom * ratio;
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    octx.drawImage(img, outWidth / 2 + ox * ratio - w / 2, outHeight / 2 + oy * ratio - h / 2, w, h);
    const blob = await toBlob(out, preferredType(out), 0.9);
    if (blob) onApply?.(blob);
  };

  return [
    el('h2', {}, title),
    el('p', { class: 'muted small' }, 'Drag to reposition, then zoom. The frame is what gets saved.'),
    el('div', { class: 'cropper' }, [el('div', { class: 'cropper__viewport' }, canvas)]),
    el('label', { class: 'cropper__zoom' }, ['Zoom', slider]),
    el('div', { class: 'dlg-foot' }, [
      button('Cancel', { onClick: onCancel }),
      button('Use image', { variant: 'gold', onClick: apply }),
    ]),
  ];
}
