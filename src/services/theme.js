const STORAGE = Object.freeze({
  theme: 'bitbee-theme',
  accent: 'bitbee-accent',
  flags: 'bitbee-flags',
});

export const THEME_CHOICES = Object.freeze([
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
  { id: 'system', label: 'System' },
]);

export const ACCENTS = Object.freeze({
  gold: { value: '#f2b824', hi: '#ffc94a', ink: '#1a1405' },
  orange: { value: '#f7931a', hi: '#ffab4a', ink: '#1a0f02' },
  green: { value: '#50e3a0', hi: '#7ff0bb', ink: '#04231a' },
  blue: { value: '#3b82f6', hi: '#6ea8ff', ink: '#f5f9ff' },
  pink: { value: '#ec4899', hi: '#ff7ab8', ink: '#2a0716' },
});

export const DEFAULT_FLAGS = Object.freeze({
  oled: false,
  reduceMotion: false,
  compact: false,
});

function safeStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readFlags(storage) {
  try {
    const raw = storage?.getItem(STORAGE.flags);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function createThemeService({
  root = document.documentElement,
  storage = safeStorage(),
  matchMedia = globalThis.matchMedia?.bind(globalThis),
} = {}) {
  const storedFlags = readFlags(storage) ?? {};
  let state = {
    theme: storage?.getItem(STORAGE.theme) || 'dark',
    accent: storage?.getItem(STORAGE.accent) || 'gold',
    flags: { ...DEFAULT_FLAGS, ...storedFlags },
  };

  const listeners = new Set();
  const TRANSITION_MS = 320;
  let animTimer = null;
  let appliedTheme = null;
  let appliedAccent = null;
  const query = (value) => {
    try {
      return typeof matchMedia === 'function' ? matchMedia(value) : null;
    } catch {
      return null;
    }
  };
  const colorScheme = query('(prefers-color-scheme: light)');
  const reducedMotion = query('(prefers-reduced-motion: reduce)');

  function resolved() {
    if (state.theme !== 'system') return state.theme;
    return colorScheme?.matches ? 'light' : 'dark';
  }

  function current() {
    return state.theme;
  }

  function accent() {
    return state.accent;
  }

  function flags() {
    return { ...state.flags };
  }

  function persist() {
    try {
      storage?.setItem(STORAGE.theme, state.theme);
      storage?.setItem(STORAGE.accent, state.accent);
      storage?.setItem(STORAGE.flags, JSON.stringify(state.flags));
    } catch {
      /* storage disabled */
    }
  }

  function notify() {
    const snapshot = { theme: state.theme, resolved: resolved(), accent: state.accent, flags: flags() };
    listeners.forEach((listener) => listener(snapshot));
  }

  function apply() {
    const token = ACCENTS[state.accent] ?? ACCENTS.gold;
    const nextTheme = resolved();
    const firstPaint = appliedTheme === null;
    const changed = !firstPaint && (appliedTheme !== nextTheme || appliedAccent !== state.accent);

    if (changed && !state.flags.reduceMotion) {
      root.setAttribute('data-theme-anim', '');
      void root.offsetWidth;
      clearTimeout(animTimer);
      animTimer = setTimeout(() => root.removeAttribute('data-theme-anim'), TRANSITION_MS + 80);
    }

    root.dataset.theme = nextTheme;
    root.dataset.oled = state.flags.oled ? 'true' : 'false';
    root.dataset.motion = state.flags.reduceMotion ? 'reduced' : 'normal';
    root.dataset.density = state.flags.compact ? 'compact' : 'cozy';
    root.style.setProperty('--accent', token.value);
    root.style.setProperty('--accent-hi', token.hi);
    root.style.setProperty('--accent-ink', token.ink);
    root.style.setProperty('--orange', token.value);
    root.style.setProperty('--orange-hi', token.hi);

    appliedTheme = nextTheme;
    appliedAccent = state.accent;
    notify();
    return nextTheme;
  }

  function setTheme(value) {
    if (!THEME_CHOICES.some((choice) => choice.id === value)) return;
    state = { ...state, theme: value };
    persist();
    apply();
  }

  function setAccent(value) {
    if (!ACCENTS[value]) return;
    state = { ...state, accent: value };
    persist();
    apply();
  }

  function setFlag(key, on) {
    if (!(key in state.flags)) return;
    state = { ...state, flags: { ...state.flags, [key]: Boolean(on) } };
    persist();
    apply();
  }

  function toggle() {
    setTheme(resolved() === 'dark' ? 'light' : 'dark');
  }

  function init() {
    if (!storedFlags.reduceMotion && reducedMotion?.matches) {
      state = { ...state, flags: { ...state.flags, reduceMotion: true } };
    }
    colorScheme?.addEventListener?.('change', () => {
      if (state.theme === 'system') apply();
    });
    return apply();
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { current, resolved, accent, flags, setTheme, setAccent, setFlag, toggle, init, subscribe };
}
