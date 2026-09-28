import { el } from '../../core/dom.js';
import {
  credentialFromProof,
  decodeProofFragment,
  statusLabel,
  statusTone,
  verifyCredential,
} from '../../domain/credential.js';
import { truncateNpub } from '../../domain/identity.js';
import { verify } from '../../services/nostr.js';
import { resolveNip05 } from '../../services/nip05.js';
import { icon } from '../components/icon.js';
import { identityChip } from '../components/identity-chip.js';
import { button, noteBox, pageTitle } from '../components/primitives.js';
import { statusBadge } from '../components/status-badge.js';

function formatIssued(issuedAt) {
  if (!issuedAt) return null;
  const date = new Date(Number(issuedAt));
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function fact(label, value) {
  return el('div', { class: 'verify__fact' }, [
    el('span', { class: 'verify__fact-label' }, label),
    el('span', { class: 'verify__fact-value' }, value),
  ]);
}

export function renderVerify({ store, app }) {
  const result = el('div', { class: 'verify__result', 'aria-live': 'polite' });
  const input = el('textarea', {
    rows: '4',
    placeholder: 'Paste a credential id or a shared credential proof (JSON)',
    'aria-label': 'Credential id or proof',
  });

  function clear() {
    input.value = '';
    result.replaceChildren();
    input.focus();
  }

  function run() {
    const query = input.value.trim();
    result.replaceChildren();
    if (!query) {
      result.append(noteBox('Paste a credential id or a shared proof to check it.', 'info'));
      return;
    }

    const local = store.getState().credentials.find((entry) => entry.id === query);
    const pasted = local ? null : credentialFromProof(query);
    const credential = local ?? pasted;
    if (!credential) {
      result.append(
        noteBox('No credential matched that id, and this is not a valid proof. Paste the id or the shared proof (JSON).', 'warn'),
      );
      return;
    }

    result.append(verificationCard({ credential, pasted, app }));
  }

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      run();
    }
  });

  const node = el('section', { class: 'screen' }, [
    pageTitle('Verify'),
    el('p', { class: 'muted' }, 'Inspect a credential before making a trust decision.'),
    el('div', { class: 'card verify__panel' }, [
      el('label', { class: 'verify__field' }, [
        el('span', { class: 'verify__field-label' }, 'Credential id or shared proof'),
        input,
        el(
          'span',
          { class: 'verify__field-hint' },
          'Paste a credential id, the JSON from “Copy proof”, or open a verification link. ⌘/Ctrl + Enter to check.',
        ),
      ]),
      el('div', { class: 'verify__actions' }, [
        button('Check credential', { variant: 'gold', onClick: run }),
        button('Clear', { variant: 'ghost', small: true, onClick: clear }),
      ]),
    ]),
    result,
    button('Back to credentials', { variant: 'ghost', small: true, onClick: () => app.navigate('/credentials') }),
  ]);

  const route = (typeof location !== 'undefined' ? location.hash : '').replace(/^#/, '');
  const fragment = route.startsWith('/verify/') ? route.slice('/verify/'.length).split(/[?&]/)[0] : '';
  const decoded = fragment ? decodeProofFragment(fragment) : null;
  if (decoded) {
    input.value = decoded;
    run();
  }
  return node;
}

function verificationCard({ credential, pasted, app }) {
  const check = verifyCredential(credential, verify);
  const active = credential.status === 'active';
  const verdict = !check.valid
    ? { tone: 'err', title: 'Signature not verified', icon: 'lucide:shield-alert', fallback: '⚠' }
    : active
      ? { tone: 'ok', title: 'Verified credential', icon: 'lucide:badge-check', fallback: '✓' }
      : {
          tone: 'warn',
          title: `Signature valid — ${statusLabel(credential.status).toLowerCase()}`,
          icon: 'lucide:triangle-alert',
          fallback: '⚠',
        };

  const facts = el('div', { class: 'verify__facts' });
  if (credential.payload?.holder) facts.append(fact('Recipient', credential.payload.holder));
  if (credential.course) facts.append(fact('Course', credential.course));
  const issued = formatIssued(credential.issuedAt);
  if (issued) facts.append(fact('Issued', issued));
  if (credential.issuer) facts.append(fact('Issuer', identityChip(credential.issuer)));

  const issuerKey = credential.issuerNpub ?? credential.issuerPubkey;
  if (issuerKey) {
    facts.append(
      fact(
        'Issuer key',
        el('span', { class: 'verify__key' }, [
          el('span', { class: 'mono small' }, truncateNpub(issuerKey)),
          button('Copy', { small: true, variant: 'ghost', onClick: () => app.copyText(issuerKey, 'Issuer key copied.') }),
        ]),
      ),
    );
  }

  const card = el('div', { class: `card verify__card verify__card--${verdict.tone}` }, [
    el('div', { class: 'verify__head' }, [
      el('span', { class: `verify__seal verify__seal--${verdict.tone}`, 'aria-hidden': 'true' }, [
        icon(verdict.icon, { size: 22, fallback: verdict.fallback }),
      ]),
      el('div', { class: 'verify__headtext' }, [
        el('h3', {}, verdict.title),
        el('p', { class: 'muted small' }, check.reason),
      ]),
      statusBadge(statusLabel(credential.status), statusTone(credential.status)),
    ]),
    el('h4', { class: 'verify__title' }, credential.title),
    facts,
  ]);

  const nip05 = credential.payload?.issuerNip05;
  if (nip05) {
    const line = el('p', { class: 'mono small muted verify__nip05' }, `Resolving ${nip05}…`);
    card.append(line);
    resolveNip05(nip05).then((resolved) => {
      if (!resolved) {
        line.textContent = `${nip05} · not resolved (signature still stands)`;
        return;
      }
      line.textContent =
        resolved.pubkey === credential.issuerPubkey
          ? `✓ ${resolved.identifier} → ${truncateNpub(resolved.npub ?? '')}`
          : `⚠ ${resolved.identifier} resolves to a different key`;
    });
  }

  if (pasted) {
    card.append(el('p', { class: 'muted small' }, 'Checked from a shared proof — status is not included in the proof.'));
  }
  card.append(noteBox('A valid signature alone is not endorsement. Check status and freshness.'));
  return card;
}
