import { createActions } from './app/actions.js';
import { createDialogs } from './app/dialogs.js';
import { qs } from './core/dom.js';
import { createEmitter } from './core/emitter.js';
import { createReactiveStore } from './core/reactive.js';
import { createRouter, navigate } from './core/router.js';
import { createScope } from './core/scope.js';
import { createStore } from './core/store.js';
import { getPersona, getPersonaIds, hasPersona, hydrateProfiles, registerPersona } from './data/personas.js';
import { DEFAULT_SIGNER } from './domain/account.js';
import { findAcademyById } from './domain/academy.js';
import { classroomById } from './domain/classroom.js';
import { credentialFromEvent } from './domain/credential.js';
import { feedEventFromNote } from './domain/feed.js';
import {
  RECORD_TYPES,
  applyRecord,
  isPublicRecord,
  migrateSubmissionHistory,
  reconcileAssessmentHeads,
} from './domain/records.js';
import { parseProfileMeta } from './domain/profile.js';
import { normalizeRelayList } from './domain/relay.js';
import { normalizeMode } from './domain/mode.js';
import { normalizePrefs, subscriptionEnabled } from './domain/prefs.js';
import { MEMBERSHIP } from './domain/school.js';
import { ZAP_RECEIPT_KIND } from './domain/wallet.js';
import { APP_TAG, decodeRecord } from './services/records.js';
import { BLOSSOM_SERVERS } from './services/blossom.js';
import { createConfirmService } from './services/confirm.js';
import { createIconifyLoader } from './services/iconify.js';
import {
  DEFAULT_RELAYS,
  KIND,
  connectBunkerSigner,
  decodeKey,
  encodeNpub,
  extensionSigner,
  generateSecretKey,
  localSigner,
  verify,
} from './services/nostr.js';
import { GIFT_WRAP_KIND, RUMOR_KIND, unwrapGiftWrap } from './services/giftwrap.js';
import { createRelayService } from './services/relay.js';
import { createSignerService } from './services/signer.js';
import { loadFeedCache, loadSecretKey, loadState, saveFeedCache, saveState } from './services/storage.js';
import { createThemeService } from './services/theme.js';
import { applyStaticTranslations, getLocale, setLocale, t } from './services/i18n/index.js';
import { createConfirmHost } from './ui/components/confirm-dialog.js';
import { setIconLoader } from './ui/components/icon.js';
import { createOverlayHost } from './ui/components/overlay.js';
import { createSignerPromptHost } from './ui/components/signer-prompt.js';
import { createToastHost } from './ui/components/toast.js';
import { createShell } from './ui/layout/shell.js';
import { renderAbout } from './ui/screens/about.js';
import {
  isAuthRoute,
  renderCreateAccount,
  renderLoginNsec,
  renderSignIn,
  renderWelcome,
} from './ui/screens/auth.js';
import { renderCredentials } from './ui/screens/credentials.js';
import { renderDiscover } from './ui/screens/discover.js';
import { renderHome } from './ui/screens/home.js';
import { renderJoin } from './ui/screens/join.js';
import { renderMessages } from './ui/screens/messages.js';
import { renderNotifications } from './ui/screens/notifications.js';
import { renderProfile } from './ui/screens/profile.js';
import { renderWallet } from './ui/screens/wallet.js';
import { renderRole } from './ui/screens/role.js';
import { renderSettings } from './ui/screens/settings.js';
import { renderVerify } from './ui/screens/verify.js';

const appRoot = qs('[data-app-root]');
const overlayRoot = qs('[data-overlay-root]');

const persisted = loadState() ?? {};
const session = persisted.session ?? null;

// Backfill append-only history for submissions and grades saved by older builds.
const historyPatch = migrateSubmissionHistory(persisted);
const submissionVersions = historyPatch?.submissionVersions ?? persisted.submissionVersions ?? [];
const assessmentRevisions = historyPatch?.assessmentRevisions ?? persisted.assessmentRevisions ?? [];

hydrateProfiles(Object.values(persisted.profiles ?? {}));
if (session) registerPersona(session);

for (const academy of Object.values(persisted.academies ?? {})) {
  if (!academy?.orgPubkey) continue;
  registerPersona({
    id: academy.orgPubkey,
    npub: academy.orgNpub ?? encodeNpub(academy.orgPubkey),
    displayName: academy.name,
    about: academy.about ?? '',
    picture: academy.picture ?? null,
    avatar: '🏫',
  });
}

