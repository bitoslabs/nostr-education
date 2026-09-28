import { el } from '../../core/dom.js';
import { getPersona, getPersonaIds } from '../../data/personas.js';
import { SIGNER_TYPES, signerType } from '../../domain/account.js';
import { academyTypeLabel } from '../../domain/academy.js';
import { classroomsForStudent, classroomsForTeacher, subjectById } from '../../domain/classroom.js';
import { normalizeHandle, validateHandle } from '../../domain/handle.js';
import { identitySecondary, isVerified, truncateNpub } from '../../domain/identity.js';
import { relayModeLabel } from '../../domain/relay.js';
import { MEMBERSHIP, REQUEST_STATUS, ROLE, membershipBadge } from '../../domain/school.js';
import { backupNsecForPubkey, decodeKey } from '../../services/nostr.js';
import { loadOrgSecret, loadSecretKey } from '../../services/storage.js';
import { ACCENTS, THEME_CHOICES } from '../../services/theme.js';
import { icon } from '../components/icon.js';
import { identityChip } from '../components/identity-chip.js';
import { renderEditAcademy } from '../components/academy-dialog.js';
import { renderEditProfile } from '../components/profile-dialog.js';
import { avatar, button, emptyState, noteBox, segmented, swatchGroup } from '../components/primitives.js';
import { statusBadge } from '../components/status-badge.js';

const SECTIONS = Object.freeze({
  appearance: { title: 'Appearance', icon: 'lucide:palette', fallback: '🎨', sub: 'theme · accent · density' },
  profile: { title: 'My profile', icon: 'lucide:id-card', fallback: '🪪', sub: 'name · picture · links' },
  academy: { title: 'Academy info', icon: 'lucide:building-2', fallback: '🏫', sub: 'name · logo · time zone' },
  identity: { title: 'Account & identity', icon: 'lucide:user-round', fallback: '👤', sub: 'keys · handle · signers' },
  membership: { title: 'Membership', icon: 'lucide:school', fallback: '🎓', sub: 'academy access' },
  relays: { title: 'Relays & network', icon: 'lucide:server', fallback: '📡', sub: 'health · delivery' },
  session: { title: 'Session', icon: 'lucide:log-out', fallback: '⏻', sub: 'sign out' },
});

export function renderSettings({ store, app, theme, scope }) {
  const node = el('section', { class: 'screen' });
  let hideBackups = [];

  function render() {
    hideBackups.forEach((hide) => hide());
    hideBackups = [];
    const state = store.getState();
    const section = state.settingsSection;
    node.replaceChildren(
      ...(section && SECTIONS[section]
        ? sectionView(section, state, app, theme, (hide) => hideBackups.push(hide))
        : hubView(state, app)),
    );
  }

  scope.add(() => hideBackups.forEach((hide) => hide()));
  scope.add(store.subscribe(render));
  scope.add(theme.subscribe(render));
  render();
  return node;
}

function hubView(state, app) {
  const persona = getPersona(state.personaId);
  const membership = state.memberships?.[persona.id] ?? state.membership ?? MEMBERSHIP.NONE;
  const badge = membershipBadge(membership);

  return [
    el('h1', { class: 'font-display' }, 'Settings'),
    el('button', { class: 'list-row', type: 'button', onClick: () => app.navigate('/credentials') }, [
      avatar(persona, 48),
      el('span', { class: 'listrow__txt' }, [
        el('span', { class: 'list-row__title' }, [persona.displayName, el('span', { class: 'vmark' }, ' ✓')]),
        el('span', { class: 'mono small muted' }, identitySecondary(persona)),
        el('span', { class: 'small' }, badge ? statusBadge(badge.label, badge.tone) : 'no membership'),
      ]),
      el('span', { class: 'listrow__chev', 'aria-hidden': 'true' }, '›'),
    ]),

    el('span', { class: 'field-label' }, 'Preferences'),
    el(
      'div',
      { class: 'list-divide' },
      Object.entries(SECTIONS)
        .filter(([id]) => id !== 'academy' || Boolean(state.academies?.[persona.id]))
        .map(([id, meta]) => settingRow(meta, () => app.setSettingsSection(id))),
    ),

    el('span', { class: 'field-label' }, 'Support'),
    el('div', { class: 'list-divide' }, [
      plainRow('lucide:circle-help', '❓', 'Help & support', () => app.stub('Help is coming soon.')),
      plainRow('lucide:info', 'ℹ', 'About BitOS Education', () => app.stub('BitOS Education · v1.0.0-proto')),
    ]),
  ];
}

