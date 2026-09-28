import { el } from '../../core/dom.js';
import { ASSIGNMENT_STATUS, assignmentBadge } from '../../domain/school.js';
import { button, fileChip, noteBox } from './primitives.js';
import { statusBadge } from './status-badge.js';

export function renderAssignment({ assignment, actions, close, reopen }) {
  const badge = assignmentBadge(assignment);
  const isRevision = assignment.status === ASSIGNMENT_STATUS.REVISION;

  let middle;
  if (isRevision) {
    middle = [
      noteBox(`▲ Reviewer feedback · ${assignment.reviewer} · ${assignment.reviewedAt}`, 'warn'),
      el('blockquote', { class: 'quote' }, `"${assignment.feedback}"`),
      el('h3', {}, 'Attachments'),
      el(
        'div',
        { class: 'files' },
        assignment.files.map((file) =>
          fileChip(file, {
            onRemove: () => {
              actions.removeAssignmentFile(file);
              reopen();
            },
          }),
        ),
      ),
      button('＋ Add asset', { small: true, onClick: () => actions.stub('File upload is coming soon.') }),
      noteBox(`⚠ Submitting creates version ${assignment.versions + 1}. Version ${assignment.versions} stays in history.`),
      noteBox('Only the course teacher and BitOS Academy can see your files.'),
    ];
  } else if (assignment.status === ASSIGNMENT_STATUS.SUBMITTED) {
    middle = [
      el('p', {}, statusBadge(`v${assignment.versions} submitted · awaiting review`, 'info')),
      el('div', { class: 'files' }, assignment.files.map((file) => fileChip(file))),
      noteBox('This version is locked. A new submission creates the next version.'),
    ];
  } else {
    middle = [
      el('div', { class: 'gradefinal' }, [
        `${assignment.grade}%`,
        el('span', { class: 'muted' }, ' · rubric total'),
      ]),
      assignment.status === ASSIGNMENT_STATUS.CORRECTED
        ? el('p', { class: 'small muted' }, 'Previous grade superseded — both stay in history.')
        : null,
    ];
  }

  return [
    el('div', { class: 'dhead' }, [
      el('h2', {}, `CS-101 · ${assignment.title}`),
      button('✕', { variant: 'ghost', small: true, onClick: close }),
    ]),
    el('p', { class: 'muted small' }, `Due ${assignment.due} · ${assignment.late}`),
    el('p', {}, statusBadge(badge.label, badge.tone)),
    ...middle,
    el('h3', {}, 'Version history'),
    el('ul', { class: 'hist' }, assignment.history.map((entry) => el('li', {}, `● ${entry}`))),
    el('div', { class: 'dlg-foot' }, [
      button('Close', { onClick: close }),
      isRevision
        ? button(`Submit version ${assignment.versions + 1}`, {
            variant: 'gold',
            onClick: () => actions.submitVersion(close),
          })
        : null,
    ]),
  ];
}
