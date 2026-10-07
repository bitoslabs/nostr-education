import { el } from '../../core/dom.js';
import { getPersona } from '../../data/personas.js';
import { conversationsForAccount, unreadMessageCount } from '../../domain/messaging.js';
import { unreadNotificationCount } from '../../domain/notifications.js';
import { formatSats, walletBalance, zapsForAccount } from '../../domain/wallet.js';
import { t } from '../../services/i18n/index.js';
import { icon } from '../components/icon.js';
import { beeLogo } from '../components/logo.js';
import { avatar } from '../components/primitives.js';

function badge(count) {
  if (!count) return null;
  return el('span', { class: 'topbar__badge' }, count > 9 ? '9+' : String(count));
}

function barIcon(name, label, route, app, count, { className } = {}) {
  return el(
    'button',
    {
      class: ['icon-btn', 'topbar__icon', className].filter(Boolean).join(' '),
      type: 'button',
      'aria-label': count ? `${label} (${count})` : label,
      title: label,
      onClick: () => app.navigate(route),
    },
    [icon(name, { size: 19, fallback: '•' }), badge(count)],
  );
}

// Mobile-only bar: brand plus wallet/quick actions. On desktop the sidebar owns
// the brand and each page renders its own header, so this bar is hidden.
export function renderTopbar({ state, app }) {
  const persona = getPersona(state.personaId);
  const balance = walletBalance(zapsForAccount(state, state.accountId));
  const messages = unreadMessageCount(conversationsForAccount(state, state.accountId), state.personaId);
  const notifications = unreadNotificationCount(state, state.personaId);

  return [
    el(
      'button',
      {
        class: 'topbar__brand',
        type: 'button',
        'aria-label': t('nav.home'),
        onClick: () => app.navigate('/home'),
      },
      [beeLogo(26, 'bee-float'), el('span', { class: 'topbar__brandtxt' }, t('common.appName'))],
    ),
    el('span', { class: 'spacer' }),
    el(
      'button',
      {
        class: 'satspill',
        type: 'button',
        'aria-label': t('wallet.a11y.balance', { amount: formatSats(balance) }),
        title: t('common.a11y.wallet'),
        onClick: () => app.navigate('/wallet'),
      },
      [
        icon('lucide:zap', { size: 15, fallback: '⚡' }),
        el('b', {}, formatSats(balance)),
        el('span', { class: 'satspill__unit' }, t('wallet.sats')),
      ],
    ),
    // On desktop these live in the sidebar; they are shown here only when the
    // sidebar is hidden (see layout.css), so each destination has one entry point.
    barIcon('lucide:message-circle', t('common.a11y.messages'), '/messages', app, messages, {
      className: 'topbar__icon--messages',
    }),
    barIcon('lucide:bell', t('nav.notifications'), '/notifications', app, notifications, {
      className: 'topbar__icon--bell',
    }),
    el(
      'button',
      {
        class: 'topbar__me',
        type: 'button',
        'aria-label': t('common.a11y.profileSettings'),
        onClick: () => app.navigate('/settings'),
      },
      avatar(persona, 32),
    ),
  ];
}
