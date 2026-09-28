import { el } from '../../core/dom.js';
import { inviteRoleLabel } from '../../domain/academy.js';
import { icon } from './icon.js';
import { button, noteBox } from './primitives.js';

export function inviteLinkPanel({ invite, copyText, actions, close }) {
  const input = el('input', {
    type: 'text',
    class: 'mono small',
    readOnly: true,
    value: invite.url,
    'aria-label': 'Invite link',
    onFocus: (event) => event.target.select(),
  });

  const canCheck = Boolean(actions?.checkJoinLink);
  let busy = false;

  const shareTitle = el('span', {}, canCheck ? 'Checking this link…' : 'Open link');
  const shareMsg = el(
    'p',
    { class: 'invite-share__msg muted small' },
    'Anyone with the code can join from another device once it is public.',
  );
  const publishButton = button([icon('lucide:globe', { size: 16, fallback: '🌐' }), 'Publish public link'], {
    variant: 'gold',
    onClick: async () => {
      if (busy) return;
      busy = true;
      publishButton.disabled = true;
      publishButton.replaceChildren(icon('lucide:loader', { size: 16, fallback: '…' }), 'Publishing…');
      shareTitle.replaceChildren('Publishing to relays…');
      await actions?.publishJoinLinkToRelays?.(invite.id);
      busy = false;
      publishButton.disabled = false;
      await verify();
    },
  });
  const shareBox = el('div', { class: 'invite-share', 'aria-live': 'polite' }, [
    el('div', { class: 'invite-share__head' }, [
      el('span', { class: 'invite-share__dot', 'aria-hidden': 'true' }),
      shareTitle,
    ]),
    shareMsg,
    publishButton,
  ]);
  shareBox.hidden = !canCheck;

  async function verify() {
    if (!canCheck) return;
    shareBox.classList.remove('is-live');
    shareTitle.replaceChildren('Checking this link on your relays…');
    shareMsg.textContent = 'Looking for this code on your relays…';
    let live = await actions.checkJoinLink(invite.id);
    if (!live) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      live = await actions.checkJoinLink(invite.id);
    }
    shareBox.classList.toggle('is-live', live);
    shareTitle.replaceChildren(live ? 'Public link is live' : 'Not published yet');
    shareMsg.textContent = live
      ? 'Anyone with this code can join from another device.'
      : 'Publish it so the code is readable on public relays and the link works on other devices.';
    publishButton.replaceChildren(
      icon('lucide:globe', { size: 16, fallback: '🌐' }),
      live ? 'Republish public link' : 'Publish public link',
    );
  }

  verify();

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
      button('Copy link', {
        variant: 'gold',
        small: true,
        className: 'input-group__btn',
        onClick: () => copyText(invite.url, 'Invite link copied — share it.'),
      }),
    ]),
    shareBox,
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
          body.replaceChildren(...inviteLinkPanel({ invite, copyText: actions.copyText, actions, close }));
        },
      }),
    ]),
  ]);

  return body;
}

export function renderInviteLink({ invite, actions, close }) {
  return el('div', {}, inviteLinkPanel({ invite, copyText: actions.copyText, actions, close }));
}
