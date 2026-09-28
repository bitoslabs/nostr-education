import { el } from '../../core/dom.js';
import { icon } from '../components/icon.js';
import { renderTopBar, renderBottomTabs } from './mobile-chrome.js';
import { renderNav } from './nav.js';

export function createShell({ root, store, app, theme }) {
  const topBar = el('header', { class: 'appbar' });
  const content = el('div', { id: 'main', class: 'pv-scroll' });
  const screen = el('section', { class: 'pv-screen' }, [topBar, content]);
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
    sidebar.replaceChildren(renderNav({ state, app }));
    topBar.replaceChildren(...renderTopBar({ state, app, theme }));
    tabbar.replaceChildren(...renderBottomTabs({ state, app }));
  }

  store.subscribe(render);
  theme.subscribe(render);
  render();

  return { frame, content };
}