function sectionView(section, state, app, theme, registerBackupHide) {
  const meta = SECTIONS[section];
  const persona = getPersona(state.personaId);
  const membership = state.memberships?.[persona.id] ?? state.membership ?? MEMBERSHIP.NONE;

  const bodies = {
    appearance: () => [appearanceBody(theme)],
    profile: () => [
      renderEditProfile({
        persona,
        actions: app,
        close: () => app.setSettingsSection(null),
        cropImage: app.cropImage,
        blossomServer: state.blossomServer,
      }),
    ],
    academy: () => {
      const academy = state.academies?.[persona.id];
      if (!academy) return [emptyState('You do not own an academy yet.')];
      return [
        renderEditAcademy({
          academy,
          actions: app,
          close: () => app.setSettingsSection(null),
          cropImage: app.cropImage,
        }),
      ];
    },
    identity: () => [
      identityCard(persona, app),
      backupCard({
        title: 'Back up your account key',
        description: 'This key controls your personal Nostr account, including your owner access. You can import it on the sign-in page to use another browser.',
        pubkey: state.session?.pubkey,
        npub: persona.npub,
        readSecret: () => loadSecretKey(decodeKey),
        external: state.session?.method === 'extension' || state.session?.method === 'bunker',
        app,
        registerHide: registerBackupHide,
      }),
      state.academies?.[persona.id]?.orgPubkey
        ? backupCard({
            title: 'Back up your academy key',
            description: 'Your academy has a separate key for its public profile. Keep both backups. Academy-key import on another device is not available yet.',
            pubkey: state.academies[persona.id].orgPubkey,
            npub: state.academies[persona.id].orgNpub,
            readSecret: () => loadOrgSecret(state.academies[persona.id].id, decodeKey),
            app,
            registerHide: registerBackupHide,
          })
        : null,
      handleCard(persona, app),
      signerCard(state, app),
    ],
    membership: () => membershipCard(state, app, persona, membership),
    relays: () => [relayCard(state, app)],
    session: () => [sessionCard(app)],
  };

  return [sectionHeader(meta, app), ...(bodies[section]?.() ?? []).filter(Boolean)];
}

function sectionHeader(meta, app) {
  return el('div', { class: 'secthead' }, [
    el(
      'button',
      {
        class: 'icon-btn',
        type: 'button',
        'aria-label': 'Back to settings',
        onClick: () => app.setSettingsSection(null),
      },
      icon('lucide:chevron-left', { size: 20, fallback: '←' }),
    ),
    el('div', { class: 'secthead__txt' }, [
      el('h1', { class: 'font-display secthead__title' }, meta.title),
      meta.sub ? el('span', { class: 'list-row__sub' }, meta.sub) : null,
    ]),
  ]);
}

function settingRow(meta, onClick) {
  return el('button', { class: 'list-row', type: 'button', onClick }, [
    el('span', { class: 'hex-plate', style: { width: '40px', height: '40px' } }, icon(meta.icon, { size: 18, fallback: meta.fallback })),
    el('span', { class: 'listrow__txt' }, [
      el('span', { class: 'list-row__title' }, meta.title),
      el('span', { class: 'list-row__sub' }, meta.sub),
    ]),
    el('span', { class: 'listrow__chev', 'aria-hidden': 'true' }, '›'),
  ]);
}

function plainRow(iconName, fallback, title, onClick) {
  return el('button', { class: 'list-row', type: 'button', onClick }, [
    el('span', { class: 'listrow__ico' }, icon(iconName, { size: 17, fallback })),
    el('span', { class: 'listrow__txt' }, el('span', { class: 'list-row__title' }, title)),
  ]);
}

