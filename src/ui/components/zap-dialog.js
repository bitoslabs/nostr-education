import { el } from '../../core/dom.js';
import { ZAP_AMOUNT_MAX, ZAP_AMOUNT_MIN } from '../../domain/prefs.js';
import { formatSats } from '../../domain/wallet.js';
import { invoiceExpiry } from '../../services/bolt11.js';
import { qrNode } from '../../services/qr.js';
import { t } from '../../services/i18n/index.js';
import { icon } from './icon.js';
import { identityChip } from './identity-chip.js';
import { button, iconButton, spinner } from './primitives.js';

const DEFAULT_PRESETS = [21, 100, 500, 1000];
const SETTLED_HOLD_MS = 1600;

function formatCountdown(totalSeconds) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

function normalizePresets(presets) {
  const list = Array.isArray(presets) ? presets : [];
  const cleaned = list
    .map((value) => Math.round(Number(value)))
    .filter((value) => Number.isFinite(value) && value > 0);
  return cleaned.length ? cleaned : DEFAULT_PRESETS;
}

// `peer` is the person being zapped. When `eventId` is set the zap is attached
// to that post; otherwise it is a direct zap to the person. The flow is real
// NIP-57: resolve LNURL, sign a zap request, request an invoice, then pay with
// WebLN or fall back to showing the invoice as a QR code.
//
// After the invoice is shown the dialog subscribes to the relays and closes
// itself the moment the matching kind:9735 receipt arrives (`watchZapSettlement`)
// so the user never has to guess whether a scan-and-pay actually landed.
export function renderZap({
  peer,
  eventId = null,
  actions,
  close,
  presets,
  hasAddress = true,
  anonymousDefault = false,
  balance = 0,
  registerCleanup,
}) {
  const amounts = normalizePresets(presets);
  let amount = amounts[0];
  let busy = false;
  let paying = false;
  let advanced = false;
  let anonymous = anonymousDefault;
  let settled = false;
  let watching = null;
  let countdown = null;

  const hasWebln = typeof window !== 'undefined' && !!window.webln?.sendPayment;
  // Backdrop clicks are suppressed for this dialog (a mis-tap must never discard
  // a shown invoice), so it carries its own always-visible close control.
  const body = el('div', { class: 'zap__body' });
  const root = el('div', { class: 'zap' }, [
    el('div', { class: 'zap__top' }, [
      el('span', { class: 'spacer' }),
      iconButton('lucide:x', {
        label: t('common.actions.close'),
        fallback: '✕',
        onClick: () => close(),
      }),
    ]),
    body,
  ]);

  function stopWatching() {
    watching?.close?.();
    watching = null;
    if (countdown) {
      clearInterval(countdown);
      countdown = null;
    }
  }
  registerCleanup?.(stopWatching);

  const custom = el('input', {
    class: 'zap-custom',
    type: 'number',
    min: String(ZAP_AMOUNT_MIN),
    max: String(ZAP_AMOUNT_MAX),
    inputmode: 'numeric',
    placeholder: t('wallet.zap.custom'),
    'aria-label': t('wallet.zap.amountLabel'),
    'aria-describedby': 'zap-error',
  });

  const note = el('input', {
    class: 'zap-note',
    type: 'text',
    maxlength: '280',
    placeholder: t('wallet.zap.notePlaceholder'),
    'aria-label': t('wallet.zap.noteLabel'),
  });

  const anonymousSwitch = el(
    'button',
    {
      class: `switch${anonymous ? ' is-on' : ''}`,
      type: 'button',
      role: 'switch',
      'aria-checked': String(anonymous),
      'aria-label': t('wallet.zap.anonymous'),
      onClick: () => setAnonymous(!anonymous),
    },
    el('span', { class: 'switch__dot', 'aria-hidden': 'true' }),
  );
  const anonymousHint = el(
    'p',
    { class: 'muted small zap-anon-hint', hidden: !anonymous },
    t('wallet.zap.anonymousHint'),
  );
  const anonymousRow = el('div', { class: 'row' }, [
    el('span', { class: 'switch__label' }, t('wallet.zap.anonymous')),
    el('span', { class: 'spacer' }),
    anonymousSwitch,
  ]);

  function setAnonymous(next) {
    anonymous = next;
    anonymousSwitch.classList.toggle('is-on', anonymous);
    anonymousSwitch.setAttribute('aria-checked', String(anonymous));
    anonymousHint.hidden = !anonymous;
    actions.updatePrefs?.('zap', { anonymousZaps: anonymous });
  }

  // Exact-amount entry and the anonymous privacy toggle live behind the
  // Advanced disclosure so the default form stays a single tap.
  const customWrap = el('div', { class: 'zap-adv', id: 'zap-adv', hidden: true }, [
    custom,
    anonymousRow,
    anonymousHint,
  ]);

  const valueNode = el('b', { class: 'zap-amount__value' }, `${formatSats(amount)} ${t('wallet.sats')}`);
  const presetButtons = amounts.map((preset) => {
    const node = button(formatSats(preset), { small: true, className: 'zap-preset' });
    node.dataset.amount = String(preset);
    node.setAttribute('aria-label', `${formatSats(preset)} ${t('wallet.sats')}`);
    node.addEventListener('click', () => {
      amount = preset;
      custom.value = '';
      refresh();
    });
    return node;
  });

  const error = el('p', {
    class: 'zap-error',
    id: 'zap-error',
    role: 'status',
    'aria-live': 'polite',
    hidden: true,
  });
  const confirm = button(t('wallet.zap.confirmAmount', { amount: formatSats(amount) }), {
    variant: 'gold',
    type: 'submit',
  });

  const advancedToggle = button(t('wallet.zap.advanced'), {
    small: true,
    className: 'zap-adv-toggle',
    onClick: () => setAdvanced(!advanced),
  });
  advancedToggle.setAttribute('aria-expanded', 'false');
  advancedToggle.setAttribute('aria-controls', 'zap-adv');

  function setAdvanced(next) {
    advanced = next;
    advancedToggle.setAttribute('aria-expanded', String(advanced));
    customWrap.hidden = !advanced;
    if (!advanced) {
      custom.value = '';
      if (!amounts.includes(amount)) amount = amounts[0];
      refresh();
    }
  }

  function validate() {
    if (!hasAddress) return t('wallet.zap.noAddress');
    if (!(amount > 0) || amount < ZAP_AMOUNT_MIN) {
      return t('wallet.zap.tooSmall', { min: formatSats(ZAP_AMOUNT_MIN) });
    }
    if (amount > ZAP_AMOUNT_MAX) {
      return t('wallet.zap.tooLarge', { max: formatSats(ZAP_AMOUNT_MAX) });
    }
    return '';
  }

  function refresh() {
    valueNode.textContent = `${formatSats(amount)} ${t('wallet.sats')}`;
    presetButtons.forEach((node) => {
      const on = Number(node.dataset.amount) === amount && !custom.value;
      node.classList.toggle('is-on', on);
      node.setAttribute('aria-pressed', String(on));
    });
    const message = validate();
    error.textContent = message;
    error.hidden = !message;
    confirm.disabled = busy || !!message;
    confirm.textContent = paying
      ? t('wallet.zap.paying')
      : busy
        ? t('wallet.zap.preparing')
        : t('wallet.zap.confirmAmount', { amount: formatSats(amount) });
  }

  custom.addEventListener('input', () => {
    const next = Math.round(Number(custom.value));
    if (next > 0) amount = next;
    else if (!custom.value) amount = amounts[0];
    refresh();
  });

  async function submit() {
    if (busy || validate()) return;
    busy = true;
    refresh();
    try {
      const text = note.value.trim();
      const request = await actions.createZapInvoice(eventId, peer.id, amount, text, anonymous);
      if (hasWebln) {
        paying = true;
        refresh();
      }
      const paid = await actions.payInvoiceWithWebln?.(request.invoice);
      paying = false;
      if (paid?.paid) {
        actions.recordZap?.({
          peerId: peer.id,
          amountSats: amount,
          eventId,
          requestId: request.requestId,
          note: text,
        });
        actions.toast?.(t('wallet.zap.paid', { amount: formatSats(amount) }), 'ok');
        settle();
        return;
      }
      showInvoice(request);
    } catch (error) {
      busy = false;
      paying = false;
      refresh();
      actions.toast?.(error?.message ?? t('wallet.zap.failed'), 'warn');
    }
  }

  function showForm() {
    stopWatching();
    busy = false;
    paying = false;
    refresh();
    const balanceLine =
      balance > 0
        ? el('p', { class: 'muted small' }, t('wallet.zap.balance', { amount: formatSats(balance) }))
        : null;
    body.replaceChildren(
      el(
        'form',
        {
          class: 'zap-form',
          onSubmit: (event) => {
            event.preventDefault();
            submit();
          },
        },
        [
          identityChip(peer, { size: 36 }),
          el('p', { class: 'muted small' }, t(eventId ? 'wallet.zap.body' : 'wallet.zap.bodyPeer')),
          el(
            'div',
            { class: 'zap-presets', role: 'group', 'aria-label': t('wallet.zap.amountLabel') },
            presetButtons,
          ),
          advancedToggle,
          customWrap,
          note,
          el('div', { class: 'zap-amount' }, [
            el('span', { class: 'muted small' }, t('wallet.zap.amountLabel')),
            valueNode,
          ]),
          balanceLine,
          error,
          el('div', { class: 'arow' }, [
            confirm,
            button(t('common.actions.cancel'), { small: true, onClick: () => close() }),
          ]),
        ],
      ),
    );
  }

  function showInvoice(request) {
    busy = false;
    if (countdown) {
      clearInterval(countdown);
      countdown = null;
    }
    const invoice = request.invoice;
    const uri = `lightning:${invoice}`.toUpperCase();
    const node = qrNode(uri, { cell: 5, margin: 2 });
    const expiry = invoiceExpiry(invoice);
    const expiryLine = expiry
      ? el('p', { class: 'muted small zap-expiry', role: 'status', 'aria-live': 'off' })
      : null;

    // Action hierarchy: one prominent pay action, a manual "I've paid" fallback,
    // and quiet utilities. "New invoice" stays hidden until the invoice actually
    // expires, so the default view has a single clear primary action.
    const openWallet = el(
      'a',
      { class: 'btn btn--gold', href: uri, rel: 'noreferrer' },
      t('wallet.zap.openWallet'),
    );
    const markPaidButton = button(t('wallet.zap.markPaid'), {
      small: true,
      onClick: () => {
        actions.recordZap?.({
          peerId: peer.id,
          amountSats: amount,
          eventId,
          requestId: request.requestId,
          note: note.value.trim(),
          status: 'pending',
        });
        actions.toast?.(t('wallet.zap.verifying'), 'info');
      },
    });
    const newInvoiceButton = button(t('wallet.zap.newInvoice'), {
      variant: 'gold',
      onClick: () => submit(),
    });
    newInvoiceButton.hidden = !!expiry;

    const statusNode = el('div', { class: 'zap-status is-waiting', role: 'status', 'aria-live': 'polite' }, [
      spinner(t('wallet.zap.waiting')),
    ]);
    const waitingHint = el('p', { class: 'muted small' }, t('wallet.zap.waitingHint'));

    body.replaceChildren(
      el('div', { class: 'zap__head' }, [
        identityChip(peer, { size: 36 }),
        el('span', { class: 'zap__amount mono' }, `${formatSats(amount)} ${t('wallet.sats')}`),
      ]),
      el('p', { class: 'muted small' }, t('wallet.zap.scanHint', { amount: formatSats(amount) })),
      el('div', { class: 'qr-wrap' }, [node]),
      el('div', { class: 'zap-invoice' }, [
        el('code', { class: 'zap-invoice__text mono' }, invoice),
        iconButton('lucide:copy', {
          label: t('wallet.zap.copy'),
          fallback: '⧉',
          onClick: () => actions.copyText?.(invoice, t('wallet.zap.copied')),
        }),
      ]),
      statusNode,
      waitingHint,
      expiryLine,
      el('div', { class: 'arow' }, [openWallet, markPaidButton, newInvoiceButton]),
      el('div', { class: 'arow zap-actions-secondary' }, [
        button(t('wallet.zap.changeAmount'), {
          small: true,
          variant: 'ghost',
          onClick: () => showForm(),
        }),
        button(t('common.actions.cancel'), {
          small: true,
          variant: 'ghost',
          onClick: () => close(),
        }),
      ]),
    );
    if (expiryLine && expiry) {
      const tick = () => {
        const left = Math.round((expiry.expiresAtMs - Date.now()) / 1000);
        if (left <= 0) {
          if (countdown) {
            clearInterval(countdown);
            countdown = null;
          }
          expiryLine.textContent = t('wallet.zap.invoiceExpired');
          expiryLine.classList.add('is-expired');
          statusNode.hidden = true;
          waitingHint.hidden = true;
          openWallet.hidden = true;
          markPaidButton.hidden = true;
          newInvoiceButton.hidden = false;
          return;
        }
        expiryLine.textContent = t('wallet.zap.invoiceExpires', { time: formatCountdown(left) });
      };
      tick();
      countdown = setInterval(tick, 1000);
    }
    startWatching(request);
  }

  function startWatching(request) {
    if (!actions.watchZapSettlement) return;
    watching?.close?.();
    watching = actions.watchZapSettlement({
      requestId: request.requestId,
      peerId: peer.id,
      amountSats: amount,
      onSettled: () => settle(),
    });
  }

  function settle() {
    if (settled) return;
    settled = true;
    stopWatching();
    body.replaceChildren(
      el('div', { class: 'zap-status is-done', role: 'status', 'aria-live': 'polite' }, [
        icon('lucide:circle-check', { size: 30, fallback: '✓' }),
        el('b', {}, t('wallet.zap.settledTitle')),
        el('span', { class: 'muted small' }, t('wallet.zap.paid', { amount: formatSats(amount) })),
        button(t('common.actions.done'), { small: true, onClick: () => close() }),
      ]),
    );
    setTimeout(() => close(), SETTLED_HOLD_MS);
  }

  showForm();
  return root;
}
