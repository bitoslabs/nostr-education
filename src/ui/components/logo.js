const SVG_NS = 'http://www.w3.org/2000/svg';

function part(tag, attributes = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value == null || value === false) continue;
    node.setAttribute(name, String(value));
  }
  return node;
}

/**
 * BitOS bee mascot, ported from social-pure-js (`src/core/logo.js`).
 * Motion lives in styles/components.css under "Bee mascot logo".
 *
 * Usage:
 *   beeLogo(22)                static mark (nav / topbar size)
 *   beeLogo(56, 'bee-float')   hovering mark (hero / About page)
 *   beeLogo(22, 'bee-fly')     drifting mark for decorative spots
 */
export function beeLogo(size = 22, extra = '') {
  const svg = part('svg', {
    class: ['bee-svg', extra].filter(Boolean).join(' '),
    width: size,
    height: size,
    viewBox: '0 0 64 64',
    xmlns: SVG_NS,
    role: 'img',
    'aria-label': 'BitOS',
  });

  svg.append(
    part('ellipse', {
      class: 'bee-wing',
      cx: 22,
      cy: 28,
      rx: 12,
      ry: 9,
      fill: 'var(--wing)',
      stroke: 'var(--wing-stroke)',
      'stroke-width': 0.5,
    }),
    part('ellipse', {
      class: 'bee-wing',
      cx: 42,
      cy: 28,
      rx: 12,
      ry: 9,
      fill: 'var(--wing)',
      stroke: 'var(--wing-stroke)',
      'stroke-width': 0.5,
    }),
    part('ellipse', { cx: 32, cy: 38, rx: 13, ry: 17, fill: 'var(--amber)' }),
    part('path', { d: 'M20 33 Q32 29 44 33', stroke: 'var(--text)', 'stroke-width': 3, fill: 'none' }),
    part('path', { d: 'M20 40 Q32 36 44 40', stroke: 'var(--text)', 'stroke-width': 3, fill: 'none' }),
    part('path', { d: 'M20 47 Q32 43 44 47', stroke: 'var(--text)', 'stroke-width': 3, fill: 'none' }),
    part('circle', { cx: 32, cy: 17, r: 8, fill: 'var(--text)' }),
    part('circle', { cx: 29, cy: 15, r: 1.5, fill: '#fff' }),
    part('circle', { cx: 35, cy: 15, r: 1.5, fill: '#fff' }),
    part('path', {
      d: 'M28 10 Q25 6 23 3',
      stroke: 'var(--text)',
      'stroke-width': 1.5,
      fill: 'none',
      'stroke-linecap': 'round',
    }),
    part('path', {
      d: 'M36 10 Q39 6 41 3',
      stroke: 'var(--text)',
      'stroke-width': 1.5,
      fill: 'none',
      'stroke-linecap': 'round',
    }),
  );

  return svg;
}