function switchLine(label, checked, onChange) {
  return el('div', { class: 'list-row' }, [
    el('span', { class: 'switch__label' }, label),
    el('span', { class: 'spacer' }),
    el(
      'button',
      {
        class: `switch${checked ? ' is-on' : ''}`,
        type: 'button',
        role: 'switch',
        'aria-checked': String(checked),
        'aria-label': label,
        onClick: () => onChange(!checked),
      },
      el('span', { class: 'switch__dot', 'aria-hidden': 'true' }),
    ),
  ]);
}

function appearanceBody(theme) {
  const flags = theme.flags();
  return el('div', {}, [
    el('span', { class: 'field-label' }, 'Theme'),
    segmented(THEME_CHOICES, theme.current(), (id) => theme.setTheme(id), { label: 'Theme' }),
    el('p', { class: 'small dim' }, `System follows your device — currently resolving to ${theme.resolved()}.`),

    el('span', { class: 'field-label', style: { marginTop: '18px' } }, 'Accent'),
    swatchGroup(
      Object.entries(ACCENTS).map(([id, token]) => ({ id, color: token.value, label: id })),
      theme.accent(),
      (id) => theme.setAccent(id),
    ),

    el('div', { class: 'list-divide', style: { marginTop: '18px' } }, [
      switchLine('Pure black (OLED)', flags.oled, (on) => theme.setFlag('oled', on)),
      switchLine('Compact density', flags.compact, (on) => theme.setFlag('compact', on)),
      switchLine('Reduce motion', flags.reduceMotion, (on) => theme.setFlag('reduceMotion', on)),
    ]),

    el(
      'div',
      { class: 'state-banner info' },
      'Theme follows the system by default; overrides persist locally on this device.',
    ),
  ]);
}

function identityCard(persona, app) {
  return el('div', { class: 'card' }, [
    el('div', { class: 'dhead' }, [
      identityChip(persona, { size: 44 }),
      isVerified(persona) ? statusBadge('✓ handle verified', 'ok') : statusBadge('handle unverified', 'muted'),
    ]),
    el('span', { class: 'field-label', style: { marginTop: '12px' } }, 'Public key (npub)'),
    el('p', { class: 'mono small' }, persona.npub),
    el('div', { class: 'arow' }, [
      button('Edit profile', { variant: 'gold', small: true, onClick: () => app.setSettingsSection('profile') }),
      button('Copy public key', { small: true, onClick: () => app.copyText(persona.npub, 'Public key copied.') }),
    ]),
    noteBox('Your npub is safe to share. Back up your secret key below before changing devices or clearing browser data.'),
  ]);
}

function backupCard({ title, description, pubkey, npub, readSecret, external = false, app, registerHide }) {
  const card = el('div', { class: 'card' });
  const status = el('p', { class: 'muted small', role: 'status', 'aria-live': 'polite' });
  const secret = el('code', { class: 'backup-key mono' });
  const secretArea = el('div', { class: 'backup-key-area', hidden: true }, [
    el('span', { class: 'field-label' }, 'Secret key (nsec)'),
    secret,
  ]);
  let revealedNsec = null;
  let hideTimer = null;

  const copy = button('Copy secret key', {
    small: true,
    disabled: true,
    onClick: () => {
      if (revealedNsec) app.copyText(revealedNsec, 'Secret key copied. Clear your clipboard after saving it.');
    },
  });
  const toggle = button('Reveal secret key', {
    small: true,
    variant: 'gold',
    onClick: () => {
      if (revealedNsec) {
        hide();
        return;
      }
      const nsec = backupNsecForPubkey(readSecret(), pubkey);
      if (!nsec) {
        status.textContent = 'A matching key is not available in this browser. Use the original signer or backup.';
        return;
      }
      revealedNsec = nsec;
      secret.textContent = nsec;
      secretArea.hidden = false;
      copy.disabled = false;
      toggle.textContent = 'Hide secret key';
      status.textContent = 'Visible for 60 seconds. Save it somewhere private and offline.';
      document.addEventListener('visibilitychange', hideWhenHidden);
      hideTimer = setTimeout(hide, 60_000);
    },
  });

  function hide() {
    clearTimeout(hideTimer);
    hideTimer = null;
    document.removeEventListener('visibilitychange', hideWhenHidden);
    revealedNsec = null;
    secret.textContent = '';
    secretArea.hidden = true;
    copy.disabled = true;
    toggle.textContent = 'Reveal secret key';
    status.textContent = 'Secret key hidden.';
  }

  function hideWhenHidden() {
    if (document.hidden) hide();
  }

  registerHide(hide);

  card.append(
    el('h3', {}, title),
    el('p', { class: 'muted small' }, description),
    el('span', { class: 'field-label' }, 'Key to back up'),
    el('p', { class: 'mono small' }, npub ?? pubkey ?? ''),
    external
      ? noteBox('This account uses an external signer. Back up the key in your extension or bunker; BitOS cannot show it here.')
      : el('div', {}, [
          noteBox('Anyone with your nsec can act as you. Reveal it only in private. Never send it in chat or email.', 'warn'),
          el('div', { class: 'arow' }, [toggle, copy]),
          secretArea,
          status,
        ]),
  );
  return card;
}

