import { el } from '../../core/dom.js';
import { icon } from '../components/icon.js';
import { renderBottomTabs } from './mobile-chrome.js';
import { renderNav } from './nav.js';

export function createShell({ root, store, app, theme }) {
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

  function render() {
    const state = store.getState();
    root.classList.toggle('is-auth', !state.authed);
    root.classList.toggle('is-settings', state.route === '/settings');
    sidebar.replaceChildren(renderNav({ state, app }));
    tabbar.replaceChildren(...renderBottomTabs({ state, app }));
  }

  store.subscribe(render);
  render();

  return { frame, content };
}
