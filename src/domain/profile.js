const MAX_NAME = 64;
const MAX_TEXT = 256;
const MAX_ABOUT = 480;
const MAX_URL = 512;

const MANAGED_KEYS = Object.freeze([
  'name',
  'display_name',
  'about',
  'picture',
  'banner',
  'nip05',
  'lud16',
  'lud06',
  'website',
  'bot',
]);

function str(value, max = MAX_TEXT) {
  return String(value ?? '').trim().slice(0, max);
}

export function normalizeUrl(value) {
  const raw = str(value, MAX_URL);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.toString();
  } catch {
    /* not an absolute URL */
  }
  return null;
}

/* Kept as an alias: profile pictures are just URLs. */
export const normalizePicture = normalizeUrl;

export function isNip05(value) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(str(value));
}

export function isLightningAddress(value) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(str(value));
}

export function profileContent(person = {}) {
  const raw =
    person.raw && typeof person.raw === 'object' && !Array.isArray(person.raw) ? { ...person.raw } : {};
  const content = { ...raw };
  /* Drop the fields we manage so stale variants never survive an edit. */
  for (const key of MANAGED_KEYS) delete content[key];

  const displayName = str(person.displayName, MAX_NAME);
  const username = str(person.name, MAX_NAME);
  if (username || displayName) content.name = (username || displayName).slice(0, MAX_NAME);
  if (displayName) content.display_name = displayName;

  const about = str(person.about, MAX_ABOUT);
  if (about) content.about = about;

  const picture = normalizeUrl(person.picture);
  if (picture) content.picture = picture;
  const banner = normalizeUrl(person.banner);
  if (banner) content.banner = banner;

  const nip05 = str(person.handle ?? person.nip05);
  if (nip05) content.nip05 = nip05;

  const lud16 = str(person.lud16);
  if (lud16) content.lud16 = lud16;
  const lud06 = str(person.lud06);
  if (lud06) content.lud06 = lud06;

  const website = str(person.website, MAX_URL);
  if (website) content.website = website;

  if (person.bot === true) content.bot = true;

  return content;
}

export function parseProfileMeta(content) {
  let raw = content;
  if (typeof content === 'string') {
    try {
      raw = JSON.parse(content);
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const name = str(raw.name, MAX_NAME);
  const displayName = str(raw.display_name, MAX_NAME);
  return {
    name: name || undefined,
    displayName: displayName || name || undefined,
    about: str(raw.about, MAX_ABOUT),
    picture: normalizeUrl(raw.picture),
    banner: normalizeUrl(raw.banner),
    handle: str(raw.nip05) || null,
    lud16: str(raw.lud16) || null,
    lud06: str(raw.lud06) || null,
    website: str(raw.website, MAX_URL) || null,
    bot: raw.bot === true || raw.bot === 'true',
    raw,
  };
}
