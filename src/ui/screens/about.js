import { el } from '../../core/dom.js';
import { truncateNpub } from '../../domain/identity.js';
import { t } from '../../services/i18n/index.js';
import { icon } from '../components/icon.js';
import { beeLogo } from '../components/logo.js';
import { avatar, button, noteBox } from '../components/primitives.js';
import { statusBadge } from '../components/status-badge.js';

// Owner of BitOS (bitos.space). Donations are resolved live from this identity's
// kind-0 Lightning address so the app never hard-codes a payout destination.
const OWNER_NPUB = 'npub12l8q8wph9ygk0hv00pf8g558pvftr0hav2r8npfq66nm04sswnwsylp57e';
// Core contributor credited on the About page.
const CONTRIBUTOR_NPUB = 'npub1ujh9lp7vw38yatm0vsxy7xuwxl3j98qvnyatyyg9xszufpyxn2fskqagph';
const HOMEPAGE = 'https://bitos.space';
const REPOSITORY = 'https://github.com/bitoslabs/nostr-education';
const NJUMP = 'https://njump.me/';
const VERSION = 'v1.0.0-proto';

function lightningAddressOf(profile) {
  const lud16 = String(profile?.lud16 ?? '').trim();
  if (lud16.includes('@')) return lud16;
  const lud06 = String(profile?.lud06 ?? '').trim();
  return lud06 || '';
}

function lightningUri(address) {
  return address ? `lightning:${address}` : '';
}

function externalLink(label, href, { iconName, fallback, variant = 'ghost' } = {}) {
  return el(
    'a',
    { class: `btn btn--${variant} btn--sm`, href, target: '_blank', rel: 'noopener noreferrer' },
    [icon(iconName, { size: 16, fallback }), label],
  );
}

function personName(profile, npub) {
  return profile?.displayName || profile?.name || truncateNpub(npub);
}

// A credited team member: identity row plus copy-npub / view-on-Nostr actions.
// Returns the card and an `apply(profile)` that fills in the resolved kind-0.
function personCard(npub, { title, onCopy, extraLinks = [] } = {}) {
  const name = el('strong', {}, t('about.loading'));
  const secondary = el('span', { class: 'mono small muted' }, truncateNpub(npub));
  const avatarHolder = el('span', { class: 'about-owner__ava' }, avatar({ avatar: '🐝' }, 44));

  const card = el('div', { class: 'card' }, [
    el('div', { class: 'dhead' }, [el('h3', {}, title), statusBadge(t('about.core'), 'key')]),
    el('div', { class: 'about-owner' }, [
      avatarHolder,
      el('span', { class: 'about-owner__body' }, [name, secondary]),
    ]),
    el('div', { class: 'about-links' }, [
      button(t('about.copyNpub'), {
        variant: 'ghost',
        small: true,
        onClick: () => onCopy(),
      }),
      externalLink(t('about.viewOnNostr'), `${NJUMP}/${npub}`, {
        iconName: 'lucide:external-link',
        fallback: '↗',
      }),
      ...extraLinks,
    ]),
  ]);

  function apply(profile) {
    name.textContent = personName(profile, npub);
    secondary.textContent = profile?.handle || truncateNpub(npub);
    if (profile?.picture) {
      avatarHolder.replaceChildren(avatar({ picture: profile.picture, avatar: '🐝' }, 44));
    }
  }

  return { card, apply };
}

export function renderAbout({ app }) {
  const owner = personCard(OWNER_NPUB, {
    title: t('about.owner'),
    onCopy: () => app.copyText(OWNER_NPUB, t('about.npubCopied')),
    extraLinks: [externalLink(t('about.website'), HOMEPAGE, { iconName: 'lucide:globe', fallback: '🌐' })],
  });
  const contributor = personCard(CONTRIBUTOR_NPUB, {
    title: t('about.contributor'),
    onCopy: () => app.copyText(CONTRIBUTOR_NPUB, t('about.npubCopied')),
  });

  const donateBody = el('div', { class: 'about-donate__body' });
  const donateCard = el('div', { class: 'card' }, [
    el('div', { class: 'dhead' }, [
      el('h3', {}, t('about.donate')),
      statusBadge(t('about.sats'), 'warn'),
    ]),
    donateBody,
  ]);

  function renderDonate(state, profile) {
    if (state === 'loading') {
      donateBody.replaceChildren(el('p', { class: 'about-lead muted' }, t('about.lookingUp')));
      return;
    }

    const address = lightningAddressOf(profile);
    if (address) {
      donateBody.replaceChildren(
        el('p', { class: 'about-lead muted' }, t('about.supportBody')),
        el('div', { class: 'about-ln' }, [
          el('span', { class: 'about-ln__label' }, t('about.lightningAddress')),
          el('b', { class: 'about-ln__addr' }, address),
        ]),
        el('div', { class: 'about-links' }, [
          button(t('about.copyAddress'), {
            variant: 'gold',
            small: true,
            onClick: () => app.copyText(address, t('about.addressCopied')),
          }),
          el(
            'a',
            { class: 'btn btn--ghost btn--sm', href: lightningUri(address) },
            [icon('lucide:zap', { size: 16, fallback: '⚡' }), t('about.openWallet')],
          ),
        ]),
      );
      return;
    }

    donateBody.replaceChildren(
      el('p', { class: 'about-lead muted' }, t('about.noAddress')),
      el('div', { class: 'about-ln' }, [
        el('span', { class: 'about-ln__label' }, t('about.owner')),
        el('b', { class: 'about-ln__addr' }, truncateNpub(OWNER_NPUB)),
      ]),
      el('div', { class: 'about-links' }, [
        button(t('about.copyNpub'), {
          variant: 'ghost',
          small: true,
          onClick: () => app.copyText(OWNER_NPUB, t('about.npubCopied')),
        }),
        externalLink(t('about.zapOnNostr'), `${NJUMP}/${OWNER_NPUB}`, {
          iconName: 'lucide:zap',
          fallback: '⚡',
        }),
        button(t('common.actions.retry'), {
          variant: 'ghost',
          small: true,
          onClick: () => load(),
        }),
      ]),
    );
  }

  function load() {
    renderDonate('loading');
    return Promise.all([app.resolveProfile(OWNER_NPUB), app.resolveProfile(CONTRIBUTOR_NPUB)])
      .then(([ownerProfile, contributorProfile]) => {
        if (!node.isConnected) return;
        owner.apply(ownerProfile.profile);
        contributor.apply(contributorProfile.profile);
        renderDonate('ready', ownerProfile.profile);
      })
      .catch(() => {
        if (node.isConnected) renderDonate('ready', null);
      });
  }

  const node = el('section', { class: 'screen' }, [
    el('div', { class: 'about-hero' }, [
      beeLogo(72, 'bee-float'),
      el('h1', { class: 'font-display about-name' }, t('about.title')),
      el('p', { class: 'about-tagline muted small' }, t('about.tagline')),
      statusBadge(VERSION, 'muted'),
    ]),
    el('div', { class: 'card' }, [
      el('h3', {}, t('about.whatTitle')),
      el('p', { class: 'muted small' }, t('about.whatBody')),
      noteBox(t('about.protocolNote')),
      el('div', { class: 'about-links' }, [
        externalLink(t('about.source'), REPOSITORY, { iconName: 'lucide:code', fallback: '</>' }),
      ]),
    ]),
    owner.card,
    contributor.card,
    donateCard,
    el('p', { class: 'muted small about-foot' }, t('about.footer')),
  ]);

  load();

  return node;
}