const store = createStore({
  authed: Boolean(session),
  session,
  accountId: session?.pubkey ?? null,
  personaId: session?.pubkey ?? null,
  signerType: session?.method ?? DEFAULT_SIGNER,
  memberships: persisted.memberships ?? {},
  academyMemberships: persisted.academyMemberships ?? [],
  academies: persisted.academies ?? {},
  invites: persisted.invites ?? [],
  subjects: persisted.subjects ?? [],
  classrooms: persisted.classrooms ?? [],
  homework: persisted.homework ?? [],
  submissions: persisted.submissions ?? [],
  submissionVersions,
  assessmentRevisions,
  profiles: persisted.profiles ?? {},
  mode: normalizeMode(persisted.mode),
  prefs: normalizePrefs(persisted.prefs),
  blossomServer: persisted.blossomServer ?? BLOSSOM_SERVERS[0],
  relayConfig: normalizeRelayList(persisted.relayConfig ?? persisted.relays ?? DEFAULT_RELAYS, {
    defaults: DEFAULT_RELAYS,
  }),
  relays: [],
  following: persisted.following ?? {},
  locale: persisted.locale ?? 'lo',
  joinRequests: persisted.joinRequests ?? [],
  enrollRequests: persisted.enrollRequests ?? [],
  // Notes are relay-backed; the last cached page paints instantly on reload,
  // then the relay subscription refreshes it. `feedStatus` drives the skeleton.
  events: loadFeedCache().map((raw) => feedEventFromNote(raw)).filter(Boolean),
  feedStatus: 'idle',
  // The open profile page's content. Session-local and separate from the home
  // feed, so browsing a profile never changes For-you / Latest ordering, yet
  // engagement (reactions, reposts, threads) still resolves these events.
  // `events` holds the author's notes + replies; `zaps`/`likes` load lazily.
  profileTimeline: {
    pubkey: null,
    status: 'idle',
    events: [],
    zaps: [],
    zapsStatus: 'idle',
    likes: [],
    likesStatus: 'idle',
  },
  signQueue: persisted.signQueue ?? [],
  recommendations: persisted.recommendations ?? [],
  capabilities: persisted.capabilities ?? [],
  grants: [],
  credentials: persisted.credentials ?? [],
  privateNames: persisted.privateNames ?? {},
  deliveries: [],
  lastCreated: null,
  route: '/home',
  feedTab: 'foryou',
  notificationTab: 'all',
  // Read/dismiss state per persona. Events themselves are session-local, so
  // this stays in memory too — it must not imply cross-device persistence.
  feedStates: {},
  // Per-person muted actors for the For-you tab; a preference, never an
  // authorization change (docs/architecture/home-feed.md).
  feedMutes: {},
  roleTab: 'classes',
  orgTab: 'overview',
  settingsSection: null,
  gradebookClassId: null,
  reviewSelectedId: null,
  membership: MEMBERSHIP.NONE,
  // Wallet, messaging, and notification-read state are local, per-account
  // prototype data. A wallet balance never authorizes anything and messages
  // are not yet an official academic record (docs/product-roadmap.md).
  zapsByAccount: persisted.zapsByAccount ?? {},
  conversationsByAccount: persisted.conversationsByAccount ?? {},
  walletConnectedByAccount: persisted.walletConnectedByAccount ?? {},
  notificationReads: persisted.notificationReads ?? {},
  // Public engagement on this account's own notes (likes, replies, reposts,
  // zaps), projected from signed relay events addressed to `#p:[me]`.
  // Persisted so unread rows survive a reload; the source stays on relays.
  socialNotificationsByAccount: persisted.socialNotificationsByAccount ?? {},
  activeConversationId: null,
  // Drives the conversation-list skeleton on first load; 'loading' only until
  // the gift-wrap query answers, so an empty inbox never flashes before the
  // relay replay arrives.
  messagesStatus: 'idle',
  // Loaded comment threads, keyed by note id: { status, replies[] }. Session
  // only; replies are fetched on demand when a thread opens.
  threads: {},
});

// Repair any submission head that was resolved with the old revision ordering,
// so a persisted score shows correctly without waiting for a relay replay.
const headPatch = reconcileAssessmentHeads({
  submissions: persisted.submissions ?? [],
  assessmentRevisions,
});
if (headPatch) store.setState(headPatch);

const reactiveState = createReactiveStore(store);

const bus = createEmitter();
setIconLoader(createIconifyLoader());

