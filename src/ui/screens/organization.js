import { el } from '../../core/dom.js';
import { bindScreen } from '../../core/reactive.js';
import { findPersonaByKey, getPersona } from '../../data/personas.js';
import { INVITE_STATUS, inviteBadge } from '../../domain/academy.js';
import {
  CLASS_STATUS,
  classStatusBadge,
  classroomsForAcademy,
  subjectsForAcademy,
} from '../../domain/classroom.js';
import { deliveryTone, isDeliverySettled } from '../../domain/delivery.js';
import { truncateNpub } from '../../domain/identity.js';
import { ROLE, pendingRequestCount, REQUEST_STATUS, requestBadge } from '../../domain/school.js';
import { t } from '../../services/i18n/index.js';
import { avatar, button, emptyState, noteBox, pageTitle, row, stat, tabs } from '../components/primitives.js';
import { statusBadge } from '../components/status-badge.js';

const ORG_TABS = Object.freeze([
  { id: 'overview', key: 'organization.tabs.overview' },
  { id: 'courses', key: 'organization.tabs.courses' },
  { id: 'enrollment', key: 'organization.tabs.enrollment' },
  { id: 'staff', key: 'organization.tabs.staff' },
  { id: 'sign', key: 'organization.tabs.sign' },
  { id: 'network', key: 'organization.tabs.network' },
]);

const ACADEMY_TYPE_KEYS = Object.freeze({
  school: 'organization.academyTypes.school',
  college: 'organization.academyTypes.college',
  training: 'organization.academyTypes.training',
});

const RELAY_MODE_KEYS = Object.freeze({
  read: 'organization.relayMode.read',
  write: 'organization.relayMode.write',
  'read+write': 'organization.relayMode.readWrite',
});

const RELAY_HEALTH_KEYS = Object.freeze({
  connected: 'organization.relayHealth.connected',
  connecting: 'organization.relayHealth.connecting',
  offline: 'organization.relayHealth.offline',
});

const DELIVERY_STATE_KEYS = Object.freeze({
  pending: 'organization.deliveryState.pending',
  delivered: 'organization.deliveryState.delivered',
  failed: 'organization.deliveryState.failed',
  stale: 'organization.deliveryState.stale',
});

export function renderOrganization({ app, state }) {
  const node = el('section', { class: 'screen' });

  function render(snapshot) {
    const persona = getPersona(snapshot.personaId);
    const academy = snapshot.academies?.[persona.id] ?? null;
    const pending = snapshot.signQueue.filter((entry) => entry.status === 'pending').length;

    if (!academy) {
      node.replaceChildren(
        pageTitle(t('organization.title')),
        el('div', { class: 'card card--accent' }, [
          el('h3', {}, t('organization.create.title')),
          el('p', { class: 'muted small' }, t('organization.create.body')),
          button(t('organization.create.action'), { variant: 'gold', onClick: () => app.openCreateAcademy() }),
        ]),
      );
      return;
    }

    const pendingRequests = pendingRequestCount(
      academyJoinRequests(snapshot, academy),
      academyEnrollRequests(snapshot, academy),
    );

    const tabsView = tabs(
      ORG_TABS.map((tab) => {
        if (tab.id === 'sign') {
          return { id: tab.id, label: t('organization.tabs.signCount', { count: pending }) };
        }
        if (tab.id === 'enrollment') {
          return { id: tab.id, label: t('organization.tabs.enrollmentCount', { count: pendingRequests }) };
        }
        return { id: tab.id, label: t(tab.key) };
      }),
      snapshot.orgTab,
      (id) => app.setOrgTab(id),
      { label: t('organization.title') },
    );

    node.replaceChildren(
      pageTitle(t('organization.title')),
      el(
        'p',
        { class: 'muted small' },
        `${academy.name} · ${t(ACADEMY_TYPE_KEYS[academy.type] ?? 'organization.academyTypes.school')}`,
      ),
      tabsView,
      bodyFor(snapshot, app, pending, academy),
    );
  }

  return bindScreen(state, node, render);
}

function bodyFor(state, app, pending, academy) {
  switch (state.orgTab) {
    case 'courses':
      return coursesBody(state, app, academy);
    case 'enrollment':
      return enrollmentBody(state, app, academy);
    case 'staff':
      return staffBody(state, app, academy);
    case 'sign':
      return signQueueRows(state, app, pending);
    case 'network':
      return networkBody(state, app);
    default:
      return overviewBody(state, app, pending, academy);
  }
}

