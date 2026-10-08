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
  getEventHash,
  localSigner,
  publicKeyFromSecret,
  encodeNsec,
  verify,
  DEFAULT_RELAYS,
} from '../services/nostr.js';
import {
  APP_TAG,
  decodeRecord,
  encodeRecord,
  headAddress,
  recordKind,
  recordTags,
} from '../services/records.js';
import { normalizeBlossomServer, uploadBlob } from '../services/blossom.js';
import { RECORD_RUMOR_KIND, wrapForRecipient } from '../services/giftwrap.js';
import { RECORD_TYPES, applyRecord, toPublicRecord } from '../domain/records.js';
import { CAPABILITY, createCapability, isCapabilityActive } from '../domain/capability.js';
import { normalizeRubric, rubricMax, scoresComplete, scoresTotal } from '../domain/rubric.js';
import { credentialPayload, credentialProofContent, revocationPayload } from '../domain/credential.js';
import { ACTION, authorize } from '../domain/authorization.js';
import { clearFeedCache, clearState, loadOrgSecret, saveOrgSecret, saveSecretKey } from '../services/storage.js';
import { clearGifCache } from '../services/giphy.js';
import { clearIconCache } from '../services/iconify.js';
import {
  ACADEMY_TYPES,
  INVITE_STATUS,
  createInvite,
  findAcademyById,
  findInviteByCode,
  inviteUrl,
  orgProfileContent,
  parseInviteReference,
} from '../domain/academy.js';
import {
  CLASS_STATUS,
  HOMEWORK_STATUS,
  SUBMISSION_STATUS,
  canSubmitLate,
  classroomsForStudent,
  classroomActivity,
  classroomById,
  enrolledAccountIds,
  homeworkForClassroom,
  isEnrollable,
  isHomeworkOpen,
  isLate,
  isValidScore,
  normalizeLatePolicy,
  subjectById,
  subjectInUse,
  submissionFor,
} from '../domain/classroom.js';
import { evaluateCompletion, normalizePolicy } from '../domain/completion.js';
import { DELIVERY_STATE } from '../domain/delivery.js';
import { eventKeyOf, feedEventFromNote, threadEventFromNote } from '../domain/feed.js';
import {
  CONVERSATION_STATUS,
  MESSAGE_STATE,
  conversationById,
  conversationWith,
  conversationsForAccount,
  incomingMessageFromEvent,
  mergeIncomingMessage,
  normalizeConversation,
} from '../domain/messaging.js';
import {
  mergeSocialNotifications,
  notificationFromEngagement,
  notificationFromZap,
  socialNotificationsFor,
  workflowNotifications,
} from '../domain/notifications.js';
import { ZAP_DIRECTION, ZAP_RECEIPT_KIND, ZAP_STATUS, formatSats, mergeZapReceipt, normalizeZap, sortZaps, upsertZap, zapFromReceipt, zapRequestTags, zapsForAccount } from '../domain/wallet.js';
import { fetchPayRequest, lnurlPayUrl, requestZapInvoice } from '../services/lnurl.js';
import { normalizeHandle, validateHandle } from '../domain/handle.js';
import { truncateNpub } from '../domain/identity.js';
import { normalizeMode } from '../domain/mode.js';
import {
  allowsIncomingMessage,
  defaultPow as defaultPowPref,
  setNetwork as setNetworkPrefs,
  setPrivacy as setPrivacyPrefs,
  setSubscription as setSubscriptionPrefs,
  setZap as setZapPrefs,
  zapAmounts as zapAmountsPref,
} from '../domain/prefs.js';
import { REACTION_LIKE, leadingZeroBits, reactionTags, replyTags, repostTags } from '../domain/social.js';
import { normalizePrivateName, formatPrivateName, validatePrivateName } from '../domain/private-name.js';
import { normalizeUrl, parseProfileMeta, profileContent } from '../domain/profile.js';
import {
  addRelay as addRelayToList,
  nextRelayMode,
  normalizeRelayUrl,
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
import { t, availableLocales, setLocale as setI18nLocale } from '../services/i18n/index.js';

let sequence = 0;

// How many of an author's public notes the profile page loads per visit.
const PROFILE_NOTE_LIMIT = 20;

function inviteRoleKey(role) {
  if (role === ROLE.TEACHER) return 'common.inviteRole.teacher';
  if (role === ROLE.OWNER) return 'common.inviteRole.admin';
  return 'common.inviteRole.learner';
}

function relayModeKey(mode) {
  if (mode === 'read') return 'common.relayMode.read';
  if (mode === 'write') return 'common.relayMode.write';
  return 'common.relayMode.readWrite';
}

function nextId(prefix) {
  sequence += 1;
  return `${prefix}${Date.now().toString(36)}${sequence}`;
}

function membershipOf(state, personaId) {
  return state.memberships?.[personaId] ?? MEMBERSHIP.NONE;
}

export function createActions({ store, bus, signer, confirm: confirmService, relay }) {
  const confirm =
    typeof confirmService === 'function' ? confirmService : (confirmService?.confirm ?? confirmService?.ask);
  const state = () => store.getState();
  const update = (patch) => store.setState(patch);
  const toast = (message, tone = 'info') => bus.emit('toast', { message, tone });
  // Keep encrypted records for the same recipient in publish order. Teachers
  // may correct a score several times in quick succession; firing every gift
  // wrap concurrently causes public relays to rate-limit an arbitrary revision,
  // including the newest one, while the teacher's local state still advances.
  const recipientPublishQueues = new Map();

  function enqueueRecipientPublish(recipient, publish) {
    const previous = recipientPublishQueues.get(recipient) ?? Promise.resolve();
    const queued = previous.catch(() => null).then(publish);
    recipientPublishQueues.set(recipient, queued);
    const cleanup = () => {
      if (recipientPublishQueues.get(recipient) === queued) recipientPublishQueues.delete(recipient);
    };
    queued.then(cleanup, cleanup);
    return queued;
  }

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

  function setNotificationTab(notificationTab) {
    update({ notificationTab });
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

  // Inline review workspace: the submission currently open in the detail pane.
  function setReviewSelection(reviewSelectedId) {
    update({ reviewSelectedId: reviewSelectedId ?? null });
  }

  async function copyText(text, label = t('common.actions.copied')) {
    try {
      await navigator.clipboard.writeText(String(text));
      toast(label, 'ok');
      return true;
    } catch {
      toast(t('actions.copyFailed'), 'warn');
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

  function upsertCapability(list = [], capability) {
    if (!capability) return list;
    return [capability, ...list.filter((entry) => entry.id !== capability.id)];
  }

  function canPublish() {
    return typeof signer.canSign === 'function' && signer.canSign();
  }

  function classroomContext(current, classroom) {
    return {
      actor: current.personaId,
      classroom,
      academy: findAcademyById(current.academies ?? {}, classroom?.academyId),
      capabilities: current.capabilities ?? [],
    };
  }

  function canManageClassroom(current, classroom) {
    return authorize(ACTION.MANAGE_CLASSROOM, classroomContext(current, classroom));
  }

  function canSubmitWork(current, classroom) {
    return authorize(ACTION.SUBMIT, classroomContext(current, classroom));
  }

  function canFinalizeAssessment(current, classroom) {
    return authorize(ACTION.FINALIZE_ASSESSMENT, classroomContext(current, classroom));
  }

  function canCorrectAssessment(current, classroom) {
    return authorize(ACTION.CORRECT_ASSESSMENT, classroomContext(current, classroom));
  }

  // Address every enrolled account, including learners who self-enrolled through
  // a link (their enrollment arrives as a capability, not a synced studentIds
  // entry). Lifecycle records — close/reopen, edits, deletes — must reach them
  // too, or a learner keeps a stale `published` copy and can still submit.
  function homeworkRecipients(current, classroom) {
    return [
      ...new Set([
        classroom?.teacherId,
        ...(classroom?.studentIds ?? []),
        ...enrolledAccountIds(current?.capabilities ?? [], classroom?.id),
      ].filter(Boolean)),
    ];
  }

  // Who may grade a submission: the homework author, the assigned class
  // teacher, and the academy owner. Targeting only `createdBy` meant an assigned
  // teacher never received work for homework the owner had posted. The
  // submitter's own key is included so their other devices refetch their work.
  function submissionRecipients(current, classroom, item) {
    const academy = classroom ? findAcademyById(current.academies ?? {}, classroom.academyId) : null;
    // Teachers assigned by a signed capability (joined through a link, or on a
    // device that never saw the class record's teacherId) must be addressed too.
    const assignedTeachers = (current?.capabilities ?? [])
      .filter(
        (cap) =>
          cap?.kind === CAPABILITY.TEACHER_ASSIGNMENT &&
          cap.classroomId === classroom?.id &&
          isCapabilityActive(cap),
      )
      .map((cap) => cap.accountId);
    return [
      ...new Set(
        [
          item?.createdBy,
          classroom?.teacherId,
          academy?.ownerId,
          current?.personaId,
          ...assignedTeachers,
        ].filter(Boolean),
      ),
    ];
  }

  // A score or revision reaches the learner and the grader's own other devices.
  // Without the grader's own key the record is never addressed back to them, so
  // a teacher who grades on one device cannot refetch the score on another.
  function assessmentRecipients(current, submission) {
    return [...new Set([submission?.studentId, current?.personaId].filter(Boolean))];
  }

  function normalizeInviteTarget(raw) {
    const value = String(raw ?? '').trim();
    if (!value) {
      toast(t('actions.enterHandleOrNpub'), 'warn');
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
    // Targeted invites are single-use. Open links (academy or class links with
    // no target) are meant to be shared with many learners, so accepting one
    // must not burn it — otherwise a learner who retries sees "no longer valid".
    const consume = Boolean(invite.target);
    const invites = current.invites.map((entry) =>
      entry.id === invite.id
        ? {
            ...entry,
            status: consume ? INVITE_STATUS.ACCEPTED : entry.status,
            acceptedBy: consume ? persona.id : entry.acceptedBy,
          }
        : entry,
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
          const next = students.includes(persona.id) ? room : { ...room, studentIds: [...students, persona.id] };
          // The learner accepted a real invite, so show the class even if the
          // owner's public record has not caught up to published yet.
          return next.status === CLASS_STATUS.ARCHIVED ? next : { ...next, status: CLASS_STATUS.PUBLISHED };
        })
      : list;

    if (invite.role === ROLE.TEACHER) {
      registerPersona({ ...persona, role: ROLE.TEACHER });
      // A public classroom record still carries the owner's original
      // `teacherId: null`, so re-syncing it on refresh would wipe the local
      // assignment. Persist a signed-style assignment capability instead: it is
      // the documented roster source and survives a catalog re-apply.
      const capability = createCapability({
        kind: CAPABILITY.TEACHER_ASSIGNMENT,
        academyId: invite.academyId,
        accountId: persona.id,
        classroomId: classroom?.id ?? null,
        role: ROLE.TEACHER,
        issuedBy: current.personaId,
      });
      update({
        invites,
        classrooms,
        pendingInviteCode: null,
        profiles: { ...current.profiles, [persona.id]: getPersona(persona.id) },
        session: current.session ? { ...current.session, role: ROLE.TEACHER } : current.session,
        capabilities: upsertCapability(current.capabilities, capability),
        membership: MEMBERSHIP.ACTIVE,
        memberships: { ...current.memberships, [persona.id]: MEMBERSHIP.ACTIVE },
        academyMemberships: academyMembership(MEMBERSHIP.ACTIVE),
        events: [
          {
            id: nextId('e'),
            type: 'member',
            author: 'academy',
            time: 'now',
            occurredAt: new Date().toISOString(),
            context: classroom?.name ?? academy?.name ?? t('actions.academyFallback'),
            audience: [persona.id],
            text: classroom
              ? t('actions.joinedAsTeacher', { name: classroom.name })
              : t('actions.welcomeJoinedAcademyTeacher', { name: academy?.name ?? t('actions.theAcademy') }),
          },
          ...current.events,
        ],
      });
      // Publish the assignment so the class becomes staffed and published for
      // everyone (owner, students, relays) instead of only on this device.
      const assigned = classroom
        ? { ...classroom, teacherId: persona.id, status: CLASS_STATUS.PUBLISHED }
        : null;
      if (assigned && canPublish()) {
        publishRecord({
          type: RECORD_TYPES.CLASSROOM,
          id: assigned.id,
          payload: toPublicRecord(assigned),
          title: t('actions.assignTeacher'),
          action: el(
            'span',
            {},
            t('actions.publishClassroomNamed', {
              name: assigned.name,
              subject: subjectById(current.subjects ?? [], assigned.subjectId)?.name ?? assigned.name,
            }),
          ),
        });
      }
      toast(
        classroom
          ? t('actions.youTeachClass', { name: classroom.name })
          : t('actions.youAreTeacherAt', { name: academy?.name ?? t('actions.theAcademy') }),
        'ok',
      );
      return true;
    }

    // A valid signed class invite authorizes enrollment. The class may still be
    // an unpublished draft on the network, so enroll and publish it locally
    // rather than turning the learner away.
    if (invite.classroomId && !classroom) {
      toast(t('actions.classNotReadyYet'), 'warn');
      return false;
    }
    if (invite.classroomId && classroom.status === CLASS_STATUS.ARCHIVED) {
      toast(t('actions.classNotOpenEnrollment'), 'warn');
      return false;
    }

    if (classroom) {
      // A self-enrollment via link must leave a signed capability so the roster
      // survives on another device and the teacher can address homework to it.
      const enrollment = createCapability({
        kind: CAPABILITY.ENROLLMENT,
        academyId: classroom.academyId,
        accountId: persona.id,
        classroomId: classroom.id,
        role: ROLE.STUDENT,
        issuedBy: invite.createdBy ?? persona.id,
      });
      update({
        invites,
        classrooms,
        pendingInviteCode: null,
        capabilities: upsertCapability(current.capabilities, enrollment),
        membership: MEMBERSHIP.ACTIVE,
        memberships: { ...current.memberships, [persona.id]: MEMBERSHIP.ACTIVE },
        academyMemberships: academyMembership(MEMBERSHIP.ACTIVE),
        events: [
          {
            id: nextId('e'),
            type: 'member',
            author: 'academy',
            time: 'now',
            occurredAt: new Date().toISOString(),
            context: classroom.name,
            audience: [persona.id],
            text: t('actions.enrolledIn', { name: classroom.name }),
          },
          ...current.events,
        ],
      });
      const roster = [classroom.teacherId, academy?.ownerId].filter(Boolean);
      if (enrollment && roster.length && canPublish()) {
        publishRecord({
          type: RECORD_TYPES.CAPABILITY,
          id: enrollment.id,
          payload: enrollment,
          recipients: roster,
          encrypted: true,
          title: t('actions.shareEnrollment'),
          action: el('span', {}, t('actions.enrolledCapability', { name: classroom.name })),
        });
      }
      toast(t('actions.youAreEnrolled', { name: classroom.name }), 'ok');
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
            academy: academy?.name ?? t('actions.academyFallback'),
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
              occurredAt: new Date().toISOString(),
              context: academy?.name ?? t('actions.academyFallback'),
              audience: [academy?.ownerId ?? 'nadia'],
              requestId: joinId,
              text: t('actions.acceptedInviteRequestedJoin', { name: academy?.name ?? t('actions.theAcademy') }),
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
        title: t('actions.requestAcademyMembership'),
        action: el('span', {}, t('actions.requestToJoinAsLearner', { name: academy.name })),
      });
    }
    toast(
      existingRequest
        ? t('actions.membershipRequestPending')
        : t('actions.inviteAcceptedOwnerApproves'),
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
      toast(t('actions.connectSignerToSign'), 'warn');
      return null;
    }
    const event = buildEvent({ kind, tags, content });
    let signed;
    try {
      const result = await signer.request({ title, action, detail, event });
      if (!result.approved) return null;
      signed = result.event;
    } catch (error) {
      toast(error?.message ?? t('actions.signingFailed'), 'warn');
      return null;
    }

    const published = await relay.publish(signed);
    if (!published.count) toast(t('actions.signedNoRelay'), 'warn');
    else toast(t('actions.signedPublishedRelays', { count: published.count, total: published.total }), 'ok');
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
      toast(t('actions.orgKeyUnavailable'), 'warn');
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
      if (!published.count) toast(t('actions.orgProfileNoRelay'), 'warn');
      return { event: signed, published };
    } catch (error) {
      toast(error?.message ?? t('actions.orgProfilePublishFailed'), 'warn');
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
      toast(t('actions.addDisplayNameBeforeSaving'), 'warn');
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
      title: t('actions.updateProfile'),
      action: el('span', {}, [
        el('strong', {}, t('actions.publishProfile')),
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
    toast(t('actions.profilePublished'), 'ok');
    return true;
  }

  // Academy-scoped private name (gender, first/last name) plus its visibility
  // policy. Never a public record: it stays on-device and is delivered only as
  // an encrypted record to the assigned teachers of the learner's classes, so a
  // teacher on another device can read an authorized name. This mirrors the
  // private data plane in docs/architecture/data-model.md until the private API
  // endpoints exist.
  function savePrivateName(fields = {}) {
    const current = state();
    const persona = getPersona(current.personaId);
    const role = fields.role ?? persona.role;
    const check = validatePrivateName(fields);
    if (!check.valid) {
      toast(t('actions.privateNameRequired'), 'warn');
      return false;
    }
    const record = {
      ...normalizePrivateName(fields, { role }),
      subjectId: persona.id,
      role: role ?? null,
      updatedAt: new Date().toISOString(),
    };
    update({ privateNames: { ...(current.privateNames ?? {}), [persona.id]: record } });

    const teachers = new Set();
    for (const room of classroomsForStudent(current.classrooms ?? [], persona.id, current.capabilities ?? [])) {
      if (room.teacherId && room.teacherId !== persona.id) teachers.add(room.teacherId);
    }
    if (teachers.size && signer.canSign()) {
      publishRecord({
        type: RECORD_TYPES.PRIVATE_NAME,
        id: persona.id,
        payload: record,
        recipients: [...teachers],
        encrypted: true,
        title: t('actions.privateNameDelivery'),
        action: el('span', {}, t('actions.privateNameShared', { name: formatPrivateName(record) })),
      });
    }

    toast(
      teachers.size ? t('actions.privateNameSavedShared') : t('actions.privateNameSaved'),
      'ok',
    );
    return true;
  }

  async function uploadImage(blob, { server } = {}) {
    if (!blob) return null;
    if (!signer.canSign()) {
      toast(t('actions.connectSignerToUpload'), 'warn');
      return null;
    }
    const target = normalizeBlossomServer(server ?? state().blossomServer);
    try {
      toast(t('actions.uploadingImage'), 'info');
      const result = await uploadBlob({
        blob,
        server: target,
        signer,
        title: t('actions.uploadImage'),
        action: el('span', {}, [
          el('strong', {}, t('actions.uploadToBlossom')),
          el('br'),
          `${target.replace(/^https?:\/\//, '')} · ${Math.max(1, Math.round(blob.size / 1024))} KB`,
        ]),
      });
      if (!result) return null;
      toast(t('actions.imageUploaded'), 'ok');
      return result.url;
    } catch (error) {
      toast(error?.message ?? t('actions.imageUploadFailed'), 'warn');
      return null;
    }
  }

  async function uploadAttachment(file, { server } = {}) {
    if (!file) return null;
    if (!signer.canSign()) {
      toast(t('actions.connectSignerToUpload'), 'warn');
      return null;
    }
    const target = normalizeBlossomServer(server ?? state().blossomServer);
    try {
      toast(t('actions.uploadingFile'), 'info');
      const result = await uploadBlob({
        blob: file,
        server: target,
        signer,
        title: t('actions.uploadFile'),
        action: el('span', {}, [
          el('strong', {}, t('actions.uploadToBlossom')),
          el('br'),
          `${String(file.name ?? 'file')} · ${Math.max(1, Math.round((file.size ?? 0) / 1024))} KB`,
        ]),
      });
      if (!result) return null;
      toast(t('actions.fileUploaded'), 'ok');
      return {
        name: String(file.name ?? 'file'),
        url: result.url,
        type: file.type ?? null,
        size: file.size ?? null,
      };
    } catch (error) {
      toast(error?.message ?? t('actions.fileUploadFailed'), 'warn');
      return null;
    }
  }

  function setBlossomServer(server) {
    update({ blossomServer: normalizeBlossomServer(server) });
  }

  function setMode(mode) {
    const next = normalizeMode(mode);
    update({ mode: next });
    toast(t('actions.modeSet', { mode: next }), 'ok');
    return next;
  }

  function setLocale(locale) {
    const next = availableLocales().includes(locale) ? locale : 'en';
    setI18nLocale(next);
    update({ locale: next });
    return next;
  }

  // Local preferences (privacy / zap / network). Stored in app state so every
  // observer re-renders, and persisted by services/storage.js.
  function updatePrefs(section, patch = {}) {
    const current = state().prefs;
    const next =
      section === 'privacy'
        ? setPrivacyPrefs(current, patch)
        : section === 'zap'
          ? setZapPrefs(current, patch)
          : section === 'network'
            ? setNetworkPrefs(current, patch)
            : current;
    update({ prefs: next });
    return next;
  }

  function toggleSubscription(kind, enabled) {
    update({ prefs: setSubscriptionPrefs(state().prefs, kind, enabled) });
  }

  function zapPresets() {
    return zapAmountsPref(state().prefs);
  }

  function defaultPow() {
    return defaultPowPref(state().prefs);
  }

  // Drops local caches (feed paint, Giphy, and the icon cache) without touching
  // keys, records, or any signed data. Safe to run at any time.
  async function clearCache() {
    clearFeedCache();
    clearGifCache();
    await clearIconCache().catch(() => {});
    toast(t('actions.cacheCleared'), 'ok');
  }

  // Force-refresh the app shell. Retires the offline service worker and drops
  // its caches so a new deploy can never be shadowed by a stale copy, then
  // reloads with a cache-busting query in case an HTTP/CDN cache also holds the
  // old index.html. index.html re-registers the worker on the next load.
  async function forceUpdate() {
    toast(t('actions.updating'), 'info');
    try {
      if (typeof caches !== 'undefined') {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
      }
    } catch {
      /* reload anyway */
    }
    const url = new URL(location.href);
    url.searchParams.set('v', Date.now().toString(36));
    location.replace(url.toString());
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
    toast(t('actions.fetchingProfile'), 'info');
    const result = await fetchProfile(me);
    toast(
      result ? t('actions.profileRefreshed') : t('actions.noProfileFound'),
      result ? 'ok' : 'warn',
    );
    return Boolean(result);
  }

  // Resolve any npub/hex reference to its kind-0 profile from relays. Used by
  // the About page to credit the owner (bitos.space) and read their Lightning
  // address for donations. Read-only: it never publishes or touches the session.
  function resolveProfile(reference) {
    const decoded = decodeKey(reference);
    const pubkey = decoded?.pubkey ?? null;
    const npub = pubkey ? encodeNpub(pubkey) : String(reference ?? '');
    if (!pubkey) return Promise.resolve({ pubkey: null, npub, profile: null });
    return new Promise((resolve) => {
      let settled = false;
      let sub = null;
      let best = null;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        sub?.close?.();
        resolve({ pubkey, npub, profile: best });
      };
      const timer = setTimeout(finish, 7000);
      sub = relay.subscribe([{ kinds: [KIND.PROFILE], authors: [pubkey], limit: 1 }], {
        onEvent: (event) => {
          if (event.pubkey !== pubkey) return;
          const meta = parseProfileMeta(event.content);
          if (!meta) return;
          if (!best || (event.created_at ?? 0) >= (best.createdAt ?? 0)) {
            best = { ...meta, createdAt: event.created_at ?? 0 };
          }
          finish();
        },
        onEose: finish,
      });
    });
  }

  // Open a profile page for any npub/hex/nprofile reference. The public key
  // travels in the route, so a profile is shareable as a plain hash link.
  function openProfile(reference) {
    const pubkey = recipientPubkey(reference);
    if (!pubkey) {
      toast(t('profile.invalid'), 'warn');
      return null;
    }
    const ref = encodeNpub(pubkey);
    if (state().route === `/profile/${ref}`) {
      store.setState({});
      return ref;
    }
    navigate(`/profile/${ref}`);
    return ref;
  }

  const emptyTimeline = (pubkey = null, status = 'idle') => ({
    pubkey,
    status,
    events: [],
    zaps: [],
    zapsStatus: 'idle',
    likes: [],
    likesStatus: 'idle',
  });

  // The public notes and replies an author published, for the profile page.
  // Read-only and page-scoped: they live in `state.profileTimeline`, never in
  // `state.events`, so browsing a profile cannot re-rank or pollute For-you /
  // Latest — while the shared engagement actions still resolve them by id.
  // One author query feeds Notes, Replies, and Media (the card carries
  // `replyTo`, and files ride along), so those tabs need no extra round-trip.
  function loadProfileNotes(reference) {
    const pubkey = recipientPubkey(reference);
    if (!pubkey) {
      update({ profileTimeline: emptyTimeline() });
      return Promise.resolve([]);
    }
    const items = [];
    const seen = new Set();
    // Only the newest visit owns the slice: a slow query for a profile the
    // user already left must not overwrite the profile they are viewing.
    const owns = () => state().profileTimeline?.pubkey === pubkey;
    const commit = (status) => {
      if (!owns()) return;
      const events = [...items].sort(
        (left, right) => Date.parse(right.occurredAt ?? '') - Date.parse(left.occurredAt ?? ''),
      );
      update({ profileTimeline: { ...state().profileTimeline, events, status } });
    };
    update({ profileTimeline: emptyTimeline(pubkey, 'loading') });
    return new Promise((resolve) => {
      let settled = false;
      let sub = null;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        sub?.close?.();
        commit('ready');
        resolve([...items]);
      };
      const timer = setTimeout(finish, 7000);
      sub = relay.subscribe([{ kinds: [KIND.NOTE], authors: [pubkey], limit: PROFILE_NOTE_LIMIT }], {
        onEvent: (event) => {
          if (event.pubkey !== pubkey || seen.has(event.id)) return;
          // Keep replies too (`allowReply`); the Replies tab filters on `replyTo`.
          const mapped = threadEventFromNote(event);
          if (!mapped) return;
          seen.add(event.id);
          items.push(mapped);
          commit('loading');
        },
        onEose: finish,
      });
    });
  }

  // Zaps the author received (NIP-57 receipts addressed to them). Reused by the
  // Zaps tab and the "Sats received" stat; loaded lazily on first tab open.
  function loadProfileZaps(reference) {
    const pubkey = recipientPubkey(reference);
    if (!pubkey || !state().profileTimeline || state().profileTimeline.pubkey !== pubkey) {
      return Promise.resolve([]);
    }
    const owns = () => state().profileTimeline?.pubkey === pubkey;
    const zaps = [];
    const seen = new Set();
    const commit = (status) => {
      if (!owns()) return;
      update({ profileTimeline: { ...state().profileTimeline, zaps: sortZaps(zaps), zapsStatus: status } });
    };
    commit('loading');
    return new Promise((resolve) => {
      let settled = false;
      let sub = null;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        sub?.close?.();
        commit('ready');
        resolve([...zaps]);
      };
      const timer = setTimeout(finish, 7000);
      sub = relay.subscribe([{ kinds: [KIND.ZAP], '#p': [pubkey], limit: 50 }], {
        onEvent: (event) => {
          if (seen.has(event.id)) return;
          const zap = zapFromReceipt(event, pubkey);
          if (!zap || zap.direction !== ZAP_DIRECTION.IN) return;
          seen.add(event.id);
          zaps.push(zap);
          commit('loading');
        },
        onEose: finish,
      });
    });
  }

  // Notes the author liked: their kind:7 reactions, then the referenced notes.
  // Two phases in one visit; loaded lazily on first open of the Likes tab.
  function loadProfileLikes(reference) {
    const pubkey = recipientPubkey(reference);
    if (!pubkey || !state().profileTimeline || state().profileTimeline.pubkey !== pubkey) {
      return Promise.resolve([]);
    }
    const owns = () => state().profileTimeline?.pubkey === pubkey;
    const targetIds = new Set();
    const liked = [];
    const seen = new Set();
    const commit = (status) => {
      if (!owns()) return;
      const events = [...liked].sort(
        (left, right) => Date.parse(right.occurredAt ?? '') - Date.parse(left.occurredAt ?? ''),
      );
      update({ profileTimeline: { ...state().profileTimeline, likes: events, likesStatus: status } });
    };
    commit('loading');
    return new Promise((resolve) => {
      let settled = false;
      let reactionsDone = false;
      let notesDone = false;
      let reactSub = null;
      let notesSub = null;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reactSub?.close?.();
        notesSub?.close?.();
        commit('ready');
        resolve([...liked]);
      };
      const timer = setTimeout(() => {
        reactionsDone = true;
        notesDone = true;
        finish();
      }, 8000);
      const fetchLikedNotes = () => {
        const ids = [...targetIds].filter((id) => /^[0-9a-f]{64}$/.test(id)).slice(0, 80);
        if (!ids.length) {
          notesDone = true;
          finish();
          return;
        }
        notesSub = relay.subscribe([{ kinds: [KIND.NOTE], ids }], {
          onEvent: (event) => {
            if (seen.has(event.id)) return;
            const mapped = threadEventFromNote(event);
            if (!mapped) return;
            seen.add(event.id);
            liked.push(mapped);
            commit('loading');
          },
          onEose: () => {
            notesDone = true;
            if (reactionsDone) finish();
          },
        });
      };
      reactSub = relay.subscribe([{ kinds: [KIND.REACTION], authors: [pubkey], limit: 80 }], {
        onEvent: (event) => {
          if (event.content === '-') return; // a dislike, not a like
          for (const tag of event.tags ?? []) {
            if (tag?.[0] === 'e' && tag?.[1]) targetIds.add(tag[1]);
          }
        },
        onEose: () => {
          reactionsDone = true;
          reactSub?.close?.();
          fetchLikedNotes();
        },
      });
    });
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

  function publishRecord({
    type,
    id,
    payload,
    recipients = [],
    encrypted = false,
    // Encrypted records are gift-wrapped by default so relays cannot see the
    // real author or recipient. Pass giftWrap: false to force plain NIP-44.
    giftWrap = encrypted,
    head = null,
    title,
    action,
    detail,
  } = {}) {
    if (!signer.canSign()) return Promise.resolve(null);
    const plaintext = encodeRecord(type, id, payload);

    // Encrypted records (homework, submissions, scores) are saved locally even
    // when no relay accepts them, so tell the sender instead of leaving the
    // recipient with nothing and a "saved" toast.
    const warnIfUnpublished = (result) => {
      if (result && result.count === 0) toast(t('actions.signedNoRelay'), 'warn');
      return result;
    };

    const run = async () => {
      if (encrypted && giftWrap) {
        const active = signer.getSigner();
        if (!active?.nip44Encrypt || !active?.signEvent) {
          toast(t('actions.signerCannotGiftWrap'), 'warn');
          return null;
        }
        let last = null;
        for (const recipient of recipients.filter(Boolean)) {
          last = await enqueueRecipientPublish(recipient, async () => {
            const wrap = await wrapForRecipient({
              content: plaintext,
              recipient,
              signer: active,
              kind: RECORD_RUMOR_KIND,
            });
            if (!wrap) return null;
            return relay.publish(wrap);
          });
        }
        if (last) update({ deliveries: [...relaySnapshot(last), ...state().deliveries] });
        return warnIfUnpublished(last);
      }

      if (encrypted) {
        if (!signer.canEncrypt()) {
          toast(t('actions.signerCannotEncrypt'), 'warn');
          return null;
        }
        let last = null;
        for (const recipient of recipients.filter(Boolean)) {
          const ciphertext = await signer.encrypt(recipient, plaintext);
          const event = buildEvent({
            kind: recordKind(type),
            tags: recordTags(type, id, { recipients: [recipient], head }),
            content: ciphertext,
          });
          const signed = await signRecord(event, { title, action, detail });
          if (!signed) return last;
          last = await relay.publish(signed);
        }
        if (last) update({ deliveries: [...relaySnapshot(last), ...state().deliveries] });
        return warnIfUnpublished(last);
      }

      const event = buildEvent({
        kind: recordKind(type),
        tags: recordTags(type, id, {
          code: type === RECORD_TYPES.JOIN_LINK ? payload?.code : null,
          head,
        }),
        content: plaintext,
      });
      const signed = await signRecord(event, { title, action, detail });
      if (!signed) return null;
      const published = await relay.publish(signed);
      update({ deliveries: [...relaySnapshot(published), ...state().deliveries] });
      return warnIfUnpublished(published);
    };

    return run().catch((error) => {
      toast(error?.message ?? t('actions.recordPublishFailed'), 'warn');
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
      role: profile.role ?? getPersona(pubkey).role ?? null,
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
      toast(t('actions.noNostrExtension'), 'warn');
      return false;
    }
    let pubkey;
    try {
      const active = extensionSigner();
      pubkey = await active.getPublicKey();
      applySession({ method: 'extension', pubkey, profile: {}, activeSigner: active });
    } catch (error) {
      toast(error?.message ?? t('actions.extensionRefused'), 'warn');
      return false;
    }
    acceptPendingInvite();
    navigateTo('/home');
    toast(t('actions.signedInWithExtension'), 'ok');
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
      toast(t('actions.enterDisplayNameFirst'), 'warn');
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
        toast(t('actions.handleTakenTryAnother', { handle: result.handle }), 'warn');
        return false;
      }
      resolvedHandle = result.handle;
    }

    const current = state();
    const isOwner = role === ROLE.OWNER;
    const pendingInvite = current.pendingInviteCode;
    const requestedAcademy = String(academyName ?? '').trim() || t('actions.academyNamedFor', { name });

    if (signerTypeId === 'bunker') {
      toast(t('actions.connectBunkerFirst'), 'warn');
      return false;
    }

    let activeSigner;
    let pubkey;
    if (signerTypeId === 'extension') {
      activeSigner = extensionSigner();
      try {
        pubkey = await activeSigner.getPublicKey();
      } catch (error) {
        toast(error?.message ?? t('actions.extensionRefused'), 'warn');
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
      title: t('actions.publishProfile'),
      action: el('span', {}, [
        el('strong', {}, t('actions.publishProfile')),
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
        title: t('actions.createAcademy'),
        action: el('span', {}, [
          el('strong', {}, t('actions.createNamed', { name: requestedAcademy })),
          el('br'),
          t('actions.becomeOwnerInvite'),
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
              occurredAt: new Date().toISOString(),
              context: academy.name,
              audience: 'all',
              text: t('actions.createdAcademyBecameOwner', { name: academy.name }),
            },
            ...current.events,
          ]
        : current.events,
    });

    if (pendingInvite && !isOwner) acceptPendingInvite();

    navigateTo(isOwner ? '/role' : '/home');
    toast(isOwner ? t('actions.academyCreatedNamed', { name: academy.name }) : t('actions.accountCreatedBackupKey'), 'ok');
    return true;
  }

  async function signInWithKey({ key, displayName, role = ROLE.STUDENT } = {}) {
    const value = String(key ?? '').trim();
    if (!value) {
      toast(t('actions.pasteKey'), 'warn');
      return false;
    }
    if (!isKeyLike(value)) {
      toast(t('actions.invalidKey'), 'warn');
      return false;
    }

    const decoded = decodeKey(value);
    if (!decoded?.pubkey) {
      toast(t('actions.keyUnreadable'), 'warn');
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
    // Keep a role this device already knows (owner/teacher) instead of
    // resetting a returning owner back to the learner workspace.
    const knownRole = getPersona(decoded.pubkey).role;
    applySession({
      method,
      pubkey: decoded.pubkey,
      profile: { displayName: name || undefined, role: knownRole ?? role },
      activeSigner,
    });

    acceptPendingInvite();
    navigateTo('/home');
    toast(
      activeSigner
        ? t('actions.signedInWithKey')
        : t('actions.readOnlyIdentity'),
      activeSigner ? 'ok' : 'warn',
    );
    return true;
  }

  async function signOut() {
    const ok = await confirm({
      title: t('actions.signOutTitle'),
      body: t('actions.signOutBody'),
      confirmLabel: t('common.actions.signOut'),
    });
    if (!ok) return false;

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
      submissionVersions: [],
      assessmentRevisions: [],
      joinRequests: [],
      enrollRequests: [],
      events: [],
      signQueue: [],
      recommendations: [],
      capabilities: [],
      credentials: [],
      // Private names are device-local person data, not session data. Keep them
      // so a teacher signing in on the same device can still read an enrolled
      // student's name through the authorization check. They are never relayed.
      deliveries: [],
      lastCreated: null,
    });
    navigate('/welcome');
    toast(t('actions.signedOut'), 'info');
    return true;
  }

  async function createAcademy({ name, type = 'school', timeZone = 'UTC' } = {}) {
    const current = state();
    const persona = getPersona(current.personaId);
    const academyName = String(name ?? '').trim();
    if (!academyName) {
      toast(t('actions.nameAcademyFirst'), 'warn');
      return false;
    }

    const existing = ownedAcademy(current, persona.id);
    if (existing) {
      toast(t('actions.alreadyOwnAcademy', { name: existing.name }), 'info');
      return false;
    }

    const academy = newAcademy({ name: academyName, type, timeZone, ownerId: persona.id });

    const signed = await signAndPublish({
      title: t('actions.createAcademy'),
      action: el('span', {}, [
        el('strong', {}, t('actions.createNamed', { name: academyName })),
        el('br'),
        `${persona.displayName} · `,
        el('span', { class: 'mono' }, truncateNpub(persona.npub)),
        el('br'),
        t('actions.becomeOwnerControlRecords'),
      ]),
      ...recordPayload('academy', academy.id, academy),
    });
    if (!signed) return false;

    registerPersona({ ...persona, role: ROLE.OWNER });
    registerAcademyPersona(academy);
    await publishOrgProfile(academy);
    update({
      academies: { ...current.academies, [persona.id]: academy },
      profiles: {
        ...current.profiles,
        [academy.orgPubkey]: getPersona(academy.orgPubkey),
        [persona.id]: getPersona(persona.id),
      },
      session: current.session ? { ...current.session, role: ROLE.OWNER } : current.session,
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
          occurredAt: new Date().toISOString(),
          context: academyName,
          audience: 'all',
          text: t('actions.createdAcademyBecameOwner', { name: academyName }),
        },
        ...current.events,
      ],
    });
    navigateTo('/role');
    toast(t('actions.academyCreatedInvite', { name: academyName }), 'ok');
    return true;
  }

  async function updateAcademyInfo({ name, about = '', picture = '', type, timeZone, handle } = {}) {
    const current = state();
    const academy = ownedAcademy(current, current.personaId);
    if (!academy) {
      toast(t('actions.createAcademyBeforeEditingInfo'), 'warn');
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
      title: t('actions.updateAcademyInfo'),
      action: el('span', {}, [
        el('strong', {}, t('actions.updateNamed', { name: nextName })),
        el('br'),
        t('actions.repostAcademyRecord'),
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
          occurredAt: new Date().toISOString(),
          context: nextName,
          audience: 'all',
          text: t('actions.updatedAcademyProfile', { name: nextName }),
        },
        ...state().events,
      ],
    });
    toast(
      profile
        ? t('actions.academyInfoUpdated')
        : t('actions.academyInfoSavedLocally'),
      profile ? 'ok' : 'warn',
    );
    return true;
  }

  function inviteTeacher({ target, name = '' } = {}) {
    const current = state();
    const academy = ownedAcademy(current, current.personaId);
    if (!academy) {
      toast(t('actions.createAcademyBeforeInvitingTeachers'), 'warn');
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
          occurredAt: new Date().toISOString(),
          context: academy.name,
          audience: [normalizedTarget],
          text: t('actions.invitedToTeach', { label, academy: academy.name }),
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
        title: t('actions.sendInvite'),
        action: el('span', {}, t('actions.sendTeacherInvite', { label })),
      });
    } else {
      publishJoinLink(invite, t('actions.publishTeacherJoinLink', { academy: academy.name }));
    }
    toast(t('actions.inviteReadyFor', { label }), 'ok');
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
        title: t('actions.publishAcademy'),
        action: el('span', {}, t('actions.publishAcademyForJoinLinks', { name: academy.name })),
      });
      if (!academyPublished?.count) {
        toast(t('actions.academyRecordNotAccepted'), 'warn');
        return false;
      }
    }

    const published = await publishRecord({
      type: RECORD_TYPES.JOIN_LINK,
      id: invite.id,
      payload: publicLinkPayload(invite),
      title: t('actions.publishJoinLink'),
      action: el('span', {}, message),
    });
    if (!published?.count) {
      toast(t('actions.joinLinkSavedNoRelay'), 'warn');
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
    return publishJoinLink(invite, t('actions.publishThisJoinLink'));
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

  // A shared invite code is public data. Look it up directly by its `code` tag
  // so a learner can join even when the bounded catalog query missed the record
  // (some relays return an early EOSE for the broad catalog subscription).
  function lookupInvite(reference, { timeoutMs = 6000 } = {}) {
    const code = parseInviteReference(reference) ?? reference;
    const current = state();
    const local = findInviteByCode(current.invites ?? [], code);
    if (local) return Promise.resolve(local);
    if (!code || typeof relay?.subscribe !== 'function') return Promise.resolve(null);

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
      const timer = setTimeout(() => finish(null), timeoutMs);
      // Filter by the indexed `#t` app tag; `code` is a multi-letter tag many
      // relays do not index for filters, so match it on the client instead.
      sub = relay.subscribe([{ kinds: [KIND.APP_DATA], '#t': [APP_TAG], limit: 200 }], {
        onEvent: (event) => {
          const record = decodeRecord(event.content, event.tags);
          if (record?.type !== RECORD_TYPES.JOIN_LINK) return;
          if (String(record.code ?? '').toLowerCase() !== code) return;
          const patch = applyRecord(state(), record);
          if (patch) update(patch);
          finish(record);
        },
      });
    });
  }

  function createInviteLink(role = ROLE.STUDENT) {
    const current = state();
    const academy = ownedAcademy(current, current.personaId);
    if (!academy) {
      toast(t('actions.createAcademyBeforeSharingLink'), 'warn');
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
      publishJoinLink(existing, t('actions.publishJoinLinkFor', { name: academy.name }));
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
    publishJoinLink(invite, t('actions.publishJoinLinkFor', { name: academy.name }));
    toast(t('actions.joinLinkReady'), 'ok');
    return { ...invite, url: inviteUrl(invite.code, appBase()) };
  }

  async function copyInviteLink(inviteId) {
    const invite = state().invites.find((entry) => entry.id === inviteId);
    if (!invite) return false;
    publishJoinLink(invite, t('actions.publishJoinLinkAnyone'));
    return copyText(inviteUrl(invite.code, appBase()), t('actions.inviteLinkCopied'));
  }

  function revokeInvite(inviteId) {
    const invite = state().invites.find((entry) => entry.id === inviteId);
    if (!invite) return;
    update({
      invites: state().invites.map((entry) =>
        entry.id === inviteId ? { ...entry, status: INVITE_STATUS.REVOKED } : entry,
      ),
    });
    publishJoinLink({ ...invite, status: INVITE_STATUS.REVOKED }, t('actions.revokeThisJoinLink'));
    toast(t('actions.inviteRevoked'), 'warn');
  }

  function rememberInvite(reference) {
    const invite = findInviteByCode(state().invites, parseInviteReference(reference));
    if (!invite || invite.status !== INVITE_STATUS.PENDING) {
      toast(t('actions.inviteLinkInvalid'), 'warn');
      return false;
    }
    update({ pendingInviteCode: invite.code });
    return true;
  }

  async function acceptInvite(reference, { prove = true } = {}) {
    const current = state();
    const invite = findInviteByCode(current.invites, parseInviteReference(reference) ?? reference);
    if (!invite) {
      toast(t('actions.inviteLinkNotRecognized'), 'warn');
      return false;
    }
    if (invite.status !== INVITE_STATUS.PENDING) {
      toast(t('actions.inviteUsedOrRevoked'), 'warn');
      return false;
    }

    if (prove) {
      const persona = getPersona(current.personaId);
      const academy = academyById(current, invite.academyId);
      const classroom = invite.classroomId
        ? classroomById(current.classrooms ?? [], invite.classroomId)
        : null;
      const approved = await signer.request({
        title: t('actions.acceptInvitation'),
        action: el('span', {}, [
          el('strong', {}, t('actions.joinNamed', { name: classroom?.name ?? academy?.name ?? t('actions.theAcademy') })),
          el('br'),
          t('actions.asARole', { role: t(inviteRoleKey(invite.role)) }),
          el('span', { class: 'mono' }, truncateNpub(persona.npub)),
        ]),
      });
      if (!approved.approved) {
        toast(t('actions.notSignedNothingChanged'), 'warn');
        return false;
      }
    }

    return applyInvite(invite);
  }

  function createSubject({ name, code = '' } = {}) {
    const current = state();
    const academy = ownedAcademy(current, current.personaId);
    if (!academy) {
      toast(t('actions.openAcademyFirst'), 'warn');
      return null;
    }
    const subjectName = String(name ?? '').trim();
    if (!subjectName) {
      toast(t('actions.nameSubjectFirst'), 'warn');
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
          occurredAt: new Date().toISOString(),
          context: academy.name,
          audience: 'all',
          text: t('actions.addedSubject', { name: subjectName }),
        },
        ...current.events,
      ],
    });
    publishRecord({
      type: 'subject',
      id: subject.id,
      payload: subject,
      title: t('actions.publishSubject'),
      action: el('span', {}, t('actions.publishSubjectNamed', { name: subjectName })),
    });
    toast(t('actions.subjectAdded', { name: subjectName }), 'ok');
    return subject;
  }

  function updateSubject({ subjectId, name, code = '' } = {}) {
    const current = state();
    const academy = ownedAcademy(current, current.personaId);
    const subject = subjectById(current.subjects ?? [], subjectId);
    if (!academy || !subject || subject.academyId !== academy.id) {
      toast(t('actions.subjectNotInAcademy'), 'warn');
      return false;
    }
    const nextName = String(name ?? '').trim();
    if (!nextName) {
      toast(t('actions.nameSubjectFirst'), 'warn');
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
          occurredAt: new Date().toISOString(),
          context: academy.name,
          audience: 'all',
          text: t('actions.updatedSubject', { name: nextName }),
        },
        ...current.events,
      ],
    });
    publishRecord({
      type: 'subject',
      id: updated.id,
      payload: updated,
      title: t('actions.updateSubject'),
      action: el('span', {}, t('actions.publishUpdatedSubject', { name: nextName })),
    });
    toast(t('actions.subjectUpdated', { name: nextName }), 'ok');
    return true;
  }

  async function deleteSubject(subjectId) {
    const current = state();
    const academy = ownedAcademy(current, current.personaId);
    const subject = subjectById(current.subjects ?? [], subjectId);
    if (!academy || !subject || subject.academyId !== academy.id) {
      toast(t('actions.subjectNotInAcademy'), 'warn');
      return false;
    }
    if (subjectInUse(current.classrooms ?? [], subjectId)) {
      toast(t('actions.moveOrDeleteClassrooms'), 'warn');
      return false;
    }
    const ok = await confirm({
      title: t('actions.deleteNamed', { name: subject.name }),
      body: t('actions.subjectDeletedBody'),
      confirmLabel: t('common.actions.delete'),
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
          occurredAt: new Date().toISOString(),
          context: academy.name,
          audience: 'all',
          text: t('actions.removedSubject', { name: subject.name }),
        },
        ...current.events,
      ],
    });
    publishRecord({
      type: 'subject',
      id: subjectId,
      payload: { ...subject, deleted: true },
      title: t('actions.deleteSubject'),
      action: el('span', {}, t('actions.removeSubjectNamed', { name: subject.name })),
    });
    toast(t('actions.subjectRemoved', { name: subject.name }), 'warn');
    return true;
  }

  function createClassroom({ subjectId, name, term = '', teacherId = null, inviteTarget = '', inviteName = '' } = {}) {
    const current = state();
    const academy = ownedAcademy(current, current.personaId);
    if (!academy) {
      toast(t('actions.createAcademyFirst'), 'warn');
      return null;
    }
    const subject = subjectById(current.subjects ?? [], subjectId);
    if (!subject) {
      toast(t('actions.pickSubjectForClassroom'), 'warn');
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
          occurredAt: new Date().toISOString(),
          context: subject.name,
          audience: 'all',
          text: t(assigned ? 'actions.createdClassroom' : 'actions.createdClassroomInvitedTeacher', { name: className, subject: subject.name }),
        },
        ...current.events,
      ],
    });
    publishRecord({
      type: 'classroom',
      id: classroom.id,
      payload: toPublicRecord(classroom),
      title: t('actions.publishClassroom'),
      action: el('span', {}, t('actions.publishClassroomNamed', { name: className, subject: subject.name })),
    });
    toast(
      assigned
        ? t('actions.classroomPublishedEnrollable', { name: className })
        : t('actions.classroomCreatedInviteTeacher', { name: className }),
      'ok',
    );
    return classroom;
  }

  function publishClassroom(classroomId) {
    const current = state();
    const classroom = classroomById(current.classrooms ?? [], classroomId);
    if (!classroom) return false;
    if (!classroom.teacherId) {
      toast(t('actions.assignTeacherBeforePublishing'), 'warn');
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
      title: t('actions.publishClassroom'),
      action: el('span', {}, t('actions.publishClassroomToCatalog', { name: classroom.name })),
    });
    toast(t('actions.classroomPublishedVisible', { name: classroom.name }), 'ok');
    return true;
  }

  function assignClassTeacher(classroomId, teacherId) {
    const current = state();
    const classroom = classroomById(current.classrooms ?? [], classroomId);
    if (!classroom) return false;
    const updated = { ...classroom, teacherId, status: CLASS_STATUS.PUBLISHED };
    const capability = createCapability({
      kind: CAPABILITY.TEACHER_ASSIGNMENT,
      academyId: classroom.academyId,
      accountId: teacherId,
      classroomId: classroom.id,
      role: ROLE.TEACHER,
      issuedBy: current.personaId,
    });
    update({
      classrooms: current.classrooms.map((room) => (room.id === classroomId ? updated : room)),
      capabilities: upsertCapability(current.capabilities, capability),
    });
    publishRecord({
      type: 'classroom',
      id: updated.id,
      payload: toPublicRecord(updated),
      title: t('actions.assignTeacher'),
      action: el('span', {}, t('actions.assignTeacherTo', { name: classroom.name })),
    });
    if (capability && canPublish()) {
      publishRecord({
        type: RECORD_TYPES.CAPABILITY,
        id: capability.id,
        payload: capability,
        recipients: [teacherId],
        encrypted: true,
        title: t('actions.grantTeacherAssignment'),
        action: el('span', {}, t('actions.signTeacherAssignment', { name: classroom.name })),
      });
    }
    toast(t('actions.classroomAssignedPublished', { name: classroom.name }), 'ok');
    return true;
  }

  function updateClassroom({ classroomId, name, term = '', subjectId, teacherId = null } = {}) {
    const current = state();
    const academy = ownedAcademy(current, current.personaId);
    const classroom = classroomById(current.classrooms ?? [], classroomId);
    if (!academy || !classroom || classroom.academyId !== academy.id) {
      toast(t('actions.classroomNotInAcademy'), 'warn');
      return false;
    }
    const nextName = String(name ?? '').trim();
    if (!nextName) {
      toast(t('actions.nameClassroomFirst'), 'warn');
      return false;
    }
    const nextSubject =
      subjectById(current.subjects ?? [], subjectId) ??
      subjectById(current.subjects ?? [], classroom.subjectId);
    if (!nextSubject) {
      toast(t('actions.pickSubjectForClassroom'), 'warn');
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
          occurredAt: new Date().toISOString(),
          context: nextSubject.name,
          audience: 'all',
          text: t('actions.updatedClassroom', { name: nextName }),
        },
        ...current.events,
      ],
    });
    publishRecord({
      type: 'classroom',
      id: updated.id,
      payload: toPublicRecord(updated),
      title: t('actions.updateClassroom'),
      action: el('span', {}, t('actions.publishChangesTo', { name: nextName })),
    });
    toast(t('actions.classroomUpdated', { name: nextName }), 'ok');
    return true;
  }

  function setClassroomStatus(classroomId, status, message) {
    const current = state();
    const academy = ownedAcademy(current, current.personaId);
    const classroom = classroomById(current.classrooms ?? [], classroomId);
    if (!academy || !classroom || classroom.academyId !== academy.id) {
      toast(t('actions.classroomNotInAcademy'), 'warn');
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
          occurredAt: new Date().toISOString(),
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
      title: status === CLASS_STATUS.ARCHIVED ? t('actions.archiveClassroom') : t('actions.restoreClassroom'),
      action: el('span', {}, `${message}`),
    });
    return true;
  }

  function archiveClassroom(classroomId) {
    const classroom = classroomById(state().classrooms ?? [], classroomId);
    if (!classroom) return false;
    const ok = setClassroomStatus(classroomId, CLASS_STATUS.ARCHIVED, t('actions.archivedClassroom', { name: classroom.name }));
    if (ok) toast(t('actions.classroomArchived', { name: classroom.name }), 'warn');
    return ok;
  }

  function restoreClassroom(classroomId) {
    const classroom = classroomById(state().classrooms ?? [], classroomId);
    if (!classroom) return false;
    const status = classroom.teacherId ? CLASS_STATUS.PUBLISHED : CLASS_STATUS.DRAFT;
    const ok = setClassroomStatus(classroomId, status, t('actions.restoredClassroom', { name: classroom.name }));
    if (ok) {
      toast(
        classroom.teacherId
          ? t('actions.classroomRestoredPublished', { name: classroom.name })
          : t('actions.classroomRestoredDraft', { name: classroom.name }),
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
      toast(t('actions.classroomNotInAcademy'), 'warn');
      return false;
    }
    const activity = classroomActivity(current.homework ?? [], current.submissions ?? [], classroomId);
    const learners = (classroom.studentIds ?? []).length;
    if (activity.homework || activity.submissions || learners) {
      toast(t('actions.archiveInsteadHasWork'), 'warn');
      return false;
    }
    const ok = await confirm({
      title: t('actions.deleteNamed', { name: classroom.name }),
      body: t('actions.classroomDeletedBody'),
      confirmLabel: t('common.actions.delete'),
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
          occurredAt: new Date().toISOString(),
          context: classroom.name,
          audience: 'all',
          text: t('actions.removedClassroom', { name: classroom.name }),
        },
        ...current.events,
      ],
    });
    publishRecord({
      type: 'classroom',
      id: classroomId,
      payload: toPublicRecord({ ...classroom, deleted: true }),
      title: t('actions.deleteClassroom'),
      action: el('span', {}, t('actions.removeClassroomNamed', { name: classroom.name })),
    });
    toast(t('actions.classroomRemoved', { name: classroom.name }), 'warn');
    return true;
  }

  function setCompletionPolicy({ classroomId, minAverage = 0, requireAllHomework = true, latePolicy } = {}) {
    const current = state();
    const classroom = classroomById(current.classrooms ?? [], classroomId);
    if (!classroom || !authorize(ACTION.SET_POLICY, classroomContext(current, classroom))) {
      toast(t('actions.onlyOwnerSetCompletion'), 'warn');
      return false;
    }
    const policy = normalizePolicy({ minAverage, requireAllHomework });
    const updated = {
      ...classroom,
      completion: policy,
      latePolicy:
        latePolicy === undefined ? classroom.latePolicy ?? 'flag' : normalizeLatePolicy(latePolicy),
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
          occurredAt: new Date().toISOString(),
          context: classroom.name,
          audience: 'all',
          text: t('actions.updatedCompletionRules', { name: classroom.name, version: updated.completionVersion }),
        },
        ...current.events,
      ],
    });
    publishRecord({
      type: 'classroom',
      id: updated.id,
      payload: toPublicRecord(updated),
      title: t('actions.completionRules'),
      action: el('span', {}, t('actions.publishCompletionRules', { version: updated.completionVersion, name: classroom.name })),
    });
    toast(t('actions.completionRulesUpdated', { version: updated.completionVersion }), 'ok');
    return true;
  }

  function recommendCompletion({ classroomId, studentId } = {}) {
    const current = state();
    const classroom = classroomById(current.classrooms ?? [], classroomId);
    if (!authorize(ACTION.RECOMMEND_COMPLETION, classroomContext(current, classroom))) {
      toast(t('actions.onlyTeacherOrOwnerRecommend'), 'warn');
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
      toast(t('actions.learnerNotMetRules'), 'warn');
      return false;
    }
    const pending = (current.recommendations ?? []).some(
      (entry) => entry.classroomId === classroomId && entry.studentId === studentId && entry.status === 'recommended',
    );
    if (pending) {
      toast(t('actions.completionAlreadyRecommended'), 'info');
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
          occurredAt: new Date().toISOString(),
          context: classroom.name,
          audience: [studentId, academy?.ownerId].filter(Boolean),
          text: t('actions.recommendedForCompletion', { learner: learner.displayName, name: classroom.name }),
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
        title: t('actions.recommendCompletion'),
        action: el('span', {}, t('actions.sendCompletionRecommendation', { learner: learner.displayName })),
      });
    }
    toast(t('actions.completionRecommendedFor', { name: learner.displayName }), 'ok');
    return true;
  }

  function inviteToClassroom({ classroomId, role = ROLE.STUDENT, target, name = '' } = {}) {
    const current = state();
    const classroom = classroomById(current.classrooms ?? [], classroomId);
    if (!classroom) {
      toast(t('actions.pickClassroomFirst'), 'warn');
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
          occurredAt: new Date().toISOString(),
          context: classroom.name,
          audience: [normalized],
          text: t('actions.invitedToClassAsRole', { label, name: classroom.name, role: t(inviteRoleKey(role)) }),
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
        title: t('actions.sendInvite'),
        action: el('span', {}, t('actions.sendRoleInvite', { role: t(inviteRoleKey(role)), label })),
      });
    } else {
      publishJoinLink(invite, t('actions.publishJoinLinkFor', { name: classroom.name }));
    }
    toast(t('actions.inviteReadyShareLink', { label }), 'ok');
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
      toast(t('actions.pickClassroomFirst'), 'warn');
      return null;
    }
    // Sharing a class link implies the class is open: publish it so the learner
    // who opens the link can actually join.
    if (classroom.status !== CLASS_STATUS.PUBLISHED && canManageClassroom(current, classroom)) {
      const published = { ...classroom, status: CLASS_STATUS.PUBLISHED, teacherId: classroom.teacherId ?? current.personaId };
      update({
        classrooms: (current.classrooms ?? []).map((entry) => (entry.id === published.id ? published : entry)),
      });
      publishRecord({
        type: RECORD_TYPES.CLASSROOM,
        id: published.id,
        payload: toPublicRecord(published),
        title: t('actions.publishClassroom'),
        action: el(
          'span',
          {},
          t('actions.publishClassroomNamed', {
            name: published.name,
            subject: subjectById(current.subjects ?? [], published.subjectId)?.name ?? published.name,
          }),
        ),
      });
    }
    const existing = (current.invites ?? []).find(
      (invite) =>
        invite.classroomId === classroomId &&
        invite.role === ROLE.STUDENT &&
        invite.status === INVITE_STATUS.PENDING &&
        !invite.target,
    );
    if (existing) {
      publishJoinLink(existing, t('actions.publishJoinLinkFor', { name: classroom.name }));
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
    publishJoinLink(invite, t('actions.publishJoinLinkFor', { name: classroom.name }));
    toast(t('actions.classJoinLinkReady'), 'ok');
    return { ...invite, url: inviteUrl(invite.code, appBase()) };
  }

  function createHomework({
    classroomId,
    title,
    instructions = '',
    due = '',
    dueAt = '',
    maxScore = 100,
    rubric = [],
    link = '',
    cover = '',
    files = [],
    publish = true,
  } = {}) {
    const current = state();
    const classroom = classroomById(current.classrooms ?? [], classroomId);
    if (!classroom) {
      toast(t('actions.pickClassroomFirst'), 'warn');
      return null;
    }
    if (!canManageClassroom(current, classroom)) {
      toast(t('actions.onlyTeacherOrOwnerPostHomework'), 'warn');
      return null;
    }
    const homeworkTitle = String(title ?? '').trim();
    if (!homeworkTitle) {
      toast(t('actions.addHomeworkTitle'), 'warn');
      return null;
    }
    const criteria = normalizeRubric(rubric);
    const max = criteria.length ? rubricMax(criteria) : Number(maxScore);
    if (!Number.isFinite(max) || max <= 0) {
      toast(criteria.length ? t('actions.rubricPositiveMax') : t('actions.maxScorePositive'), 'warn');
      return null;
    }
    const persona = getPersona(current.personaId);
    const subject = subjectById(current.subjects ?? [], classroom.subjectId);
    const status = publish ? HOMEWORK_STATUS.PUBLISHED : HOMEWORK_STATUS.DRAFT;
    const item = {
      id: nextId('hw'),
      academyId: classroom.academyId,
      classroomId,
      subjectId: classroom.subjectId,
      title: homeworkTitle,
      instructions: String(instructions ?? '').trim(),
      due: String(due ?? '').trim() || t('actions.noDueDate'),
      dueAt: String(dueAt ?? '').trim() || null,
      maxScore: max,
      rubric: criteria,
      link: normalizeUrl(link),
      cover: normalizeUrl(cover),
      files: (Array.isArray(files) ? files : [])
        .filter((file) => file?.url)
        .map((file) => ({
          name: String(file.name ?? 'file'),
          url: String(file.url),
          type: file.type ?? null,
          size: file.size ?? null,
        })),
      status,
      createdBy: persona.id,
      createdAt: new Date().toISOString(),
    };
    update({
      homework: [item, ...(current.homework ?? [])],
      events: [
        {
          id: nextId('e'),
          type: 'homework',
          author: persona.id,
          time: 'now',
          occurredAt: new Date().toISOString(),
          context: `${subject?.name ?? classroom.name} ▸ ${classroom.name}`,
          audience: 'all',
          text: publish
            ? t('actions.publishedHomework', { title: homeworkTitle, due: item.due, max })
            : t('actions.savedHomeworkDraft', { title: homeworkTitle }),
        },
        ...current.events,
      ],
    });
    if (publish) {
      // Address every enrolled account, including learners who self-enrolled
      // through a link (their enrollment arrives as a capability, not a synced
      // studentIds entry).
      const recipients = homeworkRecipients(current, classroom);
      publishRecord({
        type: 'homework',
        id: item.id,
        payload: item,
        recipients,
        encrypted: true,
        title: t('actions.publishHomework'),
        action: el('span', {}, t('actions.sendHomeworkToClass', { title: homeworkTitle })),
      });
      toast(t('actions.homeworkPosted', { title: homeworkTitle }), 'ok');
    } else {
      toast(t('actions.homeworkSavedDraft', { title: homeworkTitle }), 'info');
    }
    return item;
  }

  const backfilledEnrollments = new Set();

  // A learner who enrolled after homework was posted never received those
  // encrypted records. When we (teacher/owner) learn of their enrollment,
  // re-send the class's published homework to them.
  function backfillHomeworkForEnrollment(record) {
    if (!record || record.kind !== CAPABILITY.ENROLLMENT || !record.classroomId || !record.accountId) {
      return false;
    }
    const key = `${record.classroomId}:${record.accountId}`;
    if (backfilledEnrollments.has(key)) return false;
    const current = state();
    if (record.accountId === current.personaId) return false;
    const classroom = classroomById(current.classrooms ?? [], record.classroomId);
    if (!classroom || !canManageClassroom(current, classroom)) return false;
    if (!canPublish()) return false;
    backfilledEnrollments.add(key);
    const homework = (current.homework ?? []).filter(
      (item) => item.classroomId === classroom.id && item.status !== HOMEWORK_STATUS.DRAFT,
    );
    for (const item of homework) {
      publishRecord({
        type: 'homework',
        id: item.id,
        payload: item,
        recipients: [record.accountId],
        encrypted: true,
        title: t('actions.publishHomework'),
        action: el('span', {}, t('actions.sendHomeworkToClass', { title: item.title })),
      });
    }
    return homework.length > 0;
  }

  function publishHomework(homeworkId) {
    const current = state();
    const item = (current.homework ?? []).find((entry) => entry.id === homeworkId);
    if (!item) return false;
    const classroom = classroomById(current.classrooms ?? [], item.classroomId);
    if (!canManageClassroom(current, classroom)) {
      toast(t('actions.onlyTeacherOrOwnerPublishHomework'), 'warn');
      return false;
    }
    if (item.status === HOMEWORK_STATUS.PUBLISHED) return true;
    return setHomeworkStatus(
      homeworkId,
      HOMEWORK_STATUS.PUBLISHED,
      t('actions.publishedHomeworkToClass', { title: item.title }),
      'ok',
    );
  }

  function submitHomework({ homeworkId, text, link = '', files = [] } = {}) {
    const current = state();
    const item = (current.homework ?? []).find((entry) => entry.id === homeworkId);
    if (!item) return false;
    if (!isHomeworkOpen(item)) {
      toast(t('actions.homeworkClosed'), 'warn');
      return false;
    }
    const classroom = classroomById(current.classrooms ?? [], item.classroomId);
    if (!canSubmitWork(current, classroom)) {
      toast(t('actions.onlyEnrolledCanSubmit'), 'warn');
      return false;
    }
    const late = isLate(item);
    if (late && !canSubmitLate(classroom, item)) {
      toast(t('actions.homeworkLateNotAccepted'), 'warn');
      return false;
    }
    const persona = getPersona(current.personaId);
    const body = String(text ?? '').trim();
    const linkUrl = normalizeUrl(link);
    const attachments = (Array.isArray(files) ? files : [])
      .filter((file) => file?.url)
      .map((file) => ({
        name: String(file.name ?? 'file'),
        url: String(file.url),
        type: file.type ?? null,
        size: file.size ?? null,
      }));
    if (!body && !linkUrl && !attachments.length) {
      toast(t('actions.writeAnswerOrAttach'), 'warn');
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
      link: linkUrl,
      files: attachments,
      version,
      status: SUBMISSION_STATUS.SUBMITTED,
      score: null,
      scores: null,
      maxScore: item.maxScore,
      feedback: '',
      late,
      submittedAt: new Date().toISOString(),
      gradedAt: null,
      gradedBy: null,
    };
    // Append an immutable version. The head above stays the mutable pointer and
    // is derived from versions on other devices, so earlier text is never lost.
    const versionRecord = {
      id: nextId('subver'),
      submissionId: submission.id,
      homeworkId,
      classroomId: item.classroomId,
      studentId: persona.id,
      version,
      text: body,
      link: linkUrl,
      files: attachments,
      maxScore: item.maxScore,
      late,
      submittedAt: submission.submittedAt,
    };
    update({
      submissions: existing
        ? (current.submissions ?? []).map((entry) => (entry.id === existing.id ? submission : entry))
        : [submission, ...(current.submissions ?? [])],
      submissionVersions: [
        versionRecord,
        ...(current.submissionVersions ?? []).filter((entry) => entry.id !== versionRecord.id),
      ],
      events: [
        {
          id: nextId('e'),
          type: 'submission',
          author: persona.id,
          time: 'now',
          occurredAt: new Date().toISOString(),
          context: item.title,
          audience: [item.createdBy],
          homeworkId,
          late,
          text: late
            ? t('actions.submittedVersionLate', { version, title: item.title })
            : t('actions.submittedVersion', { version, title: item.title }),
        },
        ...current.events,
      ],
    });
    publishRecord({
      type: RECORD_TYPES.SUBMISSION_VERSION,
      id: versionRecord.id,
      payload: versionRecord,
      recipients: submissionRecipients(current, classroom, item),
      encrypted: true,
      head: headAddress('submission', submission.id, persona.id),
      title: t('actions.submitHomework'),
      action: el('span', {}, t('actions.submitVersionEncrypted', { version, title: item.title })),
    });
    toast(
      late
        ? t('actions.submittedLateToast', { version })
        : t('actions.submittedToast', { version }),
      late ? 'warn' : 'ok',
    );
    return true;
  }

  function gradeSubmission({ submissionId, score, feedback = '', scores = null } = {}) {
    const current = state();
    const submission = (current.submissions ?? []).find((entry) => entry.id === submissionId);
    if (!submission) return false;
    const classroom = classroomById(current.classrooms ?? [], submission.classroomId);
    const alreadyGraded = submission.status === SUBMISSION_STATUS.GRADED;
    const canScore = alreadyGraded
      ? canCorrectAssessment(current, classroom)
      : canFinalizeAssessment(current, classroom);
    if (!canScore) {
      toast(t('actions.onlyTeacherOrOwnerScore'), 'warn');
      return false;
    }
    const homeworkItem = (current.homework ?? []).find((entry) => entry.id === submission.homeworkId);
    const rubric = normalizeRubric(homeworkItem?.rubric);
    let sheet = null;
    let numeric = Number(score);
    // Older submission versions did not carry maxScore; fall back to the
    // homework's max so grading never rejects every value.
    let maxScore = submission.maxScore ?? homeworkItem?.maxScore ?? 100;
    if (rubric.length) {
      sheet = Array.isArray(scores) ? scores : [];
      if (!scoresComplete(sheet, rubric)) {
        toast(t('actions.scoreEveryCriterion'), 'warn');
        return false;
      }
      numeric = scoresTotal(sheet);
      maxScore = rubricMax(rubric);
    } else if (!isValidScore(score, maxScore)) {
      toast(t('actions.enterScoreBetween', { max: maxScore }), 'warn');
      return false;
    }
    const persona = getPersona(current.personaId);
    // Count *all* revisions, not just finalized ones, so a re-grade after a
    // revision request cannot reuse that revision's version number.
    const priorRevisions = (current.assessmentRevisions ?? []).filter(
      (entry) => entry.submissionId === submission.id,
    ).length;
    const gradedAt = new Date().toISOString();
    // Append an immutable assessment revision; corrections and re-grades keep the
    // earlier results instead of overwriting them.
    const revisionRecord = {
      id: nextId('asmt'),
      submissionId: submission.id,
      studentId: submission.studentId,
      homeworkId: submission.homeworkId,
      version: priorRevisions + 1,
      status: 'finalized',
      score: numeric,
      scores: sheet,
      maxScore,
      feedback: String(feedback ?? '').trim(),
      gradedAt,
      gradedBy: persona.id,
    };
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
              gradedAt,
              gradedBy: persona.id,
              assessmentVersion: revisionRecord.version,
            }
          : entry,
      ),
      assessmentRevisions: [
        revisionRecord,
        ...(current.assessmentRevisions ?? []).filter((entry) => entry.id !== revisionRecord.id),
      ],
      events: [
        {
          id: nextId('e'),
          type: 'grade',
          author: persona.id,
          time: 'now',
          occurredAt: new Date().toISOString(),
          context: submission.homeworkId,
          audience: [submission.studentId],
          homeworkId: submission.homeworkId,
          text: t('actions.scoredSubmission', { score: numeric, max: maxScore }),
        },
        ...current.events,
      ],
    });
    publishRecord({
      type: RECORD_TYPES.ASSESSMENT_REVISION,
      id: revisionRecord.id,
      payload: revisionRecord,
      recipients: assessmentRecipients(current, submission),
      encrypted: true,
      head: headAddress('assessment', submission.id, persona.id),
      title: t('actions.sendScore'),
      action: el('span', {}, t('actions.sendScoreToLearner', { score: numeric, max: maxScore })),
    });
    toast(t('actions.scoreSaved', { score: numeric, max: maxScore }), 'ok');
    return true;
  }

  function requestRevision({ submissionId, feedback = '' } = {}) {
    const current = state();
    const submission = (current.submissions ?? []).find((entry) => entry.id === submissionId);
    if (!submission) return false;
    const classroom = classroomById(current.classrooms ?? [], submission.classroomId);
    if (!canFinalizeAssessment(current, classroom)) {
      toast(t('actions.onlyTeacherOrOwnerRequestRevision'), 'warn');
      return false;
    }
    const note = String(feedback ?? '').trim();
    if (!note) {
      toast(t('actions.writeRevisionNote'), 'warn');
      return false;
    }
    const persona = getPersona(current.personaId);
    const homeworkItem = (current.homework ?? []).find((entry) => entry.id === submission.homeworkId);
    const priorRevisions = (current.assessmentRevisions ?? []).filter(
      (entry) => entry.submissionId === submission.id,
    ).length;
    const revisionRecord = {
      id: nextId('asmt'),
      submissionId: submission.id,
      studentId: submission.studentId,
      homeworkId: submission.homeworkId,
      version: priorRevisions + 1,
      status: 'revision',
      score: null,
      scores: null,
      feedback: note,
      requestedAt: new Date().toISOString(),
      requestedBy: persona.id,
    };
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
              assessmentVersion: revisionRecord.version,
            }
          : entry,
      ),
      assessmentRevisions: [
        revisionRecord,
        ...(current.assessmentRevisions ?? []).filter((entry) => entry.id !== revisionRecord.id),
      ],
      events: [
        {
          id: nextId('e'),
          type: 'revision',
          author: persona.id,
          time: 'now',
          occurredAt: new Date().toISOString(),
          context: homeworkItem?.title ?? classroom?.name ?? t('actions.homeworkFallback'),
          audience: [submission.studentId],
          homeworkId: submission.homeworkId,
          actionNeeded: true,
          quote: note,
          text: t('actions.requestedRevision'),
        },
        ...current.events,
      ],
    });
    publishRecord({
      type: RECORD_TYPES.ASSESSMENT_REVISION,
      id: revisionRecord.id,
      payload: revisionRecord,
      recipients: assessmentRecipients(current, submission),
      encrypted: true,
      head: headAddress('assessment', submission.id, persona.id),
      title: t('actions.requestRevision'),
      action: el('span', {}, t('actions.sendRevisionFeedback')),
    });
    toast(t('actions.revisionRequested'), 'ok');
    return true;
  }

  function updateHomework({ homeworkId, title, instructions = '', due = '', dueAt, maxScore, rubric } = {}) {
    const current = state();
    const item = (current.homework ?? []).find((entry) => entry.id === homeworkId);
    if (!item) return false;
    const classroom = classroomById(current.classrooms ?? [], item.classroomId);
    if (!canManageClassroom(current, classroom)) {
      toast(t('actions.onlyTeacherOrOwnerEditHomework'), 'warn');
      return false;
    }
    const nextTitle = String(title ?? '').trim();
    if (!nextTitle) {
      toast(t('actions.addHomeworkTitle'), 'warn');
      return false;
    }
    const criteria = rubric === undefined ? normalizeRubric(item.rubric) : normalizeRubric(rubric);
    const max = criteria.length ? rubricMax(criteria) : Number(maxScore ?? item.maxScore);
    if (!Number.isFinite(max) || max <= 0) {
      toast(criteria.length ? t('actions.rubricPositiveMax') : t('actions.maxScorePositive'), 'warn');
      return false;
    }
    const updated = {
      ...item,
      title: nextTitle,
      instructions: String(instructions ?? '').trim(),
      due: String(due ?? '').trim() || t('actions.noDueDate'),
      dueAt: dueAt === undefined ? item.dueAt ?? null : String(dueAt ?? '').trim() || null,
      maxScore: max,
      rubric: criteria,
      updatedAt: new Date().toISOString(),
    };
    update({
      homework: (current.homework ?? []).map((entry) => (entry.id === homeworkId ? updated : entry)),
      events: [
        {
          id: nextId('e'),
          type: 'homework',
          author: current.personaId,
          time: 'now',
          occurredAt: new Date().toISOString(),
          context: `${classroom?.name ?? t('actions.classFallback')} ▸ ${nextTitle}`,
          audience: 'all',
          text: t('actions.updatedHomeworkEvent', { title: nextTitle, due: updated.due, max }),
        },
        ...current.events,
      ],
    });
    publishRecord({
      type: 'homework',
      id: updated.id,
      payload: updated,
      recipients: homeworkRecipients(current, classroom),
      encrypted: true,
      title: t('actions.updateHomework'),
      action: el('span', {}, t('actions.sendUpdatedHomework', { title: nextTitle })),
    });
    toast(t('actions.homeworkUpdated', { title: nextTitle }), 'ok');
    return true;
  }

  function setHomeworkStatus(homeworkId, status, message, tone = 'info') {
    const current = state();
    const item = (current.homework ?? []).find((entry) => entry.id === homeworkId);
    if (!item) return false;
    const classroom = classroomById(current.classrooms ?? [], item.classroomId);
    if (!canManageClassroom(current, classroom)) {
      toast(t('actions.onlyTeacherOrOwnerChangeHomework'), 'warn');
      return false;
    }
    const updated = { ...item, status, updatedAt: new Date().toISOString() };
    update({
      homework: (current.homework ?? []).map((entry) => (entry.id === homeworkId ? updated : entry)),
      events: [
        {
          id: nextId('e'),
          type: 'homework',
          author: current.personaId,
          time: 'now',
          occurredAt: new Date().toISOString(),
          context: classroom?.name ?? t('actions.classFallback'),
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
      recipients: homeworkRecipients(current, classroom),
      encrypted: true,
      title:
        status === HOMEWORK_STATUS.CLOSED
          ? t('actions.closeHomeworkTitle')
          : status === HOMEWORK_STATUS.DRAFT
            ? t('actions.saveHomeworkDraftTitle')
            : t('actions.publishHomework'),
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
      t('actions.closedHomework', { title: item.title }),
      'warn',
    );
  }

  function reopenHomework(homeworkId) {
    const item = (state().homework ?? []).find((entry) => entry.id === homeworkId);
    if (!item) return false;
    return setHomeworkStatus(homeworkId, HOMEWORK_STATUS.PUBLISHED, t('actions.reopenedHomework', { title: item.title }), 'ok');
  }

  async function deleteHomework(homeworkId) {
    const current = state();
    const item = (current.homework ?? []).find((entry) => entry.id === homeworkId);
    if (!item) return false;
    const classroom = classroomById(current.classrooms ?? [], item.classroomId);
    if (!canManageClassroom(current, classroom)) {
      toast(t('actions.onlyTeacherOrOwnerDeleteHomework'), 'warn');
      return false;
    }
    const submitted = (current.submissions ?? []).some((entry) => entry.homeworkId === homeworkId);
    if (submitted) {
      toast(t('actions.closeHomeworkInstead'), 'warn');
      return false;
    }
    const ok = await confirm({
      title: t('actions.deleteNamed', { name: item.title }),
      body: t('actions.homeworkDeletedBody'),
      confirmLabel: t('common.actions.delete'),
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
          occurredAt: new Date().toISOString(),
          context: classroom?.name ?? t('actions.classFallback'),
          audience: 'all',
          text: t('actions.removedHomework', { title: item.title }),
        },
        ...current.events,
      ],
    });
    publishRecord({
      type: 'homework',
      id: homeworkId,
      payload: { id: homeworkId, classroomId: item.classroomId, deleted: true },
      recipients: homeworkRecipients(current, classroom),
      encrypted: true,
      title: t('actions.deleteHomework'),
      action: el('span', {}, t('actions.removeHomeworkFromClass', { title: item.title })),
    });
    toast(t('actions.homeworkRemoved', { title: item.title }), 'warn');
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
      toast(t('actions.handleTakenTryVariation', { handle: result.handle }), 'warn');
      return false;
    }

    const claimed = {
      ...persona,
      handle: `${result.handle}@bitos.id`,
      verifiedAt: new Date().toISOString(),
    };
    const published = await publishProfileEvent(claimed, {
      title: t('actions.handleClaim'),
      action: el('span', {}, [
        el('strong', {}, t('actions.claimHandle', { handle: result.handle })),
        el('br'),
        t('actions.claimHandleBody'),
        el('br'),
        el('span', { class: 'mono' }, truncateNpub(persona.npub)),
      ]),
    });
    if (!published) {
      toast(t('actions.handleNotClaimed'), 'warn');
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
          occurredAt: new Date().toISOString(),
          audience: 'all',
          text: t('actions.claimedHandle', { handle: result.handle }),
        },
        ...state().events,
      ],
    });
    toast(t('actions.handleYours', { handle: result.handle }), 'ok');
    return true;
  }

  function requestMembership({ academyId = null } = {}) {
    const current = state();
    const persona = getPersona(current.personaId);
    if (membershipOf(current, persona.id) === MEMBERSHIP.ACTIVE) {
      toast(t('actions.alreadyMember'), 'info');
      return null;
    }
    const academy = academyId ? academyById(current, academyId) : null;
    const academyName = academy?.name ?? t('actions.academyFallback');
    const existing = (current.joinRequests ?? []).find(
      (entry) =>
        entry.accountId === persona.id &&
        entry.status === REQUEST_STATUS.PENDING &&
        (academyId ? entry.academyId === academyId : !entry.academyId),
    );
    if (existing) {
      toast(t('actions.membershipRequestPending'), 'info');
      return existing;
    }
    const request = {
      id: nextId('jr'),
      academyId: academy?.id ?? null,
      accountId: persona.id,
      displayName: persona.displayName,
      handle: persona.handle,
      academy: academyName,
      role: persona.role,
      time: 'now',
      status: REQUEST_STATUS.PENDING,
    };
    update({
      membership: MEMBERSHIP.PENDING,
      memberships: { ...current.memberships, [persona.id]: MEMBERSHIP.PENDING },
      joinRequests: [request, ...(current.joinRequests ?? [])],
      events: [
        {
          id: nextId('e'),
          type: 'joinreq',
          author: persona.id,
          time: 'now',
          occurredAt: new Date().toISOString(),
          context: academyName,
          audience: academy?.ownerId ? [academy.ownerId] : [],
          requestId: request.id,
          text: t('actions.requestedToJoinAcademy', { name: academyName }),
        },
        ...current.events,
      ],
    });
    toast(t('actions.joinRequestSent'), 'info');
    return request;
  }

  function acceptJoin(requestId) {
    const request = state().joinRequests.find((entry) => entry.id === requestId);
    if (!request) return false;
    if (!canDecideJoin(requestId)) {
      toast(t('actions.onlyOwnerApproveMemberships'), 'warn');
      return false;
    }
    const sameRequest = (entry) =>
      entry.accountId === request.accountId &&
      (request.academyId
        ? entry.academyId === request.academyId || (!entry.academyId && entry.academy === request.academy)
        : entry.academy === request.academy);
    const role = request.role ?? ROLE.STUDENT;
    const capability = createCapability({
      kind: CAPABILITY.MEMBERSHIP,
      academyId: request.academyId,
      accountId: request.accountId,
      role,
      issuedBy: state().personaId,
    });
    update({
      joinRequests: state().joinRequests.map((entry) =>
        sameRequest(entry) ? { ...entry, status: REQUEST_STATUS.APPROVED } : entry,
      ),
      memberships: { ...state().memberships, [request.accountId]: MEMBERSHIP.ACTIVE },
      membership:
        request.accountId === state().personaId ? MEMBERSHIP.ACTIVE : state().membership,
      capabilities: upsertCapability(state().capabilities, capability),
      events: [
        {
          id: nextId('e'),
          type: 'member',
          author: 'academy',
          time: 'now',
          occurredAt: new Date().toISOString(),
          context: request.academy ?? t('actions.academyFallback'),
          audience: [request.accountId],
          text: t('actions.approvedMembershipWelcome'),
        },
        ...state().events,
      ],
    });
    if (request.accountId && canPublish()) {
      publishRecord({
        type: RECORD_TYPES.MEMBER,
        id: `member:${request.academyId ?? request.academy}:${request.accountId}`,
        payload: {
          academyId: request.academyId ?? null,
          memberId: request.accountId,
          role,
          status: MEMBERSHIP.ACTIVE,
        },
        recipients: [request.accountId],
        encrypted: true,
        title: t('actions.approveAcademyMembership'),
        action: el('span', {}, t('actions.approveMemberFor', { name: request.displayName, academy: request.academy })),
      });
      if (request.academyId && capability && canPublish()) {
        publishRecord({
          type: RECORD_TYPES.CAPABILITY,
          id: capability.id,
          payload: capability,
          recipients: [request.accountId],
          encrypted: true,
          title: t('actions.grantAcademyMembership'),
          action: el('span', {}, t('actions.signMembershipGrant', { name: request.displayName })),
        });
      }
    }
    toast(t('actions.approvedIsMember', { name: request.displayName }), 'ok');
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
    if (request.accountId && canPublish()) {
      publishRecord({
        type: RECORD_TYPES.MEMBER,
        id: `member:${request.academyId ?? request.academy}:${request.accountId}`,
        payload: {
          academyId: request.academyId ?? null,
          memberId: request.accountId,
          role: request.role ?? ROLE.STUDENT,
          status: MEMBERSHIP.NONE,
        },
        recipients: [request.accountId],
        encrypted: true,
        title: t('actions.declineAcademyMembership'),
        action: el('span', {}, t('actions.declineMemberRequest', { name: request.displayName, academy: request.academy })),
      });
    }
    toast(t('actions.declinedNotified', { name: request.displayName }), 'warn');
  }

  function requestEnrollment(classroomId) {
    const current = state();
    const persona = getPersona(current.personaId);
    if (membershipOf(current, persona.id) !== MEMBERSHIP.ACTIVE) {
      toast(t('actions.joinAcademyBeforeClass'), 'warn');
      return false;
    }
    const classroom = classroomById(current.classrooms ?? [], classroomId);
    if (!isEnrollable(classroom)) {
      toast(t('actions.classNotOpenEnrollment'), 'warn');
      return false;
    }
    const pending = (current.enrollRequests ?? []).find(
      (entry) =>
        entry.learnerId === persona.id &&
        entry.courseId === classroom.id &&
        entry.status === REQUEST_STATUS.PENDING,
    );
    if (pending) {
      toast(t('actions.enrollmentPending'), 'info');
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
          occurredAt: new Date().toISOString(),
          context: classroom.name,
          audience,
          requestId: id,
          text: t('actions.requestedEnrollment', { name: classroom.name }),
        },
        ...current.events,
      ],
    });
    toast(t('actions.enrollmentRequested', { name: classroom.name }), 'info');
    return true;
  }

  function acceptEnrollment(requestId) {
    const current = state();
    const request = (current.enrollRequests ?? []).find((entry) => entry.id === requestId);
    if (!request || request.status !== REQUEST_STATUS.PENDING) return false;
    const classroom = classroomById(current.classrooms ?? [], request.courseId);
    if (!authorize(ACTION.DECIDE_ENROLLMENT, classroomContext(current, classroom))) {
      toast(t('actions.onlyTeacherOrOwnerApproveEnrollment'), 'warn');
      return false;
    }
    const already = (classroom?.studentIds ?? []).includes(request.learnerId);
    const classrooms = classroom && !already
      ? (current.classrooms ?? []).map((room) =>
          room.id === classroom.id ? { ...room, studentIds: [...(room.studentIds ?? []), request.learnerId] } : room,
        )
      : current.classrooms;
    const capability = classroom
      ? createCapability({
          kind: CAPABILITY.ENROLLMENT,
          academyId: classroom.academyId,
          accountId: request.learnerId,
          classroomId: classroom.id,
          role: ROLE.STUDENT,
          issuedBy: current.personaId,
        })
      : null;

    update({
      enrollRequests: (current.enrollRequests ?? []).map((entry) =>
        entry.id === requestId ? { ...entry, status: REQUEST_STATUS.APPROVED } : entry,
      ),
      classrooms,
      memberships: { ...current.memberships, [request.learnerId]: MEMBERSHIP.ACTIVE },
      capabilities: upsertCapability(current.capabilities, capability),
      events: [
        {
          id: nextId('e'),
          type: 'course',
          author: current.personaId,
          time: 'now',
          occurredAt: new Date().toISOString(),
          context: request.courseTitle,
          audience: [request.learnerId],
          courseId: request.courseId,
          text: t('actions.approvedEnrollment', { name: request.courseTitle }),
        },
        ...current.events,
      ],
    });
    if (capability && canPublish()) {
      publishRecord({
        type: RECORD_TYPES.CAPABILITY,
        id: capability.id,
        payload: capability,
        recipients: [request.learnerId],
        encrypted: true,
        title: t('actions.grantClassEnrollment'),
        action: el('span', {}, t('actions.signEnrollmentGrant', { name: request.learnerName })),
      });
    }
    toast(t('actions.enrollmentApprovedSees', { name: request.learnerName, course: request.courseTitle }), 'ok');
    return true;
  }

  function declineEnrollment(requestId) {
    const current = state();
    const request = (current.enrollRequests ?? []).find((entry) => entry.id === requestId);
    if (!request) return false;
    const classroom = classroomById(current.classrooms ?? [], request.courseId);
    if (!authorize(ACTION.DECIDE_ENROLLMENT, classroomContext(current, classroom))) {
      toast(t('actions.onlyTeacherOrOwnerDeclineEnrollment'), 'warn');
      return false;
    }
    update({
      enrollRequests: (current.enrollRequests ?? []).map((entry) =>
        entry.id === requestId ? { ...entry, status: REQUEST_STATUS.DECLINED } : entry,
      ),
    });
    toast(t('actions.declinedNotified', { name: request.learnerName }), 'warn');
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

  // Per-person feed card state. Dismissing an informational card also marks it
  // read; action-needed cards are derived from live records and are not
  // dismissible, so a required task cannot be hidden (docs/architecture/home-feed.md).
  function dismissFeedEvent(eventKey) {
    const current = state();
    const personaId = current.personaId;
    if (!personaId || eventKey == null) return;
    const mine = current.feedStates?.[personaId] ?? {};
    const at = new Date().toISOString();
    update({
      feedStates: {
        ...(current.feedStates ?? {}),
        [personaId]: {
          ...mine,
          [eventKey]: { readAt: mine[eventKey]?.readAt ?? at, dismissedAt: at },
        },
      },
    });
  }

  async function testSigner() {
    const result = await signer.request({
      title: t('actions.signerCheck'),
      action: el('span', {}, [
        el('strong', {}, t('actions.plainTextChallenge')),
        el('br'),
        el('span', { class: 'mono' }, 'bitos.education/test'),
      ]),
    });
    toast(
      result.approved ? t('actions.signatureValid') : t('actions.notSigned'),
      result.approved ? 'ok' : 'warn',
    );
  }

  // Marking a card read is per person and only affects For-you ranking
  // (-15). It never hides a card and never mutates the source record.
  function readFeedEvent(eventKey) {
    const current = state();
    const personaId = current.personaId;
    if (!personaId || eventKey == null) return;
    const mine = current.feedStates?.[personaId] ?? {};
    if (mine[eventKey]?.readAt) return;
    update({
      feedStates: {
        ...(current.feedStates ?? {}),
        [personaId]: {
          ...mine,
          [eventKey]: { ...mine[eventKey], readAt: new Date().toISOString() },
        },
      },
    });
  }

  // Muting an actor is a per-person preference: it drops their cards from the
  // For-you tab only and never affects authorization or required tasks.
  function muteAuthor(actorId) {
    const current = state();
    const personaId = current.personaId;
    if (!personaId || !actorId || actorId === personaId) return;
    const muted = current.feedMutes?.[personaId] ?? [];
    if (muted.includes(actorId)) return;
    update({
      feedMutes: { ...(current.feedMutes ?? {}), [personaId]: [...muted, actorId] },
    });
  }

  // Reverse of muteAuthor: drop the actor from the per-person mute list.
  function unmuteAuthor(actorId) {
    const current = state();
    const personaId = current.personaId;
    if (!personaId || !actorId) return;
    const muted = current.feedMutes?.[personaId] ?? [];
    if (!muted.includes(actorId)) return;
    update({
      feedMutes: { ...(current.feedMutes ?? {}), [personaId]: muted.filter((id) => id !== actorId) },
    });
  }

  // Notes can be engaged from two surfaces: the home feed (`events`) and an
  // open profile (`profileTimeline`). Look up and patch both so like / repost /
  // reply / bookmark work identically wherever the note is shown.
  function feedEventById(eventId) {
    const current = state();
    const inFeed = (current.events ?? []).find((entry) => entry.id === eventId);
    if (inFeed) return inFeed;
    return (current.profileTimeline?.events ?? []).find((entry) => entry.id === eventId) ?? null;
  }

  function patchFeedEvent(eventId, patch) {
    const current = state();
    const apply = (list) =>
      list.map((entry) => (entry.id === eventId ? { ...entry, ...patch } : entry));
    const next = {};
    if ((current.events ?? []).some((entry) => entry.id === eventId)) {
      next.events = apply(current.events);
    }
    const timelineEvents = current.profileTimeline?.events ?? [];
    if (timelineEvents.some((entry) => entry.id === eventId)) {
      next.profileTimeline = {
        ...current.profileTimeline,
        events: apply(timelineEvents),
      };
    }
    if (Object.keys(next).length) update(next);
  }

  // Sign and publish a small social event (reaction, repost, reply, deletion).
  // Local signers sign silently; external signers confirm via the sign drawer.
  async function publishSocial({ kind, content = '', tags = [], title, action, detail, pow = 0 }) {
    const base = buildEvent({ kind, tags, content });
    const event = pow > 0 ? await minePow(base, Number(pow) || 0) : base;
    const signed = await signRecord(event, { title, action, detail });
    if (!signed) return null;
    const published = await relay.publish(signed);
    return { event: signed, published };
  }

  async function like(eventId) {
    const current = feedEventById(eventId);
    if (!current?.raw) return false;
    if (!signer.canSign()) {
      toast(t('actions.connectSignerToSign'), 'warn');
      return false;
    }
    if (current.liked) return unlikePost(eventId, current);

    const result = await publishSocial({
      kind: KIND.REACTION,
      content: REACTION_LIKE,
      tags: reactionTags(current.raw),
      title: t('home.like'),
      action: t('home.like'),
    });
    if (!result) return false;
    patchFeedEvent(eventId, {
      liked: true,
      reactionId: result.event.id,
      counts: { ...current.counts, likes: (current.counts?.likes ?? 0) + 1 },
    });
    return true;
  }

  // Undo a like: publish a NIP-09 deletion for our own reaction (kind 7) so
  // relays drop the count, and decrement locally right away.
  async function unlikePost(eventId, current) {
    patchFeedEvent(eventId, {
      liked: false,
      reactionId: null,
      counts: { ...current.counts, likes: Math.max(0, (current.counts?.likes ?? 0) - 1) },
    });
    if (current.reactionId) {
      await publishSocial({
        kind: KIND.DELETE,
        tags: [['e', current.reactionId], ['k', String(KIND.REACTION)]],
        title: t('home.unlike'),
        action: t('home.unlike'),
      });
    }
    return true;
  }

  async function repost(eventId) {
    const current = feedEventById(eventId);
    if (!current?.raw) return false;
    if (!signer.canSign()) {
      toast(t('actions.connectSignerToSign'), 'warn');
      return false;
    }
    if (current.reposted) return unrepostPost(eventId, current);

    const result = await publishSocial({
      kind: KIND.REPOST,
      content: JSON.stringify(current.raw),
      tags: repostTags(current.raw),
      title: t('home.repost'),
      action: t('home.repost'),
    });
    if (!result) return false;
    patchFeedEvent(eventId, {
      reposted: true,
      repostId: result.event.id,
      counts: { ...current.counts, reposts: (current.counts?.reposts ?? 0) + 1 },
    });
    toast(t('actions.reposted'), 'ok');
    return true;
  }

  async function unrepostPost(eventId, current) {
    patchFeedEvent(eventId, {
      reposted: false,
      repostId: null,
      counts: { ...current.counts, reposts: Math.max(0, (current.counts?.reposts ?? 0) - 1) },
    });
    if (current.repostId) {
      await publishSocial({
        kind: KIND.DELETE,
        tags: [['e', current.repostId], ['k', String(KIND.REPOST)]],
        title: t('home.unrepost'),
        action: t('home.unrepost'),
      });
    }
    return true;
  }

  async function replyPost(eventId, text, pow = 0) {
    const trimmed = String(text ?? '').trim();
    const current = feedEventById(eventId);
    if (!trimmed) {
      toast(t('actions.writeSomethingFirst'), 'warn');
      return false;
    }
    if (!current?.raw) return false;
    if (!signer.canSign()) {
      toast(t('actions.connectSignerToSign'), 'warn');
      return false;
    }
    if (Number(pow) > 0) toast(t('actions.miningPow', { bits: Number(pow) }), 'info');
    const result = await publishSocial({
      kind: KIND.NOTE,
      content: trimmed,
      tags: [['t', APP_TAG], ...replyTags(current.raw)],
      title: t('home.reply'),
      action: t('home.reply'),
      detail: trimmed,
      pow,
    });
    if (!result) return false;
    const mappedReply = threadEventFromNote(result.event);
    const thread = state().threads?.[eventId] ?? { status: 'ready', replies: [] };
    // Works whether the note is in the home feed or an open profile timeline.
    patchFeedEvent(eventId, {
      counts: { ...(current.counts ?? {}), replies: (current.counts?.replies ?? 0) + 1 },
    });
    update({
      threads: mappedReply && !thread.replies.some((reply) => reply.id === mappedReply.id)
        ? { ...state().threads, [eventId]: { ...thread, replies: [...thread.replies, mappedReply] } }
        : state().threads,
    });
    toast(t('actions.replied'), 'ok');
    return true;
  }

  function bookmark(eventId) {
    const current = feedEventById(eventId);
    if (!current) return false;
    const next = !current.bookmarked;
    patchFeedEvent(eventId, { bookmarked: next });
    toast(next ? t('actions.bookmarked') : t('actions.unbookmarked'), 'ok');
    return true;
  }

  // Comment threads: replies (kind:1 with an `e` tag for the note) are fetched
  // on demand and cached in state.threads. One live subscription per note.
  const threadSubs = new Map();

  function loadThread(noteId) {
    if (threadSubs.has(noteId)) return;
    const existing = state().threads?.[noteId];
    update({ threads: { ...(state().threads ?? {}), [noteId]: { status: 'loading', replies: existing?.replies ?? [] } } });
    const sub = relay.subscribe([{ kinds: [KIND.NOTE], '#e': [noteId], limit: 100 }], {
      onEvent: (event) => {
        if (!verify(event)) return;
        const mapped = threadEventFromNote(event);
        if (!mapped) return;
        const entry = state().threads?.[noteId] ?? { status: 'loading', replies: [] };
        if (entry.replies.some((reply) => reply.id === mapped.id)) return;
        update({
          threads: { ...state().threads, [noteId]: { ...entry, replies: [...entry.replies, mapped] } },
        });
      },
      onEose: () => {
        const entry = state().threads?.[noteId];
        if (entry && entry.status !== 'ready') {
          update({ threads: { ...state().threads, [noteId]: { ...entry, status: 'ready' } } });
        }
      },
    });
    threadSubs.set(noteId, sub);
  }

  function closeThread(noteId) {
    const sub = threadSubs.get(noteId);
    sub?.close?.();
    threadSubs.delete(noteId);
  }

  // (Comment threads are opened by the dialogs layer; see dialogs.openThread.)

  // NIP-13: vary the `nonce` tag until the event id has `target` leading zero
  // bits. Yields to the event loop periodically so the mining UI stays alive.
  async function minePow(event, target) {
    if (!target) return event;
    const me = state().accountId;
    if (!me) return event;
    const base = { kind: event.kind, created_at: event.created_at, content: event.content, pubkey: me };
    for (let nonce = 0; ; nonce += 1) {
      const tags = [...event.tags, ['nonce', String(nonce), String(target)]];
      if (leadingZeroBits(getEventHash({ ...base, tags })) >= target) return { ...event, tags };
      if (nonce % 25000 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  async function postNote({ text, media = [], pow = 0 } = {}) {
    const trimmed = String(text ?? '').trim();
    const attachments = (Array.isArray(media) ? media : []).filter((item) => item?.url);
    if (!trimmed && !attachments.length) {
      toast(t('actions.writeSomethingFirst'), 'warn');
      return false;
    }
    if (!signer.canSign()) {
      toast(t('actions.connectSignerToSign'), 'warn');
      return false;
    }

    // Media URLs ride in the content (so any client can find them) and in
    // NIP-92 `imeta` tags (so this client renders a proper grid).
    const content = [trimmed, ...attachments.map((item) => item.url)].filter(Boolean).join('\n\n');
    const imeta = attachments.map((item) =>
      ['imeta', `url ${item.url}`, item.type ? `m ${item.type}` : null, item.name ? `alt ${item.name}` : null]
        .filter(Boolean),
    );
    const base = buildEvent({ kind: KIND.NOTE, tags: [['t', APP_TAG], ...imeta], content });
    if (pow > 0) toast(t('actions.miningPow', { bits: pow }), 'info');
    const event = await minePow(base, Number(pow) || 0);

    // Local signers sign silently; external signers (NIP-07 / bunker) confirm.
    const signed = await signRecord(event, {
      title: t('common.a11y.newPost'),
      action: t('home.post'),
      detail: trimmed || attachments.map((item) => item.name).filter(Boolean).join(', '),
    });
    if (!signed) return false;

    const published = await relay.publish(signed);
    // Show the note immediately; the relay echo is deduped by event id.
    const mapped = feedEventFromNote(signed);
    if (mapped && !state().events.some((entry) => entry.id === mapped.id)) {
      update({ events: [mapped, ...state().events] });
    }
    if (state().route !== '/home') navigateTo('/home');
    toast(published.count ? t('actions.postedPublic') : t('actions.postedNoRelay'), published.count ? 'ok' : 'warn');
    return true;
  }

  async function sendCompletion() {
    const ok = await confirm({
      title: t('actions.sendCompletionTitle'),
      body: [
        t('actions.sendCompletionBody1'),
        t('actions.sendCompletionBody2'),
      ],
      confirmLabel: t('actions.sendCompletion'),
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
          occurredAt: new Date().toISOString(),
          context: 'CS-101',
          audience: ['bob', 'nadia'],
          signId,
          text: t('actions.sentCompletionFor', { learner: 'Alice', course: 'CS-101' }),
        },
        ...state().events,
      ],
    });
    toast(t('actions.completionSentWaiting'), 'ok');
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
      toast(t('actions.academyKeyUnavailable'), 'warn');
      return false;
    }

    const approved = await signer.request({
      title: t('actions.signatureRequest'),
      action: el('span', {}, [
        el('strong', {}, t('actions.issueCredential')),
        el('br'),
        t('actions.certificateTo', { academy: academy.name, learner: item.learnerName }),
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
      toast(error?.message ?? t('actions.credentialSignFailed'), 'warn');
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
      meta: payload.course ? t('actions.courseCompletionNamed', { course: payload.course }) : t('actions.courseCompletion'),
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
          label: t('actions.certificateLabel', { name: item.learnerName }),
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
          occurredAt: new Date().toISOString(),
          context: payload.course || academy.name,
          audience: 'all',
          text: t('actions.issuedCredential', { title: payload.title, name: item.learnerName }),
        },
        ...current.events,
      ],
    });
    close?.();
    toast(
      delivered
        ? t('actions.credentialIssuedPublished', { title: payload.title })
        : t('actions.credentialSignedLocally'),
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
      toast(t('actions.onlyOwnerRevokeCredential'), 'warn');
      return false;
    }
    const identity = ensureOrgIdentity(academy);
    if (!identity) {
      toast(t('actions.academyKeyUnavailable'), 'warn');
      return false;
    }
    const ok = await confirm({
      title: t('actions.revokeNamed', { name: credential.title }),
      body: t('actions.revokeBody'),
      confirmLabel: t('actions.revoke'),
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
      toast(error?.message ?? t('actions.revocationSignFailed'), 'warn');
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
          occurredAt: new Date().toISOString(),
          context: credential.course ?? credential.title,
          audience: 'all',
          text: t('actions.revokedCredential', { title: credential.title }),
        },
        ...current.events,
      ],
    });
    toast(t('actions.credentialRevoked'), 'warn');
    return true;
  }

  async function declineSign(signId, close) {
    const item = state().signQueue.find((entry) => entry.id === signId);
    if (!item) return;

    const ok = await confirm({
      title: t('actions.declineIssuanceTitle'),
      body: t('actions.declineIssuanceBody'),
      confirmLabel: t('actions.decline'),
    });
    if (!ok) return;

    update({
      signQueue: state().signQueue.map((entry) =>
        entry.id === signId ? { ...entry, status: 'declined' } : entry,
      ),
    });
    close?.();
    toast(t('actions.declinedBob'), 'warn');
  }

  async function createGrant(recipient, duration, close) {
    if (!recipient) return;
    const result = await signer.request({
      title: t('actions.signatureRequest'),
      action: el('span', {}, [
        t('actions.grantAccessToDegree'),
        el('br'),
        `→ ${recipient.display}`,
        el('br'),
        t('actions.expiresIn', { duration }),
      ]),
    });
    if (!result.approved) {
      toast(t('actions.notSignedNothingShared'), 'warn');
      return;
    }

    update({ grants: [...state().grants, { to: recipient.display, duration }] });
    close?.();
    toast(t('actions.accessGranted', { name: recipient.display, duration }), 'ok');
  }

  function revokeGrant(index) {
    const grants = [...state().grants];
    grants.splice(index, 1);
    update({ grants });
    toast(
      t('actions.accessRevoked'),
      'warn',
    );
  }

  async function retryDelivery(deliveryId) {
    toast(t('actions.retryingDelivery'), 'info');
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
        ? reachable === 1
          ? t('actions.deliveryRetriedOne', { count: reachable })
          : t('actions.deliveryRetriedMany', { count: reachable })
        : t('actions.noRelayReachable'),
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
      toast(t('actions.enterValidRelayUrl'), 'warn');
      return false;
    }
    if (result.error === 'duplicate') {
      toast(t('actions.relayAlreadyConfigured'), 'info');
      return false;
    }

    applyRelayConfig(result.relays);
    const url = normalizeRelayUrl(input);
    toast(t('actions.addedRelay', { url }), 'ok');
    relay.check([url]).then(refreshRelays);
    return true;
  }

  function removeRelay(id) {
    const current = state().relayConfig ?? [];
    if (current.length <= 1) {
      toast(t('actions.keepOneRelay'), 'warn');
      return false;
    }
    applyRelayConfig(removeRelayFromList(current, id));
    toast(t('actions.relayRemoved'), 'info');
    return true;
  }

  function cycleRelayMode(id) {
    const entry = (state().relayConfig ?? []).find((relay) => relay.id === id);
    if (!entry) return;
    const mode = nextRelayMode(entry.mode);
    applyRelayConfig(setRelayModeInList(state().relayConfig, id, mode));
    toast(t('actions.relaySetTo', { mode: t(relayModeKey(mode)) }), 'info');
  }

  async function checkRelays() {
    toast(t('actions.checkingRelays'), 'info');
    await relay.check();
    refreshRelays();
    const statuses = relay.statuses();
    const healthy = statuses.filter((entry) => entry.health === 'connected').length;
    toast(t('actions.relaysReachable', { healthy, total: statuses.length }), healthy ? 'ok' : 'warn');
  }

  // ---- Messaging (NIP-17 over NIP-59 gift wraps) ------------------------
  // One-to-one messages are encrypted to the recipient and published as gift
  // wraps; the conversation list is a local index over them. Nothing here
  // grants academic authority, and official records still travel separately
  // (docs/product-roadmap.md, R3).
  function accountConversations(current) {
    return conversationsForAccount(current, current.accountId);
  }

  function writeConversations(list) {
    const current = state();
    update({
      conversationsByAccount: {
        ...(current.conversationsByAccount ?? {}),
        [current.accountId]: list,
      },
    });
  }

  function isHexPubkey(value) {
    return /^[0-9a-f]{64}$/i.test(String(value ?? ''));
  }

  // Flip an optimistic message's delivery state once the relay answers (or the
  // send is known to be impossible).
  function settleMessage(messageId, nextState) {
    const current = state();
    let changed = false;
    const list = accountConversations(current).map((conversation) => {
      if (!(conversation.messages ?? []).some((message) => message.id === messageId)) return conversation;
      changed = true;
      return {
        ...conversation,
        messages: conversation.messages.map((message) =>
          message.id === messageId ? { ...message, state: nextState } : message,
        ),
      };
    });
    if (changed) writeConversations(list);
  }

  // Encrypt `text` to the peer and to ourselves (so our other devices see the
  // sent message), publishing a gift wrap to the network for each. Settles the
  // local message to sent/failed based on whether any relay accepted it.
  function dispatchDirectMessage({ peerId, text, messageId }) {
    const active = signer.getSigner();
    if (!isHexPubkey(peerId)) {
      settleMessage(messageId, MESSAGE_STATE.FAILED);
      toast(t('messages.noRecipientKey'), 'warn');
      return Promise.resolve(false);
    }
    if (!active?.nip44Encrypt || !active?.signEvent) {
      settleMessage(messageId, MESSAGE_STATE.FAILED);
      toast(t('messages.noSigner'), 'warn');
      return Promise.resolve(false);
    }

    const me = state().personaId;
    const recipients = [...new Set([peerId, me].filter(isHexPubkey))];
    const tags = [
      ['p', peerId],
      ['client', messageId],
    ];
    return (async () => {
      let delivered = false;
      for (const recipient of recipients) {
        try {
          const wrap = await wrapForRecipient({
            content: text,
            recipient,
            signer: active,
            tags,
          });
          if (!wrap) continue;
          const published = await relay.publish(wrap);
          if (published?.count) delivered = true;
        } catch {
          /* try the next recipient/relay set */
        }
      }
      settleMessage(messageId, delivered ? MESSAGE_STATE.SENT : MESSAGE_STATE.FAILED);
      if (!delivered) toast(t('messages.sendFailed'), 'warn');
      return delivered;
    })();
  }

  // Apply a decrypted incoming gift wrap to the conversation index.
  function receiveMessage(payload = {}) {
    const current = state();
    const meId = current.personaId;
    if (!meId) return false;
    const normalized = incomingMessageFromEvent(payload, meId);
    if (!normalized) return false;
    // Respect the "who can DM me" preference before the message enters the
    // local inbox. Default policy (everyone) keeps the previous behavior.
    const allowed = allowsIncomingMessage(current.prefs, {
      peerId: normalized.peerId,
      selfId: meId,
      following: current.following?.[meId] ?? [],
    });
    if (!allowed) return false;
    const result = mergeIncomingMessage(accountConversations(current), normalized);
    if (!result.changed) return false;
    writeConversations(result.list);
    if (!hasPersona(normalized.peerId)) {
      registerPersona({ id: normalized.peerId, npub: encodeNpub(normalized.peerId) });
    }
    return true;
  }

  function markConversationRead(conversationId) {
    const current = state();
    const me = current.personaId;
    const at = new Date().toISOString();
    const list = accountConversations(current).map((conversation) => {
      if (conversation.id !== conversationId) return conversation;
      return {
        ...conversation,
        messages: conversation.messages.map((message) =>
          message.from !== me && !message.readAt ? { ...message, readAt: at } : message,
        ),
      };
    });
    writeConversations(list);
  }

  function setActiveConversation(id) {
    const next = id ?? null;
    if (next) markConversationRead(next);
    update({ activeConversationId: next });
  }

  function sendMessage(conversationId, text) {
    const trimmed = String(text ?? '').trim();
    if (!trimmed) return false;
    const current = state();
    const list = accountConversations(current);
    const conversation = conversationById(list, conversationId);
    if (!conversation) return false;
    const createdAt = new Date().toISOString();
    const message = {
      id: nextId('m'),
      from: current.personaId,
      text: trimmed,
      state: MESSAGE_STATE.SENDING,
      createdAt,
      readAt: null,
    };
    writeConversations(
      list.map((entry) =>
        entry.id === conversationId
          ? normalizeConversation({
              ...entry,
              messages: [...entry.messages, message],
              updatedAt: createdAt,
            })
          : entry,
      ),
    );
    // Relay delivery is asynchronous; the optimistic bubble shows "sending…"
    // and settles to sent/failed from the publish result.
    dispatchDirectMessage({ peerId: conversation.peerId, text: trimmed, messageId: message.id });
    return true;
  }

  // Re-send a message that failed to reach a relay. Reuses the original message
  // id, so if a previous attempt actually landed the recipient still sees one
  // bubble.
  function retryMessage(messageId) {
    const current = state();
    if (!messageId) return false;
    for (const conversation of accountConversations(current)) {
      const message = (conversation.messages ?? []).find((entry) => entry.id === messageId);
      if (!message) continue;
      if (message.from !== current.personaId) return false;
      settleMessage(messageId, MESSAGE_STATE.SENDING);
      dispatchDirectMessage({ peerId: conversation.peerId, text: message.text, messageId });
      return true;
    }
    return false;
  }

  function setConversationStatus(conversationId, status) {
    writeConversations(
      accountConversations(state()).map((conversation) =>
        conversation.id === conversationId ? { ...conversation, status } : conversation,
      ),
    );
  }

  function acceptConversation(conversationId) {
    setConversationStatus(conversationId, CONVERSATION_STATUS.ACCEPTED);
    markConversationRead(conversationId);
  }

  function declineConversation(conversationId) {
    writeConversations(
      accountConversations(state()).filter((conversation) => conversation.id !== conversationId),
    );
    if (state().activeConversationId === conversationId) update({ activeConversationId: null });
  }

  function blockConversation(conversationId) {
    setConversationStatus(conversationId, CONVERSATION_STATUS.BLOCKED);
    if (state().activeConversationId === conversationId) update({ activeConversationId: null });
    toast(t('messages.blocked'), 'info');
  }

  function unblockConversation(conversationId) {
    setConversationStatus(conversationId, CONVERSATION_STATUS.ACCEPTED);
    markConversationRead(conversationId);
    update({ activeConversationId: conversationId });
  }

  // Resolve an npub/hex/handle to a persona id, registering a minimal persona
  // for a valid key the app has never seen so the thread has a stable peer.
  function resolvePeer(reference) {
    const value = String(reference ?? '').trim();
    if (!value) return { reason: 'empty' };
    const known = findPersonaByKey(value);
    if (known) return { peerId: known.id };
    const decoded = decodeKey(value);
    if (decoded?.pubkey) {
      registerPersona({ id: decoded.pubkey, npub: encodeNpub(decoded.pubkey) });
      return { peerId: decoded.pubkey };
    }
    const handle = normalizeHandle(value.replace(/^@/, '').split('@')[0].toLowerCase());
    if (handle) {
      const match = getPersonaIds()
        .map(getPersona)
        .find((person) => normalizeHandle(String(person.handle ?? '').split('@')[0].toLowerCase()) === handle);
      if (match) return { peerId: match.id };
    }
    return { reason: 'unknown' };
  }

  function startConversation(reference, text) {
    const trimmed = String(text ?? '').trim();
    if (!trimmed) return { ok: false, reason: 'empty' };
    const current = state();
    const resolved = resolvePeer(reference);
    if (resolved.reason) return { ok: false, reason: resolved.reason };
    if (resolved.peerId === current.personaId || resolved.peerId === current.accountId) {
      return { ok: false, reason: 'self' };
    }

    const list = accountConversations(current);
    const existing = conversationWith(list, resolved.peerId);
    const createdAt = new Date().toISOString();
    const message = {
      id: nextId('m'),
      from: current.personaId,
      text: trimmed,
      state: MESSAGE_STATE.SENDING,
      createdAt,
      readAt: null,
    };
    let conversationId;
    let next;
    if (existing) {
      conversationId = existing.id;
      next = list.map((conversation) =>
        conversation.id === existing.id
          ? normalizeConversation({
              ...conversation,
              status: CONVERSATION_STATUS.ACCEPTED,
              messages: [...conversation.messages, message],
              updatedAt: createdAt,
            })
          : conversation,
      );
    } else {
      const created = normalizeConversation({
        id: nextId('c'),
        peerId: resolved.peerId,
        status: CONVERSATION_STATUS.ACCEPTED,
        messages: [message],
        updatedAt: createdAt,
      });
      conversationId = created.id;
      next = [created, ...list];
    }
    writeConversations(next);
    dispatchDirectMessage({ peerId: resolved.peerId, text: trimmed, messageId: message.id });
    if (current.route !== '/messages') navigateTo('/messages');
    update({ activeConversationId: conversationId });
    return { ok: true };
  }

  // ---- Wallet (external, prototype) -------------------------------------
  // A zap records an outbound entry locally and bumps the post's zap count. It
  // is never an academic record and cannot change access
  // (docs/product-roadmap.md, R4).
  function zapPost(eventId, amountSats) {
    const amount = Math.max(1, Math.round(Number(amountSats) || 0));
    const current = state();
    const event = (current.events ?? []).find((entry) => entry.id === eventId);
    if (!event) return false;
    if (event.author === current.personaId) {
      toast(t('wallet.zap.self'), 'warn');
      return false;
    }
    if (!amount) return false;
    const zap = normalizeZap({
      id: nextId('z'),
      direction: ZAP_DIRECTION.OUT,
      amountSats: amount,
      status: ZAP_STATUS.SETTLED,
      peerId: event.author,
      note: t('wallet.zap.note'),
      createdAt: new Date().toISOString(),
    });
    const zaps = current.zapsByAccount?.[current.accountId] ?? [];
    update({
      zapsByAccount: { ...(current.zapsByAccount ?? {}), [current.accountId]: [zap, ...zaps] },
      events: current.events.map((entry) =>
        entry.id === eventId
          ? { ...entry, counts: { ...entry.counts, bitz: (entry.counts?.bitz ?? 0) + amount } }
          : entry,
      ),
    });
    toast(t('wallet.zap.sent', { amount: formatSats(amount) }), 'ok');
    return true;
  }

  // A direct zap to a person (no post attached), e.g. from a message thread.
  function zapPeer(peerId, amountSats) {
    const amount = Math.max(1, Math.round(Number(amountSats) || 0));
    const current = state();
    if (!peerId || peerId === current.personaId || !amount) return false;
    const zap = normalizeZap({
      id: nextId('z'),
      direction: ZAP_DIRECTION.OUT,
      amountSats: amount,
      status: ZAP_STATUS.SETTLED,
      peerId,
      note: t('wallet.zap.note'),
      createdAt: new Date().toISOString(),
    });
    const zaps = current.zapsByAccount?.[current.accountId] ?? [];
    update({
      zapsByAccount: { ...(current.zapsByAccount ?? {}), [current.accountId]: [zap, ...zaps] },
    });
    toast(t('wallet.zap.sent', { amount: formatSats(amount) }), 'ok');
    return true;
  }

  // --- NIP-57 zaps -----------------------------------------------------------
  // Real flow: resolve the recipient's LNURL-pay endpoint from their profile,
  // sign a kind:9734 zap request, ask the endpoint for an invoice, then either
  // pay with WebLN or hand the invoice to the caller to render as a QR code.

  async function createZapInvoice(eventId, peerId, amountSats, note = '', anonymous = false) {
    const amount = Math.max(1, Math.round(Number(amountSats) || 0));
    const target = eventId ? feedEventById(eventId) : null;
    const recipient = peerId ?? target?.author ?? null;
    if (!recipient) throw new Error(t('wallet.zap.noRecipient'));
    const payUrl = lnurlPayUrl(getPersona(recipient));
    if (!payUrl) throw new Error(t('wallet.zap.noAddress'));
    if (!anonymous && !signer.canSign()) throw new Error(t('actions.connectSignerToSign'));

    const payRequest = await fetchPayRequest(payUrl);
    const amountMsat = amount * 1000;
    if (payRequest.minSendable && amountMsat < Number(payRequest.minSendable)) {
      throw new Error(t('wallet.zap.tooSmall', { min: Math.ceil(Number(payRequest.minSendable) / 1000) }));
    }
    if (payRequest.maxSendable && amountMsat > Number(payRequest.maxSendable)) {
      throw new Error(t('wallet.zap.tooLarge', { max: Math.floor(Number(payRequest.maxSendable) / 1000) }));
    }

    let zapRequest = null;
    if (payRequest.allowsNostr && payRequest.nostrPubkey) {
      const tags = zapRequestTags({
        recipient,
        eventId,
        amountSats: amount,
        relays: DEFAULT_RELAYS,
        lnurl: payUrl,
      });
      if (anonymous) {
        // NIP-57 anonymity: sign the zap request with a throwaway key so the
        // receipt's `P` tag (and thus the relay-visible sender) is not us.
        const throwaway = generateKeyPair();
        zapRequest = await localSigner(throwaway.secretKey).signEvent(
          buildEvent({ kind: KIND.ZAP_REQUEST, tags, content: note }),
        );
      } else {
        zapRequest = await signRecord(buildEvent({ kind: KIND.ZAP_REQUEST, tags, content: note }), {
          title: t('wallet.zap.title'),
          action: t('wallet.zap.confirm'),
          detail: `${formatSats(amount)} ${t('wallet.sats')}`,
        });
        if (!zapRequest) throw new Error(t('wallet.zap.cancelled'));
      }
    }

    const data = await requestZapInvoice(payRequest.callback, { amountMsat, zapRequest });
    return { invoice: data.pr, amount, recipient, payUrl, requestId: zapRequest?.id ?? null };
  }

  // Pay with WebLN when a browser wallet is injected. Returns paid:false so the
  // caller can fall back to showing the invoice as a QR code.
  async function payInvoiceWithWebln(invoice) {
    const webln = typeof window !== 'undefined' ? window.webln : null;
    if (!webln?.sendPayment) return { paid: false };
    try {
      await webln.enable?.();
      const result = await webln.sendPayment(invoice);
      return { paid: true, preimage: result?.preimage ?? null };
    } catch {
      return { paid: false };
    }
  }

  // Local history entry. Pending entries do not move the balance; a settled
  // entry also bumps the note's bitz counter when it targets a post. `requestId`
  // links this optimistic row to the signed kind:9734 request so the real
  // receipt replaces it instead of double-counting (mergeZapReceipt).
  function recordZap({ peerId, amountSats, note = '', status = ZAP_STATUS.SETTLED, eventId = null, requestId = null } = {}) {
    const current = state();
    if (!current.accountId) return null;
    const zap = normalizeZap({
      id: nextId('z'),
      direction: ZAP_DIRECTION.OUT,
      amountSats,
      status,
      peerId,
      note,
      createdAt: new Date().toISOString(),
      requestId,
      eventId,
    });
    const list = zapsForAccount(current, current.accountId);
    const events =
      eventId && status === ZAP_STATUS.SETTLED
        ? current.events.map((entry) =>
            entry.id === eventId
              ? { ...entry, counts: { ...entry.counts, bitz: (entry.counts?.bitz ?? 0) + Number(amountSats) } }
              : entry,
          )
        : current.events;
    update({
      zapsByAccount: { ...(current.zapsByAccount ?? {}), [current.accountId]: upsertZap(list, zap) },
      events,
    });
    return zap;
  }

  // Live projector for a single NIP-57 receipt read from relays. A receipt is
  // the only authoritative settlement signal, so both the dialog (auto-close)
  // and the global relay subscription (syncZaps) funnel through here. Ignores a
  // repeat receipt, evicts any optimistic row for the same request, bumps the
  // note counter once, and notifies the user only for a genuinely new settle.
  function ingestZapReceipt(event) {
    if (!verify(event)) return null;
    const me = state().accountId;
    const zap = zapFromReceipt(event, me);
    if (!zap) return null;
    const current = state();
    const list = zapsForAccount(current, me);
    if (list.some((entry) => entry.id === zap.id)) return zap;
    const replacedSettled = Boolean(
      zap.requestId &&
        list.some((entry) => entry.requestId === zap.requestId && entry.status === ZAP_STATUS.SETTLED),
    );
    const events =
      zap.eventId && !replacedSettled
        ? current.events.map((entry) =>
            entry.id === zap.eventId
              ? { ...entry, counts: { ...entry.counts, bitz: (entry.counts?.bitz ?? 0) + zap.amountSats } }
              : entry,
          )
        : current.events;
    update({
      zapsByAccount: { ...(current.zapsByAccount ?? {}), [me]: mergeZapReceipt(list, zap) },
      events,
    });
    // The sender already saw a "paid" toast when their wallet settled, so skip a
    // second one; a QR/invoice payment or an incoming zap is announced here. An
    // incoming zap also becomes an inbox notification for the recipient.
    if (!replacedSettled) {
      notifySettledZap(zap);
      const note = notificationFromZap(zap, me);
      if (note) addSocialNotifications([note]);
    }
    return zap;
  }

  function notifySettledZap(zap) {
    const peer = getPersona(zap.peerId);
    const name = peer?.displayName ?? truncateNpub(peer?.npub ?? '') ?? '';
    const key = zap.direction === ZAP_DIRECTION.IN ? 'wallet.zap.notifyIn' : 'wallet.zap.notifyOut';
    toast(t(key, { amount: formatSats(zap.amountSats), name }), 'ok');
  }

  // Auto-detect: while a zap dialog is waiting for payment, watch the relays for
  // the matching kind:9735 receipt and resolve as soon as it lands. Matching is
  // by the signed request id (preferred); when the recipient's server does not
  // build a NIP-57 request we fall back to our own outgoing receipt of the same
  // amount to the same peer. Returns a closer to run when the dialog closes.
  function watchZapSettlement({ requestId = null, peerId = null, amountSats = 0, onSettled } = {}) {
    const me = state().accountId;
    if (!me) return { close() {} };
    const filters = [
      { kinds: [ZAP_RECEIPT_KIND], '#P': [me] },
      { kinds: [ZAP_RECEIPT_KIND], '#p': [me] },
    ];
    // A kind:9735 receipt tags the recipient with `p` and only optionally tags
    // the sender with `P`, so the two filters above never see the settle when
    // the recipient's LNURL server omits `P`. Also watch the peer's receipts
    // (bounded by `since` so a popular peer's history is not replayed) and let
    // the request-id check in zapFromReceipt pick exactly our receipt: the
    // embedded kind:9734 request is the one we signed, so its id and pubkey
    // identify us even without the `P` tag.
    if (peerId) {
      filters.push({
        kinds: [ZAP_RECEIPT_KIND],
        '#p': [peerId],
        since: Math.floor(Date.now() / 1000) - 60,
      });
    }
    return relay.subscribe(
      filters,
      {
        onEvent: (event) => {
          const matchesId = requestId
            ? zapFromReceipt(event, me, { requestId }) !== null
            : false;
          if (!matchesId) {
            if (requestId) return;
            const fallback = zapFromReceipt(event, me);
            if (
              !fallback ||
              fallback.direction !== ZAP_DIRECTION.OUT ||
              (amountSats && fallback.amountSats !== Number(amountSats)) ||
              (peerId && fallback.peerId !== peerId)
            ) {
              return;
            }
          }
          const zap = ingestZapReceipt(event);
          if (!zap) return;
          onSettled?.(zap);
        },
      },
    );
  }

  function connectWallet() {
    const current = state();
    update({
      walletConnectedByAccount: {
        ...(current.walletConnectedByAccount ?? {}),
        [current.accountId]: true,
      },
    });
    toast(t('wallet.connectBody'), 'ok');
  }

  function disconnectWallet() {
    const current = state();
    update({
      walletConnectedByAccount: {
        ...(current.walletConnectedByAccount ?? {}),
        [current.accountId]: false,
      },
    });
    toast(t('wallet.disconnect'), 'info');
  }

  // ---- Notification inbox ----------------------------------------------

  // Append engagement notifications for the signed-in account. Dedupes by
  // source event id so a relay replay never doubles a row. Returns the fresh
  // entries (empty when nothing changed).
  function addSocialNotifications(entries) {
    const me = state().accountId;
    if (!me) return [];
    const current = state();
    const list = socialNotificationsFor(current, me);
    const merged = mergeSocialNotifications(list, entries);
    if (merged === list) return [];
    update({
      socialNotificationsByAccount: {
        ...(current.socialNotificationsByAccount ?? {}),
        [me]: merged,
      },
    });
    return entries ?? [];
  }

  // Project one public engagement event (reaction, repost, reply, or mention)
  // into a notification for the note author. Called by the `#p:[me]`
  // subscription in main.js; ignores anything not addressed to this account.
  function ingestSocialNotification(event) {
    const me = state().accountId;
    const entry = notificationFromEngagement(event, me);
    if (!entry) return false;
    addSocialNotifications([entry]);
    return true;
  }

  function markNotificationRead(eventKey) {
    const current = state();
    const personaId = current.personaId;
    if (!personaId || eventKey == null) return;
    const mine = current.notificationReads?.[personaId] ?? {};
    if (mine[eventKey]) return;
    update({
      notificationReads: {
        ...(current.notificationReads ?? {}),
        [personaId]: { ...mine, [eventKey]: new Date().toISOString() },
      },
    });
  }

  function markAllNotificationsRead() {
    const current = state();
    const personaId = current.personaId;
    if (!personaId) return;
    const at = new Date().toISOString();
    const mine = { ...(current.notificationReads?.[personaId] ?? {}) };
    for (const event of workflowNotifications(current, personaId)) {
      const key = eventKeyOf(event);
      if (key) mine[key] = at;
    }
    for (const notification of socialNotificationsFor(current, personaId)) {
      if (notification.id) mine[notification.id] = at;
    }
    const conversations = accountConversations(current).map((conversation) => ({
      ...conversation,
      messages: conversation.messages.map((message) =>
        message.from !== personaId && !message.readAt ? { ...message, readAt: at } : message,
      ),
    }));
    update({
      notificationReads: { ...(current.notificationReads ?? {}), [personaId]: mine },
      conversationsByAccount: { ...(current.conversationsByAccount ?? {}), [current.accountId]: conversations },
    });
    toast(t('notifications.allRead'), 'ok');
  }

  function stub(message = t('actions.actionNotAvailable')) {
    toast(message, 'info');
  }

  return {
    navigate: navigateTo,
    setFeedTab,
    setNotificationTab,
    setRoleTab,
    setOrgTab,
    setSettingsSection,
    setGradebookClass,
    setReviewSelection,
    copyText,
    updatePrefs,
    toggleSubscription,
    zapPresets,
    defaultPow,
    clearCache,
    forceUpdate,
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
    lookupInvite,
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
    backfillHomeworkForEnrollment,
    updateHomework,
    publishHomework,
    closeHomework,
    reopenHomework,
    deleteHomework,
    submitHomework,
    gradeSubmission,
    requestRevision,
    claimHandle,
    updateProfile,
    savePrivateName,
    uploadImage,
    uploadAttachment,
    setBlossomServer,
    setMode,
    setLocale,
    refreshMyProfile,
    resolveProfile,
    openProfile,
    loadProfileNotes,
    loadProfileZaps,
    loadProfileLikes,
    requestMembership,
    acceptJoin,
    declineJoin,
    requestEnrollment,
    acceptEnrollment,
    declineEnrollment,
    canDecideEnrollment,
    canDecideJoin,
    dismissCreated,
    dismissFeedEvent,
    readFeedEvent,
    muteAuthor,
    unmuteAuthor,
    testSigner,
    like,
    repost,
    replyPost,
    postNote,
    bookmark,
    loadThread,
    closeThread,
    setActiveConversation,
    sendMessage,
    retryMessage,
    receiveMessage,
    startConversation,
    acceptConversation,
    declineConversation,
    blockConversation,
    unblockConversation,
    zapPost,
    zapPeer,
    createZapInvoice,
    payInvoiceWithWebln,
    recordZap,
    ingestZapReceipt,
    watchZapSettlement,
    toast,
    connectWallet,
    disconnectWallet,
    markNotificationRead,
    markAllNotificationsRead,
    ingestSocialNotification,
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
  if (reason === 'reserved') return t('actions.handleReserved', { handle });
  if (reason === 'length') return t('actions.handleLength');
  if (reason === 'charset') return t('actions.handleCharset');
  return t('actions.handleInvalid');
}
