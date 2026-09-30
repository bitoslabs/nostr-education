import { el } from '../../core/dom.js';
import { bindScreen } from '../../core/reactive.js';
import { getPersona } from '../../data/personas.js';
import {
  INVITE_STATUS,
  findInviteByCode,
  parseInviteReference,
} from '../../domain/academy.js';
import { REQUEST_STATUS, ROLE } from '../../domain/school.js';
import { t } from '../../services/i18n/index.js';
import { icon } from '../components/icon.js';
import { button, noteBox, spinner } from '../components/primitives.js';
import { statusBadge } from '../components/status-badge.js';

const LOOKUP_TIMEOUT_MS = 6000;

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

export function renderJoin({ app, scope, state }) {
  const node = el('section', { class: 'screen screen--auth' });
  const checks = new Map();
  const gaveUp = new Set();

  scope.add(() => {
    for (const timer of checks.values()) clearTimeout(timer);
    checks.clear();
  });

  function render(snapshot = state.val) {
    node.className = snapshot.authed ? 'screen' : 'screen screen--auth';
    const code = parseInviteReference(snapshot.route ?? '');
    const invite = code ? findInviteByCode(snapshot.invites, code) : null;
    const academy = invite
      ? Object.values(snapshot.academies ?? {}).find((entry) => entry.id === invite.academyId) ?? null
      : null;

    if (code && !invite) {
      if (!gaveUp.has(code) && !checks.has(code)) {
        checks.set(
          code,
          setTimeout(() => {
            checks.delete(code);
            gaveUp.add(code);
            render();
          }, LOOKUP_TIMEOUT_MS),
        );
      }
    } else if (checks.has(code)) {
      clearTimeout(checks.get(code));
      checks.delete(code);
    }

    if (code && !invite && !gaveUp.has(code)) {
      node.replaceChildren(...checkingView(app));
      return;
    }
    node.replaceChildren(...view({ state: snapshot, app, invite, academy, code }).filter((child) => child != null && child !== false));
  }

  return bindScreen(state, node, render);
}

function brand() {
  return el('span', { class: 'auth-brand' }, [
    el('span', { class: 'auth-brand__mark', 'aria-hidden': 'true' }, '🐝'),
    el('span', { class: 'auth-brand__name' }, t('common.brand.name')),
    el('span', { class: 'auth-brand__tag' }, t('common.brand.tag')),
  ]);
}

function backButton(app, route = '/welcome') {
  return el(
    'button',
    {
      class: 'auth-back',
      type: 'button',
      'aria-label': t('education.join.backToWelcome'),
      onClick: () => app.navigate(route),
    },
    [
      icon('lucide:chevron-left', { size: 18, fallback: '←' }),
      el('span', {}, t('common.actions.back')),
    ],
  );
}

function topBar(app, backTo = '/welcome') {
  return el('div', { class: 'auth-top' }, [
    backButton(app, backTo),
    el('span', { class: 'spacer' }),
    brand(),
  ]);
}

function hero(title, subtitle) {
  return el('header', { class: 'auth-hero' }, [
    el('span', { class: 'auth-eyebrow' }, t('education.join.invitation')),
    el('h1', { class: 'auth-title font-display' }, title),
    subtitle ? el('p', { class: 'auth-sub muted' }, subtitle) : null,
  ]);
}

function pasteView(app) {
  const input = el('input', {
    type: 'text',
    placeholder: t('education.join.pastePlaceholder'),
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-label': t('education.join.linkOrCode'),
  });
  const error = el('p', { class: 'small danger', 'aria-live': 'polite' });

  return [
    topBar(app, '/welcome'),
    hero(t('education.join.pasteTitle'), t('education.join.pasteSubtitle')),
    el('div', { class: 'auth-form' }, [
      el('label', {}, t('education.join.linkOrCode')),
      input,
      error,
      el('div', { class: 'auth-foot' }, [
        button(t('education.join.check'), {
          variant: 'gold',
          className: 'auth-cta',
          onClick: () => {
            const code = parseInviteReference(input.value);
            if (!code) {
              error.textContent = t('education.join.invalidFormat');
              return;
            }
            app.navigate(`/join/${code}`);
          },
        }),
      ]),
    ]),
  ];
}

function checkingView(app) {
  return [
    topBar(app, '/welcome'),
    hero(t('education.join.checkingTitle'), t('education.join.checkingSubtitle')),
    el('div', { class: 'auth-foot' }, [spinner(t('education.join.checking'))]),
  ];
}