function academyJoinRequests(state, academy) {
  return (state.joinRequests ?? []).filter((entry) =>
    entry.academyId ? entry.academyId === academy.id : entry.academy === academy.name,
  );
}

function academyEnrollRequests(state, academy) {
  return (state.enrollRequests ?? []).filter((entry) => entry.academyId === academy.id);
}

function overviewBody(state, app, pending, academy) {
  const healthy = state.relays.filter((relay) => relay.health === 'connected').length;
  const requests = pendingRequestCount(
    academyJoinRequests(state, academy),
    academyEnrollRequests(state, academy),
  );
  const liveCourses = classroomsForAcademy(state.classrooms ?? [], academy.id).filter(
    (room) => room.status === CLASS_STATUS.PUBLISHED,
  ).length;
  return el('div', {}, [
    el('div', { class: 'statgrid' }, [
      stat({ value: liveCourses, label: t('organization.overview.coursesLive'), onClick: () => app.setOrgTab('courses') }),
      stat({ value: requests, label: t('organization.overview.enrollmentRequests'), onClick: () => app.setOrgTab('enrollment') }),
      stat({ value: pending, label: t('organization.overview.pendingSignatures'), onClick: () => app.setOrgTab('sign') }),
      stat({ value: `${healthy}/${state.relays.length}`, label: t('organization.overview.relaysHealthy'), onClick: () => app.setOrgTab('network') }),
    ]),
    academyProfileCard(academy, app),
    el('div', { class: 'card' }, [
      el('h3', {}, t('organization.overview.growTitle')),
      el('p', { class: 'muted small' }, t('organization.overview.growBody')),
      el('div', { class: 'arow' }, [
        button(t('organization.overview.inviteTeacher'), { small: true, onClick: () => app.openInviteTeacher() }),
        button(t('organization.overview.copyLearnerLink'), { variant: 'gold', small: true, onClick: () => app.openInviteLink(ROLE.STUDENT) }),
      ]),
    ]),
    el('h3', {}, t('organization.overview.completionQueue')),
    signQueueRows(state, app, pending),
  ]);
}

function academyProfileCard(academy, app) {
  const org = getPersona(academy.orgPubkey ?? '');
  const npub = academy.orgNpub ?? null;
  return el('div', { class: 'card' }, [
    el('div', { class: 'dhead' }, [
      avatar(org, 44),
      el('span', { class: 'listrow__txt' }, [
        el('span', { class: 'list-row__title' }, academy.name),
        el('span', { class: 'mono small muted' }, npub ? truncateNpub(npub) : t('organization.profile.keyPending')),
      ]),
      statusBadge(t('organization.badge.kind0Profile'), 'info'),
    ]),
    el('p', { class: 'muted small' }, academy.about || t('organization.profile.aboutFallback')),
    el('div', { class: 'arow' }, [
      button(t('organization.editInfo'), { variant: 'gold', small: true, onClick: () => { app.setSettingsSection('academy'); app.navigate('/settings'); } }),
      npub
        ? button(t('organization.profile.copyOrgKey'), { small: true, onClick: () => app.copyText(npub, t('organization.profile.copiedToast')) })
        : null,
    ]),
    noteBox(t('organization.profile.note')),
  ]);
}

function coursesBody(state, app, academy) {
  const subjects = subjectsForAcademy(state.subjects ?? [], academy.id);
  const classrooms = classroomsForAcademy(state.classrooms ?? [], academy.id);

  const cards = subjects.map((subject) => {
    const rooms = classrooms.filter((room) => room.subjectId === subject.id);
    return el('div', { class: 'card' }, [
      el('div', { class: 'secthead subject-head' }, [
        el('span', { class: 'subject-id' }, [
          el('span', { class: 'who' }, subject.name),
          subject.code ? el('span', { class: 'ctx' }, subject.code) : null,
        ]),
        el(
          'span',
          { class: 'muted small' },
          rooms.length
            ? t(rooms.length === 1 ? 'organization.courses.classroomOne' : 'organization.courses.classroomMany', { count: rooms.length })
            : t('organization.courses.noClassrooms'),
        ),
        el('span', { class: 'spacer' }),
        el('div', { class: 'inline-actions' }, [
          button(t('common.actions.edit'), { small: true, onClick: () => app.openEditSubject(subject.id) }),
          button(t('common.actions.delete'), { small: true, onClick: () => app.deleteSubject(subject.id) }),
        ]),
      ]),
      rooms.length
        ? el('div', { class: 'rows classroom-rows' }, rooms.map((room) => classroomRow(state, app, room)))
        : emptyState(t('organization.courses.empty')),
    ]);
  });

  return el('div', {}, [
    el('div', { class: 'arow courses-toolbar' }, [
      button(t('organization.courses.newSubject'), { variant: 'gold', small: true, onClick: () => app.openCreateSubject() }),
      button(t('organization.courses.newClassroom'), { small: true, onClick: () => app.openCreateClassroom() }),
    ]),
    subjects.length ? el('div', {}, cards) : emptyState(t('organization.courses.addSubjectEmpty')),
  ]);
}

