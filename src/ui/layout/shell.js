import { el } from '../../core/dom.js';
import { bindScreen } from '../../core/reactive.js';
import { icon } from '../components/icon.js';
import { renderBottomTabs } from './mobile-chrome.js';
import { renderNav } from './nav.js';

export function createShell({ root, app, theme, state }) {
  const content = el('div', { id: 'main', class: 'pv-scroll' });
  const screen = el('section', { class: 'pv-screen' }, [content]);
  const stage = el('div', { class: 'stage' }, screen);
  const sidebar = el('aside', { class: 'sidebar', 'aria-label': 'Primary navigation' });
  const tabbar = el('div', { class: 'tabbar' });
  const tabdock = el('nav', { class: 'tabdock', 'aria-label': 'Primary mobile' }, tabbar);
  const fab = el(
    'button',
    { class: 'fab-create', type: 'button', 'aria-label': 'New post', onClick: () => app.openComposer() },
    icon('lucide:plus', { size: 26, fallback: '＋' }),
  );
  const frame = el('div', { class: 'app-frame' }, [stage, tabdock, fab]);

  root.append(sidebar, frame);

  function render(snapshot) {
    root.classList.toggle('is-auth', !snapshot.authed);
    root.classList.toggle('is-settings', snapshot.route === '/settings');
    sidebar.replaceChildren(renderNav({ state: snapshot, app }));
    tabbar.replaceChildren(...renderBottomTabs({ state: snapshot, app }));
  }

  bindScreen(state, root, render);

  return { frame, content };
}
