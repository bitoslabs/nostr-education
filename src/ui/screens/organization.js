import { el } from '../../core/dom.js';
import { bindScreen } from '../../core/reactive.js';
import { findPersonaByKey, getPersona } from '../../data/personas.js';
import { INVITE_STATUS, academyTypeLabel, inviteBadge } from '../../domain/academy.js';
import {
  CLASS_STATUS,
  classStatusBadge,
  classroomsForAcademy,
  subjectsForAcademy,
} from '../../domain/classroom.js';
import { deliveryCopy, deliveryTone, isDeliverySettled, staleCopy } from '../../domain/delivery.js';
import { truncateNpub } from '../../domain/identity.js';
import { ROLE, pendingRequestCount, REQUEST_STATUS, requestBadge } from '../../domain/school.js';
import { avatar, button, emptyState, noteBox, pageTitle, row, stat, tabs } from '../components/primitives.js';
import { statusBadge } from '../components/status-badge.js';

const ORG_TABS = Object.freeze([
  { id: 'overview', label: 'Overview' },
  { id: 'courses', label: 'Courses' },
  { id: 'enrollment', label: 'Enrollment' },
  { id: 'staff', label: 'Staff & roles' },
  { id: 'sign', label: 'Sign queue' },
  { id: 'network', label: 'Network' },
]);

