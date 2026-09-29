import { el } from '../../core/dom.js';
import { bindScreen } from '../../core/reactive.js';
import { getPersona } from '../../data/personas.js';
import {
  INVITE_STATUS,
  academyTypeLabel,
  findInviteByCode,
  inviteRoleLabel,
  parseInviteReference,
} from '../../domain/academy.js';
import { REQUEST_STATUS, ROLE } from '../../domain/school.js';
import { icon } from '../components/icon.js';
import { button, noteBox, spinner } from '../components/primitives.js';
import { statusBadge } from '../components/status-badge.js';

const LOOKUP_TIMEOUT_MS = 6000;

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
    el('span', { class: 'auth-brand__name' }, 'BitOS'),
    el('span', { class: 'auth-brand__tag' }, 'Education'),
  ]);
}

function backButton(app, route = '/welcome') {
  return el(
    'button',
    {
      class: 'auth-back',
      type: 'button',
      'aria-label': 'Back to welcome',
      onClick: () => app.navigate(route),
    },
    [
      icon('lucide:chevron-left', { size: 18, fallback: '←' }),
      el('span', {}, 'Back'),
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
    el('span', { class: 'auth-eyebrow' }, 'Invitation'),
    el('h1', { class: 'auth-title font-display' }, title),
    subtitle ? el('p', { class: 'auth-sub muted' }, subtitle) : null,
  ]);
}

function pasteView(app) {
  const input = el('input', {
    type: 'text',
    placeholder: 'Paste an invite link or code',
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-label': 'Invite link or code',
  });
  const error = el('p', { class: 'small danger', 'aria-live': 'polite' });

  return [
    topBar(app, '/welcome'),
    hero('You have an invite link?', 'Paste it here to see what you were invited to.'),
    el('div', { class: 'auth-form' }, [
      el('label', {}, 'Invite link or code'),
      input,
      error,
      el('div', { class: 'auth-foot' }, [
        button('Check invite', {
          variant: 'gold',
          className: 'auth-cta',
          onClick: () => {
            const code = parseInviteReference(input.value);
            if (!code) {
              error.textContent = 'That does not look like an invite link or code.';
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
    hero('Checking this invitation…', 'Looking it up on your relays.'),
    el('div', { class: 'auth-foot' }, [spinner('Checking invite…')]),
  ];
}

function invalidView(app, code) {
  return [
    topBar(app, '/welcome'),
    hero(code ? 'This invite is no longer valid' : 'Invite not found'),
    noteBox(
      code
        ? 'We could not find this invite on your device or relays. It may have been used, revoked, or mistyped — ask the owner for a fresh link.'
        : 'That link does not match any academy invitation.',
      'warn',
    ),
    el('div', { class: 'auth-alt' }, [
      button('Enter a link', { small: true, onClick: () => app.navigate('/join') }),
    ]),
  ];
}

function inviteView({ state, app, invite, academy, code }) {
  const inviter = getPersona(invite.createdBy);
  const classroom = invite.classroomId
    ? (state.classrooms ?? []).find((room) => room.id === invite.classroomId)
    : null;
  const academyName = academy?.name ?? 'the academy';
  const place = classroom ? `${classroom.name} · ${academyName}` : academyName;
  const roleLabel = inviteRoleLabel(invite.role);
  const isTeacher = invite.role === ROLE.TEACHER;
  const academyKind = academyTypeLabel(academy?.type);

  const children = [
    topBar(app, '/welcome'),
    hero(
      `Join ${classroom?.name ?? academyName}`,
      isTeacher
        ? `You are invited to teach ${place}.`
        : `You are invited to join ${place} as a learner.`,
    ),
    el('div', { class: 'card' }, [
      el('div', { class: 'crow' }, [
        el('span', { class: 'who' }, academyName),
        el('span', { class: 'chip__context' }, academyKind),
        el('span', { class: 'chip__context' }, roleLabel),
      ]),
      el('p', { class: 'muted small' }, ['Invited by ', el('strong', {}, inviter.displayName)]),
      el('p', { class: 'muted small' }, isTeacher
        ? 'Accepting gives you class tools. You still need a class assignment to teach.'
        : 'The owner approves memberships, so your request joins the queue.'),
      el('div', { class: 'invite-link invite-reference' }, [
        el('span', { class: 'invite-reference__label' }, 'Invitation code'),
        el('span', { class: 'invite-code mono' }, code),
      ]),
      el('p', {}, statusBadge('invite pending', 'info')),
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
      el('p', { class: 'muted small' }, `You are signed in as ${persona.displayName}.`),
      alreadyHere
        ? noteBox('You are already an active member here.')
        : null,
      el('div', { class: 'auth-actions' }, [
        button(classroom || isTeacher ? 'Accept invitation' : 'Request membership', {
          variant: 'gold',
          className: 'auth-action',
          onClick: async () => {
            const ok = await app.acceptInvite(code);
            if (ok) app.navigate('/role');
          },
        }),
        button('Use a different link', {
          variant: 'ghost',
          className: 'auth-action',
          onClick: () => app.navigate('/join'),
        }),
      ]),
    );
  } else {
    children.push(
      noteBox('Create an account or sign in to accept. Your key controls the membership.'),
      el('div', { class: 'auth-actions' }, [
        button('Create account to accept', {
          variant: 'gold',
          className: 'auth-action',
          onClick: () => {
            app.rememberInvite(code);
            app.navigate('/create');
          },
        }),
        button('Sign in', {
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
        button('Use a different link', { variant: 'ghost', small: true, onClick: () => app.navigate('/join') }),
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
