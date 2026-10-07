import { el } from '../../core/dom.js';
import { bindScreen } from '../../core/reactive.js';
import { formatDate } from '../../core/time.js';
import { getPersona } from '../../data/personas.js';
import {
  ZAP_DIRECTION,
  ZAP_STATUS,
  formatSats,
  sortZaps,
  walletBalance,
  zapsForAccount,
} from '../../domain/wallet.js';
import { t } from '../../services/i18n/index.js';
import { icon } from '../components/icon.js';
import { button, emptyState, pageTitle } from '../components/primitives.js';
import { statusBadge } from '../components/status-badge.js';

export function renderWallet({ app, state }) {
  const node = el('section', { class: 'screen' });

  function render(snapshot) {
    const persona = getPersona(snapshot.personaId);
    const zaps = sortZaps(zapsForAccount(snapshot, snapshot.accountId));
    const connected = Boolean(snapshot.walletConnectedByAccount?.[snapshot.accountId]);

    node.replaceChildren(
      pageTitle(t('wallet.title')),
      balanceCard(walletBalance(zaps), persona, connected, app),
      historyCard(zaps),
      el('p', { class: 'muted small' }, t('wallet.prototypeNote')),
    );
  }

  return bindScreen(state, node, render);
}

function balanceCard(balance, persona, connected, app) {
  const address = String(persona?.lud16 || persona?.lud06 || '').trim();
  const receive = button(t('wallet.receive'), {
    variant: 'gold',
    small: true,
    onClick: () => {
      if (address) app.copyText(address, t('wallet.addressCopied'));
      else app.navigate('/settings');
    },
  });
  const connect = connected
    ? button(t('wallet.disconnect'), { small: true, onClick: () => app.disconnectWallet() })
    : button(t('wallet.connectAction'), { small: true, onClick: () => app.connectWallet() });

  return el('div', { class: 'card wallet-card' }, [
    el('span', { class: 'wallet-card__label' }, t('wallet.balance')),
    el('div', { class: 'wallet-card__amount' }, [
      icon('lucide:zap', { size: 26, fallback: '⚡' }),
      el('b', {}, formatSats(balance)),
      el('span', { class: 'wallet-card__unit' }, t('wallet.sats')),
    ]),
    connected ? el('p', { class: 'muted small' }, t('wallet.connected')) : null,
    el('div', { class: 'arow wallet-card__actions' }, [receive, connect]),
    address
      ? el('p', { class: 'wallet-card__addr mono small' }, address)
      : el('p', { class: 'muted small' }, t('wallet.noAddress')),
  ]);
}

function historyCard(zaps) {
  return el('div', { class: 'card' }, [
    el('h3', {}, t('wallet.history')),
    zaps.length
      ? el('div', { class: 'rows' }, zaps.map(zapRow))
      : emptyState(t('wallet.historyEmpty')),
  ]);
}

function zapRow(zap) {
  const incoming = zap.direction === ZAP_DIRECTION.IN;
  const peer = getPersona(zap.peerId);
  const name = peer?.displayName ?? zap.peerId ?? '';
  const date = formatDate(zap.createdAt);
  const status = zap.status !== ZAP_STATUS.SETTLED ? zap.status : null;
  const tone = status === ZAP_STATUS.FAILED ? 'err' : 'warn';
  return el('div', { class: 'zaprow' }, [
    el(
      'span',
      { class: `zaprow__ico ${incoming ? 'is-in' : 'is-out'}`, 'aria-hidden': 'true' },
      icon(incoming ? 'lucide:arrow-down-left' : 'lucide:arrow-up-right', {
        size: 16,
        fallback: incoming ? '↓' : '↑',
      }),
    ),
    el('span', { class: 'zaprow__body' }, [
      el('strong', {}, t(incoming ? 'wallet.fromName' : 'wallet.toName', { name })),
      zap.note ? el('span', { class: 'muted small' }, zap.note) : null,
    ]),
    el('span', { class: 'spacer' }),
    el('span', { class: 'zaprow__meta' }, [
      el('b', { class: incoming ? 'pos' : 'neg' }, `${incoming ? '+' : '−'}${formatSats(zap.amountSats)}`),
      status ? statusBadge(t('wallet.status.' + status), tone) : null,
      date ? el('span', { class: 'dim small' }, date) : null,
    ]),
  ]);
}