function joinedAcademies(state, personaId) {
  const academies = Object.values(state.academies ?? {});
  const classrooms = state.classrooms ?? [];
  const invites = state.invites ?? [];
  const entries = [];

  for (const academy of academies) {
    if (!academy?.id) continue;
    const teacherRooms = classroomsForTeacher(classrooms, personaId).filter(
      (room) => room.academyId === academy.id,
    );
    const learnerRooms = classroomsForStudent(classrooms, personaId).filter(
      (room) => room.academyId === academy.id,
    );
    const accepted = invites.filter(
      (invite) => invite.academyId === academy.id && invite.acceptedBy === personaId,
    );
    if (!teacherRooms.length && !learnerRooms.length && !accepted.length) continue;

    const role =
      teacherRooms.length || accepted.some((invite) => invite.role === ROLE.TEACHER)
        ? ROLE.TEACHER
        : ROLE.STUDENT;
    entries.push({ academy, role, rooms: [...teacherRooms, ...learnerRooms] });
  }

  return entries;
}

function classPreviewRow(state, room) {
  const subject = subjectById(state.subjects ?? [], room.subjectId);
  const teacher = room.teacherId ? getPersona(room.teacherId) : null;
  return el('div', { class: 'row' }, [
    el('span', { class: 'who' }, room.name),
    subject ? el('span', { class: 'ctx' }, subject.name) : null,
    el('span', { class: 'spacer' }),
    teacher ? el('span', { class: 'muted small' }, `teacher ${teacher.displayName}`) : null,
  ]);
}

function academyMembershipRow(state, { academy, role, rooms }, membership) {
  const isTeacher = role === ROLE.TEACHER;
  const pending = membership === MEMBERSHIP.PENDING && !rooms.length;
  return el('div', { class: 'card' }, [
    el('div', { class: 'crow' }, [
      el('span', {}, [
        el('strong', {}, academy.name),
        el('span', { class: 'muted small' }, ` · ${academyTypeLabel(academy.type)}`),
      ]),
      el('span', { class: 'spacer' }),
      statusBadge(isTeacher ? 'teacher' : 'learner', isTeacher ? 'key' : 'info'),
      pending ? statusBadge('pending approval', 'info') : null,
    ]),
    rooms.length
      ? el('div', { class: 'rows' }, rooms.map((room) => classPreviewRow(state, room)))
      : emptyState(pending ? 'Waiting for the academy owner to approve.' : 'No classes yet.'),
  ]);
}

