import { el } from '../core/dom.js';
import { navigate } from '../core/router.js';
import { DEFAULT_SIGNER, isNpub, isKeyLike } from '../domain/account.js';
import {
  KIND,
  buildEvent,
  decodeKey,
  encodeNpub,
  extensionSigner,
  generateKeyPair,
  localSigner,
  publicKeyFromSecret,
  encodeNsec,
} from '../services/nostr.js';
import { APP_TAG, decodeRecord, encodeRecord, recordTags } from '../services/records.js';
import { normalizeBlossomServer, uploadBlob } from '../services/blossom.js';
import { RECORD_TYPES, toPublicRecord } from '../domain/records.js';
import { buildScoreSheet, normalizeRubric, rubricMax, scoresComplete, scoresTotal } from '../domain/rubric.js';
import { credentialPayload, credentialProofContent, revocationPayload } from '../domain/credential.js';
import { ACTION, authorize } from '../domain/authorization.js';
import { clearState, loadOrgSecret, saveOrgSecret, saveSecretKey } from '../services/storage.js';
import {
  ACADEMY_TYPES,
  INVITE_STATUS,
  createInvite,
  findAcademyById,
  findInviteByCode,
  inviteRoleLabel,
  inviteUrl,
  orgProfileContent,
  parseInviteReference,
} from '../domain/academy.js';
import {
  CLASS_STATUS,
  HOMEWORK_STATUS,
  SUBMISSION_STATUS,
  classroomActivity,
  classroomById,
  homeworkForClassroom,
  isEnrollable,
  isHomeworkOpen,
  isValidScore,
  subjectById,
  subjectInUse,
  submissionFor,
} from '../domain/classroom.js';
import { evaluateCompletion, normalizePolicy } from '../domain/completion.js';
import { DELIVERY_STATE } from '../domain/delivery.js';
import { normalizeHandle, validateHandle } from '../domain/handle.js';
import { truncateNpub } from '../domain/identity.js';
import { normalizeUrl, parseProfileMeta, profileContent } from '../domain/profile.js';
import {
  addRelay as addRelayToList,
  nextRelayMode,
  normalizeRelayUrl,
  relayModeLabel,
  removeRelay as removeRelayFromList,
  setRelayMode as setRelayModeInList,
} from '../domain/relay.js';
import {
  MEMBERSHIP,
  REQUEST_STATUS,
  ROLE,
} from '../domain/school.js';
import {
  clearRegistry,
  findPersonaByKey,
  getPersona,
  getPersonaIds,
  hasPersona,
  registerPersona,
} from '../data/personas.js';

let sequence = 0;

function nextId(prefix) {
  sequence += 1;
  return `${prefix}${Date.now().toString(36)}${sequence}`;
}

function membershipOf(state, personaId) {
  return state.memberships?.[personaId] ?? MEMBERSHIP.NONE;
}

