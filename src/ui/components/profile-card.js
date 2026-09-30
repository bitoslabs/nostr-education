import { el } from '../../core/dom.js';
import { identitySecondary, isVerified } from '../../domain/identity.js';
import { t } from '../../services/i18n/index.js';
import { avatar, button } from './primitives.js';

export function profileCard(persona, { onEdit, onRefresh, onCopy } = {}) {
  return el('article', { class: 'card profile-card' }, [
    persona.banner
      ? el('img', { class: 'profile-card__banner', src: persona.banner, alt: '', loading: 'lazy' })
      : null,
    el('div', { class: 'profile-hero' }, [
      avatar(persona, 56),
      el('div', { class: 'profile-hero__names' }, [
        el('span', { class: 'profile-hero__name' }, [
          persona.displayName,
          isVerified(persona) ? el('span', { class: 'vmark', title: t('home.verifiedHandle') }, '✓') : null,
        ]),
        el('span', { class: 'mono small muted' }, identitySecondary(persona)),
      ]),
    ]),
    persona.about
      ? el('p', { class: 'small' }, persona.about)
      : el('p', { class: 'muted small' }, t('home.noBio')),
    persona.website || persona.lud16
      ? el('p', { class: 'small muted profile-card__meta' }, [
          persona.website
            ? el(
                'a',
                { href: persona.website, target: '_blank', rel: 'noopener noreferrer' },
                persona.website.replace(/^https?:\/\//, ''),
              )
            : null,
          persona.website && persona.lud16 ? ' · ' : null,
          persona.lud16 ? el('span', { class: 'mono' }, persona.lud16) : null,
        ])
      : null,
    el('span', { class: 'field-label' }, t('home.publicKey')),
    el('p', { class: 'mono small' }, persona.npub),
    el('div', { class: 'profile-actions' }, [
      button(t('home.editProfile'), { variant: 'gold', small: true, onClick: onEdit }),
      button(t('home.copyNpub'), { small: true, onClick: onCopy }),
      button(t('home.refreshFromRelays'), { small: true, onClick: onRefresh }),
    ]),
  ]);
}
