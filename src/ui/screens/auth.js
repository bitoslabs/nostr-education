import { el } from '../../core/dom.js';
import { getPersona, getPersonaIds } from '../../data/personas.js';
import { DEFAULT_SIGNER, ROLE_OPTIONS, SIGNER_TYPES } from '../../domain/account.js';
import { normalizeHandle, validateHandle } from '../../domain/handle.js';
import { ROLE } from '../../domain/school.js';
import { icon } from '../components/icon.js';
import { button, noteBox } from '../components/primitives.js';

const SIGNER_ICONS = Object.freeze({
  local: { icon: 'lucide:smartphone', fallback: '📱' },
  extension: { icon: 'lucide:puzzle', fallback: '🧩' },
  bunker: { icon: 'lucide:cloud', fallback: '☁' },
});

const WELCOME_FEATURES = Object.freeze([
  {
    icon: 'lucide:fingerprint',
    fallback: '🪪',
    title: 'One identity',
    body: 'Sign in across academies with a single key you control.',
  },
  {
    icon: 'lucide:shield-check',
    fallback: '🛡',
    title: 'Private coursework',
    body: 'Rosters, files, and grades stay access-controlled.',
  },
  {
    icon: 'lucide:badge-check',
    fallback: '🎓',
    title: 'Verifiable credentials',
    body: 'Completion records are signed and independently checkable.',
  },
]);

/* ---------- layout primitives ---------- */

function authBrand() {
  return el('span', { class: 'auth-brand' }, [
    el('span', { class: 'auth-brand__mark', 'aria-hidden': 'true' }, '🐝'),
    el('span', { class: 'auth-brand__name' }, 'BitOS'),
    el('span', { class: 'auth-brand__tag' }, 'Education'),
  ]);
}

function backButton(app, route = '/welcome') {
  return el('button', { class: 'auth-back', type: 'button', onClick: () => app.navigate(route) }, [
    icon('lucide:chevron-left', { size: 18, fallback: '←' }),
    el('span', {}, 'Back'),
  ]);
}

function authTop({ app, backTo }) {
  if (backTo) {
    return el('div', { class: 'auth-top' }, [backButton(app, backTo), el('span', { class: 'spacer' }), authBrand()]);
  }
  return el('div', { class: 'auth-top' }, [authBrand(), el('span', { class: 'spacer' })]);
}

function authHero({ eyebrow, title, subtitle }) {
  return el('header', { class: 'auth-hero' }, [
    eyebrow ? el('span', { class: 'auth-eyebrow' }, eyebrow) : null,
    el('h1', { class: 'auth-title font-display' }, title),
    subtitle ? el('p', { class: 'auth-sub muted' }, subtitle) : null,
  ]);
}

function authLayout({ app, backTo, children }) {
  return el('section', { class: 'screen screen--auth' }, [authTop({ app, backTo }), ...children]);
}

function formSection({ step, title, hint, children = [] }) {
  return el('section', { class: 'auth-section' }, [
    el('div', { class: 'auth-section__head' }, [
      el('span', { class: 'auth-section__num', 'aria-hidden': 'true' }, step),
      el('span', { class: 'auth-section__copy' }, [
        el('h3', {}, title),
        hint ? el('span', { class: 'muted small' }, hint) : null,
      ]),
    ]),
    ...children,
  ]);
}

function field(labelText, control, hint) {
  if (control?.tagName === 'INPUT' && !control.getAttribute('aria-label')) {
    control.setAttribute('aria-label', labelText);
  }
  return el('div', { class: 'auth-field' }, [
    el('span', { class: 'field-label' }, labelText),
    control,
    hint ? el('span', { class: 'auth-hint muted small' }, hint) : null,
  ]);
}

function fieldGroup(labelText, control, hint) {
  return el('div', { class: 'auth-field' }, [
    el('span', { class: 'field-label' }, labelText),
    control,
    hint ? el('span', { class: 'auth-hint muted small' }, hint) : null,
  ]);
}

function authFoot(primary) {
  return el('div', { class: 'auth-foot' }, [primary]);
}

/* ---------- shared controls ---------- */

function readRadio(scope, name) {
  return scope.querySelector(`input[name="${name}"]:checked`)?.value ?? null;
}

function signerChoices(name, options = SIGNER_TYPES) {
  return el(
    'div',
    { class: 'picker' },
    options.map((type) => {
      const meta = SIGNER_ICONS[type.id] ?? { icon: 'lucide:key', fallback: '◆' };
      return el('label', { class: 'picker__item' }, [
        el('input', { type: 'radio', name, value: type.id, checked: type.id === DEFAULT_SIGNER }),
        el('span', { class: 'hex-plate picker__ico' }, icon(meta.icon, { size: 18, fallback: meta.fallback })),
        el('span', { class: 'picker__body' }, [
          el('span', { class: 'picker__title' }, type.label),
          el('span', { class: 'picker__sub muted small' }, type.sub),
        ]),
      ]);
    }),
  );
}

