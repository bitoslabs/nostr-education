import { el } from '../../core/dom.js';
import { getPersona, getPersonaIds } from '../../data/personas.js';
import { DEFAULT_SIGNER, ROLE_OPTIONS, SIGNER_TYPES } from '../../domain/account.js';
import { normalizeHandle, validateHandle } from '../../domain/handle.js';
import { ROLE } from '../../domain/school.js';
import { icon } from '../components/icon.js';
import { button, noteBox } from '../components/primitives.js';
import { t } from '../../services/i18n/index.js';

const SIGNER_ICONS = Object.freeze({
  local: { icon: 'lucide:smartphone', fallback: '📱' },
  extension: { icon: 'lucide:puzzle', fallback: '🧩' },
  bunker: { icon: 'lucide:cloud', fallback: '☁' },
});

const WELCOME_FEATURES = Object.freeze([
  {
    icon: 'lucide:fingerprint',
    fallback: '🪪',
    titleKey: 'auth.featureIdentityTitle',
    bodyKey: 'auth.featureIdentityBody',
  },
  {
    icon: 'lucide:shield-check',
    fallback: '🛡',
    titleKey: 'auth.featurePrivateTitle',
    bodyKey: 'auth.featurePrivateBody',
  },
  {
    icon: 'lucide:badge-check',
    fallback: '🎓',
    titleKey: 'auth.featureCredentialsTitle',
    bodyKey: 'auth.featureCredentialsBody',
  },
]);

/* ---------- layout primitives ---------- */

function authBrand() {
  return el('span', { class: 'auth-brand' }, [
    el('span', { class: 'auth-brand__mark', 'aria-hidden': 'true' }, '🐝'),
    el('span', { class: 'auth-brand__name' }, t('common.brand.name')),
    el('span', { class: 'auth-brand__tag' }, t('common.brand.tag')),
  ]);
}

function backButton(app, route = '/welcome') {
  return el('button', { class: 'auth-back', type: 'button', onClick: () => app.navigate(route) }, [
    icon('lucide:chevron-left', { size: 18, fallback: '←' }),
    el('span', {}, t('common.actions.back')),
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
          el('span', { class: 'picker__title' }, t('common.signer.' + type.id + '.label')),
          el('span', { class: 'picker__sub muted small' }, t('common.signer.' + type.id + '.sub')),
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
      t('common.role.' + option.id),
    ),
  );
  const node = el('div', { class: 'seg', role: 'group', 'aria-label': t('auth.accountType') }, buttons);
  return { node, get: () => value };
}

function handleAvailability(handle) {
  const value = String(handle ?? '').trim().replace(/^@/, '');
  if (!value) return { ok: false, message: '' };
  const result = validateHandle(value);
  if (!result.valid) {
    if (result.reason === 'reserved') return { ok: false, message: t('auth.handleReserved', { handle: result.handle }) };
    if (result.reason === 'length') return { ok: false, message: t('auth.handleLength') };
    return { ok: false, message: t('auth.handleChars') };
  }
  const taken = getPersonaIds()
    .map((id) => normalizeHandle(String(getPersona(id).handle ?? '').split('@')[0]))
    .includes(result.handle);
  return taken
    ? { ok: false, message: t('auth.handleTaken', { handle: result.handle }) }
    : { ok: true, message: t('auth.handleAvailable', { handle: result.handle }) };
}

/* ---------- screens ---------- */

export function renderWelcome({ app }) {
  return authLayout({
    app,
    children: [
      authHero({
        eyebrow: t('auth.welcomeEyebrow'),
        title: t('auth.welcomeTitle'),
        subtitle: t('auth.welcomeSubtitle'),
      }),
      el(
        'ul',
        { class: 'auth-features' },
        WELCOME_FEATURES.map((feature) =>
          el('li', { class: 'auth-feature' }, [
            el('span', { class: 'hex-plate auth-feature__ico' }, icon(feature.icon, { size: 18, fallback: feature.fallback })),
            el('span', { class: 'auth-feature__txt' }, [
              el('strong', {}, t(feature.titleKey)),
              el('span', { class: 'muted small' }, t(feature.bodyKey)),
            ]),
          ]),
        ),
      ),
      el('div', { class: 'auth-actions' }, [
        button(t('common.actions.signIn'), { variant: 'gold', className: 'auth-action', onClick: () => app.navigate('/signin') }),
        button(t('auth.createAccount'), { className: 'auth-action', onClick: () => app.navigate('/create') }),
      ]),
      el('div', { class: 'auth-alt' }, [
        el('span', { class: 'muted small' }, t('auth.haveKey')),
        button(t('auth.importNsecNpub'), { variant: 'ghost', small: true, onClick: () => app.navigate('/nsec') }),
      ]),
      el('div', { class: 'auth-alt' }, [
        el('span', { class: 'muted small' }, t('auth.invitedPrompt')),
        button(t('auth.openInvite'), { variant: 'ghost', small: true, onClick: () => app.navigate('/join') }),
      ]),
      noteBox(t('auth.welcomeNote')),
    ],
  });
}