function membershipCard(state, app, persona, membership) {
  const owned = state.academies?.[persona.id];
  const cards = [];

  if (owned) {
    cards.push(
      el('div', { class: 'card card--accent' }, [
        el('h3', {}, `You own ${owned.name}`),
        el('p', { class: 'muted small' }, `${academyTypeLabel(owned.type)} · owner`),
        el('div', { class: 'arow' }, [
          button('Open organization', { variant: 'gold', small: true, onClick: () => app.navigate('/role') }),
          button('Edit academy info', { small: true, onClick: () => app.setSettingsSection('academy') }),
          button('Invite a teacher', { small: true, onClick: () => app.openInviteTeacher() }),
          button('Share learner link', { small: true, onClick: () => app.openInviteLink(ROLE.STUDENT) }),
        ]),
      ]),
    );
  }

  const joined = joinedAcademies(state, persona.id);
  const pendingByAcademy = new Map();
  for (const request of state.joinRequests ?? []) {
    if (request.accountId !== persona.id || request.status !== REQUEST_STATUS.PENDING) continue;
    const key = request.academyId ?? String(request.academy ?? '').trim().toLowerCase();
    if (!key || pendingByAcademy.has(key)) continue;
    pendingByAcademy.set(key, request);
  }
  const pending = [...pendingByAcademy.values()].filter(
    (request) => !joined.some(
      ({ academy }) => request.academyId === academy.id || (!request.academyId && request.academy === academy.name),
    ),
  );

  cards.push(
    el('div', { class: 'card' }, [
      el('h3', {}, 'Joined academies'),
      joined.length
        ? el(
            'div',
            { class: 'stack' },
            joined.map((entry) => academyMembershipRow(state, entry, membership)),
          )
        : pending.length
          ? el('p', { class: 'muted small' }, 'Waiting for approval from the academies below.')
          : emptyState(
            owned ? 'You have not joined another academy yet.' : 'You have not joined an academy yet.',
          ),
      pending.length
        ? el(
            'section',
            {},
            [
              el('h4', {}, 'Pending membership requests'),
              el('div', { class: 'rows' }, pending.map((request) => {
              const academyName = request.academyId
                ? Object.values(state.academies ?? {}).find((entry) => entry.id === request.academyId)
                    ?.name ?? request.academy
                : request.academy;
              return el('div', { class: 'row' }, [
                el('span', { class: 'who' }, academyName),
                el('span', { class: 'muted small' }, 'membership request'),
                el('span', { class: 'spacer' }),
                statusBadge('pending', 'info'),
              ]);
              })),
            ],
          )
        : null,
      el('div', { class: 'arow' }, [
        owned
          ? null
          : button('Create an academy', { small: true, onClick: () => app.openCreateAcademy() }),
        button('Join with a link', { variant: owned ? 'ghost' : 'gold', small: true, onClick: () => app.navigate('/join') }),
      ]),
    ]),
  );

  return cards;
}

function signerCard(state, app) {
  const signer = signerType(state.signerType);
  return el('div', { class: 'card' }, [
    el('h3', {}, 'Keys & signer'),
    el('p', { class: 'small' }, ['Signer: ', el('strong', {}, signer.label)]),
    el('p', { class: 'muted small' }, signer.sub),
    el('div', { class: 'arow' }, [
      button('Sign a test challenge', { small: true, onClick: () => app.testSigner() }),
    ]),
    noteBox('BitOS cannot restore a lost key. Keep your account backup and, if you own an academy, its separate key backup.'),
  ]);
}

function handleCard(persona, app) {
  const feedback = el('p', { class: 'muted small', 'aria-live': 'polite' });
  const input = el('input', {
    type: 'text',
    placeholder: 'alice',
    autocomplete: 'off',
    spellcheck: 'false',
    onInput: (event) => {
      const value = String(event.target.value ?? '').trim().replace(/^@/, '');
      if (!value) {
        feedback.textContent = '';
        return;
      }
      const result = validateHandle(value);
      if (!result.valid) {
        feedback.className = 'small danger';
        feedback.textContent =
          result.reason === 'reserved'
            ? `'${result.handle}' is reserved.`
            : result.reason === 'length'
              ? 'Handles are 3–24 characters.'
              : 'Letters and numbers only, plus dots and underscores.';
        return;
      }
      const taken = getPersonaIds()
        .map((id) => normalizeHandle(String(getPersona(id).handle ?? '').split('@')[0]))
        .includes(result.handle);
      feedback.className = taken ? 'small danger' : 'small ok';
      feedback.textContent = taken ? `@${result.handle} is taken.` : `✓ @${result.handle} is available.`;
    },
  });

  return el('div', {}, [
    el('div', { class: 'card' }, [
    el('h3', {}, 'Handle (UNIQ)'),
    el('p', { class: 'muted small' }, `Current: ${persona.handle || truncateNpub(persona.npub)}`),
    el('span', { class: 'field-label', style: { marginTop: '10px' } }, 'Claim a handle'),
    input,
    feedback,
    el(
      'div',
      { class: 'state-banner info' },
      'Claiming makes the link public. A verified handle proves control of the key — not an endorsement.',
    ),
    el('div', { class: 'arow' }, [
      button('Sign & claim', { variant: 'gold', small: true, onClick: () => app.claimHandle(input.value) }),
    ]),
    ]),
    el('h3', {}, 'Available signers'),
    el('div', { class: 'list-divide' }, SIGNER_TYPES.map((type) =>
      el('div', { class: 'list-row' }, [
        el('span', { class: 'listrow__txt' }, [
          el('span', { class: 'list-row__title' }, type.label),
          el('span', { class: 'list-row__sub' }, type.sub),
        ]),
      ]),
    )),
  ]);
}

