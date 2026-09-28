export function splitNip05(identifier) {
  const value = String(identifier ?? '')
    .trim()
    .replace(/^@/, '');
  const at = value.indexOf('@');
  if (at <= 0 || at === value.length - 1) return null;
  const name = value.slice(0, at);
  const domain = value.slice(at + 1).toLowerCase();
  if (!/^[a-z0-9._-]+$/i.test(name)) return null;
  if (!/^[a-z0-9.-]+$/.test(domain) || !domain.includes('.')) return null;
  return { name, domain, identifier: `${name}@${domain}` };
}

export function nip05Url(identifier) {
  const parts = splitNip05(identifier);
  if (!parts) return null;
  return `https://${parts.domain}/.well-known/nostr.json?name=${encodeURIComponent(parts.name)}`;
}

export function matchesNip05(data, identifier, pubkey) {
  const parts = splitNip05(identifier);
  if (!parts || !pubkey) return false;
  return data?.names?.[parts.name] === pubkey;
}
