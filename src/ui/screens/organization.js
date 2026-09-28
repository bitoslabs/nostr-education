import { el } from '../../core/dom.js';
import { deliveryCopy, deliveryTone, isDeliverySettled, staleCopy } from '../../domain/delivery.js';
import { pendingRequestCount, REQUEST_STATUS, requestBadge } from '../../domain/school.js';
import { button, emptyState, noteBox, pageTitle, row, stat, tabs } from '../components/primitives.js';
import { statusBadge } from '../components/status-badge.js';

const ORG_TABS = Object.freeze([
  { id: 'overview', label: 'Overview' },
  { id: 'courses', label: 'Courses' },
  { id: 'enrollment', label: 'Enrollment' },
  { id: 'staff', label: 'Staff & roles' },
  { id: 'sign', label: 'Sign queue' },
  { id: 'network', label: 'Network' },
]);

export function renderOrganization({ store, app, scope }) {
  const node = el('section', { class: 'screen' });

  function render() {
    const state = store.getState();
    const pending = state.signQueue.filter((entry) => entry.status === 'pending').length;
    const pendingRequests = pendingRequestCount(state.joinRequests, state.enrollRequests);
    const tabsView = tabs(
      ORG_TABS.map((tab) => {
        if (tab.id === 'sign') return { id: tab.id, label: `Sign queue (${pending})` };
        if (tab.id === 'enrollment') return { id: tab.id, label: `Enrollment (${pendingRequests})` };
        return tab;
      }),
      state.orgTab,
      (id) => app.setOrgTab(id),
      { label: 'Organization' },
    );

    node.replaceChildren(pageTitle('Organization'), tabsView, bodyFor(state, app, pending));
  }

  scope.add(store.subscribe(render));
  render();
  return node;
}

function bodyFor(state, app, pending) {
  switch (state.orgTab) {
    case 'courses':
      return el('div', { class: 'rows' }, [
        row([el('span', { class: 'who' }, 'CS-101'), el('span', { class: 'muted small' }, 'Applied Cryptography · live · teacher Bob ✓')]),
        row([el('span', { class: 'who' }, 'CS-204'), el('span', { class: 'muted small' }, 'Applied Cryptography II · draft — invisible to students until published')]),
        row([el('span', { class: 'who' }, 'CS-105'), el('span', { class: 'muted small' }, 'Planned')]),
      ]);
    case 'enrollment':
      return enrollmentBody(state, app);
    case 'staff':
      return el('div', {}, [
        el('div', { class: 'rows' }, [
          row([el('span', { class: 'who' }, 'Bob ✓'), statusBadge('teacher', 'info'), el('span', { class: 'muted small' }, 'CS-101'), el('span', { class: 'spacer' }), button('Roles ▾', { small: true, onClick: () => app.stub('Role editor — pilot build.') })]),
          row([el('span', { class: 'who' }, 'Carol ✓'), statusBadge('teacher', 'info'), el('span', { class: 'muted small' }, 'unassigned'), el('span', { class: 'spacer' }), button('Roles ▾', { small: true, onClick: () => app.stub('Role editor — pilot build.') })]),
          row([el('span', { class: 'who' }, '● invite pending'), el('span', { class: 'muted small mono' }, 'dave@bitos.id · sent 2d'), el('span', { class: 'spacer' }), button('Resend', { small: true, onClick: () => app.stub('Invite resent — simulated.') })]),
        ]),
        el('h3', {}, 'Issuer authorization'),
        el('div', { class: 'card' }, [
          el('p', { class: 'small' }, ['Organization signer key ', el('span', { class: 'mono' }, 'npub1kk9m…2f8d'), ' ', statusBadge('✓ rotated Jan 12', 'ok')]),
          el('p', { class: 'small muted' }, 'Authorized signers: Nadia (you). Invitations and admin access never grant signing power.'),
          button('＋ Add signer…', { small: true, onClick: () => app.stub('Signer management — pilot build.') }),
        ]),
      ]);
    case 'sign':
      return signQueueRows(state, app, pending);
    case 'network':
      return networkBody(state, app);
    default:
      return overviewBody(state, app, pending);
  }
}

function overviewBody(state, app, pending) {
  const healthy = state.relays.filter((relay) => relay.health === 'connected').length;
  const requests = pendingRequestCount(state.joinRequests, state.enrollRequests);
  return el('div', {}, [
    el('div', { class: 'statgrid' }, [
      stat({ value: 3, label: 'courses live', onClick: () => app.setOrgTab('courses') }),
      stat({ value: requests, label: 'enrollment requests', onClick: () => app.setOrgTab('enrollment') }),
      stat({ value: pending, label: 'pending signatures', onClick: () => app.setOrgTab('sign') }),
      stat({ value: `${healthy}/${state.relays.length}`, label: 'relays healthy', onClick: () => app.setOrgTab('network') }),
    ]),
    el('h3', {}, 'Completion queue'),
    signQueueRows(state, app, pending),
  ]);
}

function enrollmentBody(state, app) {
  const joinRows = state.joinRequests.map((entry) =>
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

  const enrollRows = state.enrollRequests.map((entry) =>
    row([
      el('span', { class: 'who' }, entry.learnerName),
      el('span', { class: 'muted small' }, `${entry.courseId} · ${entry.courseTitle}`),
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

  return el('div', {}, [
    el('h3', {}, 'Membership requests'),
    joinRows.length ? el('div', { class: 'rows' }, joinRows) : emptyState('No membership requests ✓'),
    el('h3', {}, 'Class enrollment requests'),
    enrollRows.length ? el('div', { class: 'rows' }, enrollRows) : emptyState('No enrollment requests ✓'),
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
          ? button('Retry', { small: true, onClick: () => app.stub('Reconnecting to relay — simulated.') })
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
