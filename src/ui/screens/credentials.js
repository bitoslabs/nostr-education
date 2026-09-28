import { el } from '../../core/dom.js';
import { getPersona } from '../../data/personas.js';
import { ROLE } from '../../domain/school.js';
import { credentialCard } from '../components/credential-card.js';
import { profileCard } from '../components/profile-card.js';
import { button, pageTitle, row } from '../components/primitives.js';
import { statusBadge } from '../components/status-badge.js';

export function renderCredentials({ store, app, scope }) {
  const node = el('section', { class: 'screen' });

  function render() {
    const state = store.getState();
    const persona = getPersona(state.personaId);
    const credentials = state.credentials ?? [];
    const profile = profileCard(persona, {
      onEdit: () => app.openEditProfile(),
      onRefresh: () => app.refreshMyProfile(),
      onCopy: () => app.copyText(persona.npub, 'Public key copied.'),
    });

    if (persona.role === ROLE.TEACHER) {
      node.replaceChildren(
        pageTitle('Credentials'),
        profile,
        el('div', { class: 'card' }, [
          el('div', { class: 'dhead' }, [
            el('h3', {}, 'Teacher · BitOS Academy'),
            statusBadge('✓ active', 'ok'),
          ]),
          el('p', { class: 'muted small' }, 'Staff credential · proves role, not issuing authority.'),
        ]),
      );
      return;
    }

    if (persona.role === ROLE.OWNER) {
      node.replaceChildren(
        pageTitle('Issued by your organization'),
        profile,
        el('div', { class: 'rows' }, [
          state.signed
            ? row([
                el('span', { class: 'who' }, 'Certificate · Alice'),
                el('span', { class: 'muted small' }, 'CS-101 · issued today'),
                statusBadge('✓ delivered', 'ok'),
              ])
            : null,
          row([
            el('span', { class: 'who' }, 'Certificate · Carol'),
            el('span', { class: 'muted small' }, 'CS-101 · Jan 30'),
            statusBadge('✓ delivered', 'ok'),
          ]),
        ]),
      );
      return;
    }

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
