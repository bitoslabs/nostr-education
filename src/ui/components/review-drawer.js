import { el } from '../../core/dom.js';
import {
  RUBRIC_CRITERIA,
  RUBRIC_MAX_PER_CRITERION,
  formatScore,
  isRubricComplete,
} from '../../domain/review.js';
import { button, fileChip, noteBox } from './primitives.js';
import { statusBadge } from './status-badge.js';

export function renderReview({ item, mode = 'review', actions, close }) {
  const scores = item.scores ? [...item.scores] : new Array(RUBRIC_CRITERIA.length).fill(0);
  const correcting = mode === 'correct';

  const total = el('span', { id: 'rubTotal', 'aria-live': 'polite' }, formatScore(scores));
  const finalButton = button(correcting ? 'Finalize correction' : 'Finalize grade', {
    variant: 'gold',
    disabled: !isRubricComplete(scores),
    onClick: () => actions.finalize(item.id, scores, correcting, close),
  });

  const refresh = () => {
    total.textContent = formatScore(scores);
    finalButton.disabled = !isRubricComplete(scores);
  };

  const rubric = RUBRIC_CRITERIA.map((criterion, index) =>
    el('fieldset', { class: 'rub' }, [
      el('legend', {}, criterion),
      el(
        'div',
        { class: 'scale', role: 'radiogroup', 'aria-label': criterion },
        Array.from({ length: RUBRIC_MAX_PER_CRITERION }, (_, offset) => {
          const value = offset + 1;
          const input = el('input', {
            type: 'radio',
            name: `r${item.id}-${index}`,
            value: String(value),
            checked: scores[index] === value,
            onChange: () => {
              scores[index] = value;
              refresh();
            },
          });
          return el('label', {}, [input, el('span', {}, String(value))]);
        }),
      ),
    ]),
  );

  const feedback = el('textarea', {
    rows: '3',
    placeholder: 'What should change before resubmission?',
    id: 'revTxt',
  });
  const revisionForm = el('div', { hidden: true }, [
    el('label', {}, 'Feedback to learner'),
    feedback,
    el('div', { class: 'dlg-foot' }, [
      button('Cancel', { onClick: () => { revisionForm.hidden = true; } }),
      button('Send request', {
        variant: 'gold',
        onClick: () => actions.sendRevision(item.id, feedback.value, close),
      }),
    ]),
  ]);

  const footer = el('div', { class: 'dlg-foot' }, [
    button('Request revision', {
      onClick: () => {
        revisionForm.hidden = false;
        feedback.focus();
      },
    }),
    finalButton,
  ]);

  return [
    el('div', { class: 'dhead' }, [
      el('h2', {}, `${item.learnerName} · ${item.title} · ${item.version}`),
      button('✕', { variant: 'ghost', small: true, onClick: close }),
    ]),
    item.status === 'final' || item.status === 'draft'
      ? el('p', {}, statusBadge(`${item.status} · ${item.score}`, item.status === 'final' ? 'ok' : 'info'))
      : null,
    correcting
      ? noteBox(`Correct grade — creates a new event. Supersedes ${item.score}. Both stay visible.`, 'warn')
      : null,
    el('div', { class: 'grid2' }, [
      el('div', {}, [
        el('h3', {}, 'Attachments'),
        el('div', { class: 'files' }, item.files.map((file) => fileChip(file))),
        el('h3', {}, 'Comments'),
        button('＋ Add comment', { small: true, onClick: () => actions.stub('Comments are coming soon.') }),
      ]),
      el('div', {}, [
        el('h3', {}, 'Rubric'),
        ...rubric,
        el('p', { class: 'small' }, ['Total ', total]),
      ]),
    ]),
    revisionForm,
    footer,
  ];
}
