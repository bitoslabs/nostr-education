import { el } from '../../core/dom.js';
import { getPersona } from '../../data/personas.js';
import { SUBMISSION_STATUS, classroomsForTeacher } from '../../domain/classroom.js';
import { isActionNeededFor } from '../../domain/feed.js';
import { identitySecondary } from '../../domain/identity.js';
import { conversationsForAccount, unreadMessageCount } from '../../domain/messaging.js';
import { unreadNotificationCount } from '../../domain/notifications.js';
import { ROLE, workspaceRole } from '../../domain/school.js';
import { formatSats, walletBalance, zapsForAccount } from '../../domain/wallet.js';
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
  const role = workspaceRole(state, persona);
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
  const role = workspaceRole(state, persona);
  const badge = badgeCount(state);
  const messages = unreadMessageCount(conversationsForAccount(state, state.accountId), state.personaId);
  const notifications = unreadNotificationCount(state, state.personaId);

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
    { route: '/wallet', label: t('nav.wallet'), icon: 'lucide:wallet', fallback: '⚡' },
    {
      route: '/messages',
      label: t('nav.messages'),
      icon: 'lucide:message-circle',
      fallback: '💬',
      badge: messages,
    },
    {
      route: '/notifications',
      label: t('nav.notifications'),
      icon: 'lucide:bell',
      fallback: '🔔',
      badge: notifications,
    },
    { route: '/settings', label: t('nav.settings'), icon: 'lucide:settings', fallback: '⚙' },
  ];

  const balance = walletBalance(zapsForAccount(state, state.accountId));

  return el('nav', { class: 'nav', 'aria-label': t('common.a11y.primaryNav') }, [
    el(
      'button',
      {
        class: 'brand',
        type: 'button',
        'aria-label': t('nav.home'),
        onClick: () => app.navigate('/home'),
      },
      [beeLogo(26, 'bee-float'), el('span', {}, t('common.appName'))],
    ),
    ...items.map((item) => navButton(item, state.route, app)),
    button(`＋ ${t('common.a11y.newPost')}`, { variant: 'gold', className: 'navbtn--gold', onClick: () => app.openComposer() }),
    el(
      'button',
      { class: 'nav-wallet', type: 'button', 'aria-label': t('common.a11y.wallet'), onClick: () => app.navigate('/wallet') },
      [
        el('span', { class: 'nav-wallet__top' }, [
          el('span', {}, t('wallet.balance')),
          icon('lucide:zap', { size: 12, fallback: '⚡' }),
        ]),
        el('span', { class: 'nav-wallet__amt' }, [
          el('b', {}, formatSats(balance)),
          el('span', { class: 'nav-wallet__unit' }, t('wallet.sats')),
        ]),
      ],
    ),
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