function roleSelector(initial = ROLE_OPTIONS[0].id, { onChange, options = ROLE_OPTIONS } = {}) {
  let value = initial;
  const buttons = options.map((option) =>
    el(
      'button',
      {
        class: `seg__btn${option.id === value ? ' is-on' : ''}`,
        type: 'button',
        'aria-pressed': String(option.id === value),
        onClick: () => {
          value = option.id;
          buttons.forEach((node, index) => {
            const on = options[index].id === value;
            node.classList.toggle('is-on', on);
            node.setAttribute('aria-pressed', String(on));
          });
          onChange?.(value);
        },
      },
      option.label,
    ),
  );
  const node = el('div', { class: 'seg', role: 'group', 'aria-label': 'Account type' }, buttons);
  return { node, get: () => value };
}

function handleAvailability(handle) {
  const value = String(handle ?? '').trim().replace(/^@/, '');
  if (!value) return { ok: false, message: '' };
  const result = validateHandle(value);
  if (!result.valid) {
    if (result.reason === 'reserved') return { ok: false, message: `'${result.handle}' is reserved.` };
    if (result.reason === 'length') return { ok: false, message: 'Handles are 3–24 characters.' };
    return { ok: false, message: 'Letters and numbers only, plus dots and underscores.' };
  }
  const taken = getPersonaIds()
    .map((id) => normalizeHandle(String(getPersona(id).handle ?? '').split('@')[0]))
    .includes(result.handle);
  return taken
    ? { ok: false, message: `@${result.handle} is taken — try a variation.` }
    : { ok: true, message: `✓ @${result.handle} is available.` };
}

/* ---------- screens ---------- */

export function renderWelcome({ app }) {
  return authLayout({
    app,
    children: [
      authHero({
        eyebrow: 'Nostr-native academy',
        title: 'One identity for class, work, and credentials.',
        subtitle: 'Sign in with a key you control. Coursework stays private. Credentials verify anywhere.',
      }),
      el(
        'ul',
        { class: 'auth-features' },
        WELCOME_FEATURES.map((feature) =>
          el('li', { class: 'auth-feature' }, [
            el('span', { class: 'hex-plate auth-feature__ico' }, icon(feature.icon, { size: 18, fallback: feature.fallback })),
            el('span', { class: 'auth-feature__txt' }, [
              el('strong', {}, feature.title),
              el('span', { class: 'muted small' }, feature.body),
            ]),
          ]),
        ),
      ),
      el('div', { class: 'auth-actions' }, [
        button('Sign in', { variant: 'gold', className: 'auth-action', onClick: () => app.navigate('/signin') }),
        button('Create account', { className: 'auth-action', onClick: () => app.navigate('/create') }),
      ]),
      el('div', { class: 'auth-alt' }, [
        el('span', { class: 'muted small' }, 'Have an existing key?'),
        button('Import nsec / npub', { variant: 'ghost', small: true, onClick: () => app.navigate('/nsec') }),
      ]),
      el('div', { class: 'auth-alt' }, [
        el('span', { class: 'muted small' }, 'Invited to an academy?'),
        button('Open an invite link', { variant: 'ghost', small: true, onClick: () => app.navigate('/join') }),
      ]),
      noteBox('Your key stays on your device or in your signer. BitOS never receives it.'),
    ],
  });
}

export function renderSignIn({ app }) {
  const body = el('div', { class: 'auth-form' }, [
    formSection({
      step: '01',
      title: 'Browser extension',
      hint: 'Sign in with a NIP-07 extension such as Alby.',
      children: [
        button('Continue with extension', {
          variant: 'gold',
          className: 'auth-cta',
          onClick: () => app.signInWithExtension(),
        }),
      ],
    }),
    formSection({
      step: '02',
      title: 'Existing key',
      hint: 'Import an nsec or paste an npub to view an identity.',
      children: [
        button('Import key', { className: 'auth-cta', onClick: () => app.navigate('/nsec') }),
      ],
    }),
  ]);

  return authLayout({
    app,
    backTo: '/welcome',
    children: [
      authHero({
        eyebrow: 'Sign in',
        title: 'Welcome back',
        subtitle: 'Connect the signer that holds your key.',
      }),
      body,
    ],
  });
}

