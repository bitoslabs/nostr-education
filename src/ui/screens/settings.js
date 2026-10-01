import { el } from '../../core/dom.js';
import { bindScreen } from '../../core/reactive.js';
import { getPersona, getPersonaIds } from '../../data/personas.js';
import { SIGNER_TYPES, signerType } from '../../domain/account.js';
import { classroomsForStudent, classroomsForTeacher, subjectById } from '../../domain/classroom.js';
import { normalizeHandle, validateHandle } from '../../domain/handle.js';
import { identitySecondary, isVerified, truncateNpub } from '../../domain/identity.js';
import { MODE, normalizeMode } from '../../domain/mode.js';
import { MEMBERSHIP, REQUEST_STATUS, ROLE, membershipBadge } from '../../domain/school.js';
import { backupNsecForPubkey, decodeKey } from '../../services/nostr.js';
import { loadOrgSecret, loadSecretKey } from '../../services/storage.js';
import { ACCENTS, THEME_CHOICES } from '../../services/theme.js';
import { availableLocales, t } from '../../services/i18n/index.js';
import { icon } from '../components/icon.js';
import { identityChip } from '../components/identity-chip.js';
import { renderEditAcademy } from '../components/academy-dialog.js';
import { renderEditProfile } from '../components/profile-dialog.js';
import { avatar, button, emptyState, noteBox, segmented, swatchGroup } from '../components/primitives.js';
import { statusBadge } from '../components/status-badge.js';

const SECTIONS = Object.freeze({
  appearance: { titleKey: 'settings.sections.appearance.title', icon: 'lucide:palette', fallback: '🎨', subKey: 'settings.sections.appearance.sub' },
  profile: { titleKey: 'settings.sections.profile.title', icon: 'lucide:id-card', fallback: '🪪', subKey: 'settings.sections.profile.sub' },
  academy: { titleKey: 'settings.sections.academy.title', icon: 'lucide:building-2', fallback: '🏫', subKey: 'settings.sections.academy.sub' },
  identity: { titleKey: 'settings.sections.identity.title', icon: 'lucide:user-round', fallback: '👤', subKey: 'settings.sections.identity.sub' },
  membership: { titleKey: 'settings.sections.membership.title', icon: 'lucide:school', fallback: '🎓', subKey: 'settings.sections.membership.sub' },
  relays: { titleKey: 'settings.sections.relays.title', icon: 'lucide:server', fallback: '📡', subKey: 'settings.sections.relays.sub' },
  session: { titleKey: 'settings.sections.session.title', icon: 'lucide:log-out', fallback: '⏻', subKey: 'settings.sections.session.sub' },
});

export function renderSettings({ app, theme, scope, state }) {
  const node = el('section', { class: 'screen' });
  let hideBackups = [];
  let syncAppearance = null;

  function render(snapshot) {
    hideBackups.forEach((hide) => hide());
    hideBackups = [];
    syncAppearance = null;
    const section = snapshot.settingsSection;
    node.replaceChildren(
      ...(section && SECTIONS[section]
        ? sectionView(section, snapshot, app, theme, (hide) => hideBackups.push(hide), (sync) => {
            syncAppearance = sync;
          })
        : hubView(snapshot, app)),
    );
  }

  scope.add(() => hideBackups.forEach((hide) => hide()));
  // Reflect theme/accent changes in place instead of rebuilding the screen.
  // A rebuild replaces freshly-styled nodes that the CSS cross-fade is
  // animating, so hairline dividers snapped while persistent chrome
  // (e.g. the sidebar/frame border) eased smoothly.
  scope.add(theme.subscribe(() => syncAppearance?.()));
  return bindScreen(state, node, render);
}

function hubView(state, app) {
  const persona = getPersona(state.personaId);
  const membership = state.memberships?.[persona.id] ?? state.membership ?? MEMBERSHIP.NONE;
  const badge = membershipBadge(membership);

  return [
    el('h1', { class: 'font-display' }, t('settings.title')),
    el('button', { class: 'list-row', type: 'button', onClick: () => app.navigate('/credentials') }, [
      avatar(persona, 48),
      el('span', { class: 'listrow__txt' }, [
        el('span', { class: 'list-row__title' }, [persona.displayName, el('span', { class: 'vmark' }, ' ✓')]),
        el('span', { class: 'mono small muted' }, identitySecondary(persona)),
        el('span', { class: 'small' }, badge ? statusBadge(t(badge.key, badge.params), badge.tone) : t('settings.noMembership')),
      ]),
      el('span', { class: 'listrow__chev', 'aria-hidden': 'true' }, '›'),
    ]),

    el('span', { class: 'field-label' }, t('settings.preferences')),
    el(
      'div',
      { class: 'list-divide' },
      Object.entries(SECTIONS)
        .filter(([id]) => id !== 'academy' || Boolean(state.academies?.[persona.id]))
        .map(([id, meta]) => settingRow(meta, () => app.setSettingsSection(id))),
    ),

    el('span', { class: 'field-label' }, t('settings.support')),
    el('div', { class: 'list-divide' }, [
      plainRow('lucide:circle-help', '❓', t('settings.helpAndSupport'), () => app.stub(t('settings.helpComingSoon'))),
      plainRow('lucide:info', 'ℹ', t('settings.about'), () => app.navigate('/about')),
    ]),
  ];
}

