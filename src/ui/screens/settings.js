import { el } from '../../core/dom.js';
import { getPersona, getPersonaIds } from '../../data/personas.js';
import { SIGNER_TYPES, signerType } from '../../domain/account.js';
import { normalizeHandle, validateHandle } from '../../domain/handle.js';
import { identitySecondary, isVerified, truncateNpub } from '../../domain/identity.js';
import { MEMBERSHIP, membershipBadge } from '../../domain/school.js';
import { ACCENTS, THEME_CHOICES } from '../../services/theme.js';
import { icon } from '../components/icon.js';
import { identityChip } from '../components/identity-chip.js';
import { avatar, button, noteBox, segmented, swatchGroup } from '../components/primitives.js';
import { statusBadge } from '../components/status-badge.js';

const SECTIONS = Object.freeze({
  appearance: { title: 'Appearance', icon: 'lucide:palette', fallback: '🎨', sub: 'theme · accent · density' },
  identity: { title: 'Account & identity', icon: 'lucide:user-round', fallback: '👤', sub: 'keys · handle · signers' },
  membership: { title: 'Membership', icon: 'lucide:school', fallback: '🎓', sub: 'academy access' },
  relays: { title: 'Relays & network', icon: 'lucide:server', fallback: '📡', sub: 'health · delivery' },
  session: { title: 'Session', icon: 'lucide:log-out', fallback: '⏻', sub: 'sign out' },
});

export function renderSettings({ store, app, theme, scope }) {
  const node = el('section', { class: 'screen' });

  function render() {
    const state = store.getState();
    const section = state.settingsSection;
    node.replaceChildren(
      ...(section && SECTIONS[section]
        ? sectionView(section, state, app, theme)
        : hubView(state, app)),
    );
  }

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
      Object.entries(SECTIONS).map(([id, meta]) => settingRow(meta, () => app.setSettingsSection(id))),
    ),

    el('span', { class: 'field-label' }, 'Support'),
    el('div', { class: 'list-divide' }, [
      plainRow('lucide:circle-help', '❓', 'Help & support', () => app.stub('Opens help.bitos.app — simulated.')),
      plainRow('lucide:info', 'ℹ', 'About BitOS Education', () => app.stub('BitOS Education · v1.0.0-proto')),
    ]),
  ];
}

function sectionView(section, state, app, theme) {
  const meta = SECTIONS[section];
  const persona = getPersona(state.personaId);
  const membership = state.memberships?.[persona.id] ?? state.membership ?? MEMBERSHIP.NONE;

  const bodies = {
    appearance: () => [appearanceBody(theme)],
    identity: () => [identityCard(persona, app), handleCard(persona, app), signerCard(state, app)],
    membership: () => [membershipCard(membership, app)],
    relays: () => [relayCard(state)],
    session: () => [sessionCard(app)],
  };

  return [sectionHeader(meta.title, app), ...(bodies[section]?.() ?? [])];
}

function sectionHeader(title, app) {
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
    el('h1', { class: 'font-display secthead__title' }, title),
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
  const secret = el('p', { class: 'mono small', hidden: true }, persona.nsec);
  const reveal = button('Reveal', {
    variant: 'ghost',
    small: true,
    onClick: () => {
      secret.hidden = !secret.hidden;
      reveal.replaceChildren(secret.hidden ? 'Reveal' : 'Hide');
    },
  });

  return el('div', { class: 'card' }, [
    el('div', { class: 'dhead' }, [
      identityChip(persona, { size: 44 }),
      isVerified(persona) ? statusBadge('✓ handle verified', 'ok') : statusBadge('handle unverified', 'muted'),
    ]),
    el('span', { class: 'field-label', style: { marginTop: '12px' } }, 'Public key (npub)'),
    el('p', { class: 'mono small' }, persona.npub),
    el('div', { class: 'arow' }, [
      button('Copy full key', { small: true, onClick: () => app.copyText(persona.npub, 'Full key copied — 63 characters.') }),
      button('Copy backup key', { small: true, onClick: () => app.copyText(persona.nsec, 'Backup key copied — keep it secret.') }),
    ]),
    el('div', { class: 'keyrow' }, [secret, reveal]),
  ]);
}

function membershipCard(membership, app) {
  const badge = membershipBadge(membership);
  const children = [el('h3', {}, 'BitOS Academy membership')];
  if (badge) children.push(el('p', {}, statusBadge(badge.label, badge.tone)));
  if (membership !== MEMBERSHIP.ACTIVE) {
    children.push(
      el('p', { class: 'muted small' }, 'Enroll in classes once the academy owner approves your membership.'),
      button('Request to join', { variant: 'gold', small: true, onClick: () => app.requestMembership() }),
    );
  } else {
    children.push(el('p', { class: 'muted small' }, 'You can request class enrollment from Discover.'));
  }
  return el('div', { class: 'card' }, children);
}

function signerCard(state, app) {
  const signer = signerType(state.signerType ?? 'demo');
  return el('div', { class: 'card' }, [
    el('h3', {}, 'Keys & signer'),
    el('p', { class: 'small' }, ['Signer: ', el('strong', {}, signer.label)]),
    el('p', { class: 'muted small' }, signer.sub),
    el('div', { class: 'arow' }, [
      button('Sign a test challenge', { small: true, onClick: () => app.testSigner() }),
      button('Lost your key?', { small: true, onClick: () => app.stub('BitOS cannot restore a lost key. Recovery options are being designed for the pilot.') }),
    ]),
    noteBox('BitOS cannot restore a lost key. Back up your key or use social recovery when it ships.'),
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

function relayCard(state) {
  return el('div', {}, [
    el('h3', {}, 'Relays'),
    el('div', { class: 'list-divide' }, state.relays.map((relay) =>
      el('div', { class: 'list-row' }, [
        el('span', { class: 'mono small' }, relay.url),
        el('span', { class: 'spacer' }),
        statusBadge(relay.mode, 'info'),
        statusBadge(relay.health, relay.health === 'connected' ? 'ok' : relay.health === 'offline' ? 'err' : 'warn'),
      ]),
    )),
  ]);
}

function sessionCard(app) {
  return el('div', { class: 'card' }, [
    el('h3', {}, 'Session'),
    el('p', { class: 'muted small' }, 'Signing out clears the session on this device. Your keys stay with your signer.'),
    button('Sign out', { variant: 'ghost', onClick: () => app.signOut() }),
  ]);
}
