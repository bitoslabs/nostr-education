import { el } from '../../core/dom.js';
import { getPersona } from '../../data/personas.js';
import {
  HOMEWORK_STATUS,
  SUBMISSION_STATUS,
  classroomsForStudent,
  homeworkForClassroom,
  homeworkStatusBadge,
  isHomeworkOpen,
  submissionFor,
  submissionStatusBadge,
  subjectById,
} from '../../domain/classroom.js';
import { completionBadge, evaluateCompletion } from '../../domain/completion.js';
import { academyTypeLabel, inviteRoleLabel } from '../../domain/academy.js';
import { MEMBERSHIP, REQUEST_STATUS, membershipBadge } from '../../domain/school.js';
import { button, emptyState, pageTitle } from '../components/primitives.js';
import { statusBadge } from '../components/status-badge.js';

export function renderEducation({ store, app, scope }) {
  const node = el('section', { class: 'screen' });

  function render() {
    const state = store.getState();
    const persona = getPersona(state.personaId);
    const membership = state.memberships?.[persona.id] ?? MEMBERSHIP.NONE;
    const token = membershipBadge(membership);

    const children = [pageTitle('Education')];
    if (token) children.push(el('p', {}, statusBadge(token.label, token.tone)));

    children.push(myAcademies(state, persona));

    if (membership !== MEMBERSHIP.ACTIVE) {
      children.push(joinCard(membership, app));
    } else {
      children.push(...classCards(state, app, persona));
    }

    children.push(
      el('div', { class: 'card' }, [
        el('h3', {}, 'Find a course'),
        el('p', { class: 'muted small' }, 'Browse the catalog for new courses.'),
        button('Go to Discover', { onClick: () => app.navigate('/discover') }),
      ]),
    );

    node.replaceChildren(...children);
  }

  scope.add(store.subscribe(render));
  render();
  return node;
}

function academyMemberships(state, persona) {
  const byId = new Map();
  const academies = Object.values(state.academies ?? {});
  const classrooms = state.classrooms ?? [];

  for (const request of state.joinRequests ?? []) {
    if (request.accountId !== persona.id) continue;
    const academy = request.academyId
      ? academies.find((entry) => entry.id === request.academyId)
      : academies.find((entry) => entry.name === request.academy);
    if (!academy) continue;
    byId.set(academy.id, {
      academy,
      role: request.role ?? persona.role,
      status: request.status === REQUEST_STATUS.APPROVED ? MEMBERSHIP.ACTIVE : request.status,
    });
  }

  for (const invite of state.invites ?? []) {
    if (invite.acceptedBy !== persona.id) continue;
    const academy = academies.find((entry) => entry.id === invite.academyId);
    if (!academy) continue;
    const inClass = classrooms.some(
      (room) => room.academyId === academy.id && (room.studentIds ?? []).includes(persona.id),
    );
    const existing = byId.get(academy.id);
    byId.set(academy.id, {
      academy,
      role: invite.role ?? existing?.role ?? persona.role,
      status: existing?.status ?? (inClass ? MEMBERSHIP.ACTIVE : MEMBERSHIP.PENDING),
    });
  }

  for (const room of classrooms) {
    if (!(room.studentIds ?? []).includes(persona.id)) continue;
    const academy = academies.find((entry) => entry.id === room.academyId);
    if (!academy) continue;
    const existing = byId.get(academy.id);
    byId.set(academy.id, {
      academy,
      role: existing?.role ?? persona.role,
      status: MEMBERSHIP.ACTIVE,
    });
  }

  return [...byId.values()].map((entry) => ({
    ...entry,
    classCount: classrooms.filter(
      (room) => room.academyId === entry.academy.id && (room.studentIds ?? []).includes(persona.id),
    ).length,
  }));
}

