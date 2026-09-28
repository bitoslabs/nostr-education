import { el } from '../../core/dom.js';
import { getPersona } from '../../data/personas.js';
import { academyTypeLabel } from '../../domain/academy.js';
import {
  CREDENTIAL_STATUS,
  ISSUED_FILTERS,
  buildIssuedTimeline,
  filterIssuedEntries,
  issuedFilterCounts,
  issuedStats,
} from '../../domain/credential.js';
import { icon } from './icon.js';
import { avatar, button, segmented } from './primitives.js';
import { statusBadge } from './status-badge.js';

function initials(name) {
  const parts = String(name ?? '?')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return `${parts[0]?.[0] ?? '?'}${parts[1]?.[0] ?? ''}`.toUpperCase();
}

function timeAgo(ts) {
  if (!ts) return 'recently';
  const diff = Date.now() - Number(ts);
  if (!Number.isFinite(diff) || diff < 0) return 'recently';
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d`;
  try {
    return new Date(Number(ts)).toLocaleDateString();
  } catch {
    return 'earlier';
  }
}

function recipientAvatar(entry) {
  const persona = entry.recipientPubkey ? getPersona(entry.recipientPubkey) : null;
  if (persona?.picture) return avatar(persona, 42);
  return avatar({ avatar: initials(entry.recipientName) }, 42);
}

function rowStatus(entry) {
  if (entry.kind === 'awaiting') return statusBadge('awaiting signature', 'warn');
  if (entry.status === CREDENTIAL_STATUS.REVOKED) return statusBadge('revoked', 'err');
  if (entry.delivery === 'delivered') return statusBadge('✓ delivered', 'ok');
  if (entry.delivery === 'failed') return statusBadge('failed', 'err');
  return statusBadge('pending', 'warn');
}

function issuedRow(entry, app) {
  const sub = [entry.title, entry.course].filter(Boolean).join(' · ');
  const actions =
    entry.kind === 'awaiting'
      ? [button('Review & sign', { variant: 'gold', small: true, onClick: () => app.openSign(entry.signId) })]
      : [
          button('Verify', { small: true, onClick: () => app.navigate('/verify') }),
          button('Copy id', { small: true, onClick: () => app.copyText(entry.id, 'Credential id copied.') }),
          entry.status === CREDENTIAL_STATUS.ACTIVE
            ? button('Revoke', { small: true, onClick: () => app.revokeCredential(entry.id) })
            : null,
        ].filter(Boolean);

  return el('article', { class: `issued-row issued-row--${entry.kind}` }, [
    recipientAvatar(entry),
    el('div', { class: 'issued-row__body' }, [
      el('div', { class: 'issued-row__top' }, [
        el('span', { class: 'issued-row__who' }, entry.recipientName),
        el(
          'span',
          { class: 'issued-row__time' },
          entry.kind === 'awaiting' ? entry.time : timeAgo(entry.issuedAt),
        ),
      ]),
      el('p', { class: 'issued-row__sub' }, sub),
      el('div', { class: 'issued-row__meta' }, [
        rowStatus(entry),
        entry.recipientHandle ? el('span', { class: 'mono small muted' }, entry.recipientHandle) : null,
        entry.kind === 'awaiting' && entry.grade != null
          ? el('span', { class: 'small muted' }, `grade ${entry.grade}%`)
          : null,
      ]),
      el('div', { class: 'issued-row__actions' }, actions),
    ]),
  ]);
}

function sectionLabel(text) {
  return el('span', { class: 'issued-section' }, text);
}

function menuItem(iconName, fallback, label, onClick) {
  return el('button', { class: 'owner-menu__item', type: 'button', onClick }, [
    el('span', { class: 'owner-menu__ico', 'aria-hidden': 'true' }, icon(iconName, { size: 16, fallback })),
    el('span', {}, label),
  ]);
}

function issuerMenu({ app, academy }) {
  const menu = el('details', { class: 'owner-menu' });
  const close = () => {
    menu.open = false;
  };

  menu.append(
    el(
      'summary',
      { class: 'owner-menu__trigger', 'aria-label': 'More issuer actions' },
      icon('lucide:ellipsis', { size: 18, fallback: '⋯' }),
    ),
    el('div', { class: 'owner-menu__list' }, [
      academy
        ? menuItem('lucide:building-2', '🏫', 'Edit academy info', () => {
            close();
            app.setSettingsSection('academy');
            app.navigate('/settings');
          })
        : null,
      menuItem('lucide:user-round', '👤', 'Edit my profile', () => {
        close();
        app.setSettingsSection('profile');
        app.navigate('/settings');
      }),
      menuItem('lucide:layout-grid', '▦', 'Open organization', () => {
        close();
        app.navigate('/role');
      }),
    ]),
  );

  menu.addEventListener('toggle', () => {
    if (menu.open) {
      const onOutside = (event) => {
        if (!menu.contains(event.target)) menu.open = false;
      };
      const onKey = (event) => {
        if (event.key === 'Escape') menu.open = false;
      };
      menu.__outside = onOutside;
      menu.__keys = onKey;
      setTimeout(() => {
        document.addEventListener('pointerdown', onOutside);
        document.addEventListener('keydown', onKey);
      }, 0);
    } else {
      if (menu.__outside) document.removeEventListener('pointerdown', menu.__outside);
      if (menu.__keys) document.removeEventListener('keydown', menu.__keys);
      menu.__outside = null;
      menu.__keys = null;
    }
  });

  return menu;
}

export function createIssuedPanel({ app }) {
  let tab = 'all';
  let query = '';
  let latest = [];

  const hero = el('div', { class: 'owner-hero' });
  const stats = el('div', { class: 'issued-stats' });
  const filters = el('div', { class: 'issued-filters' });
  const search = el('input', {
    type: 'search',
    class: 'issued-search__input',
    placeholder: 'Search learner, course, or id',
    'aria-label': 'Search issued credentials',
    onInput: (event) => {
      query = event.target.value;
      renderList();
    },
  });
  const list = el('div', { class: 'issued-list' });

  function renderHero(state, persona) {
    const academy = state.academies?.[persona.id];
    const org = academy?.orgPubkey ? getPersona(academy.orgPubkey) : persona;
    const name = academy?.name ?? persona.displayName;
    const npub = academy?.orgNpub ?? persona.npub;
    hero.replaceChildren(
      el('div', { class: 'owner-hero__banner', 'aria-hidden': 'true' }),
      el('div', { class: 'owner-hero__body' }, [
        avatar(org, 56),
        el('div', { class: 'owner-hero__names' }, [
          el('span', { class: 'owner-hero__name' }, [
            name,
            el('span', { class: 'vmark', title: 'Authorized issuer' }, '✓'),
          ]),
          el('span', { class: 'small muted' }, academy ? academyTypeLabel(academy.type) : 'Issuer'),
          el('span', { class: 'mono small muted' }, npub),
        ]),
        el('div', { class: 'owner-hero__actions' }, [
          button([icon('lucide:copy', { size: 15, fallback: '⧉' }), 'Copy key'], {
            small: true,
            onClick: () => app.copyText(npub, 'Issuer key copied.'),
          }),
          issuerMenu({ app, academy }),
        ]),
      ]),
    );
  }

  function selectTab(id) {
    tab = id;
    renderStats();
    renderFilters();
    renderList();
  }

  function statCell({ value, label, tabId }) {
    const active = tabId === tab;
    return el(
      'button',
      {
        class: `issued-stat${active ? ' is-on' : ''}`,
        type: 'button',
        'aria-pressed': String(active),
        onClick: tabId ? () => selectTab(tabId) : null,
      },
      [el('b', {}, String(value)), el('span', {}, label)],
    );
  }

  function renderStats() {
    const totals = issuedStats(latest);
    stats.replaceChildren(
      statCell({ value: totals.issued, label: 'issued', tabId: 'all' }),
      statCell({ value: totals.delivered, label: 'delivered', tabId: 'delivered' }),
      statCell({ value: totals.pending, label: 'pending', tabId: 'pending' }),
      statCell({ value: totals.learners, label: 'learners', tabId: null }),
    );
  }

  function renderFilters() {
    const counts = issuedFilterCounts(latest);
    filters.replaceChildren(
      segmented(
        ISSUED_FILTERS.map((filter) => ({
          id: filter.id,
          label: counts[filter.id] ? `${filter.label} (${counts[filter.id]})` : filter.label,
        })),
        tab,
        (id) => selectTab(id),
        { label: 'Filter issued credentials' },
      ),
    );
  }

  function renderList() {
    const entries = filterIssuedEntries(latest, tab, query);
    if (!entries.length) {
      list.replaceChildren(
        latest.length
          ? el('div', { class: 'issued-empty' }, [
              el('span', { class: 'hex-plate issued-empty__ico' }, icon('lucide:search-x', { size: 20, fallback: '⌕' })),
              el('h3', {}, 'Nothing matches'),
              el('p', { class: 'muted small' }, 'Try a different name, course, or filter.'),
            ])
          : el('div', { class: 'issued-empty' }, [
              el('span', { class: 'hex-plate issued-empty__ico' }, icon('lucide:badge-check', { size: 20, fallback: '🎓' })),
              el('h3', {}, 'No credentials issued yet'),
              el('p', { class: 'muted small' }, 'When you sign a completion, the certificate appears here with its delivery status.'),
              button('Open sign queue', {
                variant: 'gold',
                small: true,
                onClick: () => {
                  app.setOrgTab('sign');
                  app.navigate('/role');
                },
              }),
            ]),
      );
      return;
    }

    const awaiting = entries.filter((entry) => entry.kind === 'awaiting');
    const issued = entries.filter((entry) => entry.kind === 'issued');
    const mixed = awaiting.length > 0 && issued.length > 0;
    const nodes = [];
    if (awaiting.length) {
      if (mixed) nodes.push(sectionLabel('Needs your signature'));
      nodes.push(...awaiting.map((entry) => issuedRow(entry, app)));
    }
    if (issued.length) {
      if (mixed) nodes.push(sectionLabel('Issued'));
      nodes.push(...issued.map((entry) => issuedRow(entry, app)));
    }
    list.replaceChildren(...nodes);
  }

  function update(state) {
    latest = buildIssuedTimeline(state.credentials ?? [], state.signQueue ?? []);
    renderHero(state, getPersona(state.personaId));
    renderStats();
    renderFilters();
    renderList();
  }

  const root = el('div', { class: 'issued-panel' }, [
    hero,
    stats,
    el('div', { class: 'issued-toolbar' }, [
      el('label', { class: 'issued-search' }, [
        el('span', { class: 'issued-search__ico', 'aria-hidden': 'true' }, icon('lucide:search', { size: 16, fallback: '⌕' })),
        search,
      ]),
      filters,
    ]),
    list,
  ]);

  return { root, update };
}
