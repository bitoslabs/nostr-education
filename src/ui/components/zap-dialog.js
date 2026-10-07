import { el } from '../../core/dom.js';
import { formatSats } from '../../domain/wallet.js';
import { qrNode } from '../../services/qr.js';
import { t } from '../../services/i18n/index.js';
import { icon } from './icon.js';
import { identityChip } from './identity-chip.js';
import { button, spinner } from './primitives.js';

const DEFAULT_PRESETS = [21, 100, 500, 1000];
const SETTLED_HOLD_MS = 900;

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
  balance = 0,
  registerCleanup,
}) {
  const amounts = normalizePresets(presets);
  let amount = amounts[0];
  let busy = false;
  let settled = false;
  let watching = null;

  const root = el('div', { class: 'zap' });

  function stopWatching() {
    watching?.close?.();
    watching = null;
  }
  registerCleanup?.(stopWatching);

  const custom = el('input', {
    class: 'zap-custom',
    type: 'number',
    min: '1',
    inputmode: 'numeric',
    placeholder: t('wallet.zap.custom'),
    'aria-label': t('wallet.zap.amountLabel'),
  });

  const valueNode = el('b', { class: 'zap-amount__value' }, `${formatSats(amount)} ${t('wallet.sats')}`);
  const presetButtons = amounts.map((preset) => {
    const node = button(formatSats(preset), { small: true, className: 'zap-preset' });
    node.dataset.amount = String(preset);
    node.addEventListener('click', () => {
      amount = preset;
      custom.value = '';
      refresh();
    });
    return node;
  });

  const confirm = button(t('wallet.zap.confirm'), { variant: 'gold', type: 'submit' });

  function refresh() {
    valueNode.textContent = `${formatSats(amount)} ${t('wallet.sats')}`;
    presetButtons.forEach((node) => {
      const on = Number(node.dataset.amount) === amount && !custom.value;
      node.classList.toggle('is-on', on);
      node.setAttribute('aria-pressed', String(on));
    });
    confirm.disabled = busy || !(amount > 0);
    confirm.textContent = busy ? t('wallet.zap.preparing') : t('wallet.zap.confirm');
  }

  custom.addEventListener('input', () => {
    const next = Math.round(Number(custom.value));
    if (next > 0) amount = next;
    else if (!custom.value) amount = amounts[0];
    refresh();
  });

  async function submit() {
    if (busy || !(amount > 0)) return;
    busy = true;
    refresh();
    try {
      const request = await actions.createZapInvoice(eventId, peer.id, amount);
      const paid = await actions.payInvoiceWithWebln?.(request.invoice);
      if (paid?.paid) {
        actions.recordZap?.({
          peerId: peer.id,
          amountSats: amount,
          eventId,
          requestId: request.requestId,
          note: '',
        });
        actions.toast?.(t('wallet.zap.paid', { amount: formatSats(amount) }), 'ok');
        settle();
        return;
      }
      showInvoice(request);
    } catch (error) {
      busy = false;
      refresh();
      actions.toast?.(error?.message ?? t('wallet.zap.failed'), 'warn');
    }
  }

  function showForm() {
    stopWatching();
    busy = false;
    refresh();
    const balanceLine =
      balance > 0
        ? el('p', { class: 'muted small' }, t('wallet.zap.balance', { amount: formatSats(balance) }))
        : null;
    root.replaceChildren(
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
          el('div', { class: 'zap-presets' }, presetButtons),
          custom,
          el('div', { class: 'zap-amount' }, [
            el('span', { class: 'muted small' }, t('wallet.zap.amountLabel')),
            valueNode,
          ]),
          balanceLine,
          el('div', { class: 'arow' }, [
            confirm,
            button(t('common.actions.cancel'), { small: true, onClick: () => close() }),
          ]),
        ],
      ),
    );
  }

  function showInvoice(request) {
    const invoice = request.invoice;
    const uri = `lightning:${invoice}`.toUpperCase();
    const node = qrNode(uri, { cell: 5, margin: 2 });
    root.replaceChildren(
      el('div', { class: 'zap__head' }, [
        identityChip(peer, { size: 36 }),
        el('span', { class: 'zap__amount mono' }, `${formatSats(amount)} ${t('wallet.sats')}`),
      ]),
      el('p', { class: 'muted small' }, t('wallet.zap.scanHint', { amount: formatSats(amount) })),
      el('div', { class: 'qr-wrap' }, [node]),
      el('div', { class: 'zap-invoice' }, [
        el('code', { class: 'zap-invoice__text mono' }, invoice),
        button(t('wallet.zap.copy'), {
          small: true,
          onClick: () => actions.copyText?.(invoice, t('wallet.zap.copied')),
        }),
      ]),
      el('div', { class: 'zap-status is-waiting', role: 'status', 'aria-live': 'polite' }, [
        spinner(t('wallet.zap.waiting')),
      ]),
      el('p', { class: 'muted small' }, t('wallet.zap.waitingHint')),
      el('div', { class: 'arow' }, [
        el('a', { class: 'btn btn--ghost', href: uri, rel: 'noreferrer' }, t('wallet.zap.openWallet')),
        button(t('wallet.zap.markPaid'), {
          small: true,
          onClick: () => {
            actions.recordZap?.({
              peerId: peer.id,
              amountSats: amount,
              eventId,
              requestId: request.requestId,
              note: '',
              status: 'pending',
            });
            actions.toast?.(t('wallet.zap.verifying'), 'info');
          },
        }),
            button(t('common.actions.cancel'), { small: true, onClick: () => close() }),
      ]),
    );
    startWatching(request);
  }

  function startWatching(request) {
    if (!actions.watchZapSettlement) return;
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
    root.replaceChildren(
      el('div', { class: 'zap-status is-done', role: 'status', 'aria-live': 'polite' }, [
        icon('lucide:circle-check', { size: 30, fallback: '✓' }),
        el('b', {}, t('wallet.zap.settledTitle')),
        el('span', { class: 'muted small' }, t('wallet.zap.paid', { amount: formatSats(amount) })),
      ]),
    );
    setTimeout(() => close(), SETTLED_HOLD_MS);
  }

  showForm();
  return root;
}
