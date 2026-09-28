import { createActions } from './app/actions.js';
import { createDialogs } from './app/dialogs.js';
import { qs } from './core/dom.js';
import { createEmitter } from './core/emitter.js';
import { createRouter, navigate } from './core/router.js';
import { createScope } from './core/scope.js';
import { createStore } from './core/store.js';
import {
  SEED_ASSIGNMENT,
  SEED_COURSES,
  SEED_CREDENTIALS,
  SEED_DELIVERIES,
  SEED_ENROLL_REQUESTS,
  SEED_EVENTS,
  SEED_FOLLOWING,
  SEED_GRANTS,
  SEED_JOIN_REQUESTS,
  SEED_MEMBERSHIPS,
  SEED_QUEUE,
  SEED_RELAYS,
} from './data/seed.js';
import { DEFAULT_SIGNER } from './domain/account.js';
import { MEMBERSHIP } from './domain/school.js';
import { createConfirmService } from './services/confirm.js';
import { createIconifyLoader } from './services/iconify.js';
import { createRelayService } from './services/relay.js';
import { createSignerService } from './services/signer.js';
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
import { renderNotifications } from './ui/screens/notifications.js';
import { renderRole } from './ui/screens/role.js';
import { renderSettings } from './ui/screens/settings.js';
import { renderVerify } from './ui/screens/verify.js';

const appRoot = qs('[data-app-root]');
const overlayRoot = qs('[data-overlay-root]');

const store = createStore({
  authed: false,
  signerType: DEFAULT_SIGNER,
  personaId: 'alice',
  route: '/home',
  membership: MEMBERSHIP.ACTIVE,
  memberships: SEED_MEMBERSHIPS,
  lastCreated: null,
  joinRequests: SEED_JOIN_REQUESTS,
  feedTab: 'foryou',
  roleTab: 'review',
  orgTab: 'overview',
  settingsSection: null,
  enrollRequests: SEED_ENROLL_REQUESTS,
  criteriaMet: false,
  completionSent: false,
  signed: false,
  events: SEED_EVENTS,
  queue: SEED_QUEUE,
  signQueue: [],
  relays: SEED_RELAYS,
  deliveries: SEED_DELIVERIES,
  courses: SEED_COURSES,
  assignment: SEED_ASSIGNMENT,
  grants: SEED_GRANTS,
  following: SEED_FOLLOWING,
  credentials: SEED_CREDENTIALS,
});

const bus = createEmitter();
setIconLoader(createIconifyLoader());

const overlay = createOverlayHost({ root: overlayRoot });
createToastHost({ bus, root: overlayRoot });
const signer = createSignerService({ bus });
const confirm = createConfirmService({ bus });
createSignerPromptHost({ bus, overlay });
createConfirmHost({ bus, overlay });

const relay = createRelayService();
const theme = createThemeService();
theme.init();

const actions = createActions({ store, bus, signer, confirm, relay });
const dialogs = createDialogs({ overlay, store, actions });
const app = { ...actions, ...dialogs };

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
});

let activeScope = null;

function mount(render, path) {
  const state = store.getState();

  if (!state.authed && !isAuthRoute(path)) {
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

router.start();

export { store, bus };
