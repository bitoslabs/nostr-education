import { el } from '../../core/dom.js';
import { getPersona } from '../../data/personas.js';
import { t } from '../../services/i18n/index.js';
import { icon } from '../components/icon.js';
import { badgeCount } from './nav.js';

export function renderBottomTabs({ state, app }) {
  const persona = getPersona(state.personaId);
  const badge = badgeCount(state);
  const items = [
    { route: '/home', label: t('nav.home'), icon: 'lucide:house', fallback: '◉' },
    { route: '/role', label: t('common.roleSpaceShort.' + persona.role), icon: 'lucide:layout-grid', fallback: '▣', badge },
    { route: '/credentials', label: t('nav.creds'), icon: 'lucide:id-card', fallback: '◎' },
    { route: '/discover', label: t('nav.discover'), icon: 'lucide:search', fallback: '⌕' },
    { route: '/settings', label: t('nav.profile'), icon: 'lucide:user', fallback: '○' },
  ];

  return items.map((item) => {
    const active = state.route === item.route;
    const title = item.route === '/role' ? t('common.roleSpace.' + persona.role) : item.label;
    return el(
      'button',
      {
        class: `tab${active ? ' is-on' : ''}`,
        type: 'button',
        'data-route': item.route,
        'aria-current': active ? 'page' : null,
        'aria-label': title,
        title,
        onClick: () => app.navigate(item.route),
      },
      [
        el('span', { class: 'ic' }, [
          icon(item.icon, { size: 22, fallback: item.fallback }),
          item.badge ? el('span', { class: 'tab__badge' }, item.badge > 9 ? '9+' : String(item.badge)) : null,
        ]),
        el('span', { class: 'tab__lbl' }, item.label),
      ],
    );
  });
}