export function renderOrganization({ app, state }) {
  const node = el('section', { class: 'screen' });

  function render(snapshot) {
    const persona = getPersona(snapshot.personaId);
    const academy = snapshot.academies?.[persona.id] ?? null;
    const pending = snapshot.signQueue.filter((entry) => entry.status === 'pending').length;

    if (!academy) {
      node.replaceChildren(
        pageTitle('Organization'),
        el('div', { class: 'card card--accent' }, [
          el('h3', {}, 'Create your academy'),
          el('p', { class: 'muted small' }, 'You do not own an academy yet. Create one to invite teachers and learners.'),
          button('Create academy', { variant: 'gold', onClick: () => app.openCreateAcademy() }),
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
        if (tab.id === 'sign') return { id: tab.id, label: `Sign queue (${pending})` };
        if (tab.id === 'enrollment') return { id: tab.id, label: `Enrollment (${pendingRequests})` };
        return tab;
      }),
      snapshot.orgTab,
      (id) => app.setOrgTab(id),
      { label: 'Organization' },
    );

    node.replaceChildren(
      pageTitle('Organization'),
      el('p', { class: 'muted small' }, `${academy.name} · ${academyTypeLabel(academy.type)}`),
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
      stat({ value: liveCourses, label: 'courses live', onClick: () => app.setOrgTab('courses') }),
      stat({ value: requests, label: 'enrollment requests', onClick: () => app.setOrgTab('enrollment') }),
      stat({ value: pending, label: 'pending signatures', onClick: () => app.setOrgTab('sign') }),
      stat({ value: `${healthy}/${state.relays.length}`, label: 'relays healthy', onClick: () => app.setOrgTab('network') }),
    ]),
    academyProfileCard(academy, app),
    el('div', { class: 'card' }, [
      el('h3', {}, 'Grow your academy'),
      el('p', { class: 'muted small' }, 'Invite a teacher by handle, or share a join link for learners.'),
      el('div', { class: 'arow' }, [
        button('Invite a teacher', { small: true, onClick: () => app.openInviteTeacher() }),
        button('Copy learner link', { variant: 'gold', small: true, onClick: () => app.openInviteLink(ROLE.STUDENT) }),
      ]),
    ]),
    el('h3', {}, 'Completion queue'),
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
        el('span', { class: 'mono small muted' }, npub ? truncateNpub(npub) : 'organization key pending'),
      ]),
      statusBadge('kind:0 profile', 'info'),
    ]),
    el('p', { class: 'muted small' }, academy.about || 'Add a public description for your academy profile.'),
    el('div', { class: 'arow' }, [
      button('Edit info', { variant: 'gold', small: true, onClick: () => { app.setSettingsSection('academy'); app.navigate('/settings'); } }),
      npub
        ? button('Copy org key', { small: true, onClick: () => app.copyText(npub, 'Organization npub copied.') })
        : null,
    ]),
    noteBox('Public kind:0 profile signed by the academy key — separate from your personal key.'),
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
          rooms.length ? `${rooms.length} classroom${rooms.length === 1 ? '' : 's'}` : 'no classrooms',
        ),
        el('span', { class: 'spacer' }),
        el('div', { class: 'inline-actions' }, [
          button('Edit', { small: true, onClick: () => app.openEditSubject(subject.id) }),
          button('Delete', { small: true, onClick: () => app.deleteSubject(subject.id) }),
        ]),
      ]),
      rooms.length
        ? el('div', { class: 'rows classroom-rows' }, rooms.map((room) => classroomRow(state, app, room)))
        : emptyState('No classrooms yet.'),
    ]);
  });

  return el('div', {}, [
    el('div', { class: 'arow courses-toolbar' }, [
      button('＋ New subject', { variant: 'gold', small: true, onClick: () => app.openCreateSubject() }),
      button('＋ New classroom', { small: true, onClick: () => app.openCreateClassroom() }),
    ]),
    subjects.length ? el('div', {}, cards) : emptyState('Add a subject to start building classrooms.'),
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
    ? `teacher ${teacher.displayName} ✓`
    : pendingTeacher
      ? 'teacher invite pending'
      : 'no teacher';

  const actions = [
    pendingTeacher
      ? button('Copy invite', { small: true, onClick: () => app.copyInviteLink(pendingTeacher.id) })
      : null,
    !teacher ? button('Invite teacher', { small: true, onClick: () => app.openInviteClassTeacher(room.id) }) : null,
    teacher && room.status !== CLASS_STATUS.PUBLISHED && room.status !== CLASS_STATUS.ARCHIVED
      ? button('Publish', { variant: 'gold', small: true, onClick: () => app.publishClassroom(room.id) })
      : null,
    button('Manage', { small: true, onClick: () => app.openManageClassroom(room.id) }),
  ].filter(Boolean);

  return el('div', { class: 'classroom-row' }, [
    el('div', { class: 'classroom-row__title' }, [
      el('span', { class: 'who' }, room.name),
      room.term ? el('span', { class: 'muted small' }, room.term) : null,
    ]),
    el('div', { class: 'classroom-row__actions' }, actions),
    el('div', { class: 'classroom-row__meta' }, [
      badge ? statusBadge(badge.label, badge.tone) : null,
      el('span', { class: 'muted small' }, teacherLine),
      teacher ? el('span', { class: 'muted small' }, `${learners} learner${learners === 1 ? '' : 's'}`) : null,
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
      el('span', { class: 'muted small mono' }, entry.handle || 'no handle'),
      statusBadge(entry.status, requestBadge(entry.status)?.tone ?? 'muted'),
      el('span', { class: 'spacer' }),
      ...(entry.status === REQUEST_STATUS.PENDING
        ? [
            button('Decline', { small: true, onClick: () => app.declineJoin(entry.id) }),
            button('Accept', { variant: 'gold', small: true, onClick: () => app.acceptJoin(entry.id) }),
          ]
        : []),
    ]),
  );

  const enrollRows = academyEnrollRequests(state, academy).map((entry) =>
    row([
      el('span', { class: 'who' }, entry.learnerName),
      el('span', { class: 'muted small' }, entry.courseTitle || entry.courseId),
      statusBadge(entry.status, requestBadge(entry.status)?.tone ?? 'muted'),
      el('span', { class: 'spacer' }),
      ...(entry.status === REQUEST_STATUS.PENDING
        ? [
            button('Decline', { small: true, onClick: () => app.declineEnrollment(entry.id) }),
            button('Accept', { variant: 'gold', small: true, onClick: () => app.acceptEnrollment(entry.id) }),
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
      el('h3', {}, 'Invite learners'),
      el('p', { class: 'muted small' }, 'Share a join link. Learners accept it, then land in the membership queue for your approval.'),
      el('div', { class: 'arow' }, [
        button('Share join link', { variant: 'gold', small: true, onClick: () => app.openInviteLink(ROLE.STUDENT) }),
      ]),
      links.length
        ? el(
            'div',
            { class: 'rows' },
            links.map((invite) =>
              row([
                el('span', { class: 'mono small' }, invite.code),
                statusBadge('invite pending', 'info'),
                el('span', { class: 'spacer' }),
                button('Copy', { small: true, onClick: () => app.copyInviteLink(invite.id) }),
                button('Revoke', { small: true, onClick: () => app.revokeInvite(invite.id) }),
              ]),
            ),
          )
        : null,
    ]),
    el('h3', {}, 'Membership requests'),
    joinRows.length ? el('div', { class: 'rows' }, joinRows) : emptyState('No membership requests ✓'),
    el('h3', {}, 'Class enrollment requests'),
    enrollRows.length ? el('div', { class: 'rows' }, enrollRows) : emptyState('No enrollment requests ✓'),
  ]);
}

function shortTarget(target) {
  const value = String(target ?? '').trim();
  if (!value) return 'unknown key';
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
      badge: statusBadge('teacher ✓', 'ok'),
      actions: [
        button('Roles ▾', { small: true, onClick: () => app.stub('Role editing is coming soon.') }),
      ],
    });
  });

  const pendingRows = pending.map((invite) => {
    const info = staffIdentity(invite);
    return staffRow({
      persona: info.persona,
      name: info.name,
      secondary: info.secondary,
      badge: statusBadge(inviteBadge(invite.status)?.label ?? 'invite pending', inviteBadge(invite.status)?.tone ?? 'info'),
      actions: [
        button('Copy link', { small: true, onClick: () => app.copyInviteLink(invite.id) }),
        button('Revoke', { small: true, className: 'btn--danger', onClick: () => app.revokeInvite(invite.id) }),
      ],
    });
  });

  return el('div', {}, [
    el('div', { class: 'arow' }, [
      button('＋ Invite teacher', { variant: 'gold', small: true, onClick: () => app.openInviteTeacher() }),
    ]),
    el('h3', {}, 'Teachers'),
    teacherRows.length ? el('div', { class: 'rows' }, teacherRows) : emptyState('No teachers yet — invite one.'),
    pending.length ? el('h3', {}, `Pending teacher invites (${pending.length})`) : null,
    pending.length ? el('div', { class: 'rows' }, pendingRows) : null,
    el('h3', {}, 'Issuer authorization'),
    el('div', { class: 'card' }, [
      el('p', { class: 'small' }, [
        'Organization signer key ',
        el('span', { class: 'mono' }, academy.orgNpub ? truncateNpub(academy.orgNpub) : 'generated on first publish'),
        ' ',
        statusBadge(academy.orgNpub ? '✓ active' : 'not created', academy.orgNpub ? 'ok' : 'muted'),
      ]),
      el('p', { class: 'small muted' }, `Authorized signers: ${ownerName} (you). Invitations and admin access never grant signing power.`),
      el('div', { class: 'arow' }, [
        button('Edit info', { small: true, onClick: () => { app.setSettingsSection('academy'); app.navigate('/settings'); } }),
        button('＋ Add signer…', { small: true, onClick: () => app.stub('Signer management is coming soon.') }),
      ]),
    ]),
  ]);
}

