import { el } from '../../core/dom.js';
import { button, noteBox } from './primitives.js';
import { statusBadge } from './status-badge.js';

export function renderSign({ item, actions, close }) {
  const pending = item.status === 'pending';
  const issuer = item.academyName ?? 'the academy';
  const criteria = [
    item.grade != null
      ? `✓ Overall average ${item.grade}%`
      : '✓ Completion recommended by the class teacher',
    item.policyVersion ? `✓ Meets the published completion rules (v${item.policyVersion})` : null,
    `✓ Issuer: ${issuer}`,
  ].filter(Boolean);

  return [
    el('div', { class: 'dhead' }, [
      el('h2', {}, `Sign & issue · ${item.learnerName} · ${item.course}`),
      button('✕', { variant: 'ghost', small: true, onClick: close }),
    ]),
    el('h3', {}, 'Completion'),
    el(
      'ul',
      { class: 'checklist' },
      criteria.map((line) => el('li', {}, line)),
    ),
    el('h3', {}, 'Issues'),
    el('p', {}, [
      `${issuer} Certificate → `,
      el('strong', {}, item.learnerName),
      item.course ? el('span', { class: 'muted small' }, ` · ${item.course}`) : null,
    ]),
    noteBox(
      'Signing is recorded permanently. The certificate is signed by the academy key and can be verified by anyone it is shared with.',
      'warn',
    ),
    el(
      'div',
      { class: 'dlg-foot' },
      pending
        ? [
            button('Decline…', { onClick: () => actions.declineSign(item.id, close) }),
            button('Sign & issue', { variant: 'violet', onClick: () => actions.signIssue(item.id, close) }),
          ]
        : [
            statusBadge(item.status === 'signed' ? '✓ signed' : 'declined', item.status === 'signed' ? 'ok' : 'err'),
            button('Close', { onClick: close }),
          ],
    ),
  ];
}
