import { el } from '../../core/dom.js';
import { icon } from './icon.js';

// Compact overflow menu for cards and rows: a details/summary disclosure with
// an outside-pointer + Escape close, matching the owner-menu disclosure already
// used by the credentials panel.
//
// items: [{ label, icon, fallback, onClick, tone }]
export function overflowMenu({ label, items = [], className, icon: iconName = 'lucide:ellipsis', fallback = '⋯' } = {}) {
  const entries = items.filter((item) => item && item.label);
  if (!entries.length) return null;

  const menu = el('details', { class: ['menu', className].filter(Boolean).join(' ') });
  const close = () => {
    menu.open = false;
  };

  menu.append(
    el(
      'summary',
      { class: 'menu__trigger', 'aria-label': label, title: label },
      icon(iconName, { size: 18, fallback }),
    ),
    el(
      'div',
      { class: 'menu__list', role: 'menu' },
      entries.map((item) =>
        el(
          'button',
          {
            class: ['menu__item', item.tone && `menu__item--${item.tone}`].filter(Boolean).join(' '),
            type: 'button',
            role: 'menuitem',
            onClick: () => {
              close();
              item.onClick?.();
            },
          },
          [
            item.icon
              ? el(
                  'span',
                  { class: 'menu__ico', 'aria-hidden': 'true' },
                  icon(item.icon, { size: 16, fallback: item.fallback }),
                )
              : null,
            el('span', {}, item.label),
          ],
        ),
      ),
    ),
  );

  menu.addEventListener('toggle', () => {
    if (menu.open) {
      const onOutside = (event) => {
        if (!menu.contains(event.target)) menu.open = false;
      };
      const onKey = (event) => {
        if (event.key === 'Escape') menu.open = false;
      };
      menu.__outside = onOutside;
      menu.__keys = onKey;
      setTimeout(() => {
        document.addEventListener('pointerdown', onOutside);
        document.addEventListener('keydown', onKey);
      }, 0);
    } else {
      if (menu.__outside) document.removeEventListener('pointerdown', menu.__outside);
      if (menu.__keys) document.removeEventListener('keydown', menu.__keys);
      menu.__outside = null;
      menu.__keys = null;
    }
  });

  return menu;
}
