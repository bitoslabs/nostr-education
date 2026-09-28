import { el } from '../../core/dom.js';
import { queueByStatus, queueCounts } from '../../domain/review.js';
import { button, emptyState, pageTitle, row, tabs } from '../components/primitives.js';
import { statusBadge } from '../components/status-badge.js';

export function renderTeaching({ store, app, scope }) {
  const node = el('section', { class: 'screen' });

  function render() {
    const state = store.getState();
    const counts = queueCounts(state.queue);

    const tabBar = tabs(
      [
        { id: 'review', label: `To review (${counts.review})` },
        { id: 'draft', label: `Drafts (${counts.draft})` },
        { id: 'final', label: `Finalized (${counts.final})` },
      ],
      state.roleTab,
      (id) => app.setRoleTab(id),
      { label: 'Review queue' },
    );

    const items = queueByStatus(state.queue, state.roleTab);
    const rows = el(
      'div',
      { class: 'rows' },
      items.length
        ? items.map((item) =>
            row([
              el('span', { class: 'who' }, item.learnerName),
              el('span', { class: 'muted small' }, `${item.title} · ${item.version} · ${item.time}`),
              item.score
                ? statusBadge(`${item.status === 'final' ? '✓ ' : 'draft '}${item.score}`, 'info')
                : null,
              el('span', { class: 'spacer' }),
              item.status === 'final'
                ? button('Correct grade', { small: true, onClick: () => app.openReview(item.id, 'correct') })
                : button('Open', { variant: 'gold', small: true, onClick: () => app.openReview(item.id, 'review') }),
            ]),
          )
        : [emptyState('Nothing here ✓')],
    );

    const completion = completionCard(state, app);
    node.replaceChildren(
      pageTitle('Teaching · CS-101'),
      ...(completion ? [completion] : []),
      tabBar,
      rows,
    );
  }

  scope.add(store.subscribe(render));
  render();
  return node;
}

function completionCard(state, app) {
  if (state.criteriaMet && !state.completionSent) {
    return el('div', { class: 'card card--accent' }, [
      el('h3', {}, 'Alice · CS-101 — all completion criteria met'),
      button('Send completion', { variant: 'gold', onClick: () => app.sendCompletion() }),
    ]);
  }
  if (state.completionSent && !state.signed) {
    return el('div', { class: 'card' }, [
      statusBadge('completion sent — awaiting organization signature', 'info'),
    ]);
  }
  if (state.signed) {
    return el('div', { class: 'card' }, [statusBadge('✓ certificate issued to Alice', 'ok')]);
  }
  return null;
}
