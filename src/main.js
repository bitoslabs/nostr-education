import { createActions } from './app/actions.js';
import { createDialogs } from './app/dialogs.js';
import { qs } from './core/dom.js';
import { createEmitter } from './core/emitter.js';
import { createRouter, navigate } from './core/router.js';
import { createScope } from './core/scope.js';
import { createStore } from './core/store.js';
import { getPersona, getPersonaIds, hydrateProfiles, registerPersona } from './data/personas.js';
import { DEFAULT_SIGNER } from './domain/account.js';
import { findAcademyById } from './domain/academy.js';
import { classroomById } from './domain/classroom.js';
import { credentialFromEvent } from './domain/credential.js';
import { RECORD_TYPES, applyRecord, isPublicRecord } from './domain/records.js';
import { parseProfileMeta } from './domain/profile.js';
import { normalizeRelayList } from './domain/relay.js';
import { MEMBERSHIP } from './domain/school.js';
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
import { createRelayService } from './services/relay.js';
import { createSignerService } from './services/signer.js';
import { loadSecretKey, loadState, saveState } from './services/storage.js';
import { createThemeService } from './services/theme.js';
import { createConfirmHost } from './ui/components/confirm-dialog.js';
import { setIconLoader } from './ui/components/icon.js';
import { createOverlayHost } from './ui/components/overlay.js';
import { createSignerPromptHost } from './ui/components/signer-prompt.js';
import { createToastHost } from './ui/components/toast.js';
import { createShell } from './ui/layout/shell.js';
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
import { renderNotifications } from './ui/screens/notifications.js';
import { renderRole } from './ui/screens/role.js';
import { renderSettings } from './ui/screens/settings.js';
import { renderVerify } from './ui/screens/verify.js';

const appRoot = qs('[data-app-root]');
const overlayRoot = qs('[data-overlay-root]');

const persisted = loadState() ?? {};
const session = persisted.session ?? null;

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
  profiles: persisted.profiles ?? {},
  blossomServer: persisted.blossomServer ?? BLOSSOM_SERVERS[0],
  relayConfig: normalizeRelayList(persisted.relayConfig ?? persisted.relays ?? DEFAULT_RELAYS, {
    defaults: DEFAULT_RELAYS,
  }),
  relays: [],
  following: persisted.following ?? {},
  joinRequests: persisted.joinRequests ?? [],
  enrollRequests: persisted.enrollRequests ?? [],
  events: [],
  signQueue: persisted.signQueue ?? [],
  recommendations: persisted.recommendations ?? [],
  grants: [],
  credentials: persisted.credentials ?? [],
  deliveries: [],
  lastCreated: null,
  route: '/home',
  feedTab: 'foryou',
  roleTab: 'classes',
  orgTab: 'overview',
  settingsSection: null,
  gradebookClassId: null,
  membership: MEMBERSHIP.NONE,
});

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

let syncedAccount = null;
store.subscribe((state) => {
  saveState(state);
  if (state.accountId !== syncedAccount) {
    syncedAccount = state.accountId;
    syncRecords();
    syncCredentials();
  }
});

async function restoreSigner() {
  if (!session) return;
  if (session.method === 'extension') {
    signer.setSigner(extensionSigner());
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

let recordSub = null;
function syncRecords() {
  const me = store.getState().accountId;
  recordSub?.close?.();
  recordSub = null;
  if (!me) return;

  const filters = [
    { kinds: [KIND.APP_DATA], '#t': [APP_TAG], authors: [me] },
    { kinds: [KIND.APP_DATA], '#t': [APP_TAG], '#p': [me] },
  ];
  const seen = new Set();

  recordSub = relayService.subscribe(filters, {
    onEvent: async (event) => {
      if (seen.has(event.id)) return;
      seen.add(event.id);
      const active = signer.getSigner();
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
      const record = decodeRecord(content, event.tags);
      if (!record) return;
      const patch = applyRecord(store.getState(), record);
      if (patch) store.setState(patch);
    },
  });
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

const shell = createShell({ root: appRoot, store, app, theme });
shell.frame.append(overlayRoot);

const screens = Object.freeze({
  '/welcome': renderWelcome,
  '/signin': renderSignIn,
  '/create': renderCreateAccount,
  '/nsec': renderLoginNsec,
  '/home': renderHome,
  '/role': renderRole,
  '/credentials': renderCredentials,
  '/discover': renderDiscover,
  '/notifications': renderNotifications,
  '/settings': renderSettings,
  '/verify': renderVerify,
  '/verify/*': renderVerify,
  '/join': renderJoin,
  '/join/*': renderJoin,
});

function isJoinRoute(path) {
  return path === '/join' || path.startsWith('/join/');
}

let activeScope = null;

function mount(render, path) {
  const state = store.getState();

  if (!state.authed && !isAuthRoute(path) && !isJoinRoute(path)) {
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
  shell.content.replaceChildren(render({ store, bus, app, theme, scope: activeScope }));
  shell.content.scrollTop = 0;
}

const router = createRouter({
  routes: screens,
  fallback: renderHome,
  onChange: mount,
});

restoreSigner().finally(() => {
  router.start();
  syncProfiles();
  syncCatalog();
  syncCredentials();
  if (store.getState().authed) {
    relayService.check().then(() => store.setState({ relays: relayService.statuses() }));
  }
});

export { store, bus };
