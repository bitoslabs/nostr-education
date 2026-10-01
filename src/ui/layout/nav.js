import { el } from '../../core/dom.js';
import { getPersona } from '../../data/personas.js';
import { SUBMISSION_STATUS, classroomsForTeacher } from '../../domain/classroom.js';
import { isActionNeededFor } from '../../domain/feed.js';
import { identitySecondary } from '../../domain/identity.js';
import { ROLE, normalizeRole } from '../../domain/school.js';
import { t } from '../../services/i18n/index.js';
import { icon } from '../components/icon.js';
import { beeLogo } from '../components/logo.js';
import { avatar, button } from '../components/primitives.js';

const ROLE_ICON = Object.freeze({
  [ROLE.STUDENT]: 'lucide:graduation-cap',
  [ROLE.TEACHER]: 'lucide:presentation',
  [ROLE.OWNER]: 'lucide:building-2',
});

export function badgeCount(state) {
  const persona = getPersona(state.personaId);
  const role = normalizeRole(persona.role);
  if (role === ROLE.TEACHER) {
    const scope = new Set(
      classroomsForTeacher(state.classrooms ?? [], persona.id, state.capabilities ?? []).map((room) => room.id),
    );
    return (state.submissions ?? []).filter(
      (submission) => submission.status === SUBMISSION_STATUS.SUBMITTED && scope.has(submission.classroomId),
    ).length;
  }
  if (role === ROLE.OWNER) {
    return state.signQueue.filter((entry) => entry.status === 'pending').length;
  }
  return state.events.filter((event) => isActionNeededFor(event, state.personaId)).length;
}

export function renderNav({ state, app }) {
  const persona = getPersona(state.personaId);
  const role = normalizeRole(persona.role);
  const badge = badgeCount(state);

  const items = [
    { route: '/home', label: t('nav.home'), icon: 'lucide:house', fallback: '◉' },
    {
      route: '/role',
      label: t('common.roleSpace.' + role),
      icon: ROLE_ICON[role] ?? 'lucide:layout-grid',
      fallback: '▣',
      badge,
    },
    { route: '/credentials', label: t('nav.credentials'), icon: 'lucide:id-card', fallback: '◎' },
    { route: '/discover', label: t('nav.discover'), icon: 'lucide:search', fallback: '⌕' },
    { route: '/notifications', label: t('nav.notifications'), icon: 'lucide:bell', fallback: '🔔' },
    { route: '/settings', label: t('nav.settings'), icon: 'lucide:settings', fallback: '⚙' },
  ];

  return el('nav', { class: 'nav', 'aria-label': t('common.a11y.primaryNav') }, [
    el('div', { class: 'brand' }, [beeLogo(26, 'bee-float'), el('span', {}, t('common.appName'))]),
    button(`＋ ${t('common.a11y.newPost')}`, { variant: 'gold', className: 'navbtn--gold', onClick: () => app.openComposer() }),
    ...items.map((item) => navButton(item, state.route, app)),
    el('div', { class: 'navsep' }),
    el(
      'button',
      { class: 'navme', type: 'button', 'aria-label': t('common.a11y.profileSettings'), onClick: () => app.navigate('/settings') },
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
