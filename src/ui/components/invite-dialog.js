import { el } from '../../core/dom.js';
import { ROLE } from '../../domain/school.js';
import { t } from '../../services/i18n/index.js';
import { icon } from './icon.js';
import { button, noteBox } from './primitives.js';

const INVITE_ROLE_KEYS = Object.freeze({
  [ROLE.TEACHER]: 'organization.invite.roleTeacher',
  [ROLE.OWNER]: 'organization.invite.roleAdmin',
  [ROLE.STUDENT]: 'organization.invite.roleLearner',
});

export function inviteLinkPanel({ invite, copyText, actions, close }) {
  const input = el('input', {
    type: 'text',
    class: 'mono small',
    readOnly: true,
    value: invite.url,
    'aria-label': t('organization.invite.linkAria'),
    onFocus: (event) => event.target.select(),
  });

  const canCheck = Boolean(actions?.checkJoinLink);
  let busy = false;

  const shareTitle = el('span', {}, canCheck ? t('organization.invite.checking') : t('organization.invite.openLink'));
  const shareMsg = el(
    'p',
    { class: 'invite-share__msg muted small' },
    t('organization.invite.shareMsg'),
  );
  const publishButton = button([icon('lucide:globe', { size: 16, fallback: '🌐' }), t('organization.invite.publish')], {
    variant: 'gold',
    onClick: async () => {
      if (busy) return;
      busy = true;
      publishButton.disabled = true;
      publishButton.replaceChildren(icon('lucide:loader', { size: 16, fallback: '…' }), t('organization.invite.publishing'));
      shareTitle.replaceChildren(t('organization.invite.publishingToRelays'));
      const published = await actions?.publishJoinLinkToRelays?.(invite.id);
      busy = false;
      publishButton.disabled = false;
      if (published) {
        showLive();
        return;
      }
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

  function showLive() {
    shareBox.classList.add('is-live');
    shareTitle.replaceChildren(t('organization.invite.live'));
    shareMsg.textContent = t('organization.invite.liveMsg');
    publishButton.replaceChildren(
      icon('lucide:globe', { size: 16, fallback: '🌐' }),
      t('organization.invite.republish'),
    );
  }

  async function verify() {
    if (!canCheck) return;
    shareBox.classList.remove('is-live');
    shareTitle.replaceChildren(t('organization.invite.checkingRelays'));
    shareMsg.textContent = t('organization.invite.lookingForCode');
    let live = await actions.checkJoinLink(invite.id);
    if (!live) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      live = await actions.checkJoinLink(invite.id);
    }
    if (live) {
      showLive();
      return;
    }
    shareBox.classList.remove('is-live');
    shareTitle.replaceChildren(t('organization.invite.notPublished'));
    shareMsg.textContent = t('organization.invite.notPublishedMsg');
    publishButton.replaceChildren(
      icon('lucide:globe', { size: 16, fallback: '🌐' }),
      t('organization.invite.publish'),
    );
  }

  verify();

  const role = t(INVITE_ROLE_KEYS[invite.role] ?? 'organization.invite.roleLearner');
  return [
    el('h2', {}, t('organization.invite.title', { role })),
    el(
      'p',
      { class: 'muted small' },
      invite.target
        ? t('organization.invite.forTarget', { target: invite.target })
        : t('organization.invite.shareLink'),
    ),
    el('div', { class: 'invite-link' }, el('span', { class: 'invite-code mono' }, invite.code)),
    el('div', { class: 'input-group' }, [
      input,
      button(t('organization.copyLink'), {
        variant: 'gold',
        small: true,
        className: 'input-group__btn',
        onClick: () => copyText(invite.url, t('organization.invite.copied')),
      }),
    ]),
    shareBox,
    noteBox(t('organization.invite.note')),
    el('div', { class: 'dlg-foot' }, [button(t('common.actions.done'), { onClick: close })]),
  ];
}

export function renderInviteTeacher({ actions, close }) {
  const nameInput = el('input', {
    type: 'text',
    placeholder: t('organization.inviteTeacher.namePlaceholder'),
    autocomplete: 'name',
    'aria-label': t('organization.inviteTeacher.nameAria'),
  });
  const targetInput = el('input', {
    type: 'text',
    placeholder: t('organization.inviteTeacher.targetPlaceholder'),
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-label': t('organization.inviteTeacher.targetAria'),
  });
  const error = el('p', { class: 'small danger', 'aria-live': 'polite' });

  const body = el('div', {}, [
    el('h2', {}, t('organization.inviteTeacher.title')),
    el('p', { class: 'muted small' }, t('organization.inviteTeacher.subtitle')),
    el('label', {}, t('organization.inviteTeacher.nameLabel')),
    nameInput,
    el('label', {}, t('organization.inviteTeacher.targetLabel')),
    targetInput,
    error,
    noteBox(t('organization.inviteTeacher.note')),
    el('div', { class: 'dlg-foot' }, [
      button(t('common.actions.cancel'), { onClick: close }),
      button(t('organization.inviteTeacher.submit'), {
        variant: 'gold',
        onClick: () => {
          const invite = actions.inviteTeacher({ name: nameInput.value, target: targetInput.value });
          if (!invite) {
            error.textContent = t('organization.inviteTeacher.error');
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
