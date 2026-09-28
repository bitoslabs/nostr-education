import { ROLE } from '../domain/school.js';

function withKeys(persona) {
  return Object.freeze({
    ...persona,
    nsec: persona.nsec ?? `nsec1${String(persona.npub).replace(/^npub1/, '')}`,
  });
}

const registry = {
  alice: withKeys({
    id: 'alice',
    role: ROLE.STUDENT,
    displayName: 'Alice',
    handle: 'alice@bitos.id',
    avatar: '🧑‍🎓',
    npub: 'npub1fjvzq4nd7xz2m9p8c3rk6t0w5yvhsagl4euxdt2qf8n3z7m8xk3',
    verifiedAt: null,
  }),
  bob: withKeys({
    id: 'bob',
    role: ROLE.TEACHER,
    displayName: 'Bob',
    handle: 'bob@bitos.id',
    avatar: '🧑‍🏫',
    npub: 'npub1t7ch4m2wq9v5xk3n8rp0dz6efyl4cjs2gbhua7mn3t9q7vx5k2w',
    verifiedAt: '2025-02-01T09:00:00Z',
  }),
  nadia: withKeys({
    id: 'nadia',
    role: ROLE.OWNER,
    displayName: 'Nadia',
    handle: 'nadia@bitos.academy',
    avatar: '👩‍💼',
    npub: 'npub1kk9m4zp7xr2q8n5v3wy6tj0dcehf9gsl2abum4kn7t8q5xz1p3r',
    verifiedAt: '2025-01-12T11:30:00Z',
  }),
  academy: withKeys({
    id: 'academy',
    role: 'org',
    displayName: 'BitOS Academy',
    handle: 'bitos.academy',
    avatar: '🏫',
    npub: 'npub1acad4m7xq2p9n5v3wy6tj0dcehf8gsl2abum4kn7t9q5xz1p3r',
    verifiedAt: '2025-01-10T10:00:00Z',
  }),
  mia: withKeys({
    id: 'mia',
    role: 'social',
    displayName: 'Mia Spark',
    handle: 'mia.bee',
    avatar: '🎨',
    npub: 'npub1mia4m7xq2p9n5v3wy6tj0dcehf8gsl2abum4kn7t9q5xz1p3ra',
    verifiedAt: null,
  }),
  kojo: withKeys({
    id: 'kojo',
    role: 'social',
    displayName: 'Kojo Bits',
    handle: 'kojo.bee',
    avatar: '⚡',
    npub: 'npub1kojo4m7xq2p9n5v3wy6tj0dcehf8gsl2abum4kn7t9q5xz1p3rb',
    verifiedAt: null,
  }),
  vera: withKeys({
    id: 'vera',
    role: 'social',
    displayName: 'Vera Hash',
    handle: 'vera.bee',
    avatar: '🧵',
    npub: 'npub1vera4m7xq2p9n5v3wy6tj0dcehf8gsl2abum4kn7t9q5xz1p3rc',
    verifiedAt: null,
  }),
  carol: withKeys({
    id: 'carol',
    role: ROLE.STUDENT,
    displayName: 'Carol',
    handle: 'carol@bitos.id',
    avatar: '👩‍🎓',
    npub: 'npub1caro4m7xq2p9n5v3wy6tj0dcehf8gsl2abum4kn7t9q5xz1p3rd',
    verifiedAt: null,
  }),
  dave: withKeys({
    id: 'dave',
    role: ROLE.STUDENT,
    displayName: 'Dave',
    handle: 'dave@bitos.id',
    avatar: '🧑‍🎓',
    npub: 'npub1dave4m7xq2p9n5v3wy6tj0dcehf8gsl2abum4kn7t9q5xz1p3re',
    verifiedAt: null,
  }),
  priya: withKeys({
    id: 'priya',
    role: ROLE.STUDENT,
    displayName: 'Priya',
    handle: 'priya@bitos.id',
    avatar: '👩‍🎓',
    npub: 'npub1priy4m7xq2p9n5v3wy6tj0dcehf8gsl2abum4kn7t9q5xz1p3rf',
    verifiedAt: null,
  }),
};

export const PEOPLE = registry;

export const PERSONA_IDS = Object.freeze(['alice', 'bob', 'nadia']);

export function getPersonaIds() {
  return Object.keys(registry);
}

export function hasPersona(id) {
  return Boolean(registry[id]);
}

export function getPersona(id) {
  return registry[id] ?? registry.alice;
}

export function registerPersona(persona) {
  registry[persona.id] = withKeys(persona);
  return registry[persona.id];
}

export function findPersonaByKey(key) {
  const value = String(key ?? '').trim();
  if (!value) return null;
  return Object.values(registry).find((persona) => persona.npub === value || persona.nsec === value) ?? null;
}
