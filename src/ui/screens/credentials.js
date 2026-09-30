import { el } from '../../core/dom.js';
import { bindScreen } from '../../core/reactive.js';
import { getPersona } from '../../data/personas.js';
import { credentialProofText, encodeProofFragment } from '../../domain/credential.js';
import { findAcademyById } from '../../domain/academy.js';
import { ROLE } from '../../domain/school.js';
import { t } from '../../services/i18n/index.js';
import { credentialCard } from '../components/credential-card.js';
import { createIssuedPanel } from '../components/issued-credentials.js';
import { profileCard } from '../components/profile-card.js';
import { button, pageTitle } from '../components/primitives.js';
import { statusBadge } from '../components/status-badge.js';

export function renderCredentials({ app, state }) {
  const node = el('section', { class: 'screen' });
  let issuedPanel = null;

  function render(snapshot) {
    const persona = getPersona(snapshot.personaId);

    if (persona.role === ROLE.OWNER) {
      if (!issuedPanel) {
        issuedPanel = createIssuedPanel({ app });
        node.replaceChildren(pageTitle(t('credentials.issuedByOrg')), issuedPanel.root);
      }
      issuedPanel.update(snapshot);
      return;
    }

    issuedPanel = null;
    const profile = profileCard(persona, {
      onEdit: () => {
        app.setSettingsSection('profile');
        app.navigate('/settings');
      },
      onRefresh: () => app.refreshMyProfile(),
      onCopy: () => app.copyText(persona.npub, t('credentials.publicKeyCopied')),
    });

    if (persona.role === ROLE.TEACHER) {
      const memberships = teacherMemberships(snapshot, persona.id);
      node.replaceChildren(
        pageTitle(t('credentials.title')),
        profile,
        memberships.length
          ? el('div', { class: 'grid' }, memberships.map(({ academy, status }) =>
              el('div', { class: 'card' }, [
                el('div', { class: 'dhead' }, [
                  el('h3', {}, t('credentials.teacherAcademy', { name: academy.name })),
                  statusBadge(
                    status === 'active' ? t('credentials.membershipActive') : t('credentials.membershipPendingApproval'),
                    status === 'active' ? 'ok' : 'info',
                  ),
                ]),
                el(
                  'p',
                  { class: 'muted small' },
                  t('credentials.membershipNote'),
                ),
              ]),
            ))
          : el('div', { class: 'card' }, [
              el('h3', {}, t('credentials.noAcademyRole')),
              el('p', { class: 'muted small' }, t('credentials.acceptTeacherInvite')),
              button(t('credentials.openInvitation'), { variant: 'gold', small: true, onClick: () => app.navigate('/join') }),
            ]),
        button(t('credentials.verifyCredential'), { variant: 'ghost', small: true, onClick: () => app.navigate('/verify') }),
      );
      return;
    }

    const credentials = snapshot.credentials ?? [];
    node.replaceChildren(
      pageTitle(t('credentials.title')),
      profile,
      credentials.length
        ? el(
            'div',
            { class: 'grid' },
            credentials.map((credential) =>
              credentialCard(credential, {
                grants: snapshot.grants,
                onShare: () => app.openShare(credential.id),
                onRevoke: (index) => app.revokeGrant(index),
                onCopyProof: (entry) =>
                  app.copyText(
                    credentialProofText(entry),
                    t('credentials.proofCopied'),
                  ),
                onCopyLink: (entry) => {
                  const fragment = encodeProofFragment(credentialProofText(entry));
                  if (!fragment) return;
                  const base = `${location.origin}${location.pathname}`.replace(/#.*$/, '');
                  app.copyText(`${base}#/verify/${fragment}`, t('credentials.linkCopied'));
                },
              }),
            ),
          )
        : el('div', { class: 'card' }, [
            el('h3', {}, t('credentials.empty')),
            el(
              'p',
              { class: 'muted small' },
              t('credentials.emptyHint'),
            ),
            button(t('credentials.findCourse'), { variant: 'gold', small: true, onClick: () => app.navigate('/discover') }),
          ]),
      button(t('credentials.verifyCredential'), { variant: 'ghost', small: true, onClick: () => app.navigate('/verify') }),
    );
  }

  return bindScreen(state, node, render);
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
