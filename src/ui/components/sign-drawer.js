import { el } from '../../core/dom.js';
import { t } from '../../services/i18n/index.js';
import { button, noteBox } from './primitives.js';
import { statusBadge } from './status-badge.js';

export function renderSign({ item, actions, close }) {
  const pending = item.status === 'pending';
  const issuer = item.academyName ?? t('settings.sign.theAcademy');
  const criteria = [
    item.grade != null
      ? t('settings.sign.criteriaAverage', { grade: item.grade })
      : t('settings.sign.criteriaRecommended'),
    item.policyVersion ? t('settings.sign.criteriaPolicy', { version: item.policyVersion }) : null,
    t('settings.sign.criteriaIssuer', { issuer }),
  ].filter(Boolean);

  return [
    el('div', { class: 'dhead' }, [
      el('h2', {}, t('settings.sign.title', { learner: item.learnerName, course: item.course })),
      button('✕', { variant: 'ghost', small: true, onClick: close }),
    ]),
    el('h3', {}, t('settings.sign.completion')),
    el(
      'ul',
      { class: 'checklist' },
      criteria.map((line) => el('li', {}, line)),
    ),
    el('h3', {}, t('settings.sign.issues')),
    el('p', {}, [
      t('settings.sign.issuerCertificate', { issuer }),
      el('strong', {}, item.learnerName),
      item.course ? el('span', { class: 'muted small' }, ` · ${item.course}`) : null,
    ]),
    noteBox(
      t('settings.sign.note'),
      'warn',
    ),
    el(
      'div',
      { class: 'dlg-foot' },
      pending
        ? [
            button(t('settings.sign.decline'), { onClick: () => actions.declineSign(item.id, close) }),
            button(t('settings.sign.signIssue'), { variant: 'violet', onClick: () => actions.signIssue(item.id, close) }),
          ]
        : [
            statusBadge(item.status === 'signed' ? t('settings.sign.signed') : t('common.badge.declined'), item.status === 'signed' ? 'ok' : 'err'),
            button(t('common.actions.close'), { onClick: close }),
          ],
    ),
  ];
}
