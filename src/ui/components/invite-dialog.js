import { el } from '../../core/dom.js';
import { inviteRoleLabel } from '../../domain/academy.js';
import { button, noteBox } from './primitives.js';

export function inviteLinkPanel({ invite, copyText, close }) {
  const input = el('input', {
    type: 'text',
    class: 'mono small',
    readOnly: true,
    value: invite.url,
    'aria-label': 'Invite link',
    onFocus: (event) => event.target.select(),
  });

  return [
    el('h2', {}, `Invite ${inviteRoleLabel(invite.role)}`),
    el(
      'p',
      { class: 'muted small' },
      invite.target
        ? `For ${invite.target} — send them this link.`
        : 'Share this link — anyone who opens it can request to join.',
    ),
    el('div', { class: 'invite-link' }, el('span', { class: 'invite-code mono' }, invite.code)),
    el('div', { class: 'input-group' }, [
      input,
      button('Copy', {
        variant: 'gold',
        small: true,
        className: 'input-group__btn',
        onClick: () => copyText(invite.url, 'Invite link copied — share it.'),
      }),
    ]),
    noteBox('The link stops working once the invite is accepted or revoked.'),
    el('div', { class: 'dlg-foot' }, [button('Done', { onClick: close })]),
  ];
}

export function renderInviteTeacher({ actions, close }) {
  const nameInput = el('input', {
    type: 'text',
    placeholder: 'Bob',
    autocomplete: 'name',
    'aria-label': 'Teacher name',
  });
  const targetInput = el('input', {
    type: 'text',
    placeholder: '@bob or npub1…',
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-label': 'Teacher handle or npub',
  });
  const error = el('p', { class: 'small danger', 'aria-live': 'polite' });

  const body = el('div', {}, [
    el('h2', {}, 'Invite a teacher'),
    el('p', { class: 'muted small' }, 'Invite by handle or npub. They stay a teacher — not an owner.'),
    el('label', {}, 'Name (optional)'),
    nameInput,
    el('label', {}, 'Handle or npub'),
    targetInput,
    error,
    noteBox('Teaching a class still needs an explicit class assignment, even after they accept.'),
    el('div', { class: 'dlg-foot' }, [
      button('Cancel', { onClick: close }),
      button('Create invite', {
        variant: 'gold',
        onClick: () => {
          const invite = actions.inviteTeacher({ name: nameInput.value, target: targetInput.value });
          if (!invite) {
            error.textContent = 'Check the handle or npub, then try again.';
            return;
          }
          body.replaceChildren(...inviteLinkPanel({ invite, copyText: actions.copyText, close }));
        },
      }),
    ]),
  ]);

  return body;
}

export function renderInviteLink({ invite, actions, close }) {
  return el('div', {}, inviteLinkPanel({ invite, copyText: actions.copyText, close }));
}