function classroomRow(state, app, room) {
  const teacher = room.teacherId ? getPersona(room.teacherId) : null;
  const badge = classStatusBadge(room.status);
  const pendingTeacher = (state.invites ?? []).find(
    (invite) =>
      invite.classroomId === room.id &&
      invite.role === ROLE.TEACHER &&
      invite.status === INVITE_STATUS.PENDING,
  );
  const learners = (room.studentIds ?? []).length;
  const teacherLine = teacher
    ? t('organization.classroom.teacherNamed', { name: teacher.displayName })
    : pendingTeacher
      ? t('organization.classroom.teacherInvitePending')
      : t('organization.classroom.noTeacher');

  const actions = [
    pendingTeacher
      ? button(t('organization.classroom.copyInvite'), { small: true, onClick: () => app.copyInviteLink(pendingTeacher.id) })
      : null,
    !teacher ? button(t('organization.classroom.inviteTeacher'), { small: true, onClick: () => app.openInviteClassTeacher(room.id) }) : null,
    teacher && room.status !== CLASS_STATUS.PUBLISHED && room.status !== CLASS_STATUS.ARCHIVED
      ? button(t('organization.classroom.publish'), { variant: 'gold', small: true, onClick: () => app.publishClassroom(room.id) })
      : null,
    button(t('organization.classroom.manage'), { small: true, onClick: () => app.openManageClassroom(room.id) }),
  ].filter(Boolean);

  return el('div', { class: 'classroom-row' }, [
    el('div', { class: 'classroom-row__title' }, [
      el('span', { class: 'who' }, room.name),
      room.term ? el('span', { class: 'muted small' }, room.term) : null,
    ]),
    el('div', { class: 'classroom-row__actions' }, actions),
    el('div', { class: 'classroom-row__meta' }, [
      badge ? statusBadge(t(badge.key, badge.params), badge.tone) : null,
      el('span', { class: 'muted small' }, teacherLine),
      teacher
        ? el(
            'span',
            { class: 'muted small' },
            t(learners === 1 ? 'organization.classroom.learnerOne' : 'organization.classroom.learnerMany', { count: learners }),
          )
        : null,
    ]),
  ]);
}