export function renderCreateAccount({ app }) {
  const availability = el('p', { class: 'auth-hint small', 'aria-live': 'polite', hidden: true });
  const handleInput = el('input', {
    type: 'text',
    placeholder: 'alice',
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-label': 'Handle',
    onInput: (event) => {
      const outcome = handleAvailability(event.target.value);
      availability.hidden = !outcome.message;
      availability.textContent = outcome.message;
      availability.className = outcome.message
        ? outcome.ok
          ? 'auth-hint small ok'
          : 'auth-hint small danger'
        : 'auth-hint small';
    },
  });
  const nameInput = el('input', { type: 'text', placeholder: 'Ada Lovelace', autocomplete: 'name' });
  const academyInput = el('input', {
    type: 'text',
    placeholder: 'Northgate College',
    autocomplete: 'organization',
    'aria-label': 'Academy name',
  });
  const academyField = field('Academy name', academyInput, 'Your workspace — you become its owner.');
  const role = roleSelector(ROLE.STUDENT, {
    onChange: (roleId) => {
      academyField.style.display = roleId === ROLE.OWNER ? '' : 'none';
    },
  });
  academyField.style.display = 'none';
  const signers = signerChoices('create-signer', SIGNER_TYPES.filter((entry) => entry.id !== 'bunker'));

  const form = el('div', { class: 'auth-form' }, [
    formSection({
      step: '01',
      title: 'Identity',
      hint: 'Choose how you appear across the academy.',
      children: [
        field('Display name', nameInput, 'Shown on your submissions, feed, and credentials.'),
        field(
          'Handle (optional)',
          el('div', { class: 'input-group' }, [el('span', { class: 'input-addon' }, '@'), handleInput]),
          'A short public name other people can recognise.',
        ),
        availability,
        fieldGroup('Account type', role.node, 'Learners join classes; teachers publish; owners run an academy.'),
        academyField,
      ],
    }),
    formSection({
      step: '02',
      title: 'Key',
      hint: 'Where your key lives and signs requests.',
      children: [
        signers,
        noteBox('This device generates a real Nostr key. Back up your nsec — it cannot be recovered.'),
      ],
    }),
    authFoot(
      button('Create account', {
        variant: 'gold',
        className: 'auth-cta',
        onClick: () =>
          app.createAccount({
            displayName: nameInput.value,
            handle: handleInput.value,
            role: role.get(),
            signerTypeId: readRadio(signers, 'create-signer') ?? DEFAULT_SIGNER,
            academyName: academyInput.value,
          }),
      }),
    ),
  ]);

  return authLayout({
    app,
    backTo: '/welcome',
    children: [
      authHero({
        eyebrow: 'Create identity',
        title: 'Create your account',
        subtitle: 'Generate a real key, claim a handle if you want one, and publish your profile.',
      }),
      form,
    ],
  });
}

export function renderLoginNsec({ app }) {
  const keyInput = el('input', {
    type: 'password',
    placeholder: 'nsec1… or npub1…',
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-label': 'Secret key',
  });
  const nameInput = el('input', {
    type: 'text',
    placeholder: 'Display name (optional)',
    autocomplete: 'name',
  });

  const reveal = button('Reveal', {
    variant: 'ghost',
    small: true,
    className: 'input-group__btn',
    onClick: () => {
      const hidden = keyInput.type === 'password';
      keyInput.type = hidden ? 'text' : 'password';
      reveal.replaceChildren(hidden ? 'Hide' : 'Reveal');
    },
  });

  const form = el('div', { class: 'auth-form' }, [
    formSection({
      step: '01',
      title: 'Import key',
      hint: 'Paste an nsec to sign in, or an npub to view an identity.',
      children: [
        noteBox('An nsec is a secret key. Only paste it into a device you trust.', 'warn'),
        field(
          'Secret key',
          el('div', { class: 'input-group' }, [keyInput, reveal]),
          'An nsec signs as you; an npub opens a read-only session.',
        ),
      ],
    }),
    formSection({
      step: '02',
      title: 'Profile',
      hint: 'Only used when the key is not already known on the network.',
      children: [field('Display name', nameInput)],
    }),
    authFoot(
      button('Sign in', {
        variant: 'gold',
        className: 'auth-cta',
        onClick: () => app.signInWithKey({ key: keyInput.value, displayName: nameInput.value }),
      }),
    ),
  ]);

  return authLayout({
    app,
    backTo: '/welcome',
    children: [
      authHero({
        eyebrow: 'Import identity',
        title: 'Sign in with a key',
        subtitle: 'Use an existing nsec or npub to control your identity.',
      }),
      form,
    ],
  });
}

export const AUTH_ROUTES = Object.freeze(['/welcome', '/signin', '/create', '/nsec']);

export function isAuthRoute(path) {
  return AUTH_ROUTES.includes(path);
}
