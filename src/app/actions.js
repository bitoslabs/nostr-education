import { el } from '../core/dom.js';
import { navigate } from '../core/router.js';
import {
  DEFAULT_SIGNER,
  createDemoIdentity,
  isNpub,
  isKeyLike,
} from '../domain/account.js';
import { DELIVERY_STATE } from '../domain/delivery.js';
import { normalizeHandle, validateHandle } from '../domain/handle.js';
import { truncateNpub } from '../domain/identity.js';
import {
  ASSIGNMENT_STATUS,
  MEMBERSHIP,
  REQUEST_STATUS,
  ROLE,
} from '../domain/school.js';
import { formatScore, isRubricComplete, rubricPercent } from '../domain/review.js';
import {
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

  function setPersona(personaId) {
    if (!hasPersona(personaId)) return;
    update({ personaId, membership: membershipOf(state(), personaId) });
    navigateTo('/home');
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

  function challengeAction(persona, verb) {
    return el('span', {}, [
      el('strong', {}, verb),
      el('br'),
      `${persona.displayName} · `,
      el('span', { class: 'mono' }, truncateNpub(persona.npub)),
      el('br'),
      'challenge · bitos.education',
    ]);
  }

  async function signIn(personaId, signerTypeId = DEFAULT_SIGNER) {
    if (!hasPersona(personaId)) {
      toast('That identity is not available.', 'warn');
      return false;
    }
    const persona = getPersona(personaId);
    const result = await signer.request({
      title: 'Sign-in challenge',
      action: challengeAction(persona, 'Sign in as'),
    });
    if (!result.approved) {
      toast('Sign-in cancelled — nothing was shared.', 'warn');
      return false;
    }
    update({
      authed: true,
      signerType: signerTypeId,
      personaId,
      membership: membershipOf(state(), personaId),
    });
    navigateTo('/home');
    toast(`Signed in as ${persona.displayName}.`, 'ok');
    return true;
  }

  async function createAccount({ displayName, handle, role = ROLE.STUDENT, joinAcademy = true, signerTypeId = DEFAULT_SIGNER } = {}) {
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
      resolvedHandle = `${result.handle}@bitos.id`;
    }

    const identity = createDemoIdentity({ displayName: name, handle: resolvedHandle, role });
    const result = await signer.request({
      title: 'Create identity',
      action: el('span', {}, [
        el('strong', {}, 'Create account'),
        el('br'),
        `${identity.displayName} · `,
        el('span', { class: 'mono' }, truncateNpub(identity.npub)),
        el('br'),
        joinAcademy ? 'Request to join BitOS Academy' : 'No academy membership',
      ]),
    });
    if (!result.approved) {
      toast('Not signed. The account was not created.', 'warn');
      return false;
    }

    registerPersona(identity);
    const joinId = nextId('jr');
    update({
      authed: true,
      signerType: signerTypeId,
      personaId: identity.id,
      membership: joinAcademy ? MEMBERSHIP.PENDING : MEMBERSHIP.NONE,
      lastCreated: { id: identity.id, npub: identity.npub },
      memberships: { ...state().memberships, [identity.id]: joinAcademy ? MEMBERSHIP.PENDING : MEMBERSHIP.NONE },
      joinRequests: joinAcademy
        ? [
            {
              id: joinId,
              accountId: identity.id,
              displayName: identity.displayName,
              handle: identity.handle,
              academy: 'BitOS Academy',
              role: identity.role,
              time: 'now',
              status: REQUEST_STATUS.PENDING,
            },
            ...state().joinRequests,
          ]
        : state().joinRequests,
      events: joinAcademy
        ? [
            {
              id: nextId('e'),
              type: 'joinreq',
              author: identity.id,
              time: 'now',
              context: 'BitOS Academy',
              audience: ['nadia'],
              requestId: joinId,
              text: `requested to join BitOS Academy as a ${identity.role}.`,
            },
            ...state().events,
          ]
        : state().events,
    });
    navigateTo('/home');
    toast(joinAcademy ? 'Account created — membership request sent.' : 'Account created.', 'ok');
    return true;
  }

  async function signInWithKey({ key, displayName, role = ROLE.STUDENT, signerTypeId = DEFAULT_SIGNER } = {}) {
    const value = String(key ?? '').trim();
    if (!value) {
      toast('Paste your nsec1… or npub1… key.', 'warn');
      return false;
    }

    const known = findPersonaByKey(value);
    if (known) return signIn(known.id, signerTypeId);

    if (!isKeyLike(value)) {
      toast('That does not look like an nsec or npub key.', 'warn');
      return false;
    }

    const name = String(displayName ?? '').trim();
    if (!name) {
      toast('Add a display name for this imported key.', 'warn');
      return false;
    }

    const identity = createDemoIdentity({
      displayName: name,
      role,
      npub: isNpub(value) ? value : undefined,
    });
    const result = await signer.request({
      title: 'Import key',
      action: challengeAction(identity, 'Import and sign in'),
    });
    if (!result.approved) {
      toast('Not signed. Nothing was imported.', 'warn');
      return false;
    }

    registerPersona(identity);
    update({
      authed: true,
      signerType: signerTypeId,
      personaId: identity.id,
      membership: membershipOf(state(), identity.id),
      memberships: { ...state().memberships, [identity.id]: MEMBERSHIP.NONE },
    });
    navigateTo('/home');
    toast('Signed in — key import is simulated in this prototype.', 'info');
    return true;
  }

  function signOut() {
    update({ authed: false, signerType: null, lastCreated: null });
    navigate('/welcome');
    toast('Signed out.', 'info');
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

    const approved = await signer.request({
      title: 'Handle claim',
      action: el('span', {}, [
        el('strong', {}, `Claim @${result.handle}`),
        el('br'),
        'Claiming makes the link public: anyone can see this handle belongs to your identity.',
        el('br'),
        el('span', { class: 'mono' }, truncateNpub(persona.npub)),
      ]),
    });
    if (!approved.approved) {
      toast('Not signed. The handle was not claimed.', 'warn');
      return false;
    }

    registerPersona({ ...persona, handle: `${result.handle}@bitos.id`, verifiedAt: new Date().toISOString() });
    update({
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
    toast(`@${result.handle} is yours — public link, proves key control.`, 'ok');
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
    if (!request) return;
    update({
      joinRequests: state().joinRequests.map((entry) =>
        entry.id === requestId ? { ...entry, status: REQUEST_STATUS.APPROVED } : entry,
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
    toast(`Approved — ${request.displayName} is now a member.`, 'ok');
  }

  function declineJoin(requestId) {
    const request = state().joinRequests.find((entry) => entry.id === requestId);
    if (!request) return;
    update({
      joinRequests: state().joinRequests.map((entry) =>
        entry.id === requestId ? { ...entry, status: REQUEST_STATUS.DECLINED } : entry,
      ),
      memberships: { ...state().memberships, [request.accountId]: MEMBERSHIP.NONE },
      membership:
        request.accountId === state().personaId ? MEMBERSHIP.NONE : state().membership,
    });
    toast(`Declined — ${request.displayName} was notified.`, 'warn');
  }

  function requestEnrollment(courseId) {
    const current = state();
    const persona = getPersona(current.personaId);
    if (membershipOf(current, persona.id) !== MEMBERSHIP.ACTIVE) {
      toast('Join BitOS Academy before requesting a class.', 'warn');
      return;
    }
    const course = current.courses.find((entry) => entry.id === courseId);
    if (!course) return;

    const id = nextId('er');
    update({
      enrollRequests: [
        {
          id,
          learnerId: persona.id,
          learnerName: persona.displayName,
          courseId: course.id,
          courseTitle: course.title,
          time: 'now',
          status: REQUEST_STATUS.PENDING,
        },
        ...current.enrollRequests,
      ],
      events: [
        {
          id: nextId('e'),
          type: 'enrollreq',
          author: persona.id,
          time: 'now',
          context: course.id,
          audience: ['nadia'],
          requestId: id,
          text: `requested enrollment in ${course.id}.`,
        },
        ...current.events,
      ],
    });
    toast(`Enrollment requested for ${course.id} — awaiting approval.`, 'info');
  }

  function acceptEnrollment(requestId) {
    const request = state().enrollRequests.find((entry) => entry.id === requestId);
    if (!request) return;
    update({
      enrollRequests: state().enrollRequests.map((entry) =>
        entry.id === requestId ? { ...entry, status: REQUEST_STATUS.APPROVED } : entry,
      ),
      events: [
        {
          id: nextId('e'),
          type: 'course',
          author: 'academy',
          time: 'now',
          context: request.courseId,
          audience: [request.learnerId],
          courseId: request.courseId,
          text: `Approved your enrollment in ${request.courseId} — see you Monday.`,
        },
        ...state().events,
      ],
    });
    toast(`Enrollment approved — ${request.learnerName} can now see ${request.courseId}.`, 'ok');
  }

  function declineEnrollment(requestId) {
    const request = state().enrollRequests.find((entry) => entry.id === requestId);
    if (!request) return;
    update({
      enrollRequests: state().enrollRequests.map((entry) =>
        entry.id === requestId ? { ...entry, status: REQUEST_STATUS.DECLINED } : entry,
      ),
    });
    toast(`Declined — ${request.learnerName} was notified.`, 'warn');
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
    toast('Thread view — not in this prototype slice.', 'info');
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

  function removeAssignmentFile(fileName) {
    const assignment = state().assignment;
    update({ assignment: { ...assignment, files: assignment.files.filter((file) => file !== fileName) } });
  }

  async function submitVersion(close) {
    const assignment = state().assignment;
    const versions = assignment.versions + 1;
    const ok = await confirm({
      title: `Submit version ${versions}?`,
      body: `Submitting creates version ${versions}. Version ${assignment.versions} stays in history.`,
      confirmLabel: 'Submit',
    });
    if (!ok) return;

    const queueId = nextId('q');
    update({
      assignment: {
        ...assignment,
        status: ASSIGNMENT_STATUS.SUBMITTED,
        versions,
        history: [...assignment.history, `v${versions} · now · submitted`],
      },
      queue: [
        {
          id: queueId,
          learner: 'alice',
          learnerName: 'Alice',
          title: 'A2 · Hash functions',
          version: `v${versions}`,
          time: 'now',
          status: 'review',
          files: [...assignment.files],
        },
        ...state().queue,
      ],
      events: [
        {
          id: nextId('e'),
          type: 'submission',
          author: 'alice',
          time: 'now',
          context: 'CS-101 ▸ A2',
          audience: ['bob'],
          queueId,
          text: `Submitted version ${versions} — hash functions.`,
          files: [...assignment.files],
        },
        ...state().events,
      ],
    });
    close?.();
    toast(`Version ${versions} submitted — Bob can now review it.`, 'ok');
  }

  function sendRevision(queueId, text, close) {
    const item = state().queue.find((entry) => entry.id === queueId);
    if (!item) return;

    const feedback = String(text ?? '').trim();
    if (!feedback) {
      toast('Write the feedback first — the learner needs to know what to change.', 'warn');
      return;
    }

    const assignment = state().assignment;
    update({
      events: [
        {
          id: nextId('e'),
          type: 'revision',
          author: 'bob',
          time: 'now',
          context: `CS-101 ▸ ${item.title.split(' · ')[0]}`,
          audience: [item.learner],
          text: `Requested a revision on ${item.learnerName}'s submission.`,
          quote: feedback,
          actionNeeded: true,
        },
        ...state().events,
      ],
      queue: state().queue.filter((entry) => entry.id !== queueId),
      assignment:
        item.learner === 'alice'
          ? { ...assignment, status: ASSIGNMENT_STATUS.REVISION, feedback, history: [...assignment.history, 'revision requested · now'] }
          : assignment,
    });
    close?.();
    toast(`Revision requested — ${item.learnerName} can resubmit.`, 'ok');
  }

  async function finalize(queueId, scores, correcting, close) {
    const item = state().queue.find((entry) => entry.id === queueId);
    if (!item) return;
    if (!isRubricComplete(scores)) {
      toast('Score all three rubric criteria first.', 'warn');
      return;
    }

    const percent = rubricPercent(scores);
    const ok = await confirm({
      title: correcting ? 'Finalize corrected grade?' : 'Finalize grade?',
      body: correcting
        ? `This supersedes ${item.score}. Both grades stay visible in history.`
        : 'Finalizing records this grade permanently. Corrections create a new event — history is never edited.',
      confirmLabel: correcting ? 'Finalize correction' : 'Finalize',
    });
    if (!ok) return;

    const previousPercent = item.pct;
    const assignment = state().assignment;
    update({
      queue: state().queue.map((entry) =>
        entry.id === queueId
          ? { ...entry, status: 'final', scores: [...scores], pct: percent, score: formatScore(scores) }
          : entry,
      ),
      assignment:
        item.learner === 'alice'
          ? {
              ...assignment,
              status: correcting ? ASSIGNMENT_STATUS.CORRECTED : ASSIGNMENT_STATUS.FINAL,
              grade: percent,
              history: [
                ...assignment.history,
                correcting
                  ? `grade corrected · ${percent}% (supersedes ${previousPercent}%)`
                  : `grade finalized · ${percent}%`,
              ],
            }
          : assignment,
      criteriaMet: item.learner === 'alice' && !correcting ? true : state().criteriaMet,
      events: [
        {
          id: nextId('e'),
          type: correcting ? 'gradec' : 'grade',
          author: 'bob',
          time: 'now',
          context: 'CS-101 ▸ A2',
          audience: [item.learner, 'bob'],
          queueId,
          text: correcting
            ? `Corrected grade — ${item.learnerName} · ${item.title} · ${percent}% (supersedes ${previousPercent}%).`
            : `Finalized grade — ${item.learnerName} · ${item.title} · ${percent}%`,
        },
        ...state().events,
      ],
    });

    close?.();
    toast(
      correcting
        ? `Correction recorded — ${percent}%. Previous grade marked superseded.`
        : `Grade finalized — ${percent}%.`,
      'ok',
    );
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
          grade: state().assignment.grade ?? 78,
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
    const item = state().signQueue.find((entry) => entry.id === signId);
    if (!item || item.status !== 'pending') return;

    const result = await signer.request({
      title: 'Signature request',
      action: el('span', {}, [
        el('strong', {}, 'Issue credential'),
        el('br'),
        'BitOS Academy Certificate → Alice · ',
        el('span', { class: 'mono' }, 'alice@bitos.id'),
      ]),
    });
    if (!result.approved) return;

    const deliveryId = nextId('d');
    update({
      signed: true,
      signQueue: state().signQueue.map((entry) =>
        entry.id === signId ? { ...entry, status: 'signed' } : entry,
      ),
      credentials: [
        ...state().credentials,
        {
          id: nextId('c'),
          title: 'BitOS Academy Certificate',
          issuer: getPersona('academy'),
          status: 'active',
          privacyLevel: 'L1',
          expiresAt: null,
          meta: 'CS-101 completion',
        },
      ],
      events: [
        {
          id: nextId('e'),
          type: 'issued',
          author: 'academy',
          time: 'now',
          context: 'CS-101',
          audience: 'all',
          text: 'Issued BitOS Academy Certificate to Alice.',
        },
        ...state().events,
      ],
      deliveries: [
        { id: deliveryId, label: 'Certificate · Alice', state: DELIVERY_STATE.PENDING },
        ...state().deliveries,
      ],
    });
    close?.();
    toast('Certificate issued to Alice — visible in her Credentials.', 'ok');

    const delivered = await relay.publish();
    update({
      deliveries: state().deliveries.map((entry) =>
        entry.id === deliveryId ? { ...entry, state: delivered.state } : entry,
      ),
    });
    toast('Certificate delivery confirmed · 2 relays.', 'ok');
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
    const result = await relay.retry();
    update({
      deliveries: state().deliveries.map((entry) =>
        entry.id === deliveryId ? { ...entry, state: result.state } : entry,
      ),
    });
    toast('Delivery retried — confirmed on 2 relays.', 'ok');
  }

  function stub(message = 'Pilot screen — not in this prototype slice.') {
    toast(message, 'info');
  }

  return {
    navigate: navigateTo,
    setPersona,
    setFeedTab,
    setRoleTab,
    setOrgTab,
    setSettingsSection,
    copyText,
    signIn,
    createAccount,
    signInWithKey,
    signOut,
    claimHandle,
    requestMembership,
    acceptJoin,
    declineJoin,
    requestEnrollment,
    acceptEnrollment,
    declineEnrollment,
    dismissCreated,
    testSigner,
    like,
    openThread,
    postNote,
    removeAssignmentFile,
    submitVersion,
    sendRevision,
    finalize,
    sendCompletion,
    signIssue,
    declineSign,
    createGrant,
    revokeGrant,
    retryDelivery,
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