export function createActions({ store, bus, signer, confirm, relay }) {
  const state = () => store.getState();
  const update = (patch) => store.setState(patch);
  const toast = (message, tone = 'info') => bus.emit('toast', { message, tone });

  function navigateTo(route) {
    if (state().route === route) {
      store.setState({});
      return;
    }
    navigate(route);
  }

  function setFeedTab(feedTab) {
    update({ feedTab });
  }

  function setRoleTab(roleTab) {
    update({ roleTab });
  }

  function setOrgTab(orgTab) {
    update({ orgTab });
  }

  function setSettingsSection(section) {
    update({ settingsSection: section ?? null });
  }

  function setGradebookClass(gradebookClassId) {
    update({ gradebookClassId: gradebookClassId ?? null });
  }

  async function copyText(text, label = 'Copied') {
    try {
      await navigator.clipboard.writeText(String(text));
      toast(label, 'ok');
      return true;
    } catch {
      toast('Copy failed — select the text and copy manually.', 'warn');
      return false;
    }
  }

  function appBase() {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}${window.location.pathname}`;
  }

  function academyById(current, id) {
    return Object.values(current.academies ?? {}).find((academy) => academy.id === id) ?? null;
  }

  function ownedAcademy(current, personaId) {
    return current.academies?.[personaId] ?? null;
  }

  function classroomContext(current, classroom) {
    return {
      actor: current.personaId,
      classroom,
      academy: findAcademyById(current.academies ?? {}, classroom?.academyId),
    };
  }

  function canManageClassroom(current, classroom) {
    return authorize(ACTION.MANAGE_CLASSROOM, classroomContext(current, classroom));
  }

  function homeworkRecipients(classroom) {
    return [classroom?.teacherId, ...(classroom?.studentIds ?? [])].filter(Boolean);
  }

  function normalizeInviteTarget(raw) {
    const value = String(raw ?? '').trim();
    if (!value) {
      toast('Enter a handle or npub.', 'warn');
      return null;
    }
    if (isNpub(value)) return value;
    const result = validateHandle(value.replace(/^@/, '').split('@')[0]);
    if (!result.valid) {
      toast(handleError(result.reason, result.handle), 'warn');
      return null;
    }
    return `${result.handle}@bitos.id`;
  }

  function applyInvite(invite) {
    const current = state();
    const persona = getPersona(current.personaId);
    const academy = academyById(current, invite.academyId);
    const invites = current.invites.map((entry) =>
      entry.id === invite.id ? { ...entry, status: INVITE_STATUS.ACCEPTED, acceptedBy: persona.id } : entry,
    );
    const list = current.classrooms ?? [];
    const classroom = invite.classroomId ? classroomById(list, invite.classroomId) : null;
    const academyMembership = (status) => [
      ...(current.academyMemberships ?? []).filter(
        (entry) => !(entry.accountId === persona.id && entry.academyId === invite.academyId),
      ),
      {
        academyId: invite.academyId,
        accountId: persona.id,
        role: invite.role,
        status,
        sourceInviteId: invite.id,
        joinedAt: new Date().toISOString(),
      },
    ];
    const classrooms = classroom
      ? list.map((room) => {
          if (room.id !== classroom.id) return room;
          if (invite.role === ROLE.TEACHER) {
            return { ...room, teacherId: persona.id, status: CLASS_STATUS.PUBLISHED };
          }
          const students = room.studentIds ?? [];
          return students.includes(persona.id) ? room : { ...room, studentIds: [...students, persona.id] };
        })
      : list;

    if (invite.role === ROLE.TEACHER) {
      registerPersona({ ...persona, role: ROLE.TEACHER });
      update({
        invites,
        classrooms,
        pendingInviteCode: null,
        membership: MEMBERSHIP.ACTIVE,
        memberships: { ...current.memberships, [persona.id]: MEMBERSHIP.ACTIVE },
        academyMemberships: academyMembership(MEMBERSHIP.ACTIVE),
        events: [
          {
            id: nextId('e'),
            type: 'member',
            author: 'academy',
            time: 'now',
            context: classroom?.name ?? academy?.name ?? 'Academy',
            audience: [persona.id],
            text: classroom
              ? `joined ${classroom.name} as its teacher.`
              : `Welcome — you joined ${academy?.name ?? 'the academy'} as a teacher.`,
          },
          ...current.events,
        ],
      });
      toast(
        classroom
          ? `You teach ${classroom.name} — post homework when ready.`
          : `You're a teacher at ${academy?.name ?? 'the academy'} — class tools unlocked.`,
        'ok',
      );
      return true;
    }

    if (classroom) {
      update({
        invites,
        classrooms,
        pendingInviteCode: null,
        membership: MEMBERSHIP.ACTIVE,
        memberships: { ...current.memberships, [persona.id]: MEMBERSHIP.ACTIVE },
        academyMemberships: academyMembership(MEMBERSHIP.ACTIVE),
        events: [
          {
            id: nextId('e'),
            type: 'member',
            author: 'academy',
            time: 'now',
            context: classroom.name,
            audience: [persona.id],
            text: `enrolled in ${classroom.name}.`,
          },
          ...current.events,
        ],
      });
      toast(`You're enrolled in ${classroom.name} — homework is in Education.`, 'ok');
      return true;
    }

    const existingRequest = (current.joinRequests ?? []).find(
      (request) =>
        request.accountId === persona.id &&
        request.status === REQUEST_STATUS.PENDING &&
        (request.academyId === invite.academyId ||
          (!request.academyId && academy?.name && request.academy === academy.name)),
    );
    const joinId = existingRequest?.id ?? nextId('jr');
    const joinRequests = existingRequest
      ? current.joinRequests
      : [
          {
            id: joinId,
            academyId: invite.academyId,
            accountId: persona.id,
            displayName: persona.displayName,
            handle: persona.handle,
            academy: academy?.name ?? 'Academy',
            role: persona.role,
            time: 'now',
            status: REQUEST_STATUS.PENDING,
          },
          ...current.joinRequests,
        ];
    const joinRequest = existingRequest ?? joinRequests[0];
    update({
      invites,
      pendingInviteCode: null,
      membership: MEMBERSHIP.PENDING,
      memberships: { ...current.memberships, [persona.id]: MEMBERSHIP.PENDING },
      academyMemberships: academyMembership(MEMBERSHIP.PENDING),
      joinRequests,
      events: existingRequest
        ? current.events
        : [
            {
              id: nextId('e'),
              type: 'joinreq',
              author: persona.id,
              time: 'now',
              context: academy?.name ?? 'Academy',
              audience: [academy?.ownerId ?? 'nadia'],
              requestId: joinId,
              text: `accepted the invite link and requested to join ${academy?.name ?? 'the academy'} as a learner.`,
            },
            ...current.events,
          ],
    });
    if (academy?.ownerId) {
      publishRecord({
        type: RECORD_TYPES.JOIN_REQUEST,
        id: joinRequest.id,
        payload: joinRequest,
        recipients: [academy.ownerId],
        encrypted: true,
        title: 'Request academy membership',
        action: el('span', {}, `Request to join ${academy.name} as a learner.`),
      });
    }
    toast(
      existingRequest
        ? 'Your membership request is already awaiting approval.'
        : 'Invite accepted — the owner approves memberships next.',
      'info',
    );
    return true;
  }

  function acceptPendingInvite() {
    const code = state().pendingInviteCode;
    if (!code) return false;
    const invite = findInviteByCode(state().invites, code);
    if (!invite || invite.status !== INVITE_STATUS.PENDING) {
      update({ pendingInviteCode: null });
      return false;
    }
    return applyInvite(invite);
  }

  function relaySnapshot(published) {
    return (published?.ok ?? []).map((url, index) => ({
      id: `del-${Date.now().toString(36)}-${index}`,
      label: url,
      state: 'delivered',
    }));
  }

  async function signAndPublish({ title, action, detail, kind = KIND.APP_DATA, tags = [], content = '' }) {
    if (!signer.canSign()) {
      toast('Connect a signer to sign this action.', 'warn');
      return null;
    }
    const event = buildEvent({ kind, tags, content });
    let signed;
    try {
      const result = await signer.request({ title, action, detail, event });
      if (!result.approved) return null;
      signed = result.event;
    } catch (error) {
      toast(error?.message ?? 'Signing failed.', 'warn');
      return null;
    }

    const published = await relay.publish(signed);
    if (!published.count) toast('Signed, but no relay accepted the event yet.', 'warn');
    else toast(`Signed and published to ${published.count}/${published.total} relays.`, 'ok');
    return { event: signed, published };
  }

  function recordPayload(type, id, payload) {
    return {
      tags: recordTags(type, id),
      content: encodeRecord(type, id, payload),
    };
  }

  function newAcademy({ name, type = 'school', timeZone = 'UTC', ownerId }) {
    const id = nextId('org');
    const pair = generateKeyPair();
    saveOrgSecret(id, pair.secretKey, encodeNsec);
    return {
      id,
      name,
      type,
      timeZone,
      ownerId,
      about: '',
      picture: null,
      orgPubkey: pair.pubkey,
      orgNpub: pair.npub,
      createdAt: new Date().toISOString(),
    };
  }

  function registerAcademyPersona(academy) {
    if (!academy?.orgPubkey) return null;
    return registerPersona({
      id: academy.orgPubkey,
      npub: academy.orgNpub ?? encodeNpub(academy.orgPubkey),
      displayName: academy.name,
      about: academy.about ?? '',
      picture: academy.picture ?? null,
      avatar: '🏫',
    });
  }

  function ensureOrgIdentity(academy) {
    const existing = loadOrgSecret(academy.id, decodeKey);
    if (existing) {
      const pubkey = publicKeyFromSecret(existing);
      return { secretKey: existing, pubkey, npub: encodeNpub(pubkey) };
    }
    if (academy.orgPubkey) return null;
    const pair = generateKeyPair();
    saveOrgSecret(academy.id, pair.secretKey, encodeNsec);
    return { secretKey: pair.secretKey, pubkey: pair.pubkey, npub: pair.npub };
  }

  async function publishOrgProfile(academy) {
    const identity = ensureOrgIdentity(academy);
    if (!identity) {
      toast('The organization key for this academy is not available on this device.', 'warn');
      return null;
    }
    const orgSigner = localSigner(identity.secretKey);
    const event = buildEvent({
      kind: KIND.PROFILE,
      content: JSON.stringify(orgProfileContent(academy)),
    });
    try {
      const signed = await orgSigner.signEvent(event);
      const published = await relay.publish(signed);
      if (!published.count) toast('Organization profile signed, but no relay accepted it yet.', 'warn');
      return { event: signed, published };
    } catch (error) {
      toast(error?.message ?? 'The organization profile could not be published.', 'warn');
      return null;
    }
  }

  async function publishProfileEvent(persona, { title, action } = {}) {
    return signAndPublish({
      title,
      action,
      kind: KIND.PROFILE,
      content: JSON.stringify(profileContent(persona)),
    });
  }

  async function updateProfile(fields = {}) {
    const persona = getPersona(state().personaId);
    const displayName = String(fields.displayName ?? '').trim();
    if (!displayName) {
      toast('Add a display name before saving.', 'warn');
      return false;
    }
    const next = {
      ...persona,
      displayName,
      name: String(fields.name ?? '').trim() || persona.name || '',
      about: String(fields.about ?? '').trim(),
      picture: normalizeUrl(fields.picture),
      banner: normalizeUrl(fields.banner),
      handle: String(fields.handle ?? '').trim() || persona.handle || null,
      lud16: String(fields.lud16 ?? '').trim() || null,
      lud06: String(fields.lud06 ?? '').trim() || persona.lud06 || null,
      website: normalizeUrl(fields.website),
      bot: fields.bot === true,
    };
    const published = await publishProfileEvent(next, {
      title: 'Update profile',
      action: el('span', {}, [
        el('strong', {}, 'Publish profile'),
        el('br'),
        `${displayName} · `,
        el('span', { class: 'mono' }, truncateNpub(persona.npub)),
      ]),
    });
    if (!published) return false;

    const updated = registerPersona(next);
    update({
      profiles: { ...state().profiles, [updated.id]: updated },
      session:
        state().session?.pubkey === updated.id
          ? {
              ...state().session,
              displayName: updated.displayName,
              name: updated.name,
              about: updated.about,
              picture: updated.picture,
              banner: updated.banner,
              handle: updated.handle,
            }
          : state().session,
    });
    toast('Profile published to your relays.', 'ok');
    return true;
  }

  async function uploadImage(blob, { server } = {}) {
    if (!blob) return null;
    if (!signer.canSign()) {
      toast('Connect a signer to upload images.', 'warn');
      return null;
    }
    const target = normalizeBlossomServer(server ?? state().blossomServer);
    try {
      toast('Uploading image to Blossom…', 'info');
      const result = await uploadBlob({
        blob,
        server: target,
        signer,
        title: 'Upload image',
        action: el('span', {}, [
          el('strong', {}, 'Upload to Blossom'),
          el('br'),
          `${target.replace(/^https?:\/\//, '')} · ${Math.max(1, Math.round(blob.size / 1024))} KB`,
        ]),
      });
      if (!result) return null;
      toast('Image uploaded.', 'ok');
      return result.url;
    } catch (error) {
      toast(error?.message ?? 'Image upload failed.', 'warn');
      return null;
    }
  }

  function setBlossomServer(server) {
    update({ blossomServer: normalizeBlossomServer(server) });
  }

  function fetchProfile(targetId) {
    const me = targetId ?? state().accountId;
    if (!me) return Promise.resolve(null);
    return new Promise((resolve) => {
      let settled = false;
      let sub = null;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        sub?.close?.();
        resolve(value);
      };
      const timer = setTimeout(() => finish(null), 7000);
      sub = relay.subscribe([{ kinds: [KIND.PROFILE], authors: [me] }], {
        onEvent: (event) => {
          if (event.pubkey !== me) return;
          const meta = parseProfileMeta(event.content);
          if (!meta) return;
          const existing = getPersona(me);
          const merged = registerPersona({
            ...existing,
            id: me,
            npub: encodeNpub(me),
            displayName: meta.displayName || existing.displayName,
            name: meta.name ?? existing.name,
            about: meta.about || existing.about,
            picture: meta.picture ?? existing.picture,
            banner: meta.banner ?? existing.banner,
            handle: meta.handle ?? existing.handle,
            lud16: meta.lud16 ?? existing.lud16,
            lud06: meta.lud06 ?? existing.lud06,
            website: meta.website ?? existing.website,
            bot: meta.bot ?? existing.bot,
            raw: meta.raw,
          });
          update({
            profiles: { ...state().profiles, [me]: merged },
            session:
              state().session?.pubkey === me
                ? {
                    ...state().session,
                    displayName: merged.displayName,
                    name: merged.name,
                    about: merged.about,
                    picture: merged.picture,
                    banner: merged.banner,
                    handle: merged.handle,
                  }
                : state().session,
          });
          finish(merged);
        },
      });
    });
  }

  async function refreshMyProfile() {
    const me = state().accountId;
    if (!me) return false;
    toast('Fetching your profile from relays…', 'info');
    const result = await fetchProfile(me);
    toast(
      result ? 'Profile refreshed from relays.' : 'No kind:0 profile found on your relays yet.',
      result ? 'ok' : 'warn',
    );
    return Boolean(result);
  }

  function recipientPubkey(target) {
    return decodeKey(target)?.pubkey ?? null;
  }
  async function signRecord(event, { title, action, detail } = {}) {
    const active = signer.getSigner();
    if (!active) return null;
    if (active.method === 'local') return active.signEvent(event);
    const result = await signer.request({ title, action, detail, event });
    return result.approved ? result.event : null;
  }

  function publishRecord({ type, id, payload, recipients = [], encrypted = false, title, action, detail } = {}) {
    if (!signer.canSign()) return Promise.resolve(null);
    const plaintext = encodeRecord(type, id, payload);

    const run = async () => {
      if (encrypted) {
        if (!signer.canEncrypt()) {
          toast('This signer cannot encrypt, so the record stays on this device.', 'warn');
          return null;
        }
        let last = null;
        for (const recipient of recipients.filter(Boolean)) {
          const ciphertext = await signer.encrypt(recipient, plaintext);
          const event = buildEvent({
            kind: KIND.APP_DATA,
            tags: recordTags(type, id, { recipients: [recipient] }),
            content: ciphertext,
          });
          const signed = await signRecord(event, { title, action, detail });
          if (!signed) return last;
          last = await relay.publish(signed);
        }
        if (last) update({ deliveries: [...relaySnapshot(last), ...state().deliveries] });
        return last;
      }

      const event = buildEvent({
        kind: KIND.APP_DATA,
        tags: recordTags(type, id, { code: type === RECORD_TYPES.JOIN_LINK ? payload?.code : null }),
        content: plaintext,
      });
      const signed = await signRecord(event, { title, action, detail });
      if (!signed) return null;
      const published = await relay.publish(signed);
      update({ deliveries: [...relaySnapshot(published), ...state().deliveries] });
      return published;
    };

    return run().catch((error) => {
      toast(error?.message ?? 'The record could not be published.', 'warn');
      return null;
    });
  }

  function applySession({ method, pubkey, profile = {}, activeSigner }) {
    signer.setSigner(activeSigner ?? null);
    const account = registerPersona({
      id: pubkey,
      npub: encodeNpub(pubkey),
      displayName: profile.displayName,
      about: profile.about ?? '',
      picture: profile.picture ?? null,
      handle: profile.handle ?? null,
      role: profile.role ?? null,
    });
    const session = {
      method,
      pubkey,
      npub: account.npub,
      displayName: account.displayName,
      about: account.about,
      picture: account.picture,
      handle: account.handle,
      role: account.role,
      createdAt: new Date().toISOString(),
    };
    update({
      authed: true,
      session,
      accountId: pubkey,
      personaId: pubkey,
      signerType: method,
      profiles: { ...state().profiles, [pubkey]: account },
    });
    return session;
  }

  async function signInWithExtension() {
    if (!signer.canSign() && !globalThis.window?.nostr) {
      toast('No Nostr extension (NIP-07) was found.', 'warn');
      return false;
    }
    let pubkey;
    try {
      const active = extensionSigner();
      pubkey = await active.getPublicKey();
      applySession({ method: 'extension', pubkey, profile: {}, activeSigner: active });
    } catch (error) {
      toast(error?.message ?? 'The extension refused the request.', 'warn');
      return false;
    }
    acceptPendingInvite();
    navigateTo('/home');
    toast('Signed in with your browser extension.', 'ok');
    return true;
  }

  async function createAccount({
    displayName,
    handle,
    role = ROLE.STUDENT,
    joinAcademy = true,
    signerTypeId = DEFAULT_SIGNER,
    academyName,
    academyType = 'school',
  } = {}) {
    const name = String(displayName ?? '').trim();
    if (!name) {
      toast('Enter a display name first.', 'warn');
      return false;
    }

    const requested = String(handle ?? '').trim().replace(/^@/, '');
    let resolvedHandle = '';
    if (requested) {
      const result = validateHandle(requested);
      if (!result.valid) {
        toast(handleError(result.reason, result.handle), 'warn');
        return false;
      }
      if (handleTaken(result.handle)) {
        toast(`@${result.handle} is taken — try another.`, 'warn');
        return false;
      }
      resolvedHandle = result.handle;
    }

    const current = state();
    const isOwner = role === ROLE.OWNER;
    const pendingInvite = current.pendingInviteCode;
    const requestedAcademy = String(academyName ?? '').trim() || `${name}'s Academy`;

    if (signerTypeId === 'bunker') {
      toast('Connect a bunker from sign-in, then create your account.', 'warn');
      return false;
    }

    let activeSigner;
    let pubkey;
    if (signerTypeId === 'extension') {
      activeSigner = extensionSigner();
      try {
        pubkey = await activeSigner.getPublicKey();
      } catch (error) {
        toast(error?.message ?? 'The extension refused the request.', 'warn');
        return false;
      }
    } else {
      const keyPair = generateKeyPair();
      pubkey = keyPair.pubkey;
      saveSecretKey(keyPair.secretKey, encodeNsec);
      activeSigner = localSigner(keyPair.secretKey);
    }

    const account = applySession({
      method: signerTypeId,
      pubkey,
      profile: { displayName: name, handle: resolvedHandle || null, role },
      activeSigner,
    });

    await signAndPublish({
      title: 'Publish profile',
      action: el('span', {}, [
        el('strong', {}, 'Publish profile'),
        el('br'),
        `${name} · `,
        el('span', { class: 'mono' }, truncateNpub(account.npub)),
      ]),
      kind: KIND.PROFILE,
      content: JSON.stringify({ name, about: '' }),
    });

    const academy = isOwner
      ? newAcademy({ name: requestedAcademy, type: academyType, ownerId: pubkey })
      : null;

    if (academy) {
      await signAndPublish({
        title: 'Create academy',
        action: el('span', {}, [
          el('strong', {}, `Create ${requestedAcademy}`),
          el('br'),
          'You become the owner and can invite teachers and learners.',
        ]),
        ...recordPayload('academy', academy.id, academy),
      });
      registerAcademyPersona(academy);
      await publishOrgProfile(academy);
    }

    const membershipState = isOwner ? MEMBERSHIP.ACTIVE : MEMBERSHIP.NONE;
    update({
      membership: membershipState,
      lastCreated: { id: pubkey, npub: account.npub, nsec: signerTypeId === 'local' },
      memberships: { ...current.memberships, [pubkey]: membershipState },
      academies: academy ? { ...current.academies, [pubkey]: academy } : current.academies,
      profiles: academy
        ? { ...state().profiles, [academy.orgPubkey]: getPersona(academy.orgPubkey) }
        : state().profiles,
      events: academy
        ? [
            {
              id: nextId('e'),
              type: 'academy',
              author: pubkey,
              time: 'now',
              context: academy.name,
              audience: 'all',
              text: `created ${academy.name} and became its owner.`,
            },
            ...current.events,
          ]
        : current.events,
    });

    if (pendingInvite && !isOwner) acceptPendingInvite();

    navigateTo(isOwner ? '/role' : '/home');
    toast(isOwner ? `${academy.name} created.` : 'Account created — back up your key.', 'ok');
    return true;
  }

  async function signInWithKey({ key, displayName, role = ROLE.STUDENT } = {}) {
    const value = String(key ?? '').trim();
    if (!value) {
      toast('Paste an nsec1… or npub1… key.', 'warn');
      return false;
    }
    if (!isKeyLike(value)) {
      toast('That is not a valid nsec, npub, or public key.', 'warn');
      return false;
    }

    const decoded = decodeKey(value);
    if (!decoded?.pubkey) {
      toast('That key could not be read.', 'warn');
      return false;
    }

    let activeSigner = null;
    let method = 'watch';
    if (decoded.type === 'nsec') {
      method = 'local';
      activeSigner = localSigner(decoded.secretKey);
      saveSecretKey(decoded.secretKey, encodeNsec);
    } else if (globalThis.window?.nostr) {
      try {
        const ext = extensionSigner();
        const extPubkey = await ext.getPublicKey();
        if (extPubkey === decoded.pubkey) {
          activeSigner = ext;
          method = 'extension';
        }
      } catch {
        /* extension declined; continue as a read-only session */
      }
    }

    const name = String(displayName ?? '').trim();
    applySession({
      method,
      pubkey: decoded.pubkey,
      profile: { displayName: name || undefined, role },
      activeSigner,
    });

    acceptPendingInvite();
    navigateTo('/home');
    toast(
      activeSigner
        ? 'Signed in with your key.'
        : 'Viewing this identity read-only — connect a signer to act as it.',
      activeSigner ? 'ok' : 'warn',
    );
    return true;
  }

  function signOut() {
    signer.setSigner(null);
    clearState();
    clearRegistry();
    update({
      authed: false,
      session: null,
      accountId: null,
      personaId: null,
      signerType: DEFAULT_SIGNER,
      membership: MEMBERSHIP.NONE,
      memberships: {},
      academyMemberships: [],
      academies: {},
      invites: [],
      subjects: [],
      classrooms: [],
      homework: [],
      submissions: [],
      joinRequests: [],
      enrollRequests: [],
      events: [],
      signQueue: [],
      recommendations: [],
      credentials: [],
      deliveries: [],
      lastCreated: null,
    });
    navigate('/welcome');
    toast('Signed out.', 'info');
  }

  async function createAcademy({ name, type = 'school', timeZone = 'UTC' } = {}) {
    const current = state();
    const persona = getPersona(current.personaId);
    const academyName = String(name ?? '').trim();
    if (!academyName) {
      toast('Name your academy first.', 'warn');
      return false;
    }

    const existing = ownedAcademy(current, persona.id);
    if (existing) {
      toast(`You already own ${existing.name} — open Organization to manage it.`, 'info');
      return false;
    }

    const academy = newAcademy({ name: academyName, type, timeZone, ownerId: persona.id });

    const signed = await signAndPublish({
      title: 'Create academy',
      action: el('span', {}, [
        el('strong', {}, `Create ${academyName}`),
        el('br'),
        `${persona.displayName} · `,
        el('span', { class: 'mono' }, truncateNpub(persona.npub)),
        el('br'),
        'You become the owner and control its records.',
      ]),
      ...recordPayload('academy', academy.id, academy),
    });
    if (!signed) return false;

    registerPersona({ ...persona, role: ROLE.OWNER });
    registerAcademyPersona(academy);
    await publishOrgProfile(academy);
    update({
      academies: { ...current.academies, [persona.id]: academy },
      profiles: { ...current.profiles, [academy.orgPubkey]: getPersona(academy.orgPubkey) },
      membership: MEMBERSHIP.ACTIVE,
      memberships: { ...current.memberships, [persona.id]: MEMBERSHIP.ACTIVE },
      deliveries: [...relaySnapshot(signed.published), ...current.deliveries],
      orgTab: 'overview',
      events: [
        {
          id: nextId('e'),
          type: 'academy',
          author: persona.id,
          time: 'now',
          context: academyName,
          audience: 'all',
          text: `created ${academyName} and became its owner.`,
        },
        ...current.events,
      ],
    });
    navigateTo('/role');
    toast(`${academyName} created — invite a teacher or share a join link.`, 'ok');
    return true;
  }

  async function updateAcademyInfo({ name, about = '', picture = '', type, timeZone, handle } = {}) {
    const current = state();
    const academy = ownedAcademy(current, current.personaId);
    if (!academy) {
      toast('Create an academy before editing its info.', 'warn');
      return false;
    }

    const nextName = String(name ?? '').trim() || academy.name;
    const nextAbout = String(about ?? '').trim();
    const nextPicture = String(picture ?? '').trim() || null;
    const nextType = ACADEMY_TYPES.some((entry) => entry.id === type) ? type : academy.type;
    const nextTimeZone = String(timeZone ?? '').trim() || academy.timeZone || 'UTC';
    const nextHandle = String(handle ?? academy.handle ?? '').trim();
    const identity = ensureOrgIdentity(academy);
    const updated = {
      ...academy,
      name: nextName,
      about: nextAbout,
      picture: nextPicture,
      type: nextType,
      timeZone: nextTimeZone,
      handle: nextHandle,
      orgPubkey: identity?.pubkey ?? academy.orgPubkey ?? null,
      orgNpub: identity?.npub ?? academy.orgNpub ?? null,
      updatedAt: new Date().toISOString(),
    };

    const signed = await signAndPublish({
      title: 'Update academy info',
      action: el('span', {}, [
        el('strong', {}, `Update ${nextName}`),
        el('br'),
        'Repost the academy record and publish your public profile from the organization key.',
      ]),
      ...recordPayload('academy', updated.id, updated),
    });
    if (!signed) return false;

    const profile = await publishOrgProfile(updated);
    registerAcademyPersona(updated);
    update({
      academies: { ...state().academies, [current.personaId]: updated },
      profiles: { ...state().profiles, [updated.orgPubkey]: getPersona(updated.orgPubkey) },
      events: [
        {
          id: nextId('e'),
          type: 'academy',
          author: current.personaId,
          time: 'now',
          context: nextName,
          audience: 'all',
          text: `updated the academy profile for ${nextName}.`,
        },
        ...state().events,
      ],
    });
    toast(
      profile
        ? 'Academy info updated — public profile published from the organization key.'
        : 'Academy info saved locally; the organization profile was not published.',
      profile ? 'ok' : 'warn',
    );
    return true;
  }

  function inviteTeacher({ target, name = '' } = {}) {
    const current = state();
    const academy = ownedAcademy(current, current.personaId);
    if (!academy) {
      toast('Create an academy before inviting teachers.', 'warn');
      return null;
    }
    const normalizedTarget = normalizeInviteTarget(target);
    if (!normalizedTarget) return null;

    const label = String(name ?? '').trim() || normalizedTarget;
    const invite = {
      ...createInvite({
        id: nextId('inv'),
        academyId: academy.id,
        role: ROLE.TEACHER,
        target: normalizedTarget,
        name,
        createdBy: current.personaId,
      }),
      time: 'now',
    };
    update({
      invites: [invite, ...current.invites],
      events: [
        {
          id: nextId('e'),
          type: 'invite',
          author: current.personaId,
          time: 'now',
          context: academy.name,
          audience: [normalizedTarget],
          text: `invited ${label} to teach at ${academy.name}.`,
        },
        ...current.events,
      ],
    });
    const recipient = recipientPubkey(normalizedTarget);
    if (recipient) {
      publishRecord({
        type: 'invite',
        id: invite.id,
        payload: invite,
        recipients: [recipient],
        encrypted: true,
        title: 'Send invite',
        action: el('span', {}, `Send the teacher invite to ${label} (encrypted).`),
      });
    } else {
      publishJoinLink(invite, `Publish the teacher join link for ${academy.name}.`);
    }
    toast(`Invite ready for ${label}.`, 'ok');
    return { ...invite, url: inviteUrl(invite.code, appBase()) };
  }

  function publicLinkPayload(invite) {
    const { target, name, ...rest } = invite;
    return rest;
  }

  async function publishJoinLink(invite, message) {
    if (!invite?.id) return Promise.resolve(false);
    const current = state();
    const academy = academyById(current, invite.academyId);

    // Academy records created by older builds could serialize the academy
    // category (such as "school") over the record type. Repair an academy we
    // own before publishing its invite so a new device can authorize the link.
    if (academy?.ownerId === current.personaId) {
      const academyPublished = await publishRecord({
        type: RECORD_TYPES.ACADEMY,
        id: academy.id,
        payload: academy,
        title: 'Publish academy',
        action: el('span', {}, `Publish ${academy.name} so its join links can be verified.`),
      });
      if (!academyPublished?.count) {
        toast('The academy record was not accepted by a relay yet.', 'warn');
        return false;
      }
    }

    const published = await publishRecord({
      type: RECORD_TYPES.JOIN_LINK,
      id: invite.id,
      payload: publicLinkPayload(invite),
      title: 'Publish join link',
      action: el('span', {}, message),
    });
    if (!published?.count) {
      toast('Join link saved on this device, but no relay accepted it yet.', 'warn');
      return false;
    }
    return true;
  }

  function findInvite(inviteId) {
    return (state().invites ?? []).find((entry) => entry.id === inviteId) ?? null;
  }

  function publishJoinLinkToRelays(inviteId) {
    const invite = findInvite(inviteId);
    if (!invite) return Promise.resolve(false);
    return publishJoinLink(invite, 'Publish this join link to your relays.');
  }

  function checkJoinLink(inviteId, { timeoutMs = 6000 } = {}) {
    const current = state();
    const invite = findInvite(inviteId);
    if (!invite) return Promise.resolve(false);
    const author = invite.createdBy ?? current.personaId;
    if (!author) return Promise.resolve(false);

    return new Promise((resolve) => {
      let settled = false;
      let sub = null;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          sub?.close?.();
        } catch {
          /* the subscription may already be closed */
        }
        resolve(value);
      };
      const timer = setTimeout(() => finish(false), timeoutMs);
      sub = relay.subscribe([{
        kinds: [KIND.APP_DATA],
        authors: [author],
        '#d': [`${RECORD_TYPES.JOIN_LINK}:${inviteId}`],
        '#t': [APP_TAG],
      }], {
        onEvent: (event) => {
          const record = decodeRecord(event.content, event.tags);
          if (record?.type === RECORD_TYPES.JOIN_LINK && record.id === inviteId) finish(true);
        },
        onEose: () => finish(false),
      });
    });
  }

  function createInviteLink(role = ROLE.STUDENT) {
    const current = state();
    const academy = ownedAcademy(current, current.personaId);
    if (!academy) {
      toast('Create an academy before sharing a join link.', 'warn');
      return null;
    }
    const existing = current.invites.find(
      (invite) =>
        invite.academyId === academy.id &&
        invite.role === role &&
        invite.status === INVITE_STATUS.PENDING &&
        !invite.target,
    );
    if (existing) {
      publishJoinLink(existing, `Publish the join link for ${academy.name}.`);
      return { ...existing, url: inviteUrl(existing.code, appBase()) };
    }

    const invite = {
      ...createInvite({
        id: nextId('inv'),
        academyId: academy.id,
        role,
        createdBy: current.personaId,
      }),
      time: 'now',
    };
    update({ invites: [invite, ...current.invites] });
    publishJoinLink(invite, `Publish the join link for ${academy.name}.`);
    toast('Join link ready — copy and share it.', 'ok');
    return { ...invite, url: inviteUrl(invite.code, appBase()) };
  }

  async function copyInviteLink(inviteId) {
    const invite = state().invites.find((entry) => entry.id === inviteId);
    if (!invite) return false;
    publishJoinLink(invite, 'Publish this join link so anyone can open it.');
    return copyText(inviteUrl(invite.code, appBase()), 'Invite link copied — share it.');
  }

  function revokeInvite(inviteId) {
    const invite = state().invites.find((entry) => entry.id === inviteId);
    if (!invite) return;
    update({
      invites: state().invites.map((entry) =>
        entry.id === inviteId ? { ...entry, status: INVITE_STATUS.REVOKED } : entry,
      ),
    });
    publishJoinLink({ ...invite, status: INVITE_STATUS.REVOKED }, 'Revoke this join link.');
    toast('Invite revoked — that link no longer works.', 'warn');
  }

  function rememberInvite(reference) {
    const invite = findInviteByCode(state().invites, parseInviteReference(reference));
    if (!invite || invite.status !== INVITE_STATUS.PENDING) {
      toast('That invite link is not recognized or is no longer valid.', 'warn');
      return false;
    }
    update({ pendingInviteCode: invite.code });
    return true;
  }

  async function acceptInvite(reference, { prove = true } = {}) {
    const current = state();
    const invite = findInviteByCode(current.invites, parseInviteReference(reference) ?? reference);
    if (!invite) {
      toast('That invite link is not recognized.', 'warn');
      return false;
    }
    if (invite.status !== INVITE_STATUS.PENDING) {
      toast('That invite was already used or revoked.', 'warn');
      return false;
    }

    if (prove) {
      const persona = getPersona(current.personaId);
      const academy = academyById(current, invite.academyId);
      const classroom = invite.classroomId
        ? classroomById(current.classrooms ?? [], invite.classroomId)
        : null;
      const approved = await signer.request({
        title: 'Accept invitation',
        action: el('span', {}, [
          el('strong', {}, `Join ${classroom?.name ?? academy?.name ?? 'the academy'}`),
          el('br'),
          `as a ${inviteRoleLabel(invite.role)} · `,
          el('span', { class: 'mono' }, truncateNpub(persona.npub)),
        ]),
      });
      if (!approved.approved) {
        toast('Not signed. Nothing changed.', 'warn');
        return false;
      }
    }

    return applyInvite(invite);
  }

  function createSubject({ name, code = '' } = {}) {
    const current = state();
    const academy = ownedAcademy(current, current.personaId);
    if (!academy) {
      toast('Open your academy first.', 'warn');
      return null;
    }
    const subjectName = String(name ?? '').trim();
    if (!subjectName) {
      toast('Name the subject first.', 'warn');
      return null;
    }
    const subject = {
      id: nextId('sub'),
      academyId: academy.id,
      name: subjectName,
      code: String(code ?? '').trim(),
    };
    update({
      subjects: [...(current.subjects ?? []), subject],
      events: [
        {
          id: nextId('e'),
          type: 'course',
          author: current.personaId,
          time: 'now',
          context: academy.name,
          audience: 'all',
          text: `added the subject ${subjectName}.`,
        },
        ...current.events,
      ],
    });
    publishRecord({
      type: 'subject',
      id: subject.id,
      payload: subject,
      title: 'Publish subject',
      action: el('span', {}, `Publish subject “${subjectName}” to your academy.`),
    });
    toast(`Subject “${subjectName}” added.`, 'ok');
    return subject;
  }

  function updateSubject({ subjectId, name, code = '' } = {}) {
    const current = state();
    const academy = ownedAcademy(current, current.personaId);
    const subject = subjectById(current.subjects ?? [], subjectId);
    if (!academy || !subject || subject.academyId !== academy.id) {
      toast('That subject is not in your academy.', 'warn');
      return false;
    }
    const nextName = String(name ?? '').trim();
    if (!nextName) {
      toast('Name the subject first.', 'warn');
      return false;
    }
    const updated = { ...subject, name: nextName, code: String(code ?? '').trim() };
    update({
      subjects: current.subjects.map((entry) => (entry.id === subjectId ? updated : entry)),
      events: [
        {
          id: nextId('e'),
          type: 'course',
          author: current.personaId,
          time: 'now',
          context: academy.name,
          audience: 'all',
          text: `updated the subject ${nextName}.`,
        },
        ...current.events,
      ],
    });
    publishRecord({
      type: 'subject',
      id: updated.id,
      payload: updated,
      title: 'Update subject',
      action: el('span', {}, `Publish the updated subject “${nextName}”.`),
    });
    toast(`Subject “${nextName}” updated.`, 'ok');
    return true;
  }

  async function deleteSubject(subjectId) {
    const current = state();
    const academy = ownedAcademy(current, current.personaId);
    const subject = subjectById(current.subjects ?? [], subjectId);
    if (!academy || !subject || subject.academyId !== academy.id) {
      toast('That subject is not in your academy.', 'warn');
      return false;
    }
    if (subjectInUse(current.classrooms ?? [], subjectId)) {
      toast('Move or delete its classrooms before deleting the subject.', 'warn');
      return false;
    }
    const ok = await confirm({
      title: `Delete “${subject.name}”?`,
      body: 'The subject is removed from this device and a deletion record is published.',
      confirmLabel: 'Delete',
    });
    if (!ok) return false;

    update({
      subjects: (current.subjects ?? []).filter((entry) => entry.id !== subjectId),
      events: [
        {
          id: nextId('e'),
          type: 'course',
          author: current.personaId,
          time: 'now',
          context: academy.name,
          audience: 'all',
          text: `removed the subject ${subject.name}.`,
        },
        ...current.events,
      ],
    });
    publishRecord({
      type: 'subject',
      id: subjectId,
      payload: { ...subject, deleted: true },
      title: 'Delete subject',
      action: el('span', {}, `Remove “${subject.name}” from your academy.`),
    });
    toast(`Subject “${subject.name}” removed.`, 'warn');
    return true;
  }

  function createClassroom({ subjectId, name, term = '', teacherId = null, inviteTarget = '', inviteName = '' } = {}) {
    const current = state();
    const academy = ownedAcademy(current, current.personaId);
    if (!academy) {
      toast('Create an academy first.', 'warn');
      return null;
    }
    const subject = subjectById(current.subjects ?? [], subjectId);
    if (!subject) {
      toast('Pick a subject for the classroom.', 'warn');
      return null;
    }
    const className = String(name ?? '').trim() || subject.name;
    const assigned = teacherId || null;
    const classroom = {
      id: nextId('cls'),
      academyId: academy.id,
      subjectId: subject.id,
      name: className,
      term: String(term ?? '').trim(),
      status: assigned ? CLASS_STATUS.PUBLISHED : CLASS_STATUS.DRAFT,
      teacherId: assigned,
      studentIds: [],
    };

    let invites = current.invites ?? [];
    const rawTarget = String(inviteTarget ?? '').trim();
    if (!assigned && rawTarget) {
      const normalized = normalizeInviteTarget(rawTarget);
      if (!normalized) return null;
      const invite = {
        ...createInvite({
          id: nextId('inv'),
          academyId: academy.id,
          role: ROLE.TEACHER,
          target: normalized,
          name: inviteName,
          createdBy: current.personaId,
        }),
        classroomId: classroom.id,
        time: 'now',
      };
      invites = [invite, ...invites];
    }

    update({
      classrooms: [...(current.classrooms ?? []), classroom],
      invites,
      events: [
        {
          id: nextId('e'),
          type: 'course',
          author: current.personaId,
          time: 'now',
          context: subject.name,
          audience: 'all',
          text: `created the classroom ${className} (${subject.name})${assigned ? '' : ' and invited a teacher'}.`,
        },
        ...current.events,
      ],
    });
    publishRecord({
      type: 'classroom',
      id: classroom.id,
      payload: toPublicRecord(classroom),
      title: 'Publish classroom',
      action: el('span', {}, `Publish ${className} (${subject.name}).`),
    });
    toast(
      assigned ? `${className} published — students can be enrolled.` : `${className} created — invite a teacher to publish it.`,
      'ok',
    );
    return classroom;
  }

  function publishClassroom(classroomId) {
    const current = state();
    const classroom = classroomById(current.classrooms ?? [], classroomId);
    if (!classroom) return false;
    if (!classroom.teacherId) {
      toast('Assign a teacher before publishing.', 'warn');
      return false;
    }
    const updated = { ...classroom, status: CLASS_STATUS.PUBLISHED };
    update({
      classrooms: current.classrooms.map((room) => (room.id === classroomId ? updated : room)),
    });
    publishRecord({
      type: 'classroom',
      id: updated.id,
      payload: toPublicRecord(updated),
      title: 'Publish classroom',
      action: el('span', {}, `Publish ${classroom.name} to the catalog.`),
    });
    toast(`${classroom.name} published — students can see it.`, 'ok');
    return true;
  }

  function assignClassTeacher(classroomId, teacherId) {
    const current = state();
    const classroom = classroomById(current.classrooms ?? [], classroomId);
    if (!classroom) return false;
    const updated = { ...classroom, teacherId, status: CLASS_STATUS.PUBLISHED };
    update({
      classrooms: current.classrooms.map((room) => (room.id === classroomId ? updated : room)),
    });
    publishRecord({
      type: 'classroom',
      id: updated.id,
      payload: toPublicRecord(updated),
      title: 'Assign teacher',
      action: el('span', {}, `Assign a teacher to ${classroom.name}.`),
    });
    toast(`${classroom.name} assigned and published.`, 'ok');
    return true;
  }

  function updateClassroom({ classroomId, name, term = '', subjectId, teacherId = null } = {}) {
    const current = state();
    const academy = ownedAcademy(current, current.personaId);
    const classroom = classroomById(current.classrooms ?? [], classroomId);
    if (!academy || !classroom || classroom.academyId !== academy.id) {
      toast('That classroom is not in your academy.', 'warn');
      return false;
    }
    const nextName = String(name ?? '').trim();
    if (!nextName) {
      toast('Name the classroom first.', 'warn');
      return false;
    }
    const nextSubject =
      subjectById(current.subjects ?? [], subjectId) ??
      subjectById(current.subjects ?? [], classroom.subjectId);
    if (!nextSubject) {
      toast('Pick a subject for the classroom.', 'warn');
      return false;
    }
    const assigned = teacherId || null;
    const status =
      classroom.status === CLASS_STATUS.ARCHIVED
        ? CLASS_STATUS.ARCHIVED
        : assigned
          ? CLASS_STATUS.PUBLISHED
          : CLASS_STATUS.DRAFT;
    const updated = {
      ...classroom,
      name: nextName,
      term: String(term ?? '').trim(),
      subjectId: nextSubject.id,
      teacherId: assigned,
      status,
    };
    update({
      classrooms: current.classrooms.map((entry) => (entry.id === classroomId ? updated : entry)),
      events: [
        {
          id: nextId('e'),
          type: 'course',
          author: current.personaId,
          time: 'now',
          context: nextSubject.name,
          audience: 'all',
          text: `updated the classroom ${nextName}.`,
        },
        ...current.events,
      ],
    });
    publishRecord({
      type: 'classroom',
      id: updated.id,
      payload: toPublicRecord(updated),
      title: 'Update classroom',
      action: el('span', {}, `Publish changes to ${nextName}.`),
    });
    toast(`${nextName} updated.`, 'ok');
    return true;
  }

  function setClassroomStatus(classroomId, status, message) {
    const current = state();
    const academy = ownedAcademy(current, current.personaId);
    const classroom = classroomById(current.classrooms ?? [], classroomId);
    if (!academy || !classroom || classroom.academyId !== academy.id) {
      toast('That classroom is not in your academy.', 'warn');
      return false;
    }
    const updated = { ...classroom, status };
    update({
      classrooms: current.classrooms.map((entry) => (entry.id === classroomId ? updated : entry)),
      events: [
        {
          id: nextId('e'),
          type: 'course',
          author: current.personaId,
          time: 'now',
          context: classroom.name,
          audience: 'all',
          text: message,
        },
        ...current.events,
      ],
    });
    publishRecord({
      type: 'classroom',
      id: updated.id,
      payload: toPublicRecord(updated),
      title: status === CLASS_STATUS.ARCHIVED ? 'Archive classroom' : 'Restore classroom',
      action: el('span', {}, `${message}`),
    });
    return true;
  }

  function archiveClassroom(classroomId) {
    const classroom = classroomById(state().classrooms ?? [], classroomId);
    if (!classroom) return false;
    const ok = setClassroomStatus(classroomId, CLASS_STATUS.ARCHIVED, `archived ${classroom.name}.`);
    if (ok) toast(`${classroom.name} archived — hidden from learners, records kept.`, 'warn');
    return ok;
  }

  function restoreClassroom(classroomId) {
    const classroom = classroomById(state().classrooms ?? [], classroomId);
    if (!classroom) return false;
    const status = classroom.teacherId ? CLASS_STATUS.PUBLISHED : CLASS_STATUS.DRAFT;
    const ok = setClassroomStatus(classroomId, status, `restored ${classroom.name}.`);
    if (ok) {
      toast(
        classroom.teacherId
          ? `${classroom.name} restored and published.`
          : `${classroom.name} restored as a draft — assign a teacher to publish it.`,
        'ok',
      );
    }
    return ok;
  }

  async function deleteClassroom(classroomId) {
    const current = state();
    const academy = ownedAcademy(current, current.personaId);
    const classroom = classroomById(current.classrooms ?? [], classroomId);
    if (!academy || !classroom || classroom.academyId !== academy.id) {
      toast('That classroom is not in your academy.', 'warn');
      return false;
    }
    const activity = classroomActivity(current.homework ?? [], current.submissions ?? [], classroomId);
    const learners = (classroom.studentIds ?? []).length;
    if (activity.homework || activity.submissions || learners) {
      toast('Archive the classroom instead — it already has learners or work.', 'warn');
      return false;
    }
    const ok = await confirm({
      title: `Delete “${classroom.name}”?`,
      body: 'The classroom is removed from this device and a deletion record is published.',
      confirmLabel: 'Delete',
    });
    if (!ok) return false;

    update({
      classrooms: (current.classrooms ?? []).filter((entry) => entry.id !== classroomId),
      events: [
        {
          id: nextId('e'),
          type: 'course',
          author: current.personaId,
          time: 'now',
          context: classroom.name,
          audience: 'all',
          text: `removed the classroom ${classroom.name}.`,
        },
        ...current.events,
      ],
    });
    publishRecord({
      type: 'classroom',
      id: classroomId,
      payload: toPublicRecord({ ...classroom, deleted: true }),
      title: 'Delete classroom',
      action: el('span', {}, `Remove ${classroom.name} from your academy.`),
    });
    toast(`${classroom.name} removed.`, 'warn');
    return true;
  }

  function setCompletionPolicy({ classroomId, minAverage = 0, requireAllHomework = true } = {}) {
    const current = state();
    const classroom = classroomById(current.classrooms ?? [], classroomId);
    if (!classroom || !authorize(ACTION.SET_POLICY, classroomContext(current, classroom))) {
      toast('Only the academy owner can set completion rules.', 'warn');
      return false;
    }
    const policy = normalizePolicy({ minAverage, requireAllHomework });
    const updated = {
      ...classroom,
      completion: policy,
      completionVersion: (classroom.completionVersion ?? 0) + 1,
      completionUpdatedAt: 'now',
    };
    update({
      classrooms: current.classrooms.map((entry) => (entry.id === classroomId ? updated : entry)),
      events: [
        {
          id: nextId('e'),
          type: 'academy',
          author: current.personaId,
          time: 'now',
          context: classroom.name,
          audience: 'all',
          text: `updated completion rules for ${classroom.name} · v${updated.completionVersion}.`,
        },
        ...current.events,
      ],
    });
    publishRecord({
      type: 'classroom',
      id: updated.id,
      payload: toPublicRecord(updated),
      title: 'Completion rules',
      action: el('span', {}, `Publish completion rules v${updated.completionVersion} for ${classroom.name}.`),
    });
    toast(`Completion rules updated (v${updated.completionVersion}).`, 'ok');
    return true;
  }

  function recommendCompletion({ classroomId, studentId } = {}) {
    const current = state();
    const classroom = classroomById(current.classrooms ?? [], classroomId);
    if (!authorize(ACTION.RECOMMEND_COMPLETION, classroomContext(current, classroom))) {
      toast('Only the class teacher or academy owner can recommend completion.', 'warn');
      return false;
    }
    const homework = homeworkForClassroom(current.homework ?? [], classroomId);
    const result = evaluateCompletion({
      policy: classroom.completion,
      homework,
      submissions: current.submissions ?? [],
      studentId,
    });
    if (!result.eligible) {
      toast('That learner has not met the completion rules yet.', 'warn');
      return false;
    }
    const pending = (current.recommendations ?? []).some(
      (entry) => entry.classroomId === classroomId && entry.studentId === studentId && entry.status === 'recommended',
    );
    if (pending) {
      toast('Completion is already recommended for this learner.', 'info');
      return false;
    }
    const persona = getPersona(current.personaId);
    const learner = getPersona(studentId);
    const subject = subjectById(current.subjects ?? [], classroom.subjectId);
    const academy = findAcademyById(current.academies ?? {}, classroom.academyId);
    const id = nextId('rec');
    const recommendation = {
      id,
      academyId: classroom.academyId,
      academyName: academy?.name ?? null,
      classroomId,
      studentId,
      learnerName: learner.displayName,
      course: subject?.name ?? classroom.name,
      grade: result.average,
      policyVersion: classroom.completionVersion ?? null,
      recommendedBy: persona.id,
      recommendedAt: 'now',
      status: 'recommended',
    };
    update({
      recommendations: [recommendation, ...(current.recommendations ?? [])],
      signQueue: [
        {
          id: `sign-${id}`,
          learnerName: learner.displayName,
          course: recommendation.course,
          academyName: recommendation.academyName,
          policyVersion: recommendation.policyVersion,
          time: 'now',
          status: 'pending',
          grade: result.average,
        },
        ...(current.signQueue ?? []),
      ],
      events: [
        {
          id: nextId('e'),
          type: 'completion',
          author: persona.id,
          time: 'now',
          context: classroom.name,
          audience: [studentId, academy?.ownerId].filter(Boolean),
          text: `recommended ${learner.displayName} for completion of ${classroom.name}.`,
        },
        ...current.events,
      ],
    });
    if (academy?.ownerId) {
      publishRecord({
        type: 'recommendation',
        id,
        payload: recommendation,
        recipients: [academy.ownerId],
        encrypted: true,
        title: 'Recommend completion',
        action: el('span', {}, `Send ${learner.displayName}'s completion recommendation to the issuer (encrypted).`),
      });
    }
    toast(`Completion recommended for ${learner.displayName}.`, 'ok');
    return true;
  }

  function inviteToClassroom({ classroomId, role = ROLE.STUDENT, target, name = '' } = {}) {
    const current = state();
    const classroom = classroomById(current.classrooms ?? [], classroomId);
    if (!classroom) {
      toast('Pick a classroom first.', 'warn');
      return null;
    }
    const normalized = normalizeInviteTarget(target);
    if (!normalized) return null;
    const invite = {
      ...createInvite({
        id: nextId('inv'),
        academyId: classroom.academyId,
        role,
        target: normalized,
        name,
        createdBy: current.personaId,
      }),
      classroomId,
      time: 'now',
    };
    const label = String(name ?? '').trim() || normalized;
    update({
      invites: [invite, ...(current.invites ?? [])],
      events: [
        {
          id: nextId('e'),
          type: 'invite',
          author: current.personaId,
          time: 'now',
          context: classroom.name,
          audience: [normalized],
          text: `invited ${label} to ${classroom.name} as a ${inviteRoleLabel(role)}.`,
        },
        ...current.events,
      ],
    });
    const recipient = recipientPubkey(normalized);
    if (recipient) {
      publishRecord({
        type: 'invite',
        id: invite.id,
        payload: invite,
        recipients: [recipient],
        encrypted: true,
        title: 'Send invite',
        action: el('span', {}, `Send the ${inviteRoleLabel(role)} invite to ${label} (encrypted).`),
      });
    } else {
      publishJoinLink(invite, `Publish the join link for ${classroom.name}.`);
    }
    toast(`Invite ready for ${label} — share the link.`, 'ok');
    return { ...invite, url: inviteUrl(invite.code, appBase()) };
  }

  function inviteStudentToClass({ classroomId, target, name = '' } = {}) {
    return inviteToClassroom({ classroomId, role: ROLE.STUDENT, target, name });
  }

  function inviteClassTeacher({ classroomId, target, name = '' } = {}) {
    return inviteToClassroom({ classroomId, role: ROLE.TEACHER, target, name });
  }

  function createClassLink(classroomId) {
    const current = state();
    const classroom = classroomById(current.classrooms ?? [], classroomId);
    if (!classroom) {
      toast('Pick a classroom first.', 'warn');
      return null;
    }
    const existing = (current.invites ?? []).find(
      (invite) =>
        invite.classroomId === classroomId &&
        invite.role === ROLE.STUDENT &&
        invite.status === INVITE_STATUS.PENDING &&
        !invite.target,
    );
    if (existing) {
      publishJoinLink(existing, `Publish the join link for ${classroom.name}.`);
      return { ...existing, url: inviteUrl(existing.code, appBase()) };
    }

    const invite = {
      ...createInvite({
        id: nextId('inv'),
        academyId: classroom.academyId,
        role: ROLE.STUDENT,
        createdBy: current.personaId,
      }),
      classroomId,
      time: 'now',
    };
    update({ invites: [invite, ...current.invites] });
    publishJoinLink(invite, `Publish the join link for ${classroom.name}.`);
    toast('Class join link ready — copy and share it.', 'ok');
    return { ...invite, url: inviteUrl(invite.code, appBase()) };
  }

  function createHomework({ classroomId, title, instructions = '', due = '', maxScore = 100, rubric = [] } = {}) {
    const current = state();
    const classroom = classroomById(current.classrooms ?? [], classroomId);
    if (!classroom) {
      toast('Pick a classroom first.', 'warn');
      return null;
    }
    if (!canManageClassroom(current, classroom)) {
      toast('Only the class teacher or academy owner can post homework.', 'warn');
      return null;
    }
    const homeworkTitle = String(title ?? '').trim();
    if (!homeworkTitle) {
      toast('Add a homework title.', 'warn');
      return null;
    }
    const criteria = normalizeRubric(rubric);
    const max = criteria.length ? rubricMax(criteria) : Number(maxScore);
    if (!Number.isFinite(max) || max <= 0) {
      toast(criteria.length ? 'Each rubric criterion needs a positive maximum.' : 'Max score must be a positive number.', 'warn');
      return null;
    }
    const persona = getPersona(current.personaId);
    const subject = subjectById(current.subjects ?? [], classroom.subjectId);
    const item = {
      id: nextId('hw'),
      academyId: classroom.academyId,
      classroomId,
      subjectId: classroom.subjectId,
      title: homeworkTitle,
      instructions: String(instructions ?? '').trim(),
      due: String(due ?? '').trim() || 'no due date',
      maxScore: max,
      rubric: criteria,
      status: HOMEWORK_STATUS.PUBLISHED,
      createdBy: persona.id,
    };
    update({
      homework: [item, ...(current.homework ?? [])],
      events: [
        {
          id: nextId('e'),
          type: 'homework',
          author: persona.id,
          time: 'now',
          context: `${subject?.name ?? classroom.name} ▸ ${classroom.name}`,
          audience: 'all',
          text: `published “${homeworkTitle}” · due ${item.due} · out of ${max}.`,
        },
        ...current.events,
      ],
    });
    publishRecord({
      type: 'homework',
      id: item.id,
      payload: item,
      recipients: [classroom.teacherId, ...(classroom.studentIds ?? [])],
      encrypted: true,
      title: 'Publish homework',
      action: el('span', {}, `Send “${homeworkTitle}” to the class (encrypted).`),
    });
    toast(`Homework “${homeworkTitle}” posted.`, 'ok');
    return item;
  }

  function submitHomework({ homeworkId, text } = {}) {
    const current = state();
    const item = (current.homework ?? []).find((entry) => entry.id === homeworkId);
    if (!item) return false;
    if (!isHomeworkOpen(item)) {
      toast('This homework is closed to new submissions.', 'warn');
      return false;
    }
    const persona = getPersona(current.personaId);
    const body = String(text ?? '').trim();
    if (!body) {
      toast('Write your answer first.', 'warn');
      return false;
    }
    const existing = submissionFor(current.submissions ?? [], homeworkId, persona.id);
    const version = existing ? existing.version + 1 : 1;
    const submission = {
      id: existing?.id ?? nextId('sub'),
      homeworkId,
      classroomId: item.classroomId,
      studentId: persona.id,
      text: body,
      version,
      status: SUBMISSION_STATUS.SUBMITTED,
      score: null,
      scores: null,
      maxScore: item.maxScore,
      feedback: '',
      submittedAt: 'now',
      gradedAt: null,
      gradedBy: null,
    };
    update({
      submissions: existing
        ? (current.submissions ?? []).map((entry) => (entry.id === existing.id ? submission : entry))
        : [submission, ...(current.submissions ?? [])],
      events: [
        {
          id: nextId('e'),
          type: 'submission',
          author: persona.id,
          time: 'now',
          context: item.title,
          audience: [item.createdBy],
          homeworkId,
          text: `submitted version ${version} of “${item.title}”.`,
        },
        ...current.events,
      ],
    });
    publishRecord({
      type: 'submission',
      id: submission.id,
      payload: submission,
      recipients: [item.createdBy],
      encrypted: true,
      title: 'Submit homework',
      action: el('span', {}, `Submit version ${version} of “${item.title}” (encrypted).`),
    });
    toast(`Submitted version ${version} — your teacher will score it.`, 'ok');
    return true;
  }

  function gradeSubmission({ submissionId, score, feedback = '', scores = null } = {}) {
    const current = state();
    const submission = (current.submissions ?? []).find((entry) => entry.id === submissionId);
    if (!submission) return false;
    const classroom = classroomById(current.classrooms ?? [], submission.classroomId);
    if (!canManageClassroom(current, classroom)) {
      toast('Only the class teacher or academy owner can score this.', 'warn');
      return false;
    }
    const homeworkItem = (current.homework ?? []).find((entry) => entry.id === submission.homeworkId);
    const rubric = normalizeRubric(homeworkItem?.rubric);
    let sheet = null;
    let numeric = Number(score);
    let maxScore = submission.maxScore;
    if (rubric.length) {
      sheet = Array.isArray(scores) ? scores : [];
      if (!scoresComplete(sheet, rubric)) {
        toast('Score every rubric criterion.', 'warn');
        return false;
      }
      numeric = scoresTotal(sheet);
      maxScore = rubricMax(rubric);
    } else if (!isValidScore(score, submission.maxScore)) {
      toast(`Enter a score between 0 and ${submission.maxScore}.`, 'warn');
      return false;
    }
    const persona = getPersona(current.personaId);
    update({
      submissions: current.submissions.map((entry) =>
        entry.id === submissionId
          ? {
              ...entry,
              score: numeric,
              maxScore,
              scores: sheet,
              feedback: String(feedback ?? '').trim(),
              status: SUBMISSION_STATUS.GRADED,
              gradedAt: 'now',
              gradedBy: persona.id,
            }
          : entry,
      ),
      events: [
        {
          id: nextId('e'),
          type: 'grade',
          author: persona.id,
          time: 'now',
          context: submission.homeworkId,
          audience: [submission.studentId],
          homeworkId: submission.homeworkId,
          text: `scored a submission ${numeric}/${maxScore}.`,
        },
        ...current.events,
      ],
    });
    publishRecord({
      type: 'grade',
      id: nextId('grade'),
      payload: {
        submissionId: submission.id,
        studentId: submission.studentId,
        homeworkId: submission.homeworkId,
        score: numeric,
        scores: sheet,
        feedback: String(feedback ?? '').trim(),
        gradedAt: 'now',
        gradedBy: persona.id,
      },
      recipients: [submission.studentId],
      encrypted: true,
      title: 'Send score',
      action: el('span', {}, `Send ${numeric}/${maxScore} to the learner (encrypted).`),
    });
    toast(`Score saved — ${numeric}/${maxScore}.`, 'ok');
    return true;
  }

  function requestRevision({ submissionId, feedback = '' } = {}) {
    const current = state();
    const submission = (current.submissions ?? []).find((entry) => entry.id === submissionId);
    if (!submission) return false;
    const classroom = classroomById(current.classrooms ?? [], submission.classroomId);
    if (!canManageClassroom(current, classroom)) {
      toast('Only the class teacher or academy owner can request a revision.', 'warn');
      return false;
    }
    const note = String(feedback ?? '').trim();
    if (!note) {
      toast('Write what the learner should change.', 'warn');
      return false;
    }
    const persona = getPersona(current.personaId);
    const homeworkItem = (current.homework ?? []).find((entry) => entry.id === submission.homeworkId);
    update({
      submissions: current.submissions.map((entry) =>
        entry.id === submissionId
          ? {
              ...entry,
              status: SUBMISSION_STATUS.REVISION,
              score: null,
              scores: null,
              feedback: note,
              gradedAt: null,
              gradedBy: null,
            }
          : entry,
      ),
      events: [
        {
          id: nextId('e'),
          type: 'revision',
          author: persona.id,
          time: 'now',
          context: homeworkItem?.title ?? classroom?.name ?? 'Homework',
          audience: [submission.studentId],
          homeworkId: submission.homeworkId,
          actionNeeded: true,
          quote: note,
          text: `requested a revision on a submission.`,
        },
        ...current.events,
      ],
    });
    publishRecord({
      type: 'revision',
      id: nextId('rev'),
      payload: {
        submissionId: submission.id,
        studentId: submission.studentId,
        homeworkId: submission.homeworkId,
        feedback: note,
        requestedAt: 'now',
        requestedBy: persona.id,
      },
      recipients: [submission.studentId],
      encrypted: true,
      title: 'Request revision',
      action: el('span', {}, 'Send revision feedback to the learner (encrypted).'),
    });
    toast('Revision requested — the learner can resubmit.', 'ok');
    return true;
  }

  function updateHomework({ homeworkId, title, instructions = '', due = '', maxScore, rubric } = {}) {
    const current = state();
    const item = (current.homework ?? []).find((entry) => entry.id === homeworkId);
    if (!item) return false;
    const classroom = classroomById(current.classrooms ?? [], item.classroomId);
    if (!canManageClassroom(current, classroom)) {
      toast('Only the class teacher or academy owner can edit this homework.', 'warn');
      return false;
    }
    const nextTitle = String(title ?? '').trim();
    if (!nextTitle) {
      toast('Add a homework title.', 'warn');
      return false;
    }
    const criteria = rubric === undefined ? normalizeRubric(item.rubric) : normalizeRubric(rubric);
    const max = criteria.length ? rubricMax(criteria) : Number(maxScore ?? item.maxScore);
    if (!Number.isFinite(max) || max <= 0) {
      toast(criteria.length ? 'Each rubric criterion needs a positive maximum.' : 'Max score must be a positive number.', 'warn');
      return false;
    }
    const updated = {
      ...item,
      title: nextTitle,
      instructions: String(instructions ?? '').trim(),
      due: String(due ?? '').trim() || 'no due date',
      maxScore: max,
      rubric: criteria,
    };
    update({
      homework: (current.homework ?? []).map((entry) => (entry.id === homeworkId ? updated : entry)),
      events: [
        {
          id: nextId('e'),
          type: 'homework',
          author: current.personaId,
          time: 'now',
          context: `${classroom?.name ?? 'Class'} ▸ ${nextTitle}`,
          audience: 'all',
          text: `updated “${nextTitle}” · due ${updated.due} · out of ${max}.`,
        },
        ...current.events,
      ],
    });
    publishRecord({
      type: 'homework',
      id: updated.id,
      payload: updated,
      recipients: homeworkRecipients(classroom),
      encrypted: true,
      title: 'Update homework',
      action: el('span', {}, `Send the updated “${nextTitle}” to the class (encrypted).`),
    });
    toast(`Homework “${nextTitle}” updated.`, 'ok');
    return true;
  }

  function setHomeworkStatus(homeworkId, status, message, tone = 'info') {
    const current = state();
    const item = (current.homework ?? []).find((entry) => entry.id === homeworkId);
    if (!item) return false;
    const classroom = classroomById(current.classrooms ?? [], item.classroomId);
    if (!canManageClassroom(current, classroom)) {
      toast('Only the class teacher or academy owner can change this homework.', 'warn');
      return false;
    }
    const updated = { ...item, status };
    update({
      homework: (current.homework ?? []).map((entry) => (entry.id === homeworkId ? updated : entry)),
      events: [
        {
          id: nextId('e'),
          type: 'homework',
          author: current.personaId,
          time: 'now',
          context: classroom?.name ?? 'Class',
          audience: 'all',
          text: message,
        },
        ...current.events,
      ],
    });
    publishRecord({
      type: 'homework',
      id: updated.id,
      payload: updated,
      recipients: homeworkRecipients(classroom),
      encrypted: true,
      title: status === HOMEWORK_STATUS.CLOSED ? 'Close homework' : 'Reopen homework',
      action: el('span', {}, message),
    });
    toast(message, tone);
    return true;
  }

  function closeHomework(homeworkId) {
    const item = (state().homework ?? []).find((entry) => entry.id === homeworkId);
    if (!item) return false;
    return setHomeworkStatus(
      homeworkId,
      HOMEWORK_STATUS.CLOSED,
      `closed “${item.title}” — no new submissions.`,
      'warn',
    );
  }

  function reopenHomework(homeworkId) {
    const item = (state().homework ?? []).find((entry) => entry.id === homeworkId);
    if (!item) return false;
    return setHomeworkStatus(homeworkId, HOMEWORK_STATUS.PUBLISHED, `reopened “${item.title}” for submissions.`, 'ok');
  }

  async function deleteHomework(homeworkId) {
    const current = state();
    const item = (current.homework ?? []).find((entry) => entry.id === homeworkId);
    if (!item) return false;
    const classroom = classroomById(current.classrooms ?? [], item.classroomId);
    if (!canManageClassroom(current, classroom)) {
      toast('Only the class teacher or academy owner can delete this homework.', 'warn');
      return false;
    }
    const submitted = (current.submissions ?? []).some((entry) => entry.homeworkId === homeworkId);
    if (submitted) {
      toast('Close the homework instead — learners have already submitted.', 'warn');
      return false;
    }
    const ok = await confirm({
      title: `Delete “${item.title}”?`,
      body: 'The homework is removed here and a deletion record is sent to the class.',
      confirmLabel: 'Delete',
    });
    if (!ok) return false;

    update({
      homework: (current.homework ?? []).filter((entry) => entry.id !== homeworkId),
      events: [
        {
          id: nextId('e'),
          type: 'homework',
          author: current.personaId,
          time: 'now',
          context: classroom?.name ?? 'Class',
          audience: 'all',
          text: `removed “${item.title}”.`,
        },
        ...current.events,
      ],
    });
    publishRecord({
      type: 'homework',
      id: homeworkId,
      payload: { id: homeworkId, classroomId: item.classroomId, deleted: true },
      recipients: homeworkRecipients(classroom),
      encrypted: true,
      title: 'Delete homework',
      action: el('span', {}, `Remove “${item.title}” from the class.`),
    });
    toast(`Homework “${item.title}” removed.`, 'warn');
    return true;
  }

  async function claimHandle(raw) {
    const persona = getPersona(state().personaId);
    const result = validateHandle(raw);
    if (!result.valid) {
      toast(handleError(result.reason, result.handle), 'warn');
      return false;
    }
    const current = normalizeHandle(String(persona.handle ?? '').split('@')[0]);
    if (result.handle !== current && handleTaken(result.handle)) {
      toast(`@${result.handle} is taken — try a variation.`, 'warn');
      return false;
    }

    const claimed = {
      ...persona,
      handle: `${result.handle}@bitos.id`,
      verifiedAt: new Date().toISOString(),
    };
    const published = await publishProfileEvent(claimed, {
      title: 'Handle claim',
      action: el('span', {}, [
        el('strong', {}, `Claim @${result.handle}`),
        el('br'),
        'This publishes the handle in your public profile (kind:0) so others can find you by name.',
        el('br'),
        el('span', { class: 'mono' }, truncateNpub(persona.npub)),
      ]),
    });
    if (!published) {
      toast('Not signed. The handle was not claimed.', 'warn');
      return false;
    }

    const updated = registerPersona(claimed);
    update({
      profiles: { ...state().profiles, [updated.id]: updated },
      session:
        state().session?.pubkey === updated.id
          ? { ...state().session, handle: updated.handle }
          : state().session,
      events: [
        {
          id: nextId('e'),
          type: 'handle',
          author: persona.id,
          time: 'now',
          audience: 'all',
          text: `Claimed the handle @${result.handle}.`,
        },
        ...state().events,
      ],
    });
    toast(`@${result.handle} is yours — published in your profile.`, 'ok');
    return true;
  }

  function requestMembership() {
    const persona = getPersona(state().personaId);
    if (membershipOf(state(), persona.id) === MEMBERSHIP.ACTIVE) {
      toast('You are already a member.', 'info');
      return;
    }
    const id = nextId('jr');
    update({
      membership: MEMBERSHIP.PENDING,
      memberships: { ...state().memberships, [persona.id]: MEMBERSHIP.PENDING },
      joinRequests: [
        {
          id,
          accountId: persona.id,
          displayName: persona.displayName,
          handle: persona.handle,
          academy: 'BitOS Academy',
          role: persona.role,
          time: 'now',
          status: REQUEST_STATUS.PENDING,
        },
        ...state().joinRequests,
      ],
      events: [
        {
          id: nextId('e'),
          type: 'joinreq',
          author: persona.id,
          time: 'now',
          context: 'BitOS Academy',
          audience: ['nadia'],
          requestId: id,
          text: 'requested to join BitOS Academy.',
        },
        ...state().events,
      ],
    });
    toast('Join request sent — awaiting academy approval.', 'info');
  }

  function acceptJoin(requestId) {
    const request = state().joinRequests.find((entry) => entry.id === requestId);
    if (!request) return false;
    if (!canDecideJoin(requestId)) {
      toast('Only the academy owner can approve memberships.', 'warn');
      return false;
    }
    const sameRequest = (entry) =>
      entry.accountId === request.accountId &&
      (request.academyId
        ? entry.academyId === request.academyId || (!entry.academyId && entry.academy === request.academy)
        : entry.academy === request.academy);
    update({
      joinRequests: state().joinRequests.map((entry) =>
        sameRequest(entry) ? { ...entry, status: REQUEST_STATUS.APPROVED } : entry,
      ),
      memberships: { ...state().memberships, [request.accountId]: MEMBERSHIP.ACTIVE },
      membership:
        request.accountId === state().personaId ? MEMBERSHIP.ACTIVE : state().membership,
      events: [
        {
          id: nextId('e'),
          type: 'member',
          author: 'academy',
          time: 'now',
          context: 'BitOS Academy',
          audience: [request.accountId],
          text: 'Approved your BitOS Academy membership — welcome.',
        },
        ...state().events,
      ],
    });
    if (request.academyId && request.accountId) {
      publishRecord({
        type: RECORD_TYPES.MEMBER,
        id: `member:${request.academyId}:${request.accountId}`,
        payload: {
          academyId: request.academyId,
          memberId: request.accountId,
          role: request.role ?? ROLE.STUDENT,
          status: MEMBERSHIP.ACTIVE,
        },
        recipients: [request.accountId],
        encrypted: true,
        title: 'Approve academy membership',
        action: el('span', {}, `Approve ${request.displayName} for ${request.academy}.`),
      });
    }
    toast(`Approved — ${request.displayName} is now a member.`, 'ok');
    return true;
  }

  function declineJoin(requestId) {
    const request = state().joinRequests.find((entry) => entry.id === requestId);
    if (!request) return;
    const sameRequest = (entry) =>
      entry.accountId === request.accountId &&
      (request.academyId
        ? entry.academyId === request.academyId || (!entry.academyId && entry.academy === request.academy)
        : entry.academy === request.academy);
    update({
      joinRequests: state().joinRequests.map((entry) =>
        sameRequest(entry) ? { ...entry, status: REQUEST_STATUS.DECLINED } : entry,
      ),
      memberships: { ...state().memberships, [request.accountId]: MEMBERSHIP.NONE },
      membership:
        request.accountId === state().personaId ? MEMBERSHIP.NONE : state().membership,
    });
    if (request.academyId && request.accountId) {
      publishRecord({
        type: RECORD_TYPES.MEMBER,
        id: `member:${request.academyId}:${request.accountId}`,
        payload: {
          academyId: request.academyId,
          memberId: request.accountId,
          role: request.role ?? ROLE.STUDENT,
          status: MEMBERSHIP.NONE,
        },
        recipients: [request.accountId],
        encrypted: true,
        title: 'Decline academy membership',
        action: el('span', {}, `Decline ${request.displayName}'s request for ${request.academy}.`),
      });
    }
    toast(`Declined — ${request.displayName} was notified.`, 'warn');
  }

  function requestEnrollment(classroomId) {
    const current = state();
    const persona = getPersona(current.personaId);
    if (membershipOf(current, persona.id) !== MEMBERSHIP.ACTIVE) {
      toast('Join the academy before requesting a class.', 'warn');
      return false;
    }
    const classroom = classroomById(current.classrooms ?? [], classroomId);
    if (!isEnrollable(classroom)) {
      toast('That class is not open for enrollment yet.', 'warn');
      return false;
    }
    const pending = (current.enrollRequests ?? []).find(
      (entry) =>
        entry.learnerId === persona.id &&
        entry.courseId === classroom.id &&
        entry.status === REQUEST_STATUS.PENDING,
    );
    if (pending) {
      toast('Your enrollment request is already pending.', 'info');
      return false;
    }
    const academy = findAcademyById(current.academies ?? {}, classroom.academyId);
    const audience = [classroom.teacherId, academy?.ownerId].filter(Boolean);
    const id = nextId('er');
    update({
      enrollRequests: [
        {
          id,
          learnerId: persona.id,
          learnerName: persona.displayName,
          courseId: classroom.id,
          courseTitle: classroom.name,
          academyId: classroom.academyId,
          time: 'now',
          status: REQUEST_STATUS.PENDING,
        },
        ...(current.enrollRequests ?? []),
      ],
      events: [
        {
          id: nextId('e'),
          type: 'enrollreq',
          author: persona.id,
          time: 'now',
          context: classroom.name,
          audience,
          requestId: id,
          text: `requested enrollment in ${classroom.name}.`,
        },
        ...current.events,
      ],
    });
    toast(`Enrollment requested for ${classroom.name} — awaiting approval.`, 'info');
    return true;
  }

  function acceptEnrollment(requestId) {
    const current = state();
    const request = (current.enrollRequests ?? []).find((entry) => entry.id === requestId);
    if (!request || request.status !== REQUEST_STATUS.PENDING) return false;
    const classroom = classroomById(current.classrooms ?? [], request.courseId);
    if (!authorize(ACTION.DECIDE_ENROLLMENT, classroomContext(current, classroom))) {
      toast('Only the class teacher or academy owner can approve enrollment.', 'warn');
      return false;
    }
    const already = (classroom?.studentIds ?? []).includes(request.learnerId);
    const classrooms = classroom && !already
      ? (current.classrooms ?? []).map((room) =>
          room.id === classroom.id ? { ...room, studentIds: [...(room.studentIds ?? []), request.learnerId] } : room,
        )
      : current.classrooms;

    update({
      enrollRequests: (current.enrollRequests ?? []).map((entry) =>
        entry.id === requestId ? { ...entry, status: REQUEST_STATUS.APPROVED } : entry,
      ),
      classrooms,
      memberships: { ...current.memberships, [request.learnerId]: MEMBERSHIP.ACTIVE },
      events: [
        {
          id: nextId('e'),
          type: 'course',
          author: current.personaId,
          time: 'now',
          context: request.courseTitle,
          audience: [request.learnerId],
          courseId: request.courseId,
          text: `approved your enrollment in ${request.courseTitle}.`,
        },
        ...current.events,
      ],
    });
    toast(`Enrollment approved — ${request.learnerName} can now see ${request.courseTitle}.`, 'ok');
    return true;
  }

  function declineEnrollment(requestId) {
    const current = state();
    const request = (current.enrollRequests ?? []).find((entry) => entry.id === requestId);
    if (!request) return false;
    const classroom = classroomById(current.classrooms ?? [], request.courseId);
    if (!authorize(ACTION.DECIDE_ENROLLMENT, classroomContext(current, classroom))) {
      toast('Only the class teacher or academy owner can decline enrollment.', 'warn');
      return false;
    }
    update({
      enrollRequests: (current.enrollRequests ?? []).map((entry) =>
        entry.id === requestId ? { ...entry, status: REQUEST_STATUS.DECLINED } : entry,
      ),
    });
    toast(`Declined — ${request.learnerName} was notified.`, 'warn');
    return true;
  }

  function canDecideEnrollment(requestId) {
    const current = state();
    const request = (current.enrollRequests ?? []).find((entry) => entry.id === requestId);
    if (!request || request.status !== REQUEST_STATUS.PENDING) return false;
    const classroom = classroomById(current.classrooms ?? [], request.courseId);
    return authorize(ACTION.DECIDE_ENROLLMENT, classroomContext(current, classroom));
  }

  function canDecideJoin(requestId) {
    const current = state();
    const request = current.joinRequests.find((entry) => entry.id === requestId);
    if (!request || request.status !== REQUEST_STATUS.PENDING) return false;
    const academy = request.academyId
      ? findAcademyById(current.academies ?? {}, request.academyId)
      : Object.values(current.academies ?? {}).find((entry) => entry.name === request.academy);
    return Boolean(academy) && academy.ownerId === current.personaId;
  }

  function dismissCreated() {
    update({ lastCreated: null });
  }

  async function testSigner() {
    const result = await signer.request({
      title: 'Signer check',
      action: el('span', {}, [
        el('strong', {}, 'Plain-text challenge'),
        el('br'),
        el('span', { class: 'mono' }, 'bitos.education/test'),
      ]),
    });
    toast(
      result.approved ? 'Signature valid — your signer is working.' : 'Not signed.',
      result.approved ? 'ok' : 'warn',
    );
  }

  function like(eventId) {
    update({
      events: state().events.map((event) =>
        event.id === eventId ? { ...event, liked: !event.liked } : event,
      ),
    });
  }

  function openThread() {
    toast('Threads are coming soon.', 'info');
  }

  function postNote(text) {
    const trimmed = String(text ?? '').trim();
    if (!trimmed) {
      toast('Write something first.', 'warn');
      return;
    }
    update({
      events: [
        {
          id: nextId('e'),
          type: 'social',
          author: state().personaId,
          time: 'now',
          audience: 'all',
          text: trimmed,
          counts: { likes: 0, bitz: 0, replies: 0 },
        },
        ...state().events,
      ],
    });
    if (state().route !== '/home') navigateTo('/home');
    toast('Posted — public to your followers.', 'ok');
  }

  async function sendCompletion() {
    const ok = await confirm({
      title: 'Send completion?',
      body: [
        "This asks BitOS Academy's organization signer to issue the Certificate to Alice.",
        'You cannot edit this course record afterward.',
      ],
      confirmLabel: 'Send completion',
    });
    if (!ok) return;

    const signId = nextId('s');
    update({
      completionSent: true,
      signQueue: [
        {
          id: signId,
          learnerName: 'Alice',
          course: 'CS-101',
          time: 'now',
          status: 'pending',
          grade: 78,
        },
        ...state().signQueue,
      ],
      events: [
        {
          id: nextId('e'),
          type: 'completion',
          author: 'bob',
          time: 'now',
          context: 'CS-101',
          audience: ['bob', 'nadia'],
          signId,
          text: 'Sent completion for Alice · CS-101 to the organization signer.',
        },
        ...state().events,
      ],
    });
    toast('Completion sent — waiting for the organization signer.', 'ok');
  }

  async function signIssue(signId, close) {
    const current = state();
    const item = current.signQueue.find((entry) => entry.id === signId);
    if (!item || item.status !== 'pending') return false;

    const recommendation =
      (current.recommendations ?? []).find((entry) => `sign-${entry.id}` === signId) ?? null;
    const academy = recommendation ? findAcademyById(current.academies ?? {}, recommendation.academyId) : null;
    const identity = academy ? ensureOrgIdentity(academy) : null;
    if (!academy || !identity) {
      toast('The academy key for this credential is not available on this device.', 'warn');
      return false;
    }

    const approved = await signer.request({
      title: 'Signature request',
      action: el('span', {}, [
        el('strong', {}, 'Issue credential'),
        el('br'),
        `${academy.name} Certificate → ${item.learnerName}`,
        el('br'),
        el('span', { class: 'mono' }, item.course ?? ''),
      ]),
    });
    if (!approved.approved) return false;

    const classroom = recommendation
      ? classroomById(current.classrooms ?? [], recommendation.classroomId)
      : null;
    const payload = credentialPayload({
      academyName: academy.name,
      academyPubkey: identity.pubkey,
      academyNip05: academy.handle ?? null,
      holderName: item.learnerName,
      course: item.course,
      average: item.grade ?? null,
      policyVersion: classroom?.completionVersion ?? null,
      issuedAt: Date.now(),
    });
    const credentialId = nextId('cred');
    const orgSigner = localSigner(identity.secretKey);
    let proof;
    try {
      const event = buildEvent({
        kind: KIND.CREDENTIAL,
        tags: [
          ['d', credentialId],
          recommendation?.studentId ? ['p', recommendation.studentId] : null,
        ].filter(Boolean),
        content: credentialProofContent(payload),
      });
      proof = await orgSigner.signEvent(event);
    } catch (error) {
      toast(error?.message ?? 'The credential could not be signed.', 'warn');
      return false;
    }
    const published = await relay.publish(proof);
    const delivered = published.count > 0;

    const credential = {
      id: credentialId,
      academyId: academy.id,
      title: payload.title,
      issuer: getPersona(identity.pubkey),
      issuerPubkey: identity.pubkey,
      issuerNpub: identity.npub,
      status: 'active',
      privacyLevel: 'L1',
      expiresAt: null,
      meta: payload.course ? `${payload.course} completion` : 'Course completion',
      recipient: { name: item.learnerName, handle: null, pubkey: recommendation?.studentId ?? null },
      course: payload.course || null,
      payload,
      proof,
      issuedAt: payload.issuedAt,
      delivery: delivered ? 'delivered' : 'pending',
      sourceSignId: signId,
    };

    update({
      signed: true,
      signQueue: current.signQueue.map((entry) =>
        entry.id === signId ? { ...entry, status: 'signed' } : entry,
      ),
      recommendations: (current.recommendations ?? []).map((entry) =>
        recommendation && entry.id === recommendation.id ? { ...entry, status: 'issued' } : entry,
      ),
      credentials: [...current.credentials, credential],
      deliveries: [
        {
          id: nextId('d'),
          label: `Certificate · ${item.learnerName}`,
          state: delivered ? DELIVERY_STATE.DELIVERED : DELIVERY_STATE.PENDING,
        },
        ...current.deliveries,
      ],
      events: [
        {
          id: nextId('e'),
          type: 'issued',
          author: identity.pubkey,
          time: 'now',
          context: payload.course || academy.name,
          audience: 'all',
          text: `issued a ${payload.title} to ${item.learnerName}.`,
        },
        ...current.events,
      ],
    });
    close?.();
    toast(
      delivered
        ? `${payload.title} issued and published to relays.`
        : 'Credential signed locally — no relay accepted it yet.',
      delivered ? 'ok' : 'warn',
    );
    return true;
  }

  async function revokeCredential(credentialId) {
    const current = state();
    const credential = (current.credentials ?? []).find((entry) => entry.id === credentialId);
    if (!credential) return false;
    const academy = credential.academyId
      ? findAcademyById(current.academies ?? {}, credential.academyId)
      : Object.values(current.academies ?? {}).find((entry) => entry.orgPubkey === credential.issuerPubkey);
    if (!academy || !authorize(ACTION.REVOKE_CREDENTIAL, { actor: current.personaId, academy })) {
      toast('Only the academy owner can revoke this credential.', 'warn');
      return false;
    }
    const identity = ensureOrgIdentity(academy);
    if (!identity) {
      toast('The academy key for this credential is not available on this device.', 'warn');
      return false;
    }
    const ok = await confirm({
      title: `Revoke ${credential.title}?`,
      body: 'Revocation is signed by the academy key and published, so verifiers see the new status. The learner keeps the certificate.',
      confirmLabel: 'Revoke',
    });
    if (!ok) return false;

    const statusPayload = revocationPayload({
      credentialId,
      issuer: identity.pubkey,
      revokedAt: Date.now(),
    });
    let statusProof;
    try {
      const event = buildEvent({
        kind: KIND.CREDENTIAL,
        tags: [
          ['d', credentialId],
          ['status', 'revoked'],
          credential.recipient?.pubkey ? ['p', credential.recipient.pubkey] : null,
        ].filter(Boolean),
        content: JSON.stringify(statusPayload),
      });
      statusProof = await localSigner(identity.secretKey).signEvent(event);
    } catch (error) {
      toast(error?.message ?? 'The revocation could not be signed.', 'warn');
      return false;
    }
    await relay.publish(statusProof);

    update({
      credentials: (current.credentials ?? []).map((entry) =>
        entry.id === credentialId ? { ...entry, status: 'revoked', statusProof, statusPayload } : entry,
      ),
      events: [
        {
          id: nextId('e'),
          type: 'issued',
          author: identity.pubkey,
          time: 'now',
          context: credential.course ?? credential.title,
          audience: 'all',
          text: `revoked a ${credential.title}.`,
        },
        ...current.events,
      ],
    });
    toast('Credential revoked and published.', 'warn');
    return true;
  }

  async function declineSign(signId, close) {
    const item = state().signQueue.find((entry) => entry.id === signId);
    if (!item) return;

    const ok = await confirm({
      title: 'Decline issuance?',
      body: 'Bob will see the decline and can fix the record. Nothing reaches Alice.',
      confirmLabel: 'Decline',
    });
    if (!ok) return;

    update({
      signQueue: state().signQueue.map((entry) =>
        entry.id === signId ? { ...entry, status: 'declined' } : entry,
      ),
    });
    close?.();
    toast('Declined — Bob will see this. Nothing reached Alice.', 'warn');
  }

  async function createGrant(recipient, duration, close) {
    if (!recipient) return;
    const result = await signer.request({
      title: 'Signature request',
      action: el('span', {}, [
        'Grant access to "Bachelor of Computer Science"',
        el('br'),
        `→ ${recipient.display}`,
        el('br'),
        `Expires in ${duration}`,
      ]),
    });
    if (!result.approved) {
      toast('Not signed. Nothing was shared.', 'warn');
      return;
    }

    update({ grants: [...state().grants, { to: recipient.display, duration }] });
    close?.();
    toast(`Access granted to ${recipient.display} — expires in ${duration}.`, 'ok');
  }

  function revokeGrant(index) {
    const grants = [...state().grants];
    grants.splice(index, 1);
    update({ grants });
    toast(
      'Access revoked. New verification checks will fail; already-downloaded copies cannot be recalled.',
      'warn',
    );
  }

  async function retryDelivery(deliveryId) {
    toast('Retrying delivery…', 'info');
    const statuses = await relay.check();
    const reachable = statuses.filter((entry) => entry.health === 'connected').length;
    update({
      deliveries: state().deliveries.map((entry) =>
        entry.id === deliveryId
          ? { ...entry, state: reachable ? DELIVERY_STATE.DELIVERED : DELIVERY_STATE.FAILED }
          : entry,
      ),
      relays: statuses,
    });
    toast(
      reachable
        ? `Delivery retried — confirmed on ${reachable} relay${reachable === 1 ? '' : 's'}.`
        : 'No relay reachable — delivery still pending.',
      reachable ? 'ok' : 'warn',
    );
  }

  function refreshRelays() {
    update({ relays: relay.statuses() });
  }

  function applyRelayConfig(next) {
    relay.setRelays(next);
    update({ relayConfig: relay.config, relays: relay.statuses() });
  }

  function addRelay(input) {
    const result = addRelayToList(state().relayConfig ?? [], input);
    if (result.error === 'invalid') {
      toast('Enter a valid relay URL, e.g. wss://relay.example.com or ws://relay.local:7777.', 'warn');
      return false;
    }
    if (result.error === 'duplicate') {
      toast('That relay is already configured.', 'info');
      return false;
    }

    applyRelayConfig(result.relays);
    const url = normalizeRelayUrl(input);
    toast(`Added ${url}.`, 'ok');
    relay.check([url]).then(refreshRelays);
    return true;
  }

  function removeRelay(id) {
    const current = state().relayConfig ?? [];
    if (current.length <= 1) {
      toast('Keep at least one relay.', 'warn');
      return false;
    }
    applyRelayConfig(removeRelayFromList(current, id));
    toast('Relay removed.', 'info');
    return true;
  }

  function cycleRelayMode(id) {
    const entry = (state().relayConfig ?? []).find((relay) => relay.id === id);
    if (!entry) return;
    const mode = nextRelayMode(entry.mode);
    applyRelayConfig(setRelayModeInList(state().relayConfig, id, mode));
    toast(`Relay set to ${relayModeLabel(mode)}.`, 'info');
  }

  async function checkRelays() {
    toast('Checking relays…', 'info');
    await relay.check();
    refreshRelays();
    const statuses = relay.statuses();
    const healthy = statuses.filter((entry) => entry.health === 'connected').length;
    toast(`${healthy}/${statuses.length} relays reachable.`, healthy ? 'ok' : 'warn');
  }

  function stub(message = 'This action is not available yet.') {
    toast(message, 'info');
  }

  return {
    navigate: navigateTo,
    setFeedTab,
    setRoleTab,
    setOrgTab,
    setSettingsSection,
    setGradebookClass,
    copyText,
    signInWithExtension,
    createAccount,
    signInWithKey,
    signOut,
    createAcademy,
    updateAcademyInfo,
    inviteTeacher,
    createInviteLink,
    copyInviteLink,
    publishJoinLinkToRelays,
    checkJoinLink,
    revokeInvite,
    rememberInvite,
    acceptInvite,
    createSubject,
    updateSubject,
    deleteSubject,
    createClassroom,
    updateClassroom,
    publishClassroom,
    archiveClassroom,
    restoreClassroom,
    deleteClassroom,
    setCompletionPolicy,
    recommendCompletion,
    assignClassTeacher,
    inviteStudentToClass,
    inviteClassTeacher,
    createClassLink,
    createHomework,
    updateHomework,
    closeHomework,
    reopenHomework,
    deleteHomework,
    submitHomework,
    gradeSubmission,
    requestRevision,
    claimHandle,
    updateProfile,
    uploadImage,
    setBlossomServer,
    refreshMyProfile,
    requestMembership,
    acceptJoin,
    declineJoin,
    requestEnrollment,
    acceptEnrollment,
    declineEnrollment,
    canDecideEnrollment,
    canDecideJoin,
    dismissCreated,
    testSigner,
    like,
    openThread,
    postNote,
    sendCompletion,
    signIssue,
    revokeCredential,
    declineSign,
    createGrant,
    revokeGrant,
    retryDelivery,
    addRelay,
    removeRelay,
    cycleRelayMode,
    checkRelays,
    stub,
  };
}

function handleTaken(handle) {
  const own = getPersonaIds().map((id) => String(getPersona(id).handle ?? '').split('@')[0]);
  return own.map(normalizeHandle).includes(normalizeHandle(handle));
}

function handleError(reason, handle) {
  if (reason === 'reserved') return `'${handle}' is reserved — handles like admin, verify, and org names are protected.`;
  if (reason === 'length') return 'Handles are 3–24 characters.';
  if (reason === 'charset') return 'Use letters and numbers only, plus dots and underscores.';
  return 'That handle cannot be used.';
}
