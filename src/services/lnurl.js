import { bech32 } from '@scure/base';

// LNURL-pay helpers for NIP-57 zaps. Pure URL/codec functions are separated
// from the fetchers so they can be unit-tested without a network.

// lud16 is `name@domain` (a "lightning address").
export function lud16ToUrl(lud16) {
  const value = String(lud16 ?? '').trim();
  const at = value.indexOf('@');
  if (at <= 0 || at === value.length - 1) return null;
  const name = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (!name || !domain) return null;
  return `https://${domain}/.well-known/lnurlp/${encodeURIComponent(name)}`;
}

// lud06 is a bech32-encoded LNURL.
export function decodeLud06(lud06) {
  try {
    const { words } = bech32.decode(String(lud06 ?? '').toLowerCase(), 2000);
    return new TextDecoder().decode(Uint8Array.from(bech32.fromWords(words)));
  } catch {
    return null;
  }
}

export function lnurlPayUrl(profile) {
  if (profile?.lud16) return lud16ToUrl(profile.lud16);
  if (profile?.lud06) return decodeLud06(profile.lud06);
  return null;
}

export function invoiceRequestUrl(callback, { amountMsat, zapRequest } = {}) {
  const url = new URL(callback);
  url.searchParams.set('amount', String(Math.round(Number(amountMsat) || 0)));
  if (zapRequest) url.searchParams.set('nostr', JSON.stringify(zapRequest));
  return url.toString();
}

export async function fetchPayRequest(url, { signal } = {}) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`LNURL request failed (${response.status}).`);
  const data = await response.json();
  if (data?.status === 'ERROR') throw new Error(data.reason ?? 'LNURL error.');
  if (!data?.callback) throw new Error('LNURL pay request has no callback.');
  return data;
}

export async function requestZapInvoice(callback, { amountMsat, zapRequest, signal } = {}) {
  const response = await fetch(invoiceRequestUrl(callback, { amountMsat, zapRequest }), { signal });
  if (!response.ok) throw new Error(`Invoice request failed (${response.status}).`);
  const data = await response.json();
  if (!data?.pr) throw new Error(data?.reason ?? 'No invoice returned.');
  return data;
}