function relayCard(state, app) {
  const relays = state.relays ?? [];
  const healthy = relays.filter((relay) => relay.health === 'connected').length;

  const input = el('input', {
    type: 'text',
    placeholder: 'wss://relay.example.com or ws://relay.local:7777',
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-label': 'Relay URL',
  });
  const addRelay = () => {
    if (app.addRelay(input.value)) input.value = '';
  };
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addRelay();
    }
  });

  return el('div', {}, [
    el('div', { class: 'dhead' }, [
      el('h3', {}, 'Relays'),
      statusBadge(
        relays.length ? `${healthy}/${relays.length} online` : 'none configured',
        healthy ? 'ok' : relays.length ? 'warn' : 'muted',
      ),
    ]),
    relays.length
      ? el('div', { class: 'list-divide' }, relays.map((relay) => relayRow(relay, app)))
      : emptyState('No relays configured yet — add one below.'),
    el('div', { class: 'arow' }, [
      button('Check relays', { small: true, onClick: () => app.checkRelays() }),
    ]),
    el('span', { class: 'field-label', style: { marginTop: '14px' } }, 'Add relay'),
    el('div', { class: 'keyrow' }, [
      input,
      button('Add', { variant: 'gold', small: true, onClick: addRelay }),
    ]),
    noteBox('BitOS reads from read relays and publishes to write relays. Tap a relay to cycle its mode. Both wss:// and plaintext ws:// URLs are accepted.'),
  ]);
}

function relayRow(relay, app) {
  const tone = relay.health === 'connected' ? 'ok' : relay.health === 'offline' ? 'err' : 'warn';
  const detail = relay.latencyMs != null ? `${relay.health} · ${relay.latencyMs} ms` : relay.health;
  return el('div', { class: 'list-row' }, [
    el(
      'span',
      { class: 'listrow__ico' },
      icon(relay.health === 'offline' ? 'lucide:server-off' : 'lucide:server', {
        size: 18,
        fallback: '📡',
      }),
    ),
    el('span', { class: 'listrow__txt' }, [
      el('span', { class: 'mono small' }, relay.url),
      el('span', { class: `list-row__sub ${tone === 'err' ? 'danger' : ''}` }, detail),
    ]),
    el(
      'button',
      {
        class: 'chip',
        type: 'button',
        title: 'Change read/write mode',
        onClick: () => app.cycleRelayMode(relay.id),
      },
      relayModeLabel(relay.mode),
    ),
    el(
      'button',
      {
        class: 'icon-btn',
        type: 'button',
        'aria-label': `Remove ${relay.url}`,
        onClick: () => app.removeRelay(relay.id),
      },
      icon('lucide:trash-2', { size: 16, fallback: '🗑' }),
    ),
  ]);
}

function sessionCard(app) {
  return el('div', { class: 'card' }, [
    el('h3', {}, 'Session'),
    el('p', { class: 'muted small' }, 'Signing out clears the session on this device. Your keys stay with your signer.'),
    button('Sign out', { variant: 'ghost', onClick: () => app.signOut() }),
  ]);
}
