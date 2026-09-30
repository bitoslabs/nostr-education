import { el } from '../../core/dom.js';
import {
  credentialFromProof,
  decodeProofFragment,
  statusTone,
  verifyCredential,
} from '../../domain/credential.js';
import { truncateNpub } from '../../domain/identity.js';
import { verify } from '../../services/nostr.js';
import { resolveNip05 } from '../../services/nip05.js';
import { t } from '../../services/i18n/index.js';
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
    placeholder: t('credentials.verify.placeholder'),
    'aria-label': t('credentials.verify.inputAria'),
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
      result.append(noteBox(t('credentials.verify.emptyQuery'), 'info'));
      return;
    }

    const local = store.getState().credentials.find((entry) => entry.id === query);
    const pasted = local ? null : credentialFromProof(query);
    const credential = local ?? pasted;
    if (!credential) {
      result.append(
        noteBox(t('credentials.verify.noMatch'), 'warn'),
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
    pageTitle(t('credentials.verify.title')),
    el('p', { class: 'muted' }, t('credentials.verify.intro')),
    el('div', { class: 'card verify__panel' }, [
      el('label', { class: 'verify__field' }, [
        el('span', { class: 'verify__field-label' }, t('credentials.verify.fieldLabel')),
        input,
        el(
          'span',
          { class: 'verify__field-hint' },
          t('credentials.verify.fieldHint'),
        ),
      ]),
      el('div', { class: 'verify__actions' }, [
        button(t('credentials.checkCredential'), { variant: 'gold', onClick: run }),
        button(t('credentials.clear'), { variant: 'ghost', small: true, onClick: clear }),
      ]),
    ]),
    result,
    button(t('credentials.backToCredentials'), { variant: 'ghost', small: true, onClick: () => app.navigate('/credentials') }),
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
    ? { tone: 'err', title: t('credentials.verify.notVerified'), icon: 'lucide:shield-alert', fallback: '⚠' }
    : active
      ? { tone: 'ok', title: t('credentials.verify.verified'), icon: 'lucide:badge-check', fallback: '✓' }
      : {
          tone: 'warn',
          title: t('credentials.verify.signatureValid', {
            status: t('common.credentialStatus.' + credential.status).toLowerCase(),
          }),
          icon: 'lucide:triangle-alert',
          fallback: '⚠',
        };

  const facts = el('div', { class: 'verify__facts' });
  if (credential.payload?.holder) facts.append(fact(t('credentials.verify.factRecipient'), credential.payload.holder));
  if (credential.course) facts.append(fact(t('credentials.verify.factCourse'), credential.course));
  const issued = formatIssued(credential.issuedAt);
  if (issued) facts.append(fact(t('credentials.verify.factIssued'), issued));
  if (credential.issuer) facts.append(fact(t('credentials.verify.factIssuer'), identityChip(credential.issuer)));

  const issuerKey = credential.issuerNpub ?? credential.issuerPubkey;
  if (issuerKey) {
    facts.append(
      fact(
        t('credentials.verify.factIssuerKey'),
        el('span', { class: 'verify__key' }, [
          el('span', { class: 'mono small' }, truncateNpub(issuerKey)),
          button(t('common.actions.copy'), {
            small: true,
            variant: 'ghost',
            onClick: () => app.copyText(issuerKey, t('credentials.issuerKeyCopied')),
          }),
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
      statusBadge(
        t('common.credentialStatus.' + credential.status),
        statusTone(credential.status),
      ),
    ]),
    el('h4', { class: 'verify__title' }, credential.title),
    facts,
  ]);

  const nip05 = credential.payload?.issuerNip05;
  if (nip05) {
    const line = el('p', { class: 'mono small muted verify__nip05' }, t('credentials.verify.resolving', { nip05 }));
    card.append(line);
    resolveNip05(nip05).then((resolved) => {
      if (!resolved) {
        line.textContent = t('credentials.verify.notResolved', { nip05 });
        return;
      }
      line.textContent =
        resolved.pubkey === credential.issuerPubkey
          ? t('credentials.verify.resolved', {
              identifier: resolved.identifier,
              npub: truncateNpub(resolved.npub ?? ''),
            })
          : t('credentials.verify.differentKey', { identifier: resolved.identifier });
    });
  }

  if (pasted) {
    card.append(el('p', { class: 'muted small' }, t('credentials.verify.sharedNote')));
  }
  card.append(noteBox(t('credentials.verify.endorsementNote')));
  return card;
}
