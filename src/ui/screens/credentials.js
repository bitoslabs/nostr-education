import { el } from '../../core/dom.js';
import { getPersona } from '../../data/personas.js';
import { credentialProofText, encodeProofFragment } from '../../domain/credential.js';
import { findAcademyById } from '../../domain/academy.js';
import { ROLE } from '../../domain/school.js';
import { credentialCard } from '../components/credential-card.js';
import { createIssuedPanel } from '../components/issued-credentials.js';
import { profileCard } from '../components/profile-card.js';
import { button, pageTitle } from '../components/primitives.js';
import { statusBadge } from '../components/status-badge.js';

export function renderCredentials({ store, app, scope }) {
  const node = el('section', { class: 'screen' });
  let issuedPanel = null;

  function render() {
    const state = store.getState();
    const persona = getPersona(state.personaId);

    if (persona.role === ROLE.OWNER) {
      if (!issuedPanel) {
        issuedPanel = createIssuedPanel({ app });
        node.replaceChildren(pageTitle('Issued by your organization'), issuedPanel.root);
      }
      issuedPanel.update(state);
      return;
    }

    issuedPanel = null;
    const profile = profileCard(persona, {
      onEdit: () => {
        app.setSettingsSection('profile');
        app.navigate('/settings');
      },
      onRefresh: () => app.refreshMyProfile(),
      onCopy: () => app.copyText(persona.npub, 'Public key copied.'),
    });

    if (persona.role === ROLE.TEACHER) {
      const memberships = teacherMemberships(state, persona.id);
      node.replaceChildren(
        pageTitle('Credentials'),
        profile,
        memberships.length
          ? el('div', { class: 'grid' }, memberships.map(({ academy, status }) =>
              el('div', { class: 'card' }, [
                el('div', { class: 'dhead' }, [
                  el('h3', {}, `Teacher · ${academy.name}`),
                  statusBadge(status === 'active' ? '✓ active' : 'pending approval', status === 'active' ? 'ok' : 'info'),
                ]),
                el(
                  'p',
                  { class: 'muted small' },
                  'Teaching membership from an accepted invitation. This is role evidence, not a signed teaching credential.',
                ),
              ]),
            ))
          : el('div', { class: 'card' }, [
              el('h3', {}, 'No academy teaching role yet'),
              el('p', { class: 'muted small' }, 'Accept a teacher invitation to connect your role to an academy.'),
              button('Open an invitation', { variant: 'gold', small: true, onClick: () => app.navigate('/join') }),
            ]),
        button('Verify a credential', { variant: 'ghost', small: true, onClick: () => app.navigate('/verify') }),
      );
      return;
    }

    const credentials = state.credentials ?? [];
    node.replaceChildren(
      pageTitle('Credentials'),
      profile,
      credentials.length
        ? el(
            'div',
            { class: 'grid' },
            credentials.map((credential) =>
              credentialCard(credential, {
                grants: state.grants,
                onShare: () => app.openShare(credential.id),
                onRevoke: (index) => app.revokeGrant(index),
                onCopyProof: (entry) =>
                  app.copyText(
                    credentialProofText(entry),
                    'Credential proof copied — share it as a verifiable proof.',
                  ),
                onCopyLink: (entry) => {
                  const fragment = encodeProofFragment(credentialProofText(entry));
                  if (!fragment) return;
                  const base = `${location.origin}${location.pathname}`.replace(/#.*$/, '');
                  app.copyText(`${base}#/verify/${fragment}`, 'Verification link copied.');
                },
              }),
            ),
          )
        : el('div', { class: 'card' }, [
            el('h3', {}, 'No credentials yet'),
            el(
              'p',
              { class: 'muted small' },
              'Finish a course to earn a verifiable certificate. It appears here and can be shared without giving up your keys.',
            ),
            button('Find a course', { variant: 'gold', small: true, onClick: () => app.navigate('/discover') }),
          ]),
      button('Verify a credential', { variant: 'ghost', small: true, onClick: () => app.navigate('/verify') }),
    );
  }

  scope.add(store.subscribe(render));
  render();
  return node;
}

function teacherMemberships(state, personaId) {
  const byAcademy = new Map();

  for (const membership of state.academyMemberships ?? []) {
    if (membership.accountId !== personaId || membership.role !== ROLE.TEACHER) continue;
    const academy = findAcademyById(state.academies ?? {}, membership.academyId);
    if (academy) byAcademy.set(academy.id, { academy, status: membership.status ?? 'active' });
  }

  for (const invite of state.invites ?? []) {
    if (invite.acceptedBy !== personaId || invite.role !== ROLE.TEACHER) continue;
    const academy = findAcademyById(state.academies ?? {}, invite.academyId);
    if (academy && !byAcademy.has(academy.id)) byAcademy.set(academy.id, { academy, status: 'active' });
  }

  for (const classroom of state.classrooms ?? []) {
    if (classroom.teacherId !== personaId) continue;
    const academy = findAcademyById(state.academies ?? {}, classroom.academyId);
    if (academy) byAcademy.set(academy.id, { academy, status: 'active' });
  }

  return [...byAcademy.values()];
}