export function renderSignIn({ app }) {
  const body = el('div', { class: 'auth-form' }, [
    formSection({
      step: '01',
      title: t('auth.browserExtension'),
      hint: t('auth.browserExtensionHint'),
      children: [
        button(t('auth.continueWithExtension'), {
          variant: 'gold',
          className: 'auth-cta',
          onClick: () => app.signInWithExtension(),
        }),
      ],
    }),
    formSection({
      step: '02',
      title: t('auth.existingKey'),
      hint: t('auth.existingKeyHint'),
      children: [
        button(t('auth.importKey'), { className: 'auth-cta', onClick: () => app.navigate('/nsec') }),
      ],
    }),
  ]);

  return authLayout({
    app,
    backTo: '/welcome',
    children: [
      authHero({
        eyebrow: t('common.actions.signIn'),
        title: t('auth.welcomeBack'),
        subtitle: t('auth.signInSubtitle'),
      }),
      body,
    ],
  });
}

export function renderCreateAccount({ app }) {
  const availability = el('p', { class: 'auth-hint small', 'aria-live': 'polite', hidden: true });
  const handleInput = el('input', {
    type: 'text',
    placeholder: t('auth.handlePlaceholder'),
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-label': t('auth.handle'),
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
  const nameInput = el('input', { type: 'text', placeholder: t('auth.namePlaceholder'), autocomplete: 'name' });
  const academyInput = el('input', {
    type: 'text',
    placeholder: t('auth.academyPlaceholder'),
    autocomplete: 'organization',
    'aria-label': t('auth.academyName'),
  });
  const academyField = field(t('auth.academyName'), academyInput, t('auth.academyHint'));
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
      title: t('auth.identityTitle'),
      hint: t('auth.identityHint'),
      children: [
        field(t('auth.displayName'), nameInput, t('auth.displayNameHint')),
        field(
          t('auth.handleOptional'),
          el('div', { class: 'input-group' }, [el('span', { class: 'input-addon' }, '@'), handleInput]),
          t('auth.handleHint'),
        ),
        availability,
        fieldGroup(t('auth.accountType'), role.node, t('auth.accountTypeHint')),
        academyField,
      ],
    }),
    formSection({
      step: '02',
      title: t('auth.keyTitle'),
      hint: t('auth.keyHint'),
      children: [
        signers,
        noteBox(t('auth.keyNote')),
      ],
    }),
    authFoot(
      button(t('auth.createAccount'), {
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
        eyebrow: t('auth.createIdentityEyebrow'),
        title: t('auth.createAccountTitle'),
        subtitle: t('auth.createAccountSubtitle'),
      }),
      form,
    ],
  });
}

export function renderLoginNsec({ app }) {
  const keyInput = el('input', {
    type: 'password',
    placeholder: t('auth.keyPlaceholder'),
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-label': t('auth.secretKey'),
  });
  const nameInput = el('input', {
    type: 'text',
    placeholder: t('auth.displayNameOptional'),
    autocomplete: 'name',
  });

  const reveal = button(t('auth.reveal'), {
    variant: 'ghost',
    small: true,
    className: 'input-group__btn',
    onClick: () => {
      const hidden = keyInput.type === 'password';
      keyInput.type = hidden ? 'text' : 'password';
      reveal.replaceChildren(hidden ? t('auth.hide') : t('auth.reveal'));
    },
  });

  const form = el('div', { class: 'auth-form' }, [
    formSection({
      step: '01',
      title: t('auth.importKey'),
      hint: t('auth.importKeyHint'),
      children: [
        noteBox(t('auth.importKeyNote'), 'warn'),
        field(
          t('auth.secretKey'),
          el('div', { class: 'input-group' }, [keyInput, reveal]),
          t('auth.secretKeyHint'),
        ),
      ],
    }),
    formSection({
      step: '02',
      title: t('auth.profileTitle'),
      hint: t('auth.profileHint'),
      children: [field(t('auth.displayName'), nameInput)],
    }),
    authFoot(
      button(t('common.actions.signIn'), {
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
        eyebrow: t('auth.importIdentityEyebrow'),
        title: t('auth.signInWithKeyTitle'),
        subtitle: t('auth.signInWithKeySubtitle'),
      }),
      form,
    ],
  });
}

export const AUTH_ROUTES = Object.freeze(['/welcome', '/signin', '/create', '/nsec']);

export function isAuthRoute(path) {
  return AUTH_ROUTES.includes(path);
}