const overlay = createOverlayHost({ root: overlayRoot });
createToastHost({ bus, root: overlayRoot });
const signer = createSignerService({ bus });
const confirm = createConfirmService({ bus });
createSignerPromptHost({ bus, overlay });
createConfirmHost({ bus, overlay });

const relayService = createRelayService({ relays: store.getState().relayConfig });
const theme = createThemeService();
theme.init();

store.setState({ relays: relayService.statuses() });

const actions = createActions({ store, bus, signer, confirm, relay: relayService });
const dialogs = createDialogs({ overlay, store, actions });
const app = { ...actions, ...dialogs };
app.refreshRecords = refreshRecords;

// The prototype once seeded clearly-fake demo zaps and conversations. Wallet,
// messaging, and the feed are relay-backed now, so strip any demo rows a
// previous build persisted instead of seeding new ones.
function dropDemoData(accountId) {
  if (!accountId) return;
  const current = store.getState();
  const patch = {};
  const zaps = current.zapsByAccount?.[accountId] ?? [];
  const realZaps = zaps.filter((zap) => !String(zap?.id ?? '').startsWith('demo-zap-'));
  if (realZaps.length !== zaps.length) {
    patch.zapsByAccount = { ...(current.zapsByAccount ?? {}), [accountId]: realZaps };
  }
  const list = current.conversationsByAccount?.[accountId] ?? [];
  const realConversations = list.filter(
    (conversation) =>
      !String(conversation?.id ?? '').startsWith('demo-conv-') &&
      !String(conversation?.peerId ?? '').startsWith('demo-'),
  );
  if (realConversations.length !== list.length) {
    patch.conversationsByAccount = {
      ...(current.conversationsByAccount ?? {}),
      [accountId]: realConversations,
    };
  }
  if (Object.keys(patch).length) store.setState(patch);
}

let syncedAccount = null;
let syncedSubs = null;
let cachedEventsRef = null;
let cachedTimelineRef = null;
store.subscribe((state) => {
  saveState(state);
  if (state.events !== cachedEventsRef) {
    cachedEventsRef = state.events;
    saveFeedCache(state.events);
  }
  // The profile timeline brings new note ids on screen; re-query engagement
  // counts for them the same way a new feed page does.
  if (state.profileTimeline?.events !== cachedTimelineRef) {
    cachedTimelineRef = state.profileTimeline?.events ?? null;
    if (cachedTimelineRef?.length) scheduleEngagementSync();
  }
  if (state.locale !== getLocale()) setLocale(state.locale);
  // Changing which event kinds we subscribe to re-queries relays immediately
  // instead of waiting for the next account switch or reload.
  const subsKey = JSON.stringify(state.prefs?.network?.subscriptions ?? {});
  if (subsKey !== syncedSubs) {
    syncedSubs = subsKey;
    syncRecords();
    syncNotes();
    syncEngagement();
    syncEngagementNotifications();
    syncZaps();
  }
  if (state.accountId !== syncedAccount) {
    syncedAccount = state.accountId;
    dropDemoData(state.accountId);
    engagementSeen.clear();
    syncRecords();
    syncCredentials();
    syncNotes();
    syncEngagement();
    syncEngagementNotifications();
    syncZaps();
  }
});

function syncDocumentLocale() {
  setLocale(store.getState().locale);
  applyStaticTranslations();
}
syncDocumentLocale();

async function restoreSigner() {
  if (!session) return;
  if (session.method === 'extension') {
    const restored = extensionSigner();
    try {
      const pubkey = await restored.getPublicKey();
      if (pubkey === session.pubkey) signer.setSigner(restored);
    } catch {
      // The extension may still have an injected window.nostr facade after its
      // background process was removed or reloaded. Stay read-only instead of
      // sending one failed decrypt request for every event received.
      signer.setSigner(null);
    }
    return;
  }
  if (session.method === 'bunker' && session.bunkerUri) {
    try {
      const restored = await connectBunkerSigner({
        clientSecretKey: generateSecretKey(),
        uri: session.bunkerUri,
      });
      signer.setSigner(restored);
    } catch {
      /* the bunker is unreachable; the user can reconnect from settings */
    }
    return;
  }
  const secretKey = loadSecretKey(decodeKey);
  if (secretKey) signer.setSigner(localSigner(secretKey));
}

