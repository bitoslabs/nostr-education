# Build progress

Status: prototype tracker, September 2026. Checkboxes mark what exists in the static prototype
(`src/`). The [implementation plan](implementation-plan.md) remains the release contract; this file
records which parts are built and what is next.

## Delivery slices

### Slice 1 — Identity and academy

- [x] Real Nostr key generation; local, NIP-07, and NIP-46 sign-in
- [x] Academy creation with a dedicated organization keypair
- [x] Public academy profile published as `kind:0`; "Edit info" republishes it
- [x] Owner / teacher / student roles, handles, invites, join requests
- [ ] Server-side authorization and audit (client-side checks only today)

### Slice 2 — Classes and enrollment

- [x] Subjects, classrooms, teacher assignment, publish
- [x] Course management: edit, archive, restore, and guarded delete for subjects and classrooms
- [x] Discover catalog derived from published classes; enrollment request → owner approve / decline
- [x] Public catalog discovery across relays for academy / subject / classroom records
- [x] Rosters (`studentIds`) never published to relays
- [ ] Cross-device enrollment completion (needs the private API; roster updates stay local)

### Slice 3 — Homework

- [x] Publish homework encrypted to the class roster
- [x] Student submit / resubmit with version history
- [x] Homework management: edit, close submissions, reopen, delete (guarded while submissions exist)
- [ ] Private file upload (text submissions only)

### Slice 4 — Grading

- [x] Teacher review queue from real submissions; set / edit score and feedback
- [x] Class gradebook (per-student × homework cells, class average)
- [x] Rubric scoring: optional per-homework criteria, scored item by item, stored on the submission
- [x] Revision request on real submissions (`REVISION` status + feedback, student resubmits)
- [ ] Private file attachments on submissions

### Slice 5 — Completion

- [x] Versioned completion policy per class (minimum average + all-homework requirement), owner-editable
- [x] Eligibility computed from real graded submissions, per enrolled learner
- [x] Teacher / owner "recommend completion", recorded privately and encrypted to the issuer; no signing authority granted
- [x] Recommendations feed the organization sign queue (`signQueue` + `openSign`)

### Slice 6 — Nostr identity pilot

- [x] Public academy / staff profile (`kind:0`)
- [ ] NIP-05 identifier lookup and signature checks for credentials
- [ ] No coursework or roster data on a public relay (classroom records sanitised; keep verifying new events)

### Slice 7 — Credential pilot

- [x] Credential payload (recipient, course, average, policy version, issued-at) signed by the **academy key**
- [x] Issuer approval: a `signQueue` recommendation becomes a signed credential and is published to relays
- [x] Verification on the Verify screen: signature, issuer key, and payload match
- [x] Revocation: `revokeCredential` publishes an academy-signed status event; verifiers see `revoked`
- [x] Shareable public proof ("Copy proof") — signed event only, no roster or grade list
- [x] Verify screen accepts a pasted proof (JSON) as well as a local id
- [ ] Recipient receives the credential on another device (needs the private channel)

## Next task

Slice 6 — NIP-05 identifiers for issuers.

1. Add a `resolveNip05('name@domain')` helper that fetches `https://domain/.well-known/nostr.json?name=`
   and returns the matching `npub`, with an offline / `null` fallback.
2. Show the issuer's verified `name@domain` beside the `npub` on the Verify screen when the credential
   carries a NIP-05 identifier; fall back to the `npub` when nothing resolves.
3. Put the academy's NIP-05 handle into the credential payload so a shared proof carries the
   human-readable issuer, and let the academy set that handle (already surfaced in Academy info).
4. Keep lookup failures non-fatal: signature first, identifier second.

## Housekeeping

- [x] Removed the orphaned demo grading scaffolding: `state.queue` / `state.assignment`,
  `submitVersion` / `sendRevision` / `finalize` / `removeAssignmentFile`, `review-drawer.js`,
  `assignment-drawer.js`, `domain/review.js`, and the demo `alice` / `bob` branches in `event-card.js`.
