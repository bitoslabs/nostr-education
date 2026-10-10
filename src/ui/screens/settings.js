import { el } from '../../core/dom.js';
import { bindScreen } from '../../core/reactive.js';
import { getPersona, getPersonaIds } from '../../data/personas.js';
import { SIGNER_TYPES, signerType } from '../../domain/account.js';
import { classroomsForStudent, classroomsForTeacher, subjectById } from '../../domain/classroom.js';
import { normalizeHandle, validateHandle } from '../../domain/handle.js';
import { isVerified, truncateNpub } from '../../domain/identity.js';
import { MODE, normalizeMode } from '../../domain/mode.js';
import {
  CONNECTION_CHOICES,
  DM_POLICIES,
  LOW_POW_THRESHOLD,
  POW_CHOICES,
  SUBSCRIPTION_KINDS,
  zapAmounts,
} from '../../domain/prefs.js';
import { MEMBERSHIP, REQUEST_STATUS, ROLE } from '../../domain/school.js';
import { backupNsecForPubkey, decodeKey } from '../../services/nostr.js';
import { splitNip05 } from '../../domain/nip05.js';
import { resolveNip05 } from '../../services/nip05.js';
import { formatSats, walletBalance, zapsForAccount } from '../../domain/wallet.js';
import { loadOrgSecret, loadSecretKey } from '../../services/storage.js';
import { ACCENTS, THEME_CHOICES } from '../../services/theme.js';
import { availableLocales, t } from '../../services/i18n/index.js';
import { icon } from '../components/icon.js';
import { identityChip } from '../components/identity-chip.js';
import { renderEditAcademy } from '../components/academy-dialog.js';
import { renderEditProfile } from '../components/profile-dialog.js';
import { button, emptyState, noteBox, pageTitle, segmented, swatchGroup } from '../components/primitives.js';
import { statusBadge } from '../components/status-badge.js';

const SECTIONS = Object.freeze({
  appearance: { titleKey: 'settings.sections.appearance.title', navKey: 'settings.nav.appearance', icon: 'lucide:palette', fallback: '🎨', subKey: 'settings.sections.appearance.sub' },
  profile: { titleKey: 'settings.sections.profile.title', navKey: 'settings.nav.account', icon: 'lucide:user', fallback: '👤', subKey: 'settings.sections.profile.sub' },
  academy: { titleKey: 'settings.sections.academy.title', navKey: 'settings.nav.academy', icon: 'lucide:building-2', fallback: '🏫', subKey: 'settings.sections.academy.sub' },
  identity: { titleKey: 'settings.sections.identity.title', navKey: 'settings.nav.keys', icon: 'lucide:key-round', fallback: '🔑', subKey: 'settings.sections.identity.sub' },
  membership: { titleKey: 'settings.sections.membership.title', navKey: 'settings.nav.membership', icon: 'lucide:school', fallback: '🎓', subKey: 'settings.sections.membership.sub' },
  relays: { titleKey: 'settings.sections.relays.title', navKey: 'settings.nav.network', icon: 'lucide:network', fallback: '📡', subKey: 'settings.sections.relays.sub' },
  session: { titleKey: 'settings.sections.session.title', navKey: 'settings.nav.session', icon: 'lucide:log-out', fallback: '⏻', subKey: 'settings.sections.session.sub' },
  lightning: { titleKey: 'settings.lightning.title', navKey: 'settings.nav.lightning', icon: 'lucide:zap', fallback: '⚡' },
  privacy: { titleKey: 'settings.privacy.title', navKey: 'settings.nav.privacy', icon: 'lucide:shield', fallback: '🛡' },
});

// ui.html sidebar order. `about` is a link out of settings.
const NAV_ORDER = Object.freeze([
  'profile',
  'lightning',
  'privacy',
  'appearance',
  'relays',
  'identity',
  'membership',
  'academy',
  'session',
  'about',
]);

const NAV_LINKS = Object.freeze({
  about: { route: '/about', icon: 'lucide:info', fallback: 'ℹ', labelKey: 'settings.nav.about' },
});