function recordFilters(me) {
  const filters = [
    { kinds: [KIND.APP_DATA, KIND.APP_DATA_HISTORY], '#t': [APP_TAG], authors: [me] },
    { kinds: [KIND.APP_DATA, KIND.APP_DATA_HISTORY], '#t': [APP_TAG], '#p': [me] },
  ];
  // Gift wraps carry DMs and encrypted records; a user can opt out of that
  // relay subscription in Settings → Network.
  if (subscriptionEnabled(store.getState().prefs, 1059)) {
    filters.push({ kinds: [GIFT_WRAP_KIND], '#p': [me] });
  }
  return filters;
}

async function applyIncomingRecord(event, seen) {
  if (seen.has(event.id)) return;
  const me = store.getState().accountId;
  const active = signer.getSigner();

  if (event.kind === GIFT_WRAP_KIND) {
    // A grade or homework can arrive before the signer is restored, or while an
    // extension is locked. Do not consume the event: a later refresh retries it
    // instead of losing the score for good.
    if (typeof active?.nip44Decrypt !== 'function') {
      if (typeof console !== 'undefined') {
        console.warn('[records] gift wrap received but the session cannot decrypt (no NIP-44 signer)');
      }
      return;
    }
    const unwrapped = await unwrapGiftWrap({ wrap: event, signer: active });
    if (!unwrapped) {
      if (typeof console !== 'undefined') {
        console.warn('[records] gift wrap failed to decrypt', event.id);
      }
      return;
    }
    // A gift wrap carries either a NIP-17 direct message or an application
    // record. The rumor kind classifies it; the body is never trusted to decide,
    // so a crafted message cannot masquerade as a grade record.
    if (unwrapped.kind === RUMOR_KIND) {
      // A chat rumor always carries at least a recipient tag. A tagless kind-14
      // wrap is a record written by an older build (which left the rumor tags
      // empty); decode it for backward compatibility.
      const legacy = unwrapped.tags.length
        ? null
        : decodeRecord(unwrapped.content, [], unwrapped.createdAt ?? event.created_at);
      if (legacy) {
        seen.add(event.id);
        const patch = applyRecord(store.getState(), legacy);
        if (patch) store.setState(patch);
        if (legacy.type === RECORD_TYPES.CAPABILITY) actions.backfillHomeworkForEnrollment?.(legacy);
        return;
      }
      seen.add(event.id);
      const knownAuthor = hasPersona(unwrapped.author);
      const applied = actions.receiveMessage({
        author: unwrapped.author,
        tags: unwrapped.tags,
        content: unwrapped.content,
        createdAt: unwrapped.createdAt ?? event.created_at,
        eventId: event.id,
      });
      if (applied && !knownAuthor) syncProfiles();
      return;
    }
    const record = decodeRecord(unwrapped.content, unwrapped.tags, unwrapped.createdAt ?? event.created_at);
    // Decoded with no type/id: nothing to apply, so consume it.
    if (!record) {
      seen.add(event.id);
      return;
    }
    seen.add(event.id);
    const patch = applyRecord(store.getState(), record);
    if (patch) store.setState(patch);
    if (record.type === RECORD_TYPES.CAPABILITY) actions.backfillHomeworkForEnrollment?.(record);
    return;
  }

  const addressed = event.tags.some((tag) => tag[0] === 'p' && tag[1] === me);
  let content = event.content;
  if (addressed && event.pubkey !== me) {
    if (typeof active?.nip44Decrypt !== 'function') return;
    try {
      content = await active.nip44Decrypt(event.pubkey, event.content);
    } catch {
      return;
    }
  } else if (event.pubkey !== me) {
    return;
  }
  const record = decodeRecord(content, event.tags, event.created_at);
  seen.add(event.id);
  if (!record) return;
  const patch = applyRecord(store.getState(), record);
  if (patch) store.setState(patch);
  if (record.type === RECORD_TYPES.CAPABILITY) actions.backfillHomeworkForEnrollment?.(record);
}

let recordSub = null;
function syncRecords() {
  const me = store.getState().accountId;
  recordSub?.close?.();
  recordSub = null;
  if (!me) return;

  const seen = new Set();
  recordSub = relayService.subscribe(recordFilters(me), {
    onEvent: (event) => applyIncomingRecord(event, seen),
  });
}