function sectionView(section, state, app, theme, registerBackupHide, registerSync) {
  const meta = SECTIONS[section];
  const persona = getPersona(state.personaId);
  const membership = state.memberships?.[persona.id] ?? state.membership ?? MEMBERSHIP.NONE;

  const bodies = {
    appearance: () => [appearanceBody(theme, registerSync, state, app)],
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
      if (!academy) return [emptyState(t('settings.noAcademyYet'))];
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
        title: t('settings.backup.accountTitle'),
        description: t('settings.backup.accountBody'),
        pubkey: state.session?.pubkey,
        npub: persona.npub,
        readSecret: () => loadSecretKey(decodeKey),
        external: state.session?.method === 'extension' || state.session?.method === 'bunker',
        app,
        registerHide: registerBackupHide,
      }),
      state.academies?.[persona.id]?.orgPubkey
        ? backupCard({
            title: t('settings.backup.academyTitle'),
            description: t('settings.backup.academyBody'),
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
        'aria-label': t('settings.backToSettings'),
        onClick: () => app.setSettingsSection(null),
      },
      icon('lucide:chevron-left', { size: 20, fallback: '←' }),
    ),
    el('div', { class: 'secthead__txt' }, [
      el('h1', { class: 'font-display secthead__title' }, t(meta.titleKey)),
      meta.subKey ? el('span', { class: 'list-row__sub' }, t(meta.subKey)) : null,
    ]),
  ]);
}