function signQueueRows(state, app, pending) {
  if (!state.signQueue.length) return emptyState('No pending signatures ✓');

  return el(
    'div',
    { class: 'rows' },
    state.signQueue.map((entry) =>
      row([
        el('span', { class: 'who' }, entry.learnerName),
        el('span', { class: 'muted small' }, `${entry.course} · criteria met · sent ${entry.time}`),
        statusBadge(entry.status, entry.status === 'pending' ? 'info' : entry.status === 'signed' ? 'ok' : 'err'),
        entry.status === 'pending'
          ? el('span', { class: 'spacer' })
          : null,
        entry.status === 'pending'
          ? button('Review', { variant: 'gold', small: true, onClick: () => app.openSign(entry.id) })
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
        statusBadge(relay.mode, 'info'),
        el('span', { class: 'muted small' }, relay.latencyMs ? `${relay.latencyMs} ms` : relay.health),
        relay.health === 'offline' ? el('span', { class: 'spacer' }) : null,
        relay.health === 'offline'
          ? button('Retry', { small: true, onClick: () => app.checkRelays() })
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
        statusBadge(deliveryCopy(entry.state), deliveryTone(entry.state)),
        el('span', { class: 'spacer' }),
        isDeliverySettled(entry.state)
          ? null
          : button('Retry', { small: true, onClick: () => app.retryDelivery(entry.id) }),
      ]),
    ),
  );

  const stale = state.deliveries.find((entry) => entry.state === 'stale');
  return el('div', {}, [
    el('h3', {}, 'Relays'),
    relays,
    el('h3', {}, 'Delivery log'),
    deliveries,
    stale ? noteBox(staleCopy(stale.staleDays), 'warn') : null,
  ]);
}