// Re-query relays for this account's records so a student can recover homework
// or a grade the teacher set while the tab was closed. Concurrent calls (page
// load, opening the learner workspace, returning to the tab) share one query.
let refreshInFlight = null;
function refreshRecords({ timeoutMs = 8000, silent = false } = {}) {
  const me = store.getState().accountId;
  if (!me) return Promise.resolve(0);
  if (refreshInFlight) return refreshInFlight;
  if (!silent) bus.emit('toast', { message: t('actions.refreshingRecords'), tone: 'info' });
  // Show the inbox skeleton only when there is nothing cached to paint.
  if (!store.getState().conversationsByAccount?.[me]?.length) {
    store.setState({ messagesStatus: 'loading' });
  }

  // A restored browser session can still be authenticated while its signer is
  // not ready (most commonly an extension whose background page was asleep).
  // Restore it before asking relays for encrypted records; otherwise the relay
  // correctly returns the missed grade but the client cannot decrypt it.
  refreshInFlight = (async () => {
    if (!signer.getSigner()) await restoreSigner();

    return new Promise((resolve) => {
      const seen = new Set();
      const pending = new Set();
      let count = 0;
      let settled = false;
      let eose = false;
      let sub = null;
      const finish = (force = false) => {
        if (settled) return;
        // Relay EOSE means no more stored events are coming, but decrypting the
        // events already received is asynchronous. Do not close/resolve until
        // those operations have applied their records to the store.
        if (!force && (!eose || pending.size)) return;
        settled = true;
        clearTimeout(timer);
        try {
          sub?.close?.();
        } catch {
          /* the subscription may already be closed */
        }
        if (!silent) bus.emit('toast', { message: t('actions.recordsRefreshed', { count }), tone: 'ok' });
        resolve(count);
      };
      const timer = setTimeout(() => finish(true), timeoutMs);
      sub = relayService.subscribe(recordFilters(me), {
        onEvent: (event) => {
          const task = (async () => {
            const before = seen.size;
            await applyIncomingRecord(event, seen);
            if (seen.size > before) count += 1;
          })().catch((error) => {
            if (typeof console !== 'undefined') console.warn('[records] failed to apply relay event', error);
          });
          pending.add(task);
          task.finally(() => {
            pending.delete(task);
            finish();
          });
        },
        onEose: () => {
          eose = true;
          finish();
        },
      });
    });
  })().finally(() => {
    refreshInFlight = null;
    if (store.getState().messagesStatus === 'loading') store.setState({ messagesStatus: 'ready' });
  });
  return refreshInFlight;
}

let credentialSub = null;
function syncCredentials() {
  const me = store.getState().accountId;
  credentialSub?.close?.();
  credentialSub = null;
  if (!me) return;
  credentialSub = relayService.subscribe([{ kinds: [KIND.CREDENTIAL], '#p': [me] }], {
    onEvent: (event) => {
      if (!verify(event)) return;
      const parsed = credentialFromEvent(event);
      if (!parsed) return;
      const credentials = store.getState().credentials ?? [];
      if (parsed.kind === 'status') {
        if (!credentials.some((entry) => entry.id === parsed.id)) return;
        store.setState({
          credentials: credentials.map((entry) =>
            entry.id === parsed.id
              ? { ...entry, status: parsed.status, statusProof: parsed.proof }
              : entry,
          ),
        });
        return;
      }
      if (credentials.some((entry) => entry.id === parsed.credential.id)) return;
      parsed.credential.issuer = getPersona(event.pubkey);
      parsed.credential.issuerNpub = encodeNpub(event.pubkey);
      store.setState({ credentials: [parsed.credential, ...credentials] });
    },
  });
}

let profileSub = null;
function syncProfiles() {
  const authors = getPersonaIds().filter((id) => /^[0-9a-f]{64}$/.test(id));
  if (!authors.length) return;
  profileSub?.close?.();
  profileSub = relayService.subscribe([{ kinds: [0], authors }], {
    onEvent: (event) => {
      const profile = parseProfileMeta(event.content);
      if (!profile) return;
      const existing = getPersona(event.pubkey);
      registerPersona({
        ...existing,
        id: event.pubkey,
        npub: encodeNpub(event.pubkey),
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
        avatar: existing.avatar,
      });
      store.setState({
        profiles: { ...store.getState().profiles, [event.pubkey]: getPersona(event.pubkey) },
      });
    },
  });
}

// Public notes (kind:1) for the Home feed. A bounded latest-notes query seeds
// the feed, then the live subscription keeps it current. Replies are ignored by
// the mapper, and the store dedupes by event id so a re-query never doubles up.
const NOTE_LIMIT = 50;
let noteSub = null;

