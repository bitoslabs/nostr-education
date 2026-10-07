import { el } from '../../core/dom.js';
import { bindScreen } from '../../core/reactive.js';
import { formatRelative } from '../../core/time.js';
import { getPersona, registerPersona } from '../../data/personas.js';
import { identityName, identitySecondary, isVerified, truncateNpub } from '../../domain/identity.js';
import { formatSats } from '../../domain/wallet.js';
import { t } from '../../services/i18n/index.js';
import { decodeKey, encodeNpub } from '../../services/nostr.js';
import { eventCard } from '../components/event-card.js';
import { icon } from '../components/icon.js';
import { avatar, button, emptyState, spinner, tabs } from '../components/primitives.js';
import { statusBadge } from '../components/status-badge.js';

const TABS = [
  { id: 'notes', key: 'profile.notes' },
  { id: 'replies', key: 'profile.tabReplies' },
  { id: 'zaps', key: 'profile.tabZaps' },
  { id: 'media', key: 'profile.tabMedia' },
  { id: 'likes', key: 'profile.tabLikes' },
];

// A profile is addressed by public key in the route: `/profile/<npub>` (or the
// `/p/<npub>` alias). Accepts npub, nprofile, or 64-char hex.
function referenceFromRoute(route) {
  const path = String(route ?? '');
  for (const prefix of ['/profile/', '/p/']) {
    if (!path.startsWith(prefix)) continue;
    return decodeURIComponent(path.slice(prefix.length)).split(/[?&#/]/)[0];
  }
  return '';
}

export function renderProfile({ app, state, scope }) {
  const node = el('section', { class: 'screen profile' });
  const view = {
    ref: null,
    pubkey: null,
    npub: '',
    profile: null,
    status: 'idle', // idle | loading | ready | empty | invalid
    tab: 'notes',
  };
  let disposed = false;
  scope.add(() => {
    disposed = true;
  });

  function syncRef(ref) {
    view.ref = ref;
    view.profile = null;
    view.tab = 'notes';
    const decoded = ref ? decodeKey(ref) : null;
    if (!decoded?.pubkey) {
      view.pubkey = null;
      view.npub = '';
      view.status = 'invalid';
      return;
    }
    view.pubkey = decoded.pubkey;
    view.npub = encodeNpub(decoded.pubkey);
    const existing = getPersona(decoded.pubkey);
    if (existing.loaded) view.profile = existing;
    view.status = existing.loaded ? 'ready' : 'loading';
    loadProfile(decoded.pubkey, existing);
    // Notes live in the store (`profileTimeline`) so the standard engagement
    // actions can resolve them; the binding re-renders as they stream in.
    // Deferred one microtask so starting the query never writes the store from
    // inside the reactive render that triggered it.
    Promise.resolve().then(() => {
      if (disposed || view.pubkey !== decoded.pubkey) return;
      app.loadProfileNotes(decoded.pubkey);
    });
  }

  // Resolve the public kind-0 and cache it in the persona registry so the note
  // cards below render the author's name and avatar. Registration stays
  // in-memory: it never rewrites the store, so opening a profile cannot loop.
  function loadProfile(pubkey, existing) {
    app
      .resolveProfile(pubkey)
      .then(({ profile }) => {
        if (disposed || view.pubkey !== pubkey) return;
        if (profile) {
          view.profile = registerPersona({
            ...existing,
            id: pubkey,
            npub: encodeNpub(pubkey),
            displayName: profile.displayName || existing.displayName,
            name: profile.name ?? existing.name,
            about: profile.about || existing.about,
            picture: profile.picture ?? existing.picture,
            banner: profile.banner ?? existing.banner,
            handle: profile.handle ?? existing.handle,
            lud16: profile.lud16 ?? existing.lud16,
            lud06: profile.lud06 ?? existing.lud06,
            website: profile.website ?? existing.website,
            bot: profile.bot ?? existing.bot,
            raw: profile.raw,
          });
        }
        view.status = view.profile?.loaded ? 'ready' : 'empty';
        paint();
      })
      .catch(() => {
        if (disposed || view.pubkey !== pubkey) return;
        view.status = view.profile?.loaded ? 'ready' : 'empty';
        paint();
      });
  }

  function timeline() {
    const current = state.val.profileTimeline;
    if (current?.pubkey === view.pubkey) return current;
    return { events: [], status: 'loading', zaps: [], zapsStatus: 'idle', likes: [], likesStatus: 'idle' };
  }

  function headerTitle() {
    return view.profile?.displayName || (view.npub ? truncateNpub(view.npub) : t('profile.title'));
  }

  // ---------- header + hero ----------

  function topBar() {
    const tl = timeline();
    const count = tl.events.filter((event) => !event.replyTo).length;
    const sub = count
      ? t(count === 1 ? 'profile.noteCountOne' : 'profile.noteCountMany', { count })
      : t('profile.title');
    return el('header', { class: 'profile-top' }, [
      el(
        'button',
        {
          class: 'profile-top__back',
          type: 'button',
          'aria-label': t('common.actions.back'),
          onClick: () => app.navigate('/home'),
        },
        icon('lucide:arrow-left', { size: 18, fallback: '←' }),
      ),
      el('div', { class: 'profile-top__meta' }, [
        el('h1', { class: 'profile-top__name' }, headerTitle()),
        el('div', { class: 'profile-top__sub mono' }, sub),
      ]),
    ]);
  }

  function banner(profile) {
    if (profile.banner) {
      return el('div', { class: 'profile-banner' }, [
        el('img', { src: profile.banner, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }),
        el('span', { class: 'profile-banner__fade', 'aria-hidden': 'true' }),
      ]);
    }
    return el('div', { class: 'profile-banner profile-banner--fallback', 'aria-hidden': 'true' });
  }

  function actionsRow(profile) {
    const viewerId = state.val.accountId;
    const isMe = viewerId && viewerId === view.pubkey;
    const items = [];
    if (isMe) {
      items.push(
        button(t('home.editProfile'), {
          small: true,
          className: 'profile-act',
          onClick: () => app.navigate('/settings'),
        }),
      );
    } else {
      items.push(
        button(t('messages.messageAction'), {
          small: true,
          className: 'profile-act',
          onClick: () => app.openMessageTo(view.pubkey),
        }),
      );
    }
    items.push(
      button(t('wallet.zap.title'), {
        variant: 'gold',
        small: true,
        className: 'profile-act',
        onClick: () => app.openZapPeer?.(view.pubkey),
      }),
    );
    return items;
  }

  function statsRow(profile, tl) {
    const viewerId = state.val.accountId;
    const isMe = viewerId && viewerId === view.pubkey;
    const noteCount = tl.events.filter((event) => !event.replyTo).length;
    const following = (state.val.following?.[view.pubkey] ?? []).length;
    const sats = tl.zaps.reduce((total, zap) => total + (zap.amountSats ?? 0), 0);
    const stats = [
      { label: t('profile.statNotes'), value: String(noteCount) },
      isMe && following ? { label: t('profile.following'), value: String(following) } : null,
      tl.zapsStatus !== 'idle' ? { label: t('profile.satsReceived'), value: formatSats(sats), accent: true } : null,
    ].filter(Boolean);
    if (!stats.length) return null;
    return el(
      'div',
      { class: 'profile-stats' },
      stats.map((stat) =>
        el('span', { class: stat.accent ? 'profile-stat is-accent' : 'profile-stat' }, [
          el('b', { class: 'mono' }, stat.value),
          el('span', {}, stat.label),
        ]),
      ),
    );
  }

  function keyBox() {
    return el('button', {
      class: 'profile-key',
      type: 'button',
      title: t('profile.npubCopied'),
      onClick: () => app.copyText(view.npub, t('profile.npubCopied')),
    }, [
      el('span', { class: 'profile-key__label' }, t('home.publicKey')),
      el('span', { class: 'profile-key__value mono' }, view.npub),
    ]);
  }

  function hero(profile) {
    const tl = timeline();
    return el('div', { class: 'profile-hero-page' }, [
      banner(profile),
      el('div', { class: 'profile-body' }, [
        el('div', { class: 'profile-ident' }, [
          el('span', { class: 'profile-ident__ava' }, [avatar(profile, 96)]),
        ]),
        el('div', { class: 'profile-ident-row' }, [
          el('div', { class: 'profile-ident__info' }, [
            el('div', { class: 'profile-ident__name' }, [
              el('h2', {}, profile.displayName),
              isVerified(profile)
                ? el('span', { class: 'vmark', title: t('home.verifiedHandle') }, '✓')
                : null,
            ]),
            el('div', { class: 'profile-ident__npub mono' }, identitySecondary(profile)),
            profile.handle ? el('div', { class: 'profile-ident__handle' }, statusBadge(profile.handle, 'ok')) : null,
          ]),
          el('div', { class: 'profile-ident__actions' }, actionsRow(profile)),
        ]),
        profile.about
          ? el('p', { class: 'profile-bio' }, profile.about)
          : el('p', { class: 'profile-bio muted' }, t('home.noBio')),
        profile.website || profile.lud16
          ? el('p', { class: 'profile-links small muted' }, [
              profile.website
                ? el(
                    'a',
                    { href: profile.website, target: '_blank', rel: 'noopener noreferrer' },
                    [
                      icon('lucide:link', { size: 13, fallback: '🔗' }),
                      profile.website.replace(/^https?:\/\//, ''),
                    ],
                  )
                : null,
              profile.website && profile.lud16 ? ' · ' : null,
              profile.lud16 ? el('span', { class: 'mono' }, profile.lud16) : null,
            ])
          : null,
        statsRow(profile, tl),
        keyBox(),
      ]),
    ]);
  }

  // ---------- tabs ----------

  function selectTab(id) {
    if (view.tab === id) return;
    view.tab = id;
    const tl = state.val.profileTimeline;
    if (id === 'zaps' && tl?.pubkey === view.pubkey && tl.zapsStatus === 'idle') {
      app.loadProfileZaps?.(view.pubkey);
    }
    if (id === 'likes' && tl?.pubkey === view.pubkey && tl.likesStatus === 'idle') {
      app.loadProfileLikes?.(view.pubkey);
    }
    paint();
  }

  function cards(events) {
    const persona = getPersona(state.val.personaId);
    return el(
      'div',
      { class: 'feed' },
      events.map((event) => eventCard(event, { persona, actions: app })),
    );
  }

  function zapsTab(tl) {
    if (tl.zapsStatus === 'idle' || (tl.zapsStatus === 'loading' && !tl.zaps.length)) {
      return el('div', { class: 'profile-state' }, spinner(t('profile.zapsLoading')));
    }
    if (!tl.zaps.length) return el('div', { class: 'profile-state' }, emptyState(t('profile.noZaps')));
    return el(
      'div',
      { class: 'zap-list' },
      tl.zaps.map((zap) =>
        el('article', { class: 'zap-row' }, [
          el('span', { class: 'zap-row__ico' }, icon('lucide:zap', { size: 18, fallback: '⚡' })),
          el('span', { class: 'zap-row__amt mono' }, [
            el('b', {}, formatSats(zap.amountSats)),
            el('span', { class: 'muted small' }, ` ${t('wallet.sats')}`),
          ]),
          el('span', { class: 'spacer' }),
          zap.peerId ? el('span', { class: 'zap-row__from small' }, identityName(getPersona(zap.peerId))) : null,
          el('span', { class: 't small' }, formatRelative(zap.createdAt) ?? ''),
        ]),
      ),
    );
  }

  function likesTab(tl) {
    if (tl.likesStatus === 'idle' || (tl.likesStatus === 'loading' && !tl.likes.length)) {
      return el('div', { class: 'profile-state' }, spinner(t('profile.likesLoading')));
    }
    if (!tl.likes.length) return el('div', { class: 'profile-state' }, emptyState(t('profile.noLikes')));
    return cards(tl.likes);
  }

  function content() {
    const tl = timeline();
    if (view.status === 'invalid') {
      return el('div', { class: 'profile-state' }, [
        el('h3', {}, t('profile.invalid')),
        el('p', { class: 'muted small' }, t('profile.invalidBody')),
      ]);
    }
    if (view.status === 'empty') {
      return el('div', { class: 'profile-state' }, [
        el('h3', {}, t('profile.notFound')),
        el('p', { class: 'muted small' }, t('profile.notFoundBody')),
        el('p', { class: 'mono small muted', style: { wordBreak: 'break-all' } }, view.npub),
      ]);
    }
    if (view.tab === 'zaps') return zapsTab(tl);
    if (view.tab === 'likes') return likesTab(tl);
    if (tl.status !== 'ready' && !tl.events.length) {
      return el('div', { class: 'profile-state' }, spinner(t('profile.notesLoading')));
    }
    const filtered =
      view.tab === 'replies'
        ? tl.events.filter((event) => event.replyTo)
        : view.tab === 'media'
          ? tl.events.filter((event) => event.files?.length)
          : tl.events.filter((event) => !event.replyTo);
    if (!filtered.length) {
      const key =
        view.tab === 'replies'
          ? 'profile.noReplies'
          : view.tab === 'media'
            ? 'profile.noMedia'
            : 'profile.noNotes';
      return el('div', { class: 'profile-state' }, emptyState(t(key)));
    }
    return cards(filtered);
  }

  function tabBar() {
    return tabs(
      TABS.map((tab) => ({ id: tab.id, label: t(tab.key) })),
      view.tab,
      selectTab,
      { label: t('profile.title') },
    );
  }

  function paint() {
    const parts = [];
    if (view.profile) {
      parts.push(topBar(), hero(view.profile), el('div', { class: 'profile-tabs-wrap' }, [tabBar()]), content());
    } else if (view.status === 'loading') {
      parts.push(topBar(), el('div', { class: 'profile-state' }, spinner(t('profile.loading'))));
    } else {
      parts.push(topBar(), content());
    }
    node.replaceChildren(...parts.filter(Boolean));
  }

  return bindScreen(state, node, (snapshot) => {
    const ref = referenceFromRoute(snapshot.route);
    if (ref !== view.ref) syncRef(ref);
    paint();
  });
}
