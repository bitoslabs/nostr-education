// Minimal BOLT11 invoice reader. We only need the timestamp and the optional
// `x` (expiry) tag so the zap dialog can show when the invoice goes stale.
// This never validates the signature or amount: the paying wallet stays the
// source of truth, and a malformed string simply returns null.

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const DEFAULT_EXPIRY_SECONDS = 3600;
// The trailing 104 bech32 words (520 bits) are the ECDSA signature, not tags.
const SIGNATURE_WORDS = 104;
const EXPIRY_TAG = 6;

function toWords(data) {
  const words = [];
  for (let i = 0; i < data.length; i += 1) {
    const index = CHARSET.indexOf(data[i]);
    if (index === -1) return null;
    words.push(index);
  }
  return words;
}

// Reads `length` bits starting at `offset` as an unsigned big-endian integer.
// Multiplies instead of shifting so a 35-bit timestamp does not overflow.
function readBits(words, offset, length) {
  let value = 0;
  for (let i = 0; i < length; i += 1) {
    const bit = offset + i;
    const word = words[Math.floor(bit / 5)];
    if (word == null) return null;
    value = value * 2 + ((word >> (4 - (bit % 5))) & 1);
  }
  return value;
}

// Returns { timestampMs, expirySeconds, expiresAtMs } or null when `invoice`
// is not a decodable BOLT11 string. Invoices without an expiry tag follow the
// BOLT11 default of one hour.
export function invoiceExpiry(invoice) {
  const raw = String(invoice ?? '').trim().toLowerCase();
  const separator = raw.lastIndexOf('1');
  if (separator < 3) return null;
  const hrp = raw.slice(0, separator);
  const data = raw.slice(separator + 1);
  if (!hrp.startsWith('ln') || data.length < 7 + SIGNATURE_WORDS) return null;
  const words = toWords(data);
  if (!words) return null;
  const timestamp = readBits(words, 0, 35);
  if (timestamp == null) return null;

  let offset = 35;
  const tagBits = (words.length - SIGNATURE_WORDS) * 5;
  let expirySeconds = DEFAULT_EXPIRY_SECONDS;
  while (offset + 15 <= tagBits) {
    const type = readBits(words, offset, 5);
    const length = readBits(words, offset + 5, 10);
    offset += 15;
    if (type == null || length == null) return null;
    if (offset + length * 5 > tagBits) break;
    if (type === EXPIRY_TAG) expirySeconds = readBits(words, offset, length * 5);
    offset += length * 5;
  }

  return {
    timestampMs: timestamp * 1000,
    expirySeconds,
    expiresAtMs: (timestamp + expirySeconds) * 1000,
  };
}