function ingestNote(event) {
  const mapped = feedEventFromNote(event);
  if (!mapped) return;
  const current = store.getState().events ?? [];
  if (current.some((entry) => entry.id === mapped.id)) return;
  if (!hasPersona(event.pubkey)) {
    registerPersona({ id: event.pubkey, npub: encodeNpub(event.pubkey) });
    syncProfiles();
  }
  store.setState({ events: [mapped, ...current], feedStatus: 'ready' });
  scheduleEngagementSync();
}

function syncNotes() {
  noteSub?.close?.();
  noteSub = null;
  if (!store.getState().authed) return;
  if (!subscriptionEnabled(store.getState().prefs, KIND.NOTE)) return;
  if (!(store.getState().events ?? []).length) store.setState({ feedStatus: 'loading' });
  noteSub = relayService.subscribe([{ kinds: [KIND.NOTE], '#t': [APP_TAG], limit: NOTE_LIMIT }], {
    onEvent: (event) => {
      if (verify(event)) ingestNote(event);
    },
    onEose: () => {
      if (store.getState().feedStatus !== 'ready') store.setState({ feedStatus: 'ready' });
    },
  });
}

// Engagement (NIP-25 reactions, NIP-18 reposts) for the notes on screen. The
// seen set persists across resubscribes so a relay replay never double-counts.
const ENGAGEMENT_LIMIT = 200;
const engagementSeen = new Set();
let engagementSub = null;
let engagementSyncTimer = null;

// Every note list that can be engaged from the UI: the home feed and the open
// profile timeline. Both are projected the same way, so reactions, reposts and
// threads resolve against either.
function engagementSources() {
  const current = store.getState();
  return [current.events ?? [], current.profileTimeline?.events ?? []];
}

function feedNoteIds() {
  const ids = engagementSources()
    .flat()
    .map((event) => event.id)
    .filter((id) => /^[0-9a-f]{64}$/.test(id));
  return [...new Set(ids)].slice(0, 100);
}

function patchFeedEvent(eventId, patch) {
  const current = store.getState();
  const apply = (list) =>
    list.map((entry) => (entry.id === eventId ? { ...entry, ...patch } : entry));
  const patchState = {};
  if ((current.events ?? []).some((entry) => entry.id === eventId)) {
    patchState.events = apply(current.events);
  }
  const timelineEvents = current.profileTimeline?.events ?? [];
  if (timelineEvents.some((entry) => entry.id === eventId)) {
    patchState.profileTimeline = {
      ...current.profileTimeline,
      events: apply(timelineEvents),
    };
  }
  if (Object.keys(patchState).length) store.setState(patchState);
}

function findNoteById(targetId) {
  for (const list of engagementSources()) {
    const found = list.find((entry) => entry.id === targetId);
    if (found) return found;
  }
  return null;
}

function applyEngagement(event) {
  if (engagementSeen.has(event.id)) return;
  engagementSeen.add(event.id);
  const targetId = (event.tags ?? []).find((tag) => tag[0] === 'e')?.[1];
  if (!targetId) return;
  const feedEvent = findNoteById(targetId);
  if (!feedEvent) return;
  const me = store.getState().accountId;
  const counts = feedEvent.counts ?? {};

  if (event.kind === KIND.REACTION) {
    if (event.content === '-') return; // a dislike, not a like
    if (me && event.pubkey === me) {
      if (feedEvent.reactionId === event.id) return; // already applied optimistically
      patchFeedEvent(targetId, {
        liked: true,
        reactionId: event.id,
        counts: { ...counts, likes: (counts.likes ?? 0) + 1 },
      });
      return;
    }
    patchFeedEvent(targetId, { counts: { ...counts, likes: (counts.likes ?? 0) + 1 } });
    return;
  }

  if (event.kind === KIND.REPOST) {
    if (me && event.pubkey === me) {
      if (feedEvent.repostId === event.id) return;
      patchFeedEvent(targetId, {
        reposted: true,
        repostId: event.id,
        counts: { ...counts, reposts: (counts.reposts ?? 0) + 1 },
      });
      return;
    }
    patchFeedEvent(targetId, { counts: { ...counts, reposts: (counts.reposts ?? 0) + 1 } });
  }
}

function syncEngagement() {
  engagementSub?.close();
  engagementSub = null;
  if (!store.getState().authed) return;
  const ids = feedNoteIds();
  if (!ids.length) return;
  const prefs = store.getState().prefs;
  const filters = [];
  if (subscriptionEnabled(prefs, KIND.REACTION)) {
    filters.push({ kinds: [KIND.REACTION], '#e': ids, limit: ENGAGEMENT_LIMIT });
  }
  if (subscriptionEnabled(prefs, KIND.REPOST)) {
    filters.push({ kinds: [KIND.REPOST], '#e': ids, limit: ENGAGEMENT_LIMIT });
  }
  if (!filters.length) return;
  engagementSub = relayService.subscribe(filters, { onEvent: (event) => applyEngagement(event) });
}

