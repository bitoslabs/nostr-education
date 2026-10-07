import { el } from '../../core/dom.js';
import { getPersona } from '../../data/personas.js';
import { identitySecondary } from '../../domain/identity.js';
import { t } from '../../services/i18n/index.js';
import { avatar, button } from './primitives.js';

const REASON_KEYS = Object.freeze({
  unknown: 'messages.unknownRecipient',
  self: 'messages.cannotMessageSelf',
  empty: 'actions.writeSomethingFirst',
});

// `recipient` locks the compose form to a known person (opened from a profile or
// a post). Without it the user types an npub/hex/handle that `startConversation`
// resolves.
export function renderNewMessage({ actions, close, recipient } = {}) {
  const peer = recipient ? getPersona(recipient.id ?? recipient) : null;
  const locked = Boolean(peer?.id);

  const recipientInput = el('input', {
    id: 'new-message-recipient',
    type: 'text',
    placeholder: t('messages.recipientPlaceholder'),
    autocomplete: 'off',
    spellcheck: 'false',
  });
  const body = el('textarea', {
    id: 'new-message-body',
    rows: '4',
    placeholder: t('messages.bodyPlaceholder'),
  });
  const error = el('p', { class: 'small danger', 'aria-live': 'polite' });

  const recipientField = locked
    ? el('div', { class: 'msg-recipient' }, [
        avatar(peer, 32),
        el('span', { class: 'msg-recipient__body' }, [
          el('strong', {}, peer.displayName),
          el('span', { class: 'mono small muted' }, identitySecondary(peer)),
        ]),
      ])
    : recipientInput;

  const form = el(
    'form',
    {
      class: 'stack',
      onSubmit: (event) => {
        event.preventDefault();
        error.textContent = '';
        const reference = locked ? peer.id : recipientInput.value;
        const result = actions.startConversation(reference, body.value);
        if (result?.ok) {
          close();
          return;
        }
        const key = REASON_KEYS[result?.reason] ?? 'messages.unknownRecipient';
        error.textContent = t(key);
      },
    },
    [
      locked ? null : el('label', { for: 'new-message-recipient' }, t('messages.recipientLabel')),
      recipientField,
      el('label', { for: 'new-message-body' }, t('messages.bodyLabel')),
      body,
      error,
      el('div', { class: 'arow' }, [button(t('messages.start'), { variant: 'gold', type: 'submit' })]),
    ],
  );

  if (locked) queueMicrotask(() => body.focus());
  return form;
}
