import { el } from '../../core/dom.js';
import { bindScreen } from '../../core/reactive.js';
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
import { MEMBERSHIP, REQUEST_STATUS, membershipBadge } from '../../domain/school.js';
import { t } from '../../services/i18n/index.js';
import { button, emptyState, pageTitle } from '../components/primitives.js';
import { statusBadge } from '../components/status-badge.js';

const ACADEMY_TYPE_KEYS = Object.freeze({
  school: 'education.academyTypes.school',
  college: 'education.academyTypes.college',
  training: 'education.academyTypes.training',
});

const INVITE_ROLE_KEYS = Object.freeze({
  teacher: 'education.inviteRole.teacher',
  owner: 'education.inviteRole.admin',
  student: 'education.inviteRole.learner',
});

export function renderEducation({ app, state }) {
  const node = el('section', { class: 'screen' });

  function render(snapshot) {
    const persona = getPersona(snapshot.personaId);
    const membership = snapshot.memberships?.[persona.id] ?? MEMBERSHIP.NONE;
    const token = membershipBadge(membership);

    const children = [pageTitle(t('common.roleSpace.student'))];
    if (token) children.push(el('p', {}, statusBadge(t(token.key, token.params), token.tone)));

    children.push(myAcademies(snapshot, persona));

    if (membership !== MEMBERSHIP.ACTIVE) {
      children.push(joinCard(membership, app));
    } else {
      children.push(...classCards(snapshot, app, persona));
    }

    children.push(
      el('div', { class: 'card' }, [
        el('h3', {}, t('education.findCourse')),
        el('p', { class: 'muted small' }, t('education.browseCatalog')),
        el('div', { class: 'arow' }, [
          button(t('education.goToDiscover'), { onClick: () => app.navigate('/discover') }),
          button(t('common.workspace.joinWithLink'), { variant: 'gold', onClick: () => app.navigate('/join') }),
          button(t('education.refresh'), { small: true, onClick: () => app.refreshRecords?.() }),
        ]),
      ]),
    );

    if (!snapshot.academies?.[persona.id]) children.push(createAcademyCard(app));

    node.replaceChildren(...children);
  }

  return bindScreen(state, node, render);
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
      el('h3', {}, t('education.myAcademies')),
      el('span', { class: 'ctx' }, t('education.organizationCount', { count: memberships.length })),
    ]),
    memberships.length
      ? el('div', { class: 'list-divide' }, memberships.map(({ academy, role, status, classCount }) => {
          const badge = membershipBadge(status);
          return el('div', { class: 'row' }, [
            el('div', { style: { flex: '1 1 220px' } }, [
              el('div', { class: 'who' }, academy.name),
              el('div', { class: 'muted small' }, [
                t(ACADEMY_TYPE_KEYS[academy.type] ?? 'education.academyTypes.school'),
                ` · ${t(INVITE_ROLE_KEYS[role] ?? 'education.inviteRole.learner')}`,
                ` · ${t(classCount === 1 ? 'education.classCountOne' : 'education.classCountMany', { count: classCount })}`,
              ]),
            ]),
            badge ? statusBadge(t(badge.key, badge.params), badge.tone) : statusBadge(String(status), 'info'),
          ]);
        }))
      : el('p', { class: 'muted small' }, t('education.emptyAcademies')),
  ]);
}

function joinCard(membership, app) {
  return el('div', { class: 'card card--accent' }, [
    el('h3', {}, t('education.joinAcademy')),
    el('p', { class: 'muted small' }, t('education.joinAcademyBody')),
    membership === MEMBERSHIP.PENDING
      ? el('p', { class: 'muted small' }, t('education.waitingApproval'))
      : button(t('common.workspace.joinWithLink'), { variant: 'gold', onClick: () => app.navigate('/join') }),
  ]);
}

function createAcademyCard(app) {
  return el('div', { class: 'card' }, [
    el('h3', {}, t('common.workspace.createTitle')),
    el('p', { class: 'muted small' }, t('common.workspace.createBody')),
    button(t('common.workspace.createAction'), { small: true, onClick: () => app.openCreateAcademy() }),
  ]);
}

function classCards(state, app, persona) {
  const classrooms = classroomsForStudent(state.classrooms ?? [], persona.id, state.capabilities ?? []);
  if (!classrooms.length) {
    return [emptyState(t('education.emptyClasses'))];
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
  const badgeLabel = completion.eligible
    ? t('education.completionEligible')
    : completion.gradedCount === 0
      ? t('education.noGradesYet')
      : t('education.completionPending', { average: completion.average ?? 0 });
  const recommended = (state.recommendations ?? []).some(
    (entry) => entry.classroomId === room.id && entry.studentId === persona.id && entry.status === 'recommended',
  );

  return el('div', { class: 'card' }, [
    el('div', { class: 'crow' }, [
      el('span', { class: 'who' }, room.name),
      subject ? el('span', { class: 'ctx' }, subject.name) : null,
    ]),
    el('p', { class: 'muted small' }, teacher ? t('education.teacherAssigned', { name: teacher.displayName }) : t('education.noTeacher')),
    recommended
      ? el('p', {}, statusBadge(t('education.completionRecommended'), 'ok'))
      : badge
        ? el('p', {}, statusBadge(badgeLabel, badge.tone))
        : null,
    ...(homework.length
      ? homework.map((item) => homeworkRow(state, app, persona, item))
      : [emptyState(t('education.emptyHomework'))]),
  ]);
}

function homeworkRow(state, app, persona, item) {
  const submission = submissionFor(state.submissions ?? [], item.id, persona.id);
  const token = submissionStatusBadge(submission);
  const status = homeworkStatusBadge(item.status);
  const graded = submission?.status === SUBMISSION_STATUS.GRADED;
  const revision = submission?.status === SUBMISSION_STATUS.REVISION;
  const open = isHomeworkOpen(item);
  const label = !open
    ? t('education.closed')
    : revision
      ? t('education.reviseResubmit')
      : graded
        ? t('education.resubmit')
        : submission
          ? t('education.submitNewVersion')
          : t('education.submitHomework');

  const children = [
    el('div', { class: 'crow' }, [
      el('span', { class: 'who' }, t('education.homeworkMeta', { title: item.title, due: item.due, maxScore: item.maxScore })),
      !open
        ? statusBadge(status ? t(status.key, status.params) : t('common.badge.closed'), status?.tone ?? 'muted')
        : null,
    ]),
    item.instructions ? el('p', { class: 'muted small' }, item.instructions) : null,
    el('div', { class: 'arow' }, [
      statusBadge(t(token.key, token.params), token.tone),
      submission?.late ? statusBadge(t('education.late'), 'warn') : null,
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