function scheduleEngagementSync() {
  clearTimeout(engagementSyncTimer);
  engagementSyncTimer = setTimeout(syncEngagement, 600);
}

// Public engagement addressed to this account as a note author (NIP-25
// reactions, NIP-18 reposts, and NIP-10 replies/mentions). Distinct from
// `syncEngagement`, which counts engagement for notes already on screen: this
// query is keyed by `#p:[me]`, so a like or comment on any of the viewer's
// notes becomes an inbox notification even while that note is off screen.
const NOTIFICATION_LIMIT = 100;
let engagementNotifySub = null;

function syncEngagementNotifications() {
  engagementNotifySub?.close?.();
  engagementNotifySub = null;
  const me = store.getState().accountId;
  if (!me) return;
  const prefs = store.getState().prefs;
  const filters = [];
  if (subscriptionEnabled(prefs, KIND.NOTE)) {
    filters.push({ kinds: [KIND.NOTE], '#p': [me], limit: NOTIFICATION_LIMIT });
  }
  if (subscriptionEnabled(prefs, KIND.REPOST)) {
    filters.push({ kinds: [KIND.REPOST], '#p': [me], limit: NOTIFICATION_LIMIT });
  }
  if (subscriptionEnabled(prefs, KIND.REACTION)) {
    filters.push({ kinds: [KIND.REACTION], '#p': [me], limit: NOTIFICATION_LIMIT });
  }
  // NIP-02: another account's contact list that includes me is a new follow.
  if (subscriptionEnabled(prefs, KIND.CONTACT)) {
    filters.push({ kinds: [KIND.CONTACT], '#p': [me], limit: NOTIFICATION_LIMIT });
  }
  if (!filters.length) return;
  engagementNotifySub = relayService.subscribe(filters, {
    onEvent: (event) => {
      if (!verify(event)) return;
      app.ingestSocialNotification(event);
    },
  });
}

// Wallet history is a projection over NIP-57 zap receipts read from relays:
// kind 9735 addressed to us (`p`) or signed off by us as the zapper (`P`). The
// store dedupes by receipt id so a replay and a live delivery cannot double up.
let zapSub = null;
function syncZaps() {
  const me = store.getState().accountId;
  zapSub?.close?.();
  zapSub = null;
  if (!me) return;
  if (!subscriptionEnabled(store.getState().prefs, ZAP_RECEIPT_KIND)) return;
  zapSub = relayService.subscribe(
    [
      { kinds: [ZAP_RECEIPT_KIND], '#p': [me] },
      { kinds: [ZAP_RECEIPT_KIND], '#P': [me] },
    ],
    {
      onEvent: (event) => {
        if (!verify(event)) return;
        // Single projector: dedupes, evicts the optimistic row, bumps the note
        // counter once, and notifies when the zap actually settles.
        app.ingestZapReceipt(event);
      },
    },
  );
}

let catalogSub = null;
const pendingCatalog = new Map();

function applyCatalog(record) {
  const patch = applyRecord(store.getState(), record);
  if (patch) store.setState(patch);
}

function catalogAuthorization(record, pubkey) {
  if (record.type === RECORD_TYPES.ACADEMY) return record.ownerId === pubkey;
  const academy = findAcademyById(store.getState().academies ?? {}, record.academyId);
  if (!academy) return null;
  if (academy.ownerId === pubkey) return true;
  // A class teacher may publish the class they were assigned to (it carries
  // their own teacherId), which is how an accepted invitation reaches students.
  if (record.type === RECORD_TYPES.CLASSROOM) {
    return record.academyId === academy.id && record.teacherId === pubkey;
  }
  if (record.type === RECORD_TYPES.JOIN_LINK && record.classroomId) {
    const classroom = classroomById(store.getState().classrooms ?? [], record.classroomId);
    if (!classroom) return null;
    return classroom.academyId === academy.id && classroom.teacherId === pubkey;
  }
  return false;
}

function flushPendingCatalog(academyId) {
  const queued = pendingCatalog.get(academyId);
  if (!queued) return;
  pendingCatalog.delete(academyId);
  for (const { record, pubkey } of queued) {
    if (catalogAuthorization(record, pubkey) === true) applyCatalog(record);
  }
}