function enrollmentBody(state, app, academy) {
  const requestsByMember = new Map();
  for (const entry of academyJoinRequests(state, academy)) {
    const key = entry.accountId ?? entry.id;
    if (!requestsByMember.has(key)) requestsByMember.set(key, entry);
  }
  const joinRows = [...requestsByMember.values()].map((entry) =>
    row([
      el('span', { class: 'who' }, entry.displayName),
      el('span', { class: 'muted small mono' }, entry.handle || t('organization.enrollment.noHandle')),
      statusBadge(t(`organization.requestStatus.${entry.status}`), requestBadge(entry.status)?.tone ?? 'muted'),
      el('span', { class: 'spacer' }),
      ...(entry.status === REQUEST_STATUS.PENDING
        ? [
            button(t('organization.enrollment.decline'), { small: true, onClick: () => app.declineJoin(entry.id) }),
            button(t('organization.enrollment.accept'), { variant: 'gold', small: true, onClick: () => app.acceptJoin(entry.id) }),
          ]
        : []),
    ]),
  );

  const enrollRows = academyEnrollRequests(state, academy).map((entry) =>
    row([
      el('span', { class: 'who' }, entry.learnerName),
      el('span', { class: 'muted small' }, entry.courseTitle || entry.courseId),
      statusBadge(t(`organization.requestStatus.${entry.status}`), requestBadge(entry.status)?.tone ?? 'muted'),
      el('span', { class: 'spacer' }),
      ...(entry.status === REQUEST_STATUS.PENDING
        ? [
            button(t('organization.enrollment.decline'), { small: true, onClick: () => app.declineEnrollment(entry.id) }),
            button(t('organization.enrollment.accept'), { variant: 'gold', small: true, onClick: () => app.acceptEnrollment(entry.id) }),
          ]
        : []),
    ]),
  );

  const links = state.invites.filter(
    (invite) =>
      invite.academyId === academy.id &&
      !invite.target &&
      invite.status === INVITE_STATUS.PENDING &&
      invite.role === ROLE.STUDENT,
  );

  return el('div', {}, [
    el('div', { class: 'card' }, [
      el('h3', {}, t('organization.enrollment.inviteTitle')),
      el('p', { class: 'muted small' }, t('organization.enrollment.inviteBody')),
      el('div', { class: 'arow' }, [
        button(t('organization.enrollment.shareJoinLink'), { variant: 'gold', small: true, onClick: () => app.openInviteLink(ROLE.STUDENT) }),
      ]),
      links.length
        ? el(
            'div',
            { class: 'rows' },
            links.map((invite) =>
              row([
                el('span', { class: 'mono small' }, invite.code),
                statusBadge(t('organization.inviteStatus.pending'), 'info'),
                el('span', { class: 'spacer' }),
                button(t('common.actions.copy'), { small: true, onClick: () => app.copyInviteLink(invite.id) }),
                button(t('organization.revoke'), { small: true, onClick: () => app.revokeInvite(invite.id) }),
              ]),
            ),
          )
        : null,
    ]),
    el('h3', {}, t('organization.enrollment.membershipTitle')),
    joinRows.length ? el('div', { class: 'rows' }, joinRows) : emptyState(t('organization.enrollment.membershipEmpty')),
    el('h3', {}, t('organization.enrollment.classRequestsTitle')),
    enrollRows.length ? el('div', { class: 'rows' }, enrollRows) : emptyState(t('organization.enrollment.classRequestsEmpty')),
  ]);
}

function shortTarget(target) {
  const value = String(target ?? '').trim();
  if (!value) return t('organization.staff.unknownKey');
  return value.startsWith('npub1') ? truncateNpub(value) : value;
}

function staffIdentity(invite) {
  const persona = (invite.acceptedBy ? getPersona(invite.acceptedBy) : findPersonaByKey(invite.target)) ?? null;
  const target = shortTarget(invite.target);
  const named = String(invite.name ?? '').trim() || persona?.displayName || '';
  const name = named || target;
  return {
    persona: persona?.loaded ? persona : null,
    name,
    secondary: named && named !== target ? target : null,
  };
}

function staffRow({ persona, name, secondary, badge, actions }) {
  const face = persona?.picture
    ? persona
    : { avatar: String(name ?? '').trim().charAt(0).toUpperCase() || '🙂' };
  return el('div', { class: 'staff-row' }, [
    el('div', { class: 'staff-row__who' }, [
      avatar(face, 36),
      el('span', { class: 'staff-row__id' }, [
        el('span', { class: 'staff-row__name' }, name),
        secondary ? el('span', { class: 'staff-row__sub mono' }, secondary) : null,
      ]),
    ]),
    actions?.length ? el('div', { class: 'staff-row__actions' }, actions) : null,
    el('div', { class: 'staff-row__meta' }, [badge]),
  ]);
}

