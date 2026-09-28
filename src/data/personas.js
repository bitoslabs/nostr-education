const registry = new Map();

function placeholder(id) {
  const key = String(id ?? '');
  const short = key.length > 16 ? `${key.slice(0, 10)}…${key.slice(-4)}` : key || 'Unknown';
  return Object.freeze({
    id: key,
    pubkey: key,
    npub: key,
    displayName: short,
    about: '',
    picture: null,
    avatar: '🙂',
    handle: null,
    role: null,
    verifiedAt: null,
    loaded: false,
  });
}

export function registerPersona(profile) {
  if (!profile?.id) return null;
  const entry = Object.freeze({
    pubkey: profile.id,
    npub: profile.npub ?? profile.id,
    displayName: profile.displayName || placeholder(profile.id).displayName,
    about: profile.about ?? '',
    picture: profile.picture ?? null,
    avatar: profile.avatar ?? '🙂',
    handle: profile.handle ?? null,
    role: profile.role ?? null,
    verifiedAt: profile.verifiedAt ?? null,
    loaded: true,
    ...profile,
  });
  registry.set(entry.id, entry);
  return entry;
}

export function hasPersona(id) {
  return registry.has(String(id));
}

export function getPersona(id) {
  return registry.get(String(id)) ?? placeholder(id);
}

export function getPersonaIds() {
  return [...registry.keys()];
}

export function allPersonas() {
  return [...registry.values()];
}

export function findPersonaByKey(key) {
  const value = String(key ?? '').trim();
  if (!value) return null;
  return (
    [...registry.values()].find(
      (persona) => persona.npub === value || persona.pubkey === value,
    ) ?? null
  );
}

export function hydrateProfiles(profiles) {
  for (const profile of profiles ?? []) registerPersona(profile);
}

export function clearRegistry() {
  registry.clear();
}