function syncCatalog() {
  catalogSub?.close?.();
  pendingCatalog.clear();
  // Some public relays return an immediate EOSE for an unbounded application
  // query. Keep this bounded so initial join-link discovery returns records.
  catalogSub = relayService.subscribe([{ kinds: [KIND.APP_DATA], '#t': [APP_TAG], limit: 50 }], {
    onEvent: (event) => {
      const record = decodeRecord(event.content, event.tags);
      if (!isPublicRecord(record)) return;
      const authorization = catalogAuthorization(record, event.pubkey);
      if (authorization === false) return;
      if (authorization === null) {
        const queue = pendingCatalog.get(record.academyId) ?? [];
        queue.push({ record, pubkey: event.pubkey });
        pendingCatalog.set(record.academyId, queue);
        return;
      }
      applyCatalog(record);
      if (record.type === RECORD_TYPES.ACADEMY) flushPendingCatalog(record.id);
      if (record.type === RECORD_TYPES.CLASSROOM) flushPendingCatalog(record.academyId);
    },
  });
}

const shell = createShell({ root: appRoot, app, theme, state: reactiveState });
shell.frame.append(overlayRoot);

const screens = Object.freeze({
  '/welcome': renderWelcome,
  '/signin': renderSignIn,
  '/create': renderCreateAccount,
  '/nsec': renderLoginNsec,
  '/home': renderHome,
  '/role': renderRole,
  '/credentials': renderCredentials,
  '/wallet': renderWallet,
  '/messages': renderMessages,
  '/discover': renderDiscover,
  '/notifications': renderNotifications,
  '/profile': renderProfile,
  '/profile/*': renderProfile,
  '/p': renderProfile,
  '/p/*': renderProfile,
  '/settings': renderSettings,
  '/verify': renderVerify,
  '/verify/*': renderVerify,
  '/join': renderJoin,
  '/join/*': renderJoin,
  '/about': renderAbout,
});

function isJoinRoute(path) {
  return path === '/join' || path.startsWith('/join/');
}

// Public static pages that do not require a session (reachable while signed
// out, for example from a pitch or an onboarding link).
function isPublicRoute(path) {
  return path === '/about';
}

let activeScope = null;

function mount(render, path) {
  const state = store.getState();

  if (!state.authed && !isAuthRoute(path) && !isJoinRoute(path) && !isPublicRoute(path)) {
    navigate('/welcome');
    return;
  }
  if (state.authed && isAuthRoute(path)) {
    navigate('/home');
    return;
  }

  store.setState({ route: path });
  activeScope?.dispose();
  activeScope = createScope();
  shell.content.replaceChildren(
    render({ store, bus, app, theme, scope: activeScope, state: reactiveState }),
  );
  shell.content.scrollTop = 0;
  // Opening any page re-queries relays, so records created elsewhere (a score a
  // teacher set) show up without a manual refresh. Concurrent calls coalesce.
  if (state.authed) refreshRecords({ silent: true });
}

const router = createRouter({
  routes: screens,
  fallback: renderHome,
  onChange: mount,
});

restoreSigner().finally(() => {
  router.start();
  // Subscribe with the restored signer so encrypted records can be decrypted as
  // they arrive (the initial store change may have started a subscription with
  // no signer yet).
  syncRecords();
  syncProfiles();
  syncCatalog();
  syncCredentials();
  syncNotes();
  syncEngagement();
  syncEngagementNotifications();
  syncZaps();
  if (store.getState().authed) {
    // Once relays are confirmed reachable, pull records that arrived while the
    // tab was closed (for example a score the teacher set). Querying only on a
    // timer races relay connection, which is why the grade sometimes missed.
    relayService.check().then(() => {
      store.setState({ relays: relayService.statuses() });
      refreshRecords({ silent: true });
    });
    // Backstop for a relay that is slow to answer the first check.
    setTimeout(() => refreshRecords({ silent: true }), 3000);
  }
});

// A student who closed the tab or lost the network may have missed the live
// delivery of a grade. Refetch whenever the page is shown again or the network
// returns, so the score appears without hunting for the Refresh button.
function refetchIfAuthed() {
  if (store.getState().authed) refreshRecords({ silent: true });
}
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refetchIfAuthed();
  });
}
if (typeof window !== 'undefined') {
  window.addEventListener('online', refetchIfAuthed);
}

export { store, bus };