function staffBody(state, app, academy) {
  const invites = state.invites.filter((invite) => invite.academyId === academy.id);
  const accepted = invites.filter(
    (invite) => invite.role === ROLE.TEACHER && invite.status === INVITE_STATUS.ACCEPTED,
  );
  const pending = invites.filter(
    (invite) => invite.role === ROLE.TEACHER && invite.status === INVITE_STATUS.PENDING,
  );
  const owner = getPersona(state.personaId);
  const ownerName = owner.displayName || truncateNpub(owner.npub);

  const teacherRows = accepted.map((invite) => {
    const info = staffIdentity(invite);
    return staffRow({
      persona: info.persona,
      name: info.name,
      secondary: info.secondary,
      badge: statusBadge(t('organization.badge.teacher'), 'ok'),
      actions: [
        button(t('organization.staff.roles'), { small: true, onClick: () => app.stub(t('organization.staff.rolesStub')) }),
      ],
    });
  });

  const pendingRows = pending.map((invite) => {
    const info = staffIdentity(invite);
    return staffRow({
      persona: info.persona,
      name: info.name,
      secondary: info.secondary,
      badge: statusBadge(t(`organization.inviteStatus.${invite.status}`), inviteBadge(invite.status)?.tone ?? 'info'),
      actions: [
        button(t('organization.copyLink'), { small: true, onClick: () => app.copyInviteLink(invite.id) }),
        button(t('organization.revoke'), { small: true, className: 'btn--danger', onClick: () => app.revokeInvite(invite.id) }),
      ],
    });
  });

  return el('div', {}, [
    el('div', { class: 'arow' }, [
      button(t('organization.staff.inviteTeacher'), { variant: 'gold', small: true, onClick: () => app.openInviteTeacher() }),
    ]),
    el('h3', {}, t('organization.staff.teachers')),
    teacherRows.length ? el('div', { class: 'rows' }, teacherRows) : emptyState(t('organization.staff.teachersEmpty')),
    pending.length ? el('h3', {}, t('organization.staff.pendingInvites', { count: pending.length })) : null,
    pending.length ? el('div', { class: 'rows' }, pendingRows) : null,
    el('h3', {}, t('organization.staff.issuerTitle')),
    el('div', { class: 'card' }, [
      el('p', { class: 'small' }, [
        t('organization.staff.signerKey'),
        el('span', { class: 'mono' }, academy.orgNpub ? truncateNpub(academy.orgNpub) : t('organization.staff.keyGenerated')),
        ' ',
        statusBadge(t(academy.orgNpub ? 'organization.badge.active' : 'organization.badge.notCreated'), academy.orgNpub ? 'ok' : 'muted'),
      ]),
      el('p', { class: 'small muted' }, t('organization.staff.authorizedSigners', { name: ownerName })),
      el('div', { class: 'arow' }, [
        button(t('organization.editInfo'), { small: true, onClick: () => { app.setSettingsSection('academy'); app.navigate('/settings'); } }),
        button(t('organization.staff.addSigner'), { small: true, onClick: () => app.stub(t('organization.staff.addSignerStub')) }),
      ]),
    ]),
  ]);
}

function signQueueRows(state, app, pending) {
  if (!state.signQueue.length) return emptyState(t('organization.sign.empty'));

  return el(
    'div',
    { class: 'rows' },
    state.signQueue.map((entry) =>
      row([
        el('span', { class: 'who' }, entry.learnerName),
        el('span', { class: 'muted small' }, t('organization.sign.rowMeta', { course: entry.course, time: entry.time })),
        statusBadge(
          t(`organization.signStatus.${entry.status}`),
          entry.status === 'pending' ? 'info' : entry.status === 'signed' ? 'ok' : 'err',
        ),
        entry.status === 'pending'
          ? el('span', { class: 'spacer' })
          : null,
        entry.status === 'pending'
          ? button(t('organization.sign.review'), { variant: 'gold', small: true, onClick: () => app.openSign(entry.id) })
          : null,
      ]),
    ),
  );
}

function networkBody(state, app) {
  const relays = el(
    'div',
    { class: 'rows' },
    state.relays.map((relay) =>
      row([
        el('span', { class: 'mono small' }, relay.url),
        statusBadge(t(RELAY_MODE_KEYS[relay.mode] ?? relay.mode), 'info'),
        el('span', { class: 'muted small' }, relay.latencyMs ? `${relay.latencyMs} ms` : t(RELAY_HEALTH_KEYS[relay.health] ?? relay.health)),
        relay.health === 'offline' ? el('span', { class: 'spacer' }) : null,
        relay.health === 'offline'
          ? button(t('common.actions.retry'), { small: true, onClick: () => app.checkRelays() })
          : null,
      ]),
    ),
  );

  const deliveries = el(
    'div',
    { class: 'rows' },
    state.deliveries.map((entry) =>
      row([
        el('span', { class: 'small' }, entry.label),
        statusBadge(t(DELIVERY_STATE_KEYS[entry.state] ?? entry.state), deliveryTone(entry.state)),
        el('span', { class: 'spacer' }),
        isDeliverySettled(entry.state)
          ? null
          : button(t('common.actions.retry'), { small: true, onClick: () => app.retryDelivery(entry.id) }),
      ]),
    ),
  );

  const stale = state.deliveries.find((entry) => entry.state === 'stale');
  const staleDays = Number.isFinite(stale?.staleDays) ? stale.staleDays : 0;
  return el('div', {}, [
    el('h3', {}, t('organization.network.relaysTitle')),
    relays,
    el('h3', {}, t('organization.network.deliveryTitle')),
    deliveries,
    stale
      ? noteBox(
          t(staleDays === 1 ? 'organization.network.staleOne' : 'organization.network.staleMany', { days: staleDays }),
          'warn',
        )
      : null,
  ]);
}