export function renderSettings({ app, theme, scope, state }) {
  const node = el('section', { class: 'screen' });
  let hideBackups = [];
  let syncAppearance = null;

  function render(snapshot) {
    hideBackups.forEach((hide) => hide());
    hideBackups = [];
    syncAppearance = null;

    const entries = navEntries(snapshot);
    const activeId = SECTIONS[snapshot.settingsSection]
      ? snapshot.settingsSection
      : entries.find((entry) => entry.kind === 'section')?.id ?? null;
    const registerHide = (hide) => hideBackups.push(hide);
    const registerSync = (sync) => {
      syncAppearance = sync;
    };

    // ui.html layout: a left section nav beside the section content.
    node.replaceChildren(
      pageTitle(t('settings.title')),
      el('div', { class: 'settings-layout' }, [
        el(
          'nav',
          { class: 'settings-nav', 'aria-label': t('settings.title') },
          entries.map((entry) => navItem(entry, entry.id === activeId, app)),
        ),
        el(
          'div',
          { class: 'settings-content' },
          ...(activeId ? sectionBody(activeId, snapshot, app, theme, registerHide, registerSync) : []),
        ),
      ]),
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

function navEntries(state) {
  const persona = getPersona(state.personaId);
  const owned = Boolean(state.academies?.[persona.id]);
  return NAV_ORDER.filter((id) => id !== 'academy' || owned).map((id) => {
    if (NAV_LINKS[id]) return { id, kind: 'link', ...NAV_LINKS[id] };
    const meta = SECTIONS[id];
    return { id, kind: 'section', icon: meta.icon, fallback: meta.fallback, labelKey: meta.navKey ?? meta.titleKey };
  });
}

function navItem(entry, active, app) {
  const onClick =
    entry.kind === 'link' ? () => app.navigate(entry.route) : () => app.setSettingsSection(entry.id);
  return el(
    'button',
    {
      class: `settings-nav__item${active ? ' is-on' : ''}`,
      type: 'button',
      'aria-current': active ? 'true' : null,
      onClick,
    },
    [icon(entry.icon, { size: 17, fallback: entry.fallback }), el('span', {}, t(entry.labelKey))],
  );
}

function sectionBody(section, state, app, theme, registerBackupHide, registerSync) {
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
      nip05Card(persona, app),
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
      backupCard({
        title: t('settings.backup.accountTitle'),
        description: t('settings.backup.accountBody'),
        pubkey: state.session?.pubkey,
        npub: persona.npub,
        readSecret: () => loadSecretKey(decodeKey),
        external: state.session?.method === 'extension' || state.session?.method === 'bunker',
        app,
        registerHide: registerBackupHide,
        fileBase: 'bitos-education-account-backup',
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
            fileBase: 'bitos-education-academy-backup',
          })
        : null,
      identityCard(persona, app),
      handleCard(persona, app),
      signerCard(state, app),
    ],
    membership: () => membershipCard(state, app, persona, membership),
    relays: () => [relayCard(state, app), networkExtrasBody(state, app)],
    session: () => [sessionCard(app)],
    lightning: () => lightningBody(state, app, persona),
    privacy: () => privacyBody(state, app, persona),
  };

  const body = bodies[section]?.();
  return (Array.isArray(body) ? body : body ? [body] : []).filter(Boolean);
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

    el('span', { class: 'field-label', style: { marginTop: '18px' } }, t('settings.appearance.layout')),
    el('div', { class: 'list-divide' }, [
      switchLine('showEventIds', t('settings.appearance.showEventIds'), theme),
      switchLine('showPowBadges', t('settings.appearance.showPowBadges'), theme),
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
      button(t('settings.identity.showQr'), { small: true, onClick: () => app.openQr?.({ text: persona.npub, label: t('settings.identity.qrTitle') }) }),
    ]),
    noteBox(t('settings.identity.npubNote')),
  ]);
}

