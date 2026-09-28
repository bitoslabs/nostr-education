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
- [x] NIP-05 identifier lookup (`resolveNip05`) and issuer identifier shown on Verify; signature checked first
- [x] No coursework or roster data on a public relay: publish allowlist audited, `PUBLIC_RECORD_TYPES` /
  `toPublicRecord` unit-tested, credential payload asserted to exclude rosters and per-homework grades,
  and the allowlist is recorded in `nostr-events.md`

### Slice 7 — Credential pilot

- [x] Credential payload (recipient, course, average, policy version, issued-at) signed by the **academy key**
- [x] Issuer approval: a `signQueue` recommendation becomes a signed credential and is published to relays
- [x] Verification on the Verify screen: signature, issuer key, and payload match
- [x] Revocation: `revokeCredential` publishes an academy-signed status event; verifiers see `revoked`
- [x] Shareable public proof ("Copy proof") — signed event only, no roster or grade list
- [x] Verify screen accepts a pasted proof (JSON) as well as a local id
- [x] Recipient receives credentials (`CREDENTIAL` `#p: [me]` subscription, deduped) and revocations
- [x] Share link form: `…/verify#<base64 proof>` decodes into the pasted-proof path

## Next task

Make the private API the source of truth and give it durable storage.

1. Replace `server/store.js` with durable storage (a database behind the same accessor shape) so a
   restart does not lose academic state.
2. Wire the client to the API behind a config flag: route `setCompletionPolicy`, `createHomework`,
   `gradeSubmission`, `recommendCompletion`, and the enrollment decision through `fetch` with a NIP-98
   header, and keep local state as a cache only.
3. Verify the loop end to end (create → enroll → homework → grade → recommend) against the server, and
   add the server URL to settings.
4. Move issuer signing server-side with activation / rotation, and never store the academy `nsec` in
   app storage in production.

## Housekeeping

- [x] Private API core: NIP-98-authenticated HTTP endpoints (`server/`) that enforce
  `domain/authorization.js` server-side over an in-memory store, with tests (`tests/server.test.js`).
  See [private API](private-api.md).
- [x] Extracted a single authorization policy (`domain/authorization.js`, `authorize(ACTION.…)`) used by
  every client action, so the future server can import the same rules instead of duplicating them.
- [x] Removed the orphaned demo grading scaffolding: `state.queue` / `state.assignment`,
  `submitVersion` / `sendRevision` / `finalize` / `removeAssignmentFile`, `review-drawer.js`,
  `assignment-drawer.js`, `domain/review.js`, and the demo `alice` / `bob` branches in `event-card.js`.
