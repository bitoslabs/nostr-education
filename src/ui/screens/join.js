import { el } from '../../core/dom.js';
import { getPersona } from '../../data/personas.js';
import {
  INVITE_STATUS,
  findInviteByCode,
  inviteRoleLabel,
  parseInviteReference,
} from '../../domain/academy.js';
import { MEMBERSHIP, ROLE } from '../../domain/school.js';
import { icon } from '../components/icon.js';
import { button, noteBox } from '../components/primitives.js';
import { statusBadge } from '../components/status-badge.js';

export function renderJoin({ store, app, scope }) {
  const node = el('section', { class: 'screen screen--auth' });

  function render() {
    const state = store.getState();
    node.className = state.authed ? 'screen' : 'screen screen--auth';
    const code = parseInviteReference(state.route ?? '');
    const invite = code ? findInviteByCode(state.invites, code) : null;
    const academy = invite
      ? Object.values(state.academies ?? {}).find((entry) => entry.id === invite.academyId) ?? null
      : null;
    node.replaceChildren(...view({ state, app, invite, academy, code }));
  }

  scope.add(store.subscribe(render));
  render();
  return node;
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
            if (!code || !app.rememberInvite(input.value)) {
              error.textContent = 'That link or code is not recognized.';
              return;
            }
            app.navigate(`/join/${code}`);
          },
        }),
      ]),
    ]),
  ];
}

function invalidView(app, code) {
  return [
    topBar(app, '/welcome'),
    hero(code ? 'This invite is no longer valid' : 'Invite not found'),
    noteBox(
      code
        ? 'The link was already used, revoked, or mistyped. Ask the owner for a fresh link.'
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

  const children = [
    topBar(app, '/welcome'),
    hero(
      `Join ${classroom?.name ?? academyName}`,
      isTeacher
        ? `You are invited to teach ${place}.`
        : `You are invited to join ${place} as a learner.`,
    ),
    el('div', { class: 'card' }, [
      el('p', {}, [
        'Invited by ',
        el('strong', {}, inviter.displayName),
        ' · ',
        el('span', { class: 'chip__context' }, `as ${roleLabel}`),
      ]),
      el('p', { class: 'muted small' }, isTeacher
        ? 'Accepting gives you class tools. You still need a class assignment to teach.'
        : 'The owner approves memberships, so your request joins the queue.'),
      statusBadge('invite pending', 'info'),
    ]),
  ];

  if (state.authed) {
    const persona = getPersona(state.personaId);
    const already = state.memberships?.[persona.id];
    children.push(
      el('p', { class: 'muted small' }, `You are signed in as ${persona.displayName}.`),
      already === MEMBERSHIP.ACTIVE
        ? noteBox('You are already an active member here.')
        : null,
      el('div', { class: 'auth-foot' }, [
        button('Accept invitation', {
          variant: 'gold',
          className: 'auth-cta',
          onClick: async () => {
            const ok = await app.acceptInvite(code);
            if (ok) app.navigate('/home');
          },
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

  children.push(
    el('div', { class: 'auth-alt' }, [
      button('Use a different link', { variant: 'ghost', small: true, onClick: () => app.navigate('/join') }),
    ]),
  );

  return children;
}

function view({ state, app, invite, academy, code }) {
  if (!code) return pasteView(app);
  if (!invite) return invalidView(app, code);
  if (invite.status !== INVITE_STATUS.PENDING) return invalidView(app, code);
  return inviteView({ state, app, invite, academy, code });
}
