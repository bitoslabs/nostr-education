import { el } from '../../core/dom.js';
import { getPersona } from '../../data/personas.js';
import { roleSpaceLabel, roleSpaceShort } from '../../domain/school.js';
import { icon } from '../components/icon.js';
import { badgeCount, personaSelect } from './nav.js';

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
  const badge = badgeCount(state);
  const items = [
    { route: '/home', label: 'Home', icon: 'lucide:house', fallback: '◉' },
    { route: '/role', label: roleSpaceShort(persona.role), icon: 'lucide:layout-grid', fallback: '▣', badge },
    { route: '/credentials', label: 'Creds', icon: 'lucide:id-card', fallback: '◎' },
    { route: '/discover', label: 'Discover', icon: 'lucide:search', fallback: '⌕' },
    { route: '/settings', label: 'Profile', icon: 'lucide:user', fallback: '○' },
  ];

  return items.map((item) => {
    const active = state.route === item.route;
    const title = item.route === '/role' ? roleSpaceLabel(persona.role) : item.label;
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
