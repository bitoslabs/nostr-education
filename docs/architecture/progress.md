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

- [ ] Eligibility rules and teacher recommendation (not started; demo scaffolding has been removed)

### Slice 6 — Nostr identity pilot

- [x] Public academy / staff profile (`kind:0`)
- [ ] NIP-05 identifier lookup and signature checks for credentials
- [ ] No coursework or roster data on a public relay (enforced for classrooms; keep verifying new events)

### Slice 7 — Credential pilot

- [ ] Formal credential format, issuer approval, sharing, status, and verification

## Next task

Slice 5 — completion rules and teacher recommendation.

1. Define completion rules as a versioned policy on the class (for example, required homework plus a
   minimum average), editable by the owner before the class starts; changes create a new version.
2. Calculate eligibility per enrolled student from real graded submissions (`averagePercent`,
   `reviewQueue`) and show who is eligible, pending, or short.
3. Add a teacher "recommend completion" action that records the recommendation for an eligible
   student; it must not grant issuer signing authority. Keep the recommendation in the private data
   model, not on a public relay.
4. Wire the existing organization sign queue (`state.signQueue`, `openSign`) to recommendations so an
   authorized issuer can approve and sign in slice 7.

## Housekeeping

- [x] Removed the orphaned demo grading scaffolding: `state.queue` / `state.assignment`,
  `submitVersion` / `sendRevision` / `finalize` / `removeAssignmentFile`, `review-drawer.js`,
  `assignment-drawer.js`, `domain/review.js`, and the demo `alice` / `bob` branches in `event-card.js`.