function invalidView(app, code) {
  return [
    topBar(app, '/welcome'),
    hero(code ? t('education.join.invalidTitle') : t('education.join.notFoundTitle')),
    noteBox(
      code
        ? t('education.join.invalidBody')
        : t('education.join.notFoundBody'),
      'warn',
    ),
    el('div', { class: 'auth-alt' }, [
      button(t('education.join.enterLink'), { small: true, onClick: () => app.navigate('/join') }),
    ]),
  ];
}

function inviteView({ state, app, invite, academy, code }) {
  const inviter = getPersona(invite.createdBy);
  const classroom = invite.classroomId
    ? (state.classrooms ?? []).find((room) => room.id === invite.classroomId)
    : null;
  const academyName = academy?.name ?? t('education.join.theAcademy');
  const place = classroom ? `${classroom.name} · ${academyName}` : academyName;
  const roleLabel = t(INVITE_ROLE_KEYS[invite.role] ?? 'education.inviteRole.learner');
  const isTeacher = invite.role === ROLE.TEACHER;
  const academyKind = t(ACADEMY_TYPE_KEYS[academy?.type] ?? 'education.academyTypes.school');

  const children = [
    topBar(app, '/welcome'),
    hero(
      t('education.join.title', { name: classroom?.name ?? academyName }),
      isTeacher
        ? t('education.join.teacherBody', { place })
        : t('education.join.learnerBody', { place }),
    ),
    el('div', { class: 'card' }, [
      el('div', { class: 'crow' }, [
        el('span', { class: 'who' }, academyName),
        el('span', { class: 'chip__context' }, academyKind),
        el('span', { class: 'chip__context' }, roleLabel),
      ]),
      el('p', { class: 'muted small' }, [t('education.join.invitedBy'), el('strong', {}, inviter.displayName)]),
      el('p', { class: 'muted small' }, isTeacher
        ? t('education.join.teacherAcceptBody')
        : t('education.join.learnerAcceptBody')),
      el('div', { class: 'invite-link invite-reference' }, [
        el('span', { class: 'invite-reference__label' }, t('education.join.code')),
        el('span', { class: 'invite-code mono' }, code),
      ]),
      el('p', {}, statusBadge(t('education.join.pending'), 'info')),
    ]),
  ];

  if (state.authed) {
    const persona = getPersona(state.personaId);
    const alreadyHere = (state.joinRequests ?? []).some(
      (request) =>
        request.accountId === persona.id &&
        (request.academyId === invite.academyId || (!request.academyId && request.academy === academyName)) &&
        request.status === REQUEST_STATUS.APPROVED,
    ) || (state.classrooms ?? []).some(
      (room) =>
        room.academyId === invite.academyId &&
        (room.teacherId === persona.id || (room.studentIds ?? []).includes(persona.id)),
    );
    children.push(
      el('p', { class: 'muted small' }, t('education.join.signedInAs', { name: persona.displayName })),
      alreadyHere
        ? noteBox(t('education.join.alreadyMember'))
        : null,
      el('div', { class: 'auth-actions' }, [
        button(classroom || isTeacher ? t('education.join.accept') : t('education.join.requestMembership'), {
          variant: 'gold',
          className: 'auth-action',
          onClick: async () => {
            const ok = await app.acceptInvite(code);
            if (ok) app.navigate('/role');
          },
        }),
        button(t('education.join.differentLink'), {
          variant: 'ghost',
          className: 'auth-action',
          onClick: () => app.navigate('/join'),
        }),
      ]),
    );
  } else {
    children.push(
      noteBox(t('education.join.createNote')),
      el('div', { class: 'auth-actions' }, [
        button(t('education.join.createToAccept'), {
          variant: 'gold',
          className: 'auth-action',
          onClick: () => {
            app.rememberInvite(code);
            app.navigate('/create');
          },
        }),
        button(t('common.actions.signIn'), {
          className: 'auth-action',
          onClick: () => {
            app.rememberInvite(code);
            app.navigate('/signin');
          },
        }),
      ]),
    );
  }

  if (!state.authed) {
    children.push(
      el('div', { class: 'auth-alt' }, [
        button(t('education.join.differentLink'), { variant: 'ghost', small: true, onClick: () => app.navigate('/join') }),
      ]),
    );
  }

  return children;
}

function view({ state, app, invite, academy, code }) {
  if (!code) return pasteView(app);
  if (!invite) return invalidView(app, code);
  if (invite.status !== INVITE_STATUS.PENDING) return invalidView(app, code);
  return inviteView({ state, app, invite, academy, code });
}