function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = el('a', { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function backupFileText({ nsec, npub, pubkey }) {
  return [
    t('settings.backup.backupFileHeading'),
    '='.repeat(40),
    '',
    `npub: ${npub ?? ''}`,
    `nsec: ${nsec}`,
    '',
    t('settings.backup.backupFileNote'),
    '',
    `pubkey: ${pubkey ?? ''}`,
  ].join('\n');
}

function backupCard({
  title,
  description,
  pubkey,
  npub,
  readSecret,
  external = false,
  app,
  registerHide,
  fileBase = 'bitos-education-backup',
}) {
  const card = el('div', { class: 'card' });
  const status = el('p', { class: 'muted small backup-status', role: 'status', 'aria-live': 'polite' });
  const secret = el('code', { class: 'backup-key mono' });
  let revealedNsec = null;
  let hideTimer = null;

  const keyBox = el(
    'button',
    {
      class: 'backup-key-box is-hidden',
      type: 'button',
      'aria-label': t('settings.backup.revealSecretKey'),
      onClick: () => (revealedNsec ? hide() : reveal()),
    },
    secret,
  );
  const hint = el('span', { class: 'backup-key-hint' }, t('settings.backup.tapToReveal'));

  const copy = button(t('settings.backup.copySecretKey'), {
    small: true,
    variant: 'gold',
    onClick: () => {
      const nsec = reveal();
      if (nsec) app.copyText(nsec, t('settings.backup.secretCopied'));
    },
  });
  const download = button(t('settings.backup.downloadBackup'), {
    small: true,
    onClick: () => {
      const nsec = reveal();
      if (!nsec) return;
      downloadTextFile(`${fileBase}.txt`, backupFileText({ nsec, npub, pubkey }));
      status.textContent = t('settings.backup.backupDownloaded');
    },
  });

  function maskSecret() {
    secret.textContent = '•'.repeat(36);
  }
  maskSecret();

  function reveal() {
    if (revealedNsec) return revealedNsec;
    const nsec = backupNsecForPubkey(readSecret(), pubkey);
    if (!nsec) {
      status.textContent = t('settings.backup.unavailable');
      return null;
    }
    revealedNsec = nsec;
    secret.textContent = nsec;
    keyBox.classList.remove('is-hidden');
    keyBox.setAttribute('aria-label', t('settings.backup.hideSecretKey'));
    hint.textContent = t('settings.backup.tapToHide');
    status.textContent = t('settings.backup.visible');
    document.addEventListener('visibilitychange', hideWhenHidden);
    hideTimer = setTimeout(hide, 60_000);
    return nsec;
  }

  function hide() {
    clearTimeout(hideTimer);
    hideTimer = null;
    document.removeEventListener('visibilitychange', hideWhenHidden);
    revealedNsec = null;
    maskSecret();
    keyBox.classList.add('is-hidden');
    keyBox.setAttribute('aria-label', t('settings.backup.revealSecretKey'));
    hint.textContent = t('settings.backup.tapToReveal');
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
      : el('div', { class: 'backup-card__body' }, [
          noteBox(t('settings.backup.warning'), 'warn'),
          keyBox,
          hint,
          el('div', { class: 'arow' }, [copy, download]),
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
    teacher
      ? el(
          'span',
          { class: 'muted small' },
          t('settings.membership.classTeacher', { name: teacher.displayName || truncateNpub(teacher.npub) }),
        )
      : null,
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

// A preference switch bound to the reactive store. Unlike switchLine (theme
// flags), this calls back so the caller can persist to the right prefs group.
function prefSwitch(label, checked, onChange) {
  return el('div', { class: 'list-row' }, [
    el('span', { class: 'switch__label' }, label),
    el('span', { class: 'spacer' }),
    el(
      'button',
      {
        class: `switch${checked ? ' is-on' : ''}`,
        type: 'button',
        role: 'switch',
        'aria-checked': String(Boolean(checked)),
        'aria-label': label,
        onClick: () => onChange(!checked),
      },
      el('span', { class: 'switch__dot', 'aria-hidden': 'true' }),
    ),
  ]);
}

function selectField(label, value, options, onChange) {
  const select = el(
    'select',
    { 'aria-label': label, onChange: (event) => onChange(event.target.value) },
    options.map((option) =>
      el('option', { value: String(option.value), selected: String(option.value) === String(value) }, option.label),
    ),
  );
  return el('div', {}, [el('span', { class: 'field-label' }, label), select]);
}

function nip05Card(persona, app) {
  const identifier = String(persona.nip05 ?? persona.handle ?? '').trim();
  const status = el('p', { class: 'muted small', role: 'status', 'aria-live': 'polite' }, t('settings.nip05.idle'));
  const valid = Boolean(splitNip05(identifier));

  const verify = button(t('settings.nip05.verify'), {
    small: true,
    variant: 'gold',
    disabled: !valid,
    onClick: async () => {
      status.textContent = t('settings.nip05.checking');
      const resolved = await resolveNip05(identifier).catch(() => null);
      if (!resolved) {
        status.className = 'small danger';
        status.textContent = t('settings.nip05.unverified');
        return;
      }
      const matches = resolved.npub === persona.npub;
      status.className = matches ? 'small ok' : 'small danger';
      status.textContent = matches
        ? t('settings.nip05.verified')
        : t('settings.nip05.mismatch', { npub: resolved.npub });
    },
  });

  return el('div', { class: 'card' }, [
    el('h3', {}, t('settings.nip05.title')),
    el('p', { class: 'muted small' }, t('settings.nip05.body')),
    el('span', { class: 'field-label', style: { marginTop: '10px' } }, t('settings.nip05.identifier')),
    el('p', { class: 'mono small' }, valid ? identifier : t('settings.nip05.none')),
    el('div', { class: 'arow' }, [verify]),
    status,
  ]);
}

function privacyBody(state, app, persona) {
  const prefs = state.prefs ?? {};
  const privacy = prefs.privacy ?? {};
  const muted = state.feedMutes?.[persona.id] ?? [];

  const policyOptions = DM_POLICIES.map((id) => ({
    value: id,
    label: t('settings.privacy.dmPolicy.' + id),
  }));

  const powOptions = POW_CHOICES.map((bits) => ({
    value: bits,
    label: t('settings.privacy.powBits', { bits }),
  }));

  const mutedList = muted.length
    ? el(
        'div',
        { class: 'list-divide' },
        muted.map((actorId) =>
          el('div', { class: 'list-row' }, [
            el('span', { class: 'mono small' }, truncateNpub(String(actorId))),
            el('span', { class: 'spacer' }),
            button(t('settings.privacy.unmute'), { small: true, onClick: () => app.unmuteAuthor(actorId) }),
          ]),
        ),
      )
    : emptyState(t('settings.privacy.mutedEmpty'));

  return el('div', {}, [
    el('div', { class: 'card' }, [
      el('h3', {}, t('settings.privacy.dmTitle')),
      el('p', { class: 'muted small' }, t('settings.privacy.dmBody')),
      selectField(t('settings.privacy.dmWho'), privacy.dmPolicy, policyOptions, (value) =>
        app.updatePrefs('privacy', { dmPolicy: value }),
      ),
    ]),
    el('div', { class: 'card' }, [
      el('h3', {}, t('settings.privacy.powTitle')),
      el('p', { class: 'muted small' }, t('settings.privacy.powBody')),
      selectField(t('settings.privacy.defaultPow'), privacy.defaultPow, powOptions, (value) =>
        app.updatePrefs('privacy', { defaultPow: Number(value) }),
      ),
      el('div', { class: 'list-divide', style: { marginTop: '12px' } }, [
        prefSwitch(
          t('settings.privacy.refuseLowPow'),
          Boolean(privacy.refuseLowPow),
          (on) => app.updatePrefs('privacy', { refuseLowPow: on }),
        ),
      ]),
      el('p', { class: 'muted small' }, t('settings.privacy.refuseLowPowHint', { bits: LOW_POW_THRESHOLD })),
    ]),
    el('div', { class: 'card' }, [
      el('h3', {}, t('settings.privacy.mutedTitle')),
      el('p', { class: 'muted small' }, t('settings.privacy.mutedCount', { count: muted.length })),
      mutedList,
    ]),
  ]);
}

function lightningBody(state, app, persona) {
  const prefs = state.prefs ?? {};
  const zap = prefs.zap ?? {};
  const amounts = zapAmounts(prefs);
  const connected = Boolean(state.walletConnectedByAccount?.[persona.id] ?? state.walletConnectedByAccount?.[state.accountId]);
  const balance = walletBalance(zapsForAccount(state, state.accountId ?? persona.id));

  const amountInputs = el(
    'div',
    { class: 'zap-amounts' },
    amounts.map((amount, index) =>
      el('input', {
        type: 'number',
        min: String(1),
        inputmode: 'numeric',
        value: String(amount),
        'aria-label': t('settings.lightning.amountLabel', { index: index + 1 }),
        onChange: (event) => {
          const next = amounts.map((value, i) => (i === index ? Number(event.target.value) : value));
          app.updatePrefs('zap', { amounts: next });
        },
      }),
    ),
  );

  return el('div', {}, [
    el('div', { class: 'card' }, [
      el('h3', {}, t('settings.lightning.walletTitle')),
      el('p', { class: 'small' }, connected ? t('settings.lightning.connected') : t('settings.lightning.disconnected')),
      el('p', { class: 'muted small' }, t('settings.lightning.balance', { amount: formatSats(balance) })),
      el('div', { class: 'arow' }, [
        connected
          ? button(t('settings.lightning.disconnect'), { small: true, onClick: () => app.disconnectWallet() })
          : button(t('settings.lightning.connect'), { variant: 'gold', small: true, onClick: () => app.connectWallet() }),
        button(t('settings.lightning.openWallet'), { small: true, onClick: () => app.navigate('/wallet') }),
      ]),
    ]),
    el('div', { class: 'card' }, [
      el('h3', {}, t('settings.lightning.amountsTitle')),
      el('p', { class: 'muted small' }, t('settings.lightning.amountsHint')),
      amountInputs,
    ]),
    el('div', { class: 'card' }, [
      el('h3', {}, t('settings.lightning.prefsTitle')),
      el('div', { class: 'list-divide' }, [
        prefSwitch(t('settings.lightning.nonZapReactions'), Boolean(zap.nonZapReactions), (on) =>
          app.updatePrefs('zap', { nonZapReactions: on }),
        ),
        prefSwitch(t('settings.lightning.anonymousZaps'), Boolean(zap.anonymousZaps), (on) =>
          app.updatePrefs('zap', { anonymousZaps: on }),
        ),
        prefSwitch(t('settings.lightning.autoZapFollow'), Boolean(zap.autoZapFollow), (on) =>
          app.updatePrefs('zap', { autoZapFollow: on }),
        ),
      ]),
    ]),
  ]);
}

function networkExtrasBody(state, app) {
  const prefs = state.prefs ?? {};
  const network = prefs.network ?? {};

  const connectionOptions = CONNECTION_CHOICES.map((value) => ({ value, label: String(value) }));

  const subscriptionRows = SUBSCRIPTION_KINDS.map(({ kind, labelKey }) =>
    prefSwitch(t(labelKey), network.subscriptions?.[kind] !== false, (on) => app.toggleSubscription(kind, on)),
  );

  return el('div', {}, [
    el('div', { class: 'card' }, [
      el('h3', {}, t('settings.network.connectionTitle')),
      selectField(t('settings.network.maxConnections'), network.maxConnections, connectionOptions, (value) =>
        app.updatePrefs('network', { maxConnections: Number(value) }),
      ),
      el('p', { class: 'muted small' }, t('settings.network.maxConnectionsHint')),
      el('div', { class: 'arow', style: { marginTop: '12px' } }, [
        button(t('settings.network.clearCache'), { small: true, onClick: () => app.clearCache() }),
      ]),
      el('p', { class: 'muted small' }, t('settings.network.clearCacheHint')),
    ]),
    el('div', { class: 'card' }, [
      el('h3', {}, t('settings.network.subscriptions')),
      el('p', { class: 'muted small' }, t('settings.network.subscriptionsHint')),
      el('div', { class: 'list-divide' }, subscriptionRows),
    ]),
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
  // The first relay in the list is the primary (reads start there). Show which
  // one it is, and let any other relay be promoted into that slot.
  const primaryControl = relay.primary
    ? el(
        'span',
        { class: 'chip', title: t('settings.relay.primaryTitle') },
        `★ ${t('settings.relay.primary')}`,
      )
    : el(
        'button',
        {
          class: 'chip',
          type: 'button',
          title: t('settings.relay.setPrimary'),
          'aria-label': t('settings.relay.setPrimary'),
          onClick: () => app.setPrimaryRelay(relay.id),
        },
        `☆ ${t('settings.relay.setPrimary')}`,
      );
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
    primaryControl,
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