function settingRow(meta, onClick) {
  return el('button', { class: 'list-row', type: 'button', onClick }, [
    el('span', { class: 'hex-plate', style: { width: '40px', height: '40px' } }, icon(meta.icon, { size: 18, fallback: meta.fallback })),
    el('span', { class: 'listrow__txt' }, [
      el('span', { class: 'list-row__title' }, t(meta.titleKey)),
      el('span', { class: 'list-row__sub' }, t(meta.subKey)),
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

function switchLine(key, label, theme) {
  const on = theme.flags()[key];
  return el('div', { class: 'list-row' }, [
    el('span', { class: 'switch__label' }, label),
    el('span', { class: 'spacer' }),
    el(
      'button',
      {
        class: `switch${on ? ' is-on' : ''}`,
        type: 'button',
        role: 'switch',
        'aria-checked': String(Boolean(on)),
        'aria-label': label,
        'data-flag': key,
        // Read the live flag so repeated taps always toggle from the current
        // value (the node is updated in place, not rebuilt).
        onClick: () => theme.setFlag(key, !theme.flags()[key]),
      },
      el('span', { class: 'switch__dot', 'aria-hidden': 'true' }),
    ),
  ]);
}

function appearanceBody(theme, registerSync, state, app) {
  const themeSeg = segmented(THEME_CHOICES, theme.current(), (id) => theme.setTheme(id), { label: t('settings.appearance.theme') });
  const resolvedNote = el('p', { class: 'small dim' });
  const accentSwatches = swatchGroup(
    Object.entries(ACCENTS).map(([id, token]) => ({ id, color: token.value, label: id })),
    theme.accent(),
    (id) => theme.setAccent(id),
  );
  const languageSelect = el(
    'select',
    {
      'aria-label': t('settings.appearance.language'),
      onChange: (event) => app.setLocale(event.target.value),
    },
    availableLocales().map((code) =>
      el('option', { value: code, selected: code === state.locale }, t('settings.locales.' + code)),
    ),
  );
  const root = el('div', {}, [
    el('span', { class: 'field-label' }, t('settings.appearance.theme')),
    themeSeg,
    resolvedNote,

    el('span', { class: 'field-label', style: { marginTop: '18px' } }, t('settings.appearance.accent')),
    accentSwatches,

    el('span', { class: 'field-label', style: { marginTop: '18px' } }, t('settings.appearance.language')),
    languageSelect,

    el('div', { class: 'list-divide', style: { marginTop: '18px' } }, [
      switchLine('oled', t('settings.appearance.pureBlack'), theme),
      switchLine('compact', t('settings.appearance.compactDensity'), theme),
      switchLine('reduceMotion', t('settings.appearance.reduceMotion'), theme),
    ]),

    el(
      'div',
      { class: 'state-banner info' },
      t('settings.appearance.note'),
    ),
  ]);

  // Update the controls in place so the theme cross-fade keeps running on the
  // existing nodes (no rebuild → no flash on the section dividers).
  registerSync(() => {
    const active = theme.current();
    themeSeg.querySelectorAll('.seg__btn').forEach((btn, i) => {
      const on = THEME_CHOICES[i]?.id === active;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', String(on));
    });
    resolvedNote.textContent = t('settings.appearance.resolved', { theme: theme.resolved() });

    const accentId = theme.accent();
    accentSwatches.querySelectorAll('.swatch').forEach((btn, i) => {
      const on = Object.keys(ACCENTS)[i] === accentId;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', String(on));
    });

    const flags = theme.flags();
    root.querySelectorAll('.switch[data-flag]').forEach((sw) => {
      const on = Boolean(flags[sw.dataset.flag]);
      sw.classList.toggle('is-on', on);
      sw.setAttribute('aria-checked', String(on));
    });
  });

  return root;
}

function identityCard(persona, app) {
  return el('div', { class: 'card' }, [
    el('div', { class: 'dhead' }, [
      identityChip(persona, { size: 44 }),
      isVerified(persona) ? statusBadge(t('settings.identity.handleVerified'), 'ok') : statusBadge(t('settings.identity.handleUnverified'), 'muted'),
    ]),
    el('span', { class: 'field-label', style: { marginTop: '12px' } }, t('settings.identity.publicKey')),
    el('p', { class: 'mono small' }, persona.npub),
    el('div', { class: 'arow' }, [
      button(t('settings.identity.editProfile'), { variant: 'gold', small: true, onClick: () => app.setSettingsSection('profile') }),
      button(t('settings.identity.copyPublicKey'), { small: true, onClick: () => app.copyText(persona.npub, t('settings.identity.publicKeyCopied')) }),
    ]),
    noteBox(t('settings.identity.npubNote')),
  ]);
}

function backupCard({ title, description, pubkey, npub, readSecret, external = false, app, registerHide }) {
  const card = el('div', { class: 'card' });
  const status = el('p', { class: 'muted small', role: 'status', 'aria-live': 'polite' });
  const secret = el('code', { class: 'backup-key mono' });
  const secretArea = el('div', { class: 'backup-key-area', hidden: true }, [
    el('span', { class: 'field-label' }, t('settings.backup.secretKey')),
    secret,
  ]);
  let revealedNsec = null;
  let hideTimer = null;

  const copy = button(t('settings.backup.copySecretKey'), {
    small: true,
    disabled: true,
    onClick: () => {
      if (revealedNsec) app.copyText(revealedNsec, t('settings.backup.secretCopied'));
    },
  });
  const toggle = button(t('settings.backup.revealSecretKey'), {
    small: true,
    variant: 'gold',
    onClick: () => {
      if (revealedNsec) {
        hide();
        return;
      }
      const nsec = backupNsecForPubkey(readSecret(), pubkey);
      if (!nsec) {
        status.textContent = t('settings.backup.unavailable');
        return;
      }
      revealedNsec = nsec;
      secret.textContent = nsec;
      secretArea.hidden = false;
      copy.disabled = false;
      toggle.textContent = t('settings.backup.hideSecretKey');
      status.textContent = t('settings.backup.visible');
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
    toggle.textContent = t('settings.backup.revealSecretKey');
    status.textContent = t('settings.backup.hidden');
  }

  function hideWhenHidden() {
    if (document.hidden) hide();
  }

  registerHide(hide);

  card.append(
    el('h3', {}, title),
    el('p', { class: 'muted small' }, description),
    el('span', { class: 'field-label' }, t('settings.backup.keyToBackUp')),
    el('p', { class: 'mono small' }, npub ?? pubkey ?? ''),
    external
      ? noteBox(t('settings.backup.externalSigner'))
      : el('div', {}, [
          noteBox(t('settings.backup.warning'), 'warn'),
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
    const teacherRooms = classroomsForTeacher(classrooms, personaId, state.capabilities ?? []).filter(
      (room) => room.academyId === academy.id,
    );
    const learnerRooms = classroomsForStudent(classrooms, personaId, state.capabilities ?? []).filter(
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
    teacher ? el('span', { class: 'muted small' }, t('settings.membership.classTeacher', { name: teacher.displayName })) : null,
  ]);
}

function academyMembershipRow(state, { academy, role, rooms }, membership) {
  const isTeacher = role === ROLE.TEACHER;
  const pending = membership === MEMBERSHIP.PENDING && !rooms.length;
  return el('div', { class: 'card' }, [
    el('div', { class: 'crow' }, [
      el('span', {}, [
        el('strong', {}, academy.name),
        el('span', { class: 'muted small' }, ` · ${t('common.academyType.' + academy.type)}`),
      ]),
      el('span', { class: 'spacer' }),
      statusBadge(t('common.role.' + role), isTeacher ? 'key' : 'info'),
      pending ? statusBadge(t('settings.membership.pendingApproval'), 'info') : null,
    ]),
    rooms.length
      ? el('div', { class: 'rows' }, rooms.map((room) => classPreviewRow(state, room)))
      : emptyState(pending ? t('settings.membership.waitingApproval') : t('settings.membership.noClasses')),
  ]);
}

function membershipCard(state, app, persona, membership) {
  const owned = state.academies?.[persona.id];
  const cards = [];

  if (owned) {
    cards.push(
      el('div', { class: 'card card--accent' }, [
        el('h3', {}, t('settings.membership.youOwn', { academy: owned.name })),
        el('p', { class: 'muted small' }, `${t('common.academyType.' + owned.type)} · ${t('common.role.owner')}`),
        el('div', { class: 'arow' }, [
          button(t('settings.membership.openOrganization'), { variant: 'gold', small: true, onClick: () => app.navigate('/role') }),
          button(t('settings.membership.editAcademyInfo'), { small: true, onClick: () => app.setSettingsSection('academy') }),
          button(t('settings.membership.inviteTeacher'), { small: true, onClick: () => app.openInviteTeacher() }),
          button(t('settings.membership.shareLearnerLink'), { small: true, onClick: () => app.openInviteLink(ROLE.STUDENT) }),
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
      el('h3', {}, t('settings.membership.joined')),
      joined.length
        ? el(
            'div',
            { class: 'stack' },
            joined.map((entry) => academyMembershipRow(state, entry, membership)),
          )
        : pending.length
          ? el('p', { class: 'muted small' }, t('settings.membership.waitingAcademies'))
          : emptyState(
            owned ? t('settings.membership.noOtherAcademy') : t('settings.membership.noAcademy'),
          ),
      pending.length
        ? el(
            'section',
            {},
            [
              el('h4', {}, t('settings.membership.pendingRequests')),
              el('div', { class: 'rows' }, pending.map((request) => {
              const academyName = request.academyId
                ? Object.values(state.academies ?? {}).find((entry) => entry.id === request.academyId)
                    ?.name ?? request.academy
                : request.academy;
              return el('div', { class: 'row' }, [
                el('span', { class: 'who' }, academyName),
                el('span', { class: 'muted small' }, t('settings.membership.membershipRequest')),
                el('span', { class: 'spacer' }),
                statusBadge(t('common.badge.pending'), 'info'),
              ]);
              })),
            ],
          )
        : null,
      el('div', { class: 'arow' }, [
        owned
          ? null
          : button(t('settings.membership.createAcademy'), { small: true, onClick: () => app.openCreateAcademy() }),
        button(t('settings.membership.joinWithLink'), { variant: owned ? 'ghost' : 'gold', small: true, onClick: () => app.navigate('/join') }),
      ]),
    ]),
  );

  return cards;
}

function signerCard(state, app) {
  const signer = signerType(state.signerType);
  return el('div', { class: 'card' }, [
    el('h3', {}, t('settings.signer.keysSigner')),
    el('p', { class: 'small' }, [t('settings.signer.prefix'), el('strong', {}, t('common.signer.' + signer.id + '.label'))]),
    el('p', { class: 'muted small' }, t('common.signer.' + signer.id + '.sub')),
    el('div', { class: 'arow' }, [
      button(t('settings.signer.test'), { small: true, onClick: () => app.testSigner() }),
    ]),
    noteBox(t('settings.signer.note')),
  ]);
}

function handleCard(persona, app) {
  const feedback = el('p', { class: 'muted small', 'aria-live': 'polite' });
  const input = el('input', {
    type: 'text',
    placeholder: t('settings.handle.placeholder'),
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
            ? t('settings.handle.reserved', { handle: result.handle })
            : result.reason === 'length'
              ? t('settings.handle.length')
              : t('settings.handle.chars');
        return;
      }
      const taken = getPersonaIds()
        .map((id) => normalizeHandle(String(getPersona(id).handle ?? '').split('@')[0]))
        .includes(result.handle);
      feedback.className = taken ? 'small danger' : 'small ok';
      feedback.textContent = taken
        ? t('settings.handle.taken', { handle: result.handle })
        : t('settings.handle.available', { handle: result.handle });
    },
  });

  return el('div', {}, [
    el('div', { class: 'card' }, [
    el('h3', {}, t('settings.handle.title')),
    el('p', { class: 'muted small' }, t('settings.handle.current', { handle: persona.handle || truncateNpub(persona.npub) })),
    el('span', { class: 'field-label', style: { marginTop: '10px' } }, t('settings.handle.claim')),
    input,
    feedback,
    el(
      'div',
      { class: 'state-banner info' },
      t('settings.handle.note'),
    ),
    el('div', { class: 'arow' }, [
      button(t('settings.handle.signClaim'), { variant: 'gold', small: true, onClick: () => app.claimHandle(input.value) }),
    ]),
    ]),
    el('h3', {}, t('settings.signer.available')),
    el('div', { class: 'list-divide' }, SIGNER_TYPES.map((type) =>
      el('div', { class: 'list-row' }, [
        el('span', { class: 'listrow__txt' }, [
          el('span', { class: 'list-row__title' }, t('common.signer.' + type.id + '.label')),
          el('span', { class: 'list-row__sub' }, t('common.signer.' + type.id + '.sub')),
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
    placeholder: t('settings.relay.placeholder'),
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-label': t('settings.relay.url'),
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

  const currentMode = normalizeMode(state.mode);
  const modeSelect = el(
    'select',
    { 'aria-label': t('settings.relay.deploymentMode'), onChange: (event) => app.setMode(event.target.value) },
    Object.values(MODE).map((value) =>
      el('option', { value, selected: value === currentMode }, t('settings.mode.' + value + '.label')),
    ),
  );

  return el('div', {}, [
    el('span', { class: 'field-label' }, t('settings.relay.deploymentMode')),
    modeSelect,
    el('p', { class: 'muted small' }, t('settings.mode.' + currentMode + '.desc')),
    el('div', { class: 'dhead', style: { marginTop: '14px' } }, [
      el('h3', {}, t('settings.relay.title')),
      statusBadge(
        relays.length ? t('settings.relay.online', { healthy, total: relays.length }) : t('settings.relay.none'),
        healthy ? 'ok' : relays.length ? 'warn' : 'muted',
      ),
    ]),
    relays.length
      ? el('div', { class: 'list-divide' }, relays.map((relay) => relayRow(relay, app)))
      : emptyState(t('settings.relay.empty')),
    el('div', { class: 'arow' }, [
      button(t('settings.relay.check'), { small: true, onClick: () => app.checkRelays() }),
    ]),
    el('span', { class: 'field-label', style: { marginTop: '14px' } }, t('settings.relay.add')),
    el('div', { class: 'keyrow' }, [
      input,
      button(t('common.actions.add'), { variant: 'gold', small: true, onClick: addRelay }),
    ]),
    noteBox(t('settings.relay.note')),
  ]);
}

function relayModeKey(mode) {
  if (mode === 'read') return 'common.relayMode.read';
  if (mode === 'write') return 'common.relayMode.write';
  return 'common.relayMode.readWrite';
}

function relayRow(relay, app) {
  const tone = relay.health === 'connected' ? 'ok' : relay.health === 'offline' ? 'err' : 'warn';
  const healthKey =
    relay.health === 'connected'
      ? 'settings.relay.health.connected'
      : relay.health === 'offline'
        ? 'settings.relay.health.offline'
        : 'settings.relay.health.checking';
  const healthLabel = t(healthKey);
  const detail = relay.latencyMs != null ? `${healthLabel} · ${relay.latencyMs} ms` : healthLabel;
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
        title: t('settings.relay.changeMode'),
        onClick: () => app.cycleRelayMode(relay.id),
      },
      t(relayModeKey(relay.mode)),
    ),
    el(
      'button',
      {
        class: 'icon-btn',
        type: 'button',
        'aria-label': t('common.a11y.removeNamed', { name: relay.url }),
        onClick: () => app.removeRelay(relay.id),
      },
      icon('lucide:trash-2', { size: 16, fallback: '🗑' }),
    ),
  ]);
}

function sessionCard(app) {
  return el('div', { class: 'card' }, [
    el('h3', {}, t('settings.session.title')),
    el('p', { class: 'muted small' }, t('settings.session.note')),
    button(t('common.actions.signOut'), { variant: 'ghost', onClick: () => app.signOut() }),
  ]);
}
