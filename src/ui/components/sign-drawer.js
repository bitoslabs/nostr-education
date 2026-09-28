import { el } from '../../core/dom.js';
import { button, noteBox } from './primitives.js';
import { statusBadge } from './status-badge.js';

export function renderSign({ item, actions, close }) {
  const pending = item.status === 'pending';

  return [
    el('div', { class: 'dhead' }, [
      el('h2', {}, `Sign & issue · ${item.learnerName} · ${item.course}`),
      button('✕', { variant: 'ghost', small: true, onClick: close }),
    ]),
    el('h3', {}, 'Completion criteria'),
    el('ul', { class: 'checklist' }, [
      el('li', {}, '✓ All 4 assignments finalized'),
      el('li', {}, `✓ Overall grade ${item.grade ?? 78}% ≥ 60%`),
      el('li', {}, `✓ Teacher: Bob ✓ · assigned to ${item.course}`),
    ]),
    el('h3', {}, 'Issues'),
    el('p', {}, ['BitOS Academy Certificate → ', el('strong', {}, item.learnerName), ' ', el('span', { class: 'mono' }, 'alice@bitos.id'), ' ', el('span', { class: 'vmark' }, '✓')]),
    noteBox('⚠ Signing is recorded permanently. This credential becomes verifiable by anyone Alice shares it with.', 'warn'),
    el('div', { class: 'dlg-foot' }, pending
      ? [
          button('Decline…', { onClick: () => actions.declineSign(item.id, close) }),
          button('Sign & issue', { variant: 'violet', onClick: () => actions.signIssue(item.id, close) }),
        ]
      : [
          statusBadge(item.status === 'signed' ? '✓ signed' : 'declined', item.status === 'signed' ? 'ok' : 'err'),
          button('Close', { onClick: close }),
        ]),
  ];
}