function myAcademies(state, persona) {
  const memberships = academyMemberships(state, persona);
  return el('section', { class: 'card' }, [
    el('div', { class: 'crow' }, [
      el('h3', {}, 'My academies'),
      el('span', { class: 'ctx' }, `${memberships.length} organizations`),
    ]),
    memberships.length
      ? el('div', { class: 'list-divide' }, memberships.map(({ academy, role, status, classCount }) => {
          const badge = membershipBadge(status);
          return el('div', { class: 'row' }, [
            el('div', { style: { flex: '1 1 220px' } }, [
              el('div', { class: 'who' }, academy.name),
              el('div', { class: 'muted small' }, [
                academyTypeLabel(academy.type),
                ` · ${inviteRoleLabel(role)}`,
                ` · ${classCount} ${classCount === 1 ? 'class' : 'classes'}`,
              ]),
            ]),
            badge ? statusBadge(badge.label, badge.tone) : statusBadge(String(status), 'info'),
          ]);
        }))
      : el('p', { class: 'muted small' }, 'Academies and universities you join will appear here.'),
  ]);
}

function joinCard(membership, app) {
  return el('div', { class: 'card card--accent' }, [
    el('h3', {}, 'Join an academy'),
    el('p', { class: 'muted small' }, 'The owner approves memberships. Once active, your classes and homework appear here.'),
    membership === MEMBERSHIP.PENDING
      ? el('p', { class: 'muted small' }, 'Waiting for owner approval.')
      : button('Request to join BitOS Academy', { variant: 'gold', onClick: () => app.requestMembership() }),
  ]);
}

function classCards(state, app, persona) {
  const classrooms = classroomsForStudent(state.classrooms ?? [], persona.id);
  if (!classrooms.length) {
    return [emptyState('No classes yet. Use an invite link from your teacher or academy.')];
  }
  return classrooms.map((room) => classCard(state, app, persona, room));
}

function classCard(state, app, persona, room) {
  const subject = subjectById(state.subjects ?? [], room.subjectId);
  const teacher = room.teacherId ? getPersona(room.teacherId) : null;
  const homework = homeworkForClassroom(state.homework ?? [], room.id).filter(
    (item) => item.status !== HOMEWORK_STATUS.DRAFT,
  );
  const completion = evaluateCompletion({
    policy: room.completion,
    homework,
    submissions: state.submissions ?? [],
    studentId: persona.id,
  });
  const badge = completionBadge(completion);
  const recommended = (state.recommendations ?? []).some(
    (entry) => entry.classroomId === room.id && entry.studentId === persona.id && entry.status === 'recommended',
  );

  return el('div', { class: 'card' }, [
    el('div', { class: 'crow' }, [
      el('span', { class: 'who' }, room.name),
      subject ? el('span', { class: 'ctx' }, subject.name) : null,
    ]),
    el('p', { class: 'muted small' }, teacher ? `Teacher: ${teacher.displayName} ✓` : 'No teacher assigned'),
    recommended
      ? el('p', {}, statusBadge('✓ completion recommended', 'ok'))
      : badge
        ? el('p', {}, statusBadge(badge.label, badge.tone))
        : null,
    ...(homework.length
      ? homework.map((item) => homeworkRow(state, app, persona, item))
      : [emptyState('No homework yet.')]),
  ]);
}

function homeworkRow(state, app, persona, item) {
  const submission = submissionFor(state.submissions ?? [], item.id, persona.id);
  const token = submissionStatusBadge(submission);
  const graded = submission?.status === SUBMISSION_STATUS.GRADED;
  const revision = submission?.status === SUBMISSION_STATUS.REVISION;
  const open = isHomeworkOpen(item);
  const label = !open
    ? 'Closed'
    : revision
      ? 'Revise & resubmit'
      : graded
        ? 'Resubmit'
        : submission
          ? 'Submit new version'
          : 'Submit homework';

  const children = [
    el('div', { class: 'crow' }, [
      el('span', { class: 'who' }, `${item.title} · due ${item.due} · out of ${item.maxScore}`),
      !open
        ? statusBadge(homeworkStatusBadge(item.status)?.label ?? 'closed', homeworkStatusBadge(item.status)?.tone ?? 'muted')
        : null,
    ]),
    item.instructions ? el('p', { class: 'muted small' }, item.instructions) : null,
    el('div', { class: 'arow' }, [
      statusBadge(token.label, token.tone),
      button(label, {
        variant: graded ? 'default' : 'gold',
        small: true,
        disabled: !open,
        onClick: () => app.openSubmitHomework(item.id),
      }),
    ]),
  ];

  if ((graded || revision) && submission.feedback) {
    children.push(el('blockquote', { class: 'quote' }, `"${submission.feedback}"`));
  }
  return el('div', {}, children);
}
