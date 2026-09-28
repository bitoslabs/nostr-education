import { el } from '../../core/dom.js';
import { getPersona } from '../../data/personas.js';
import { roleSpaceLabel, roleSpaceShort } from '../../domain/school.js';
import { icon } from '../components/icon.js';
import { personaSelect } from './nav.js';

export function renderTopBar({ state, app, theme }) {
  const persona = getPersona(state.personaId);

  return [
    el('span', { class: 'brand' }, [
      el('span', { 'aria-hidden': 'true' }, '🐝'),
      el('span', {}, 'BitOS Education'),
      el('span', { class: 'tag' }, 'simulated'),
    ]),
    el('span', { class: 'spacer' }),
    personaSelect(state.personaId, app),
    el(
      'button',
      { class: 'icon-btn themeBtn', type: 'button', 'aria-label': `Switch to ${theme.resolved() === 'dark' ? 'light' : 'dark'} theme`, onClick: () => theme.toggle() },
      icon('lucide:contrast', { size: 20, fallback: '◐' }),
    ),
  ].map((node) => node);
}

export function renderBottomTabs({ state, app }) {
  const persona = getPersona(state.personaId);
  const items = [
    { route: '/home', label: 'Home', icon: 'lucide:house', fallback: '◉' },
    { route: '/role', label: roleSpaceShort(persona.role), icon: 'lucide:layout-grid', fallback: '▣' },
    { route: '/credentials', label: 'Creds', icon: 'lucide:id-card', fallback: '◎' },
    { route: '/discover', label: 'Discover', icon: 'lucide:search', fallback: '⌕' },
    { route: '/settings', label: 'Profile', icon: 'lucide:user', fallback: '○' },
  ];

  return items.map((item) => {
    const active = state.route === item.route;
    return el(
      'button',
      {
        class: 'tab',
        type: 'button',
        'data-route': item.route,
        'aria-current': active ? 'page' : null,
        title: item.route === '/role' ? roleSpaceLabel(persona.role) : item.label,
        onClick: () => app.navigate(item.route),
      },
      [
        el('span', { class: 'ic' }, icon(item.icon, { size: 20, fallback: item.fallback })),
        item.label,
      ],
    );
  });
}
