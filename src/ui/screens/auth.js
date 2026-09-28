import { el } from '../../core/dom.js';
import {
  DEFAULT_SIGNER,
  ROLE_OPTIONS,
  SIGNER_TYPES,
} from '../../domain/account.js';
import { normalizeHandle, validateHandle } from '../../domain/handle.js';
import { roleSpaceLabel } from '../../domain/school.js';
import { getPersona, getPersonaIds, PERSONA_IDS } from '../../data/personas.js';
import { icon } from '../components/icon.js';
import { avatar, button, noteBox } from '../components/primitives.js';

const SIGNER_ICONS = Object.freeze({
  extension: { icon: 'lucide:puzzle', fallback: '🧩' },
  hardware: { icon: 'lucide:usb', fallback: '🔑' },
  remote: { icon: 'lucide:cloud', fallback: '☁' },
  demo: { icon: 'lucide:flask-conical', fallback: '🧪' },
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
    return el('div', { class: 'auth-top' }, [
      backButton(app, backTo),
      el('span', { class: 'spacer' }),
      authBrand(),
    ]);
  }
  return el('div', { class: 'auth-top' }, [
    authBrand(),
    el('span', { class: 'spacer' }),
    el('span', { class: 'auth-tag' }, 'Prototype'),
  ]);
}

function authHero({ eyebrow, title, subtitle }) {
  return el('header', { class: 'auth-hero' }, [
    eyebrow ? el('span', { class: 'auth-eyebrow' }, eyebrow) : null,
    el('h1', { class: 'auth-title font-display' }, title),
    subtitle ? el('p', { class: 'auth-sub muted' }, subtitle) : null,
  ]);
}

function authLayout({ app, backTo, children }) {
  return el('section', { class: 'screen screen--auth' }, [
    authTop({ app, backTo }),
    ...children,
  ]);
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

function personaChoices() {
  return el(
    'div',
    { class: 'picker' },
    PERSONA_IDS.map((id) => {
      const persona = getPersona(id);
      return el('label', { class: 'picker__item' }, [
        el('input', { type: 'radio', name: 'persona', value: id, checked: id === 'alice' }),
        avatar(persona, 40),
        el('span', { class: 'picker__body' }, [
          el('span', { class: 'picker__title' }, persona.displayName),
          el('span', { class: 'picker__sub muted small mono' }, persona.handle ?? persona.npub),
        ]),
        el('span', { class: 'picker__meta' }, roleSpaceLabel(persona.role)),
      ]);
    }),
  );
}

function signerChoices(name) {
  return el(
    'div',
    { class: 'picker' },
    SIGNER_TYPES.map((type) => {
      const meta = SIGNER_ICONS[type.id] ?? { icon: 'lucide:key', fallback: '◆' };
      return el('label', { class: 'picker__item' }, [
        el('input', { type: 'radio', name, value: type.id, checked: type.id === DEFAULT_SIGNER }),
        el(
          'span',
          { class: 'hex-plate picker__ico' },
          icon(meta.icon, { size: 18, fallback: meta.fallback }),
        ),
        el('span', { class: 'picker__body' }, [
          el('span', { class: 'picker__title' }, type.label),
          el('span', { class: 'picker__sub muted small' }, type.sub),
        ]),
      ]);
    }),
  );
}

function roleSelector(initial = ROLE_OPTIONS[0].id) {
  let value = initial;
  const buttons = ROLE_OPTIONS.map((option) =>
    el(
      'button',
      {
        class: `seg__btn${option.id === value ? ' is-on' : ''}`,
        type: 'button',
        'aria-pressed': String(option.id === value),
        onClick: () => {
          value = option.id;
          buttons.forEach((node, index) => {
            const on = ROLE_OPTIONS[index].id === value;
            node.classList.toggle('is-on', on);
            node.setAttribute('aria-pressed', String(on));
          });
        },
      },
      option.label,
    ),
  );
  const node = el('div', { class: 'seg', role: 'group', 'aria-label': 'Account type' }, buttons);
  return { node, get: () => value };
}

function handleAvailability(handle) {
  const value = String(handle ?? '')
    .trim()
    .replace(/^@/, '');
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
            el(
              'span',
              { class: 'hex-plate auth-feature__ico' },
              icon(feature.icon, { size: 18, fallback: feature.fallback }),
            ),
            el('span', { class: 'auth-feature__txt' }, [
              el('strong', {}, feature.title),
              el('span', { class: 'muted small' }, feature.body),
            ]),
          ]),
        ),
      ),
      el('div', { class: 'auth-actions' }, [
        button('Sign in', {
          variant: 'gold',
          className: 'auth-action',
          onClick: () => app.navigate('/signin'),
        }),
        button('Create account', {
          className: 'auth-action',
          onClick: () => app.navigate('/create'),
        }),
      ]),
      el('div', { class: 'auth-alt' }, [
        el('span', { class: 'muted small' }, 'Have an existing key?'),
        button('Import nsec / npub', {
          variant: 'ghost',
          small: true,
          onClick: () => app.navigate('/nsec'),
        }),
      ]),
      noteBox(
        'Prototype sign-in is simulated. Signing in does not grant an academy role — roles are assigned by the academy owner.',
      ),
    ],
  });
}

