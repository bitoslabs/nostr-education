import { el } from '../../core/dom.js';
import { getPersona } from '../../data/personas.js';
import { isActionNeededFor } from '../../domain/feed.js';
import { identitySecondary } from '../../domain/identity.js';
import { queueByStatus } from '../../domain/review.js';
import { ROLE, roleSpaceLabel } from '../../domain/school.js';
import { icon } from '../components/icon.js';
import { avatar, button } from '../components/primitives.js';

const ROLE_ICON = Object.freeze({
  [ROLE.STUDENT]: 'lucide:graduation-cap',
  [ROLE.TEACHER]: 'lucide:presentation',
  [ROLE.OWNER]: 'lucide:building-2',
});

export function badgeCount(state) {
  const persona = getPersona(state.personaId);
  if (persona.role === ROLE.TEACHER) return queueByStatus(state.queue, 'review').length;
  if (persona.role === ROLE.OWNER) {
    return state.signQueue.filter((entry) => entry.status === 'pending').length;
  }
  return state.events.filter((event) => isActionNeededFor(event, state.personaId)).length;
}

export function renderNav({ state, app }) {
  const persona = getPersona(state.personaId);
  const badge = badgeCount(state);

  const items = [
    { route: '/home', label: 'Home', icon: 'lucide:house', fallback: '◉' },
    {
      route: '/role',
      label: roleSpaceLabel(persona.role),
      icon: ROLE_ICON[persona.role] ?? 'lucide:layout-grid',
      fallback: '▣',
      badge,
    },
    { route: '/credentials', label: 'Credentials', icon: 'lucide:id-card', fallback: '◎' },
    { route: '/discover', label: 'Discover', icon: 'lucide:search', fallback: '⌕' },
    { route: '/notifications', label: 'Notifications', icon: 'lucide:bell', fallback: '🔔' },
    { route: '/settings', label: 'Settings', icon: 'lucide:settings', fallback: '⚙' },
  ];

  return el('nav', { class: 'nav', 'aria-label': 'Primary' }, [
    el('div', { class: 'brand' }, [
      el('span', { 'aria-hidden': 'true' }, '🐝'),
      el('span', {}, 'BitOS Education'),
    ]),
    button('＋ New post', { variant: 'gold', className: 'navbtn--gold', onClick: () => app.openComposer() }),
    ...items.map((item) => navButton(item, state.route, app)),
    el('div', { class: 'navsep' }),
    el(
      'button',
      {
        class: 'navbtn',
        type: 'button',
        disabled: true,
        'aria-disabled': 'true',
        title: 'Coming soon',
      },
      [el('span', { class: 'navbtn__ico' }, icon('lucide:zap', { size: 18, fallback: '⚡' })), 'Bitz'],
    ),
    el(
      'button',
      { class: 'navme', type: 'button', 'aria-label': 'Profile and settings', onClick: () => app.navigate('/settings') },
      [
        avatar(persona, 34),
        el('span', { class: 'navme__txt' }, [
          el('span', { class: 'navme__name' }, persona.displayName),
          el('span', { class: 'navme__handle mono' }, identitySecondary(persona)),
        ]),
      ],
    ),
  ]);
}

function navButton(item, route, app) {
  const active = route === item.route;
  return el(
    'button',
    {
      class: `navbtn${active ? ' is-on' : ''}`,
      type: 'button',
      'aria-current': active ? 'page' : null,
      onClick: () => app.navigate(item.route),
    },
    [
      el('span', { class: 'navbtn__ico' }, [
        icon(item.icon, { size: 18, fallback: item.fallback }),
        item.badge ? el('span', { class: 'navbadge' }, String(item.badge)) : null,
      ]),
      item.label,
    ],
  );
}
