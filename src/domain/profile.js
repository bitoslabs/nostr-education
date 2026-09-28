const MAX_NAME = 64;
const MAX_ABOUT = 480;
const MAX_PICTURE = 512;

export function normalizePicture(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.toString();
  } catch {
    /* not an absolute URL */
  }
  return null;
}

export function profileContent(person = {}) {
  const content = {};
  const name = String(person.displayName ?? person.name ?? '').trim();
  if (name) content.name = name.slice(0, MAX_NAME);
  const about = String(person.about ?? '').trim();
  if (about) content.about = about.slice(0, MAX_ABOUT);
  const picture = normalizePicture(person.picture);
  if (picture) content.picture = picture.slice(0, MAX_PICTURE);
  const nip05 = String(person.handle ?? person.nip05 ?? '').trim();
  if (nip05) content.nip05 = nip05;
  return content;
}

export function parseProfileMeta(content) {
  let meta = content;
  if (typeof content === 'string') {
    try {
      meta = JSON.parse(content);
    } catch {
      return null;
    }
  }
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;

  const name = String(meta.name ?? meta.display_name ?? '').trim();
  const about = String(meta.about ?? '').trim();
  const nip05 = String(meta.nip05 ?? '').trim();
  return {
    displayName: name || undefined,
    about,
    picture: normalizePicture(meta.picture),
    handle: nip05 || null,
  };
}
