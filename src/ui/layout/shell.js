import { el } from '../../core/dom.js';
import { bindScreen } from '../../core/reactive.js';
import { t } from '../../services/i18n/index.js';
import { icon } from '../components/icon.js';
import { renderBottomTabs } from './mobile-chrome.js';
import { renderNav } from './nav.js';
import { renderRail } from './rail.js';
import { renderTopbar } from './topbar.js';

// Routes that benefit from the context rail. Full-width screens (messaging,
// settings, about, the workspace tabs, and focused flows) opt out.
const RAIL_ROUTES = new Set([
  '/home',
  '/credentials',
  '/discover',
  '/notifications',
  '/wallet',
]);

export function createShell({ root, app, theme, state }) {
  const content = el('div', { id: 'main', class: 'pv-scroll' });
  const screen = el('section', { class: 'pv-screen' }, [content]);
  const stage = el('div', { class: 'stage' }, screen);
  const topbar = el('header', { class: 'topbar' });
  const sidebar = el('aside', { class: 'sidebar', 'aria-label': t('common.a11y.sidebarNav') });
  const rail = el('aside', { class: 'rail', 'aria-label': t('common.a11y.contextRail') });
  const tabbar = el('div', { class: 'tabbar' });
  const tabdock = el('nav', { class: 'tabdock', 'aria-label': t('common.a11y.primaryMobileNav') }, tabbar);
  const fab = el(
    'button',
    { class: 'fab-create', type: 'button', 'aria-label': t('common.a11y.newPost'), onClick: () => app.openComposer() },
    icon('lucide:plus', { size: 26, fallback: '＋' }),
  );
  const frame = el('div', { class: 'app-frame' }, [topbar, stage, tabdock, fab]);

  root.append(sidebar, frame, rail);

  function render(snapshot) {
    const route = snapshot.route ?? '';
    const isProfile = route === '/profile' || route.startsWith('/profile/') || route === '/p' || route.startsWith('/p/');
    root.classList.toggle('is-auth', !snapshot.authed);
    root.classList.toggle('is-profile', isProfile);
    root.classList.toggle('is-settings', snapshot.route === '/settings');
    root.classList.toggle('is-messages', snapshot.route === '/messages');
    root.classList.toggle('has-rail', Boolean(snapshot.authed) && RAIL_ROUTES.has(snapshot.route));
    sidebar.replaceChildren(renderNav({ state: snapshot, app }));
    tabbar.replaceChildren(...renderBottomTabs({ state: snapshot, app }));
    topbar.replaceChildren(...renderTopbar({ state: snapshot, app }));
    topbar.hidden = !snapshot.authed;
    rail.replaceChildren(renderRail({ state: snapshot, app }));
  }

  bindScreen(state, root, render);

  return { frame, content };
}
