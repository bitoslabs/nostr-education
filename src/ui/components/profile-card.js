import { el } from '../../core/dom.js';
import { identitySecondary, isVerified } from '../../domain/identity.js';
import { avatar, button } from './primitives.js';

export function profileCard(persona, { onEdit, onRefresh, onCopy } = {}) {
  return el('article', { class: 'card profile-card' }, [
    el('div', { class: 'profile-hero' }, [
      avatar(persona, 56),
      el('div', { class: 'profile-hero__names' }, [
        el('span', { class: 'profile-hero__name' }, [
          persona.displayName,
          isVerified(persona) ? el('span', { class: 'vmark', title: 'Verified handle' }, '✓') : null,
        ]),
        el('span', { class: 'mono small muted' }, identitySecondary(persona)),
      ]),
    ]),
    persona.about
      ? el('p', { class: 'small' }, persona.about)
      : el('p', { class: 'muted small' }, 'No bio yet — add one so classmates can recognise you.'),
    el('span', { class: 'field-label' }, 'Public key (npub)'),
    el('p', { class: 'mono small' }, persona.npub),
    el('div', { class: 'profile-actions' }, [
      button('Edit profile', { variant: 'gold', small: true, onClick: onEdit }),
      button('Copy npub', { small: true, onClick: onCopy }),
      button('Refresh from relays', { small: true, onClick: onRefresh }),
    ]),
  ]);
}