export function renderSignIn({ app }) {
  const personas = personaChoices();
  const signers = signerChoices('signer');

  const form = el('div', { class: 'auth-form' }, [
    formSection({
      step: '01',
      title: 'Demo identity',
      hint: 'Pick an existing profile to sign in as.',
      children: [personas],
    }),
    formSection({
      step: '02',
      title: 'Signer',
      hint: 'Where your key lives and signs requests.',
      children: [
        signers,
        noteBox('Signing a challenge proves you control the key. It does not grant an academy role.'),
      ],
    }),
    authFoot(
      button('Sign challenge & continue', {
        variant: 'gold',
        className: 'auth-cta',
        onClick: () =>
          app.signIn(
            readRadio(personas, 'persona') ?? 'alice',
            readRadio(signers, 'signer') ?? DEFAULT_SIGNER,
          ),
      }),
    ),
  ]);

  return authLayout({
    app,
    backTo: '/welcome',
    children: [
      authHero({
        eyebrow: 'Sign in',
        title: 'Welcome back',
        subtitle: 'Choose a demo identity, pick a signer, then sign the challenge.',
      }),
      form,
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
  const role = roleSelector();
  const join = el('input', { type: 'checkbox', checked: true });
  const signers = signerChoices('create-signer');

  const form = el('div', { class: 'auth-form' }, [
    formSection({
      step: '01',
      title: 'Identity',
      hint: 'Choose how you appear across the academy.',
      children: [
        field('Display name', nameInput, 'Shown on your submissions, feed, and credentials.'),
        field(
          'Handle (optional)',
          el('div', { class: 'input-group' }, [
            el('span', { class: 'input-addon' }, '@'),
            handleInput,
            el('span', { class: 'input-addon input-addon--end' }, '.bitos.id'),
          ]),
          'A public link that proves control of your key.',
        ),
        availability,
        fieldGroup('Account type', role.node, 'Learners join classes; teachers publish and review.'),
        el('label', { class: 'auth-check' }, [
          join,
          el('span', { class: 'auth-check__txt' }, [
            el('strong', {}, 'Request to join BitOS Academy'),
            el('span', { class: 'muted small' }, 'Membership is approved by the academy owner.'),
          ]),
        ]),
      ],
    }),
    formSection({
      step: '02',
      title: 'Signer',
      hint: 'Where your key lives and signs requests.',
      children: [
        signers,
        noteBox(
          'Your key never leaves your signer. This prototype generates a demo key you can export from Settings.',
        ),
      ],
    }),
    authFoot(
      button('Create account & sign', {
        variant: 'gold',
        className: 'auth-cta',
        onClick: () =>
          app.createAccount({
            displayName: nameInput.value,
            handle: handleInput.value,
            role: role.get(),
            joinAcademy: join.checked,
            signerTypeId: readRadio(signers, 'create-signer') ?? DEFAULT_SIGNER,
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
        subtitle: 'Generate a key, claim a handle if you want one, and sign to create your identity.',
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
    placeholder: 'Display name (for a new key)',
    autocomplete: 'name',
  });
  const role = roleSelector();
  const signers = signerChoices('nsec-signer');

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

  const demoKeys = el(
    'div',
    { class: 'auth-chips' },
    PERSONA_IDS.map((id) => {
      const persona = getPersona(id);
      return button(persona.displayName, {
        variant: 'ghost',
        small: true,
        onClick: () => {
          keyInput.value = persona.nsec;
          nameInput.value = persona.displayName;
          keyInput.focus();
        },
      });
    }),
  );

  const form = el('div', { class: 'auth-form' }, [
    formSection({
      step: '01',
      title: 'Import key',
      hint: 'Paste an existing nsec or npub.',
      children: [
        noteBox('Never paste a real secret key into a prototype. Key import here is simulated.', 'warn'),
        field(
          'Secret key',
          el('div', { class: 'input-group' }, [keyInput, reveal]),
          'An nsec signs as you; an npub signs in to a known identity.',
        ),
        fieldGroup('Try a demo key', demoKeys, 'Fills the field with a known identity.'),
      ],
    }),
    formSection({
      step: '02',
      title: 'Profile',
      hint: 'Only used when the key is not already known.',
      children: [
        field('Display name', nameInput),
        fieldGroup('Account type', role.node),
      ],
    }),
    formSection({
      step: '03',
      title: 'Signer',
      hint: 'Where your key lives and signs requests.',
      children: [signers],
    }),
    authFoot(
      button('Sign challenge & continue', {
        variant: 'gold',
        className: 'auth-cta',
        onClick: () =>
          app.signInWithKey({
            key: keyInput.value,
            displayName: nameInput.value,
            role: role.get(),
            signerTypeId: readRadio(signers, 'nsec-signer') ?? DEFAULT_SIGNER,
          }),
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
        subtitle: 'Import an existing nsec or npub to control your identity.',
      }),
      form,
    ],
  });
}

export const AUTH_ROUTES = Object.freeze(['/welcome', '/signin', '/create', '/nsec']);

export function isAuthRoute(path) {
  return AUTH_ROUTES.includes(path);
}
