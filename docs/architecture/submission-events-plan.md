# Homework submission flow and event plan

Status: proposed, September 2026. This is a plan for the teacher → student → teacher → student
coursework loop. It fixes defects found in the current prototype and re-models the records on the
Nostr event strategy in [nostr-events.md](nostr-events.md). The private [data model](data-model.md)
stays the source of truth; the events below are an encrypted transport that mirrors it, not a
replacement.

## Scope

The audited flow: owner creates subject/class and assigns a teacher; teacher posts homework; student
submits; teacher reviews and scores; student sees the result. It covers homework, submission,
assessment, revision, and late policy. It does **not** change the publication rule — no roster,
submission, file, feedback, or score may be written in plaintext to a public relay
([nostr-events.md](nostr-events.md) core rule).

## Defects this plan fixes

| # | Defect | Current code | Severity |
| --- | --- | --- | --- |
| 1 | Resubmitting reuses the submission id and replaces the row, so prior versions are lost in state and on relays | `src/app/actions.js:2010-2031` | High |
| 2 | `submitHomework` does not authorize the actor or require an active enrollment | `src/app/actions.js:1996-2057` | High |
| 3 | No server endpoint creates a submission; the server has no `SUBMIT` action | `server/app.js:7-14` | High |
| 4 | Server grading drops rubric scores, `gradedAt`, and revision history | `server/app.js:121-136` | Medium |
| 5 | Grading writes `graded` directly; no draft → finalized → corrected chain | `src/app/actions.js:2086-2114` | Medium |
| 6 | `due` is free text; there is no late policy or flag | `src/app/actions.js:1962` | Medium |
| 7 | Homework is created already `published`; the `DRAFT` state is unreachable | `src/app/actions.js:1965` | Low |
| 8 | A resubmission after grading silently clears the score | `src/app/actions.js:2020-2025` | Low |

The UI already promises history that the code does not keep: “Submitting creates version N+1.
Version N stays in history” (`src/ui/components/classroom-dialogs.js:514`), and the data model keeps
`SUBMISSION_VERSION` and `ASSESSMENT_REVISION` immutable (`data-model.md`).

## Event model: immutable facts vs current state

The core rule is the same one NIP-01 uses for event kinds: **regular events persist; addressable
events are replaced by the latest `d`.** The prototype publishes every record as an addressable
`kind:30078` with `d = <type>:<id>` (`src/services/records.js:39-48`). That is correct for a record
whose latest value is all that matters, but wrong for a version history: a resubmission with the same
id overwrites the previous version on every relay.

Fix: put **current state** in an addressable event and **immutable facts** in regular events.

### Kind split

[NIP-78](https://github.com/nostr-protocol/nips/blob/master/78.md) defines `kind:30078`
(addressable) and `kind:78` (regular). Use both, still app-tagged `t: bitos-education`.

| Record | Kind | Replaced? | `d` tag | Author |
| --- | --- | --- | --- | --- |
| Homework head (current instructions/due/rubric/status) | `30078` | yes, latest wins | `homework:<homeworkId>` | teacher |
| Homework revision (material edit snapshot) | `78` | no, append | `homework-rev:<homeworkId>:<n>` | teacher |
| Submission head (status + pointer to latest version) | `30078` | yes | `submission:<submissionId>` | student |
| Submission version (text/files/time/late flag) | `78` | no, append | `submission-ver:<submissionId>:<n>` | student |
| Assessment head (current revision pointer/state) | `30078` | yes | `assessment:<assessmentId>` | teacher |
| Assessment revision (score/rubric/feedback/reason) | `78` | no, append | `assessment-rev:<assessmentId>:<n>` | teacher |
| Revision request (feedback + new deadline) | `78` | no, append | `revision:<submissionId>:<n>` | teacher |

Kinds `78` and `30078` remain **application-defined** until a NIP standardizes coursework; another
client cannot interpret the payload without this schema. The implemented `d` tag is `<type>:<id>`
(app-tagged with `t: bitos-education`), kept stable so existing addressable heads are not orphaned; the
envelope stays `v: 1` with additive fields. The envelope `v` is the record-schema version; the `ver`
tag is the domain version number of the submission or assessment.

### Tag schema

A submission version links to its head and to the version it supersedes:

```
{
  "kind": 78,
  "tags": [
    ["d", "submission-ver:sub_abc:2"],
    ["t", "bitos-education"],
    ["a", "30078:<studentPubkey>:submission:sub_abc"],   // head address
    ["e", "<event id of version 1>"],                    // previous version (planned)
    ["ver", "2"],                                        // domain version
    ["p", "<teacherPubkey>"]                             // recipient(s)
  ],
  "content": "<NIP-44 ciphertext of the domain payload>"
}
```

An assessment revision links what was graded and any correction it replaces:

```
{
  "kind": 78,
  "tags": [
    ["d", "assessment-rev:asmt_x:1"],
    ["t", "bitos-education"],
    ["a", "30078:<teacherPubkey>:assessment:asmt_x"],
    ["e", "<submission version event id that was graded>"],       // planned
    ["e", "<previous assessment revision event id, if a correction>"], // planned
    ["p", "<studentPubkey>"]
  ],
  "content": "<ciphertext>"
}
```

The head events carry an `e` tag to the newest version/revision so a reader can resolve state in one
event and walk `e`/`a` links for history. Correction never edits an older revision; it appends a new
one with a reason and a link to the one it replaces ([data-model.md](data-model.md) invariant
“corrections create a new row and include a reason”).

### Encryption, recipients, and metadata

Continue NIP-44 encryption to explicit `#p` recipients; never publish coursework plaintext.

| Record | Recipients (`p`) |
| --- | --- |
| Homework head/revision | class roster (teacher + active students) |
| Submission head/version | authoring student + assignment teacher |
| Assessment head/revision | student + assignment teacher |
| Revision request | student |

Recipient lists, timing, and the `a`/`d` ids still leak metadata. Two limits are documented and
accepted for the prototype:

1. NIP-78 is intended for a user’s own storage; relays **SHOULD require NIP-42 AUTH and serve these
   events only to the author**. Cross-person delivery (teacher → student) is therefore outside the
   NIP’s intent. Treat the encrypted app-data layer as a **prototype bridge**, not the production
   transport.
2. The production path is the private API + database in [private-api.md](private-api.md). The event
   schema above is deliberately isomorphic to the append-only tables so the transport can be swapped
   without changing the domain.

### History durability

Regular events persist and copies can outlive intent; addressable heads can be replaced or discarded.
Keep the authoritative audit in the private database regardless of the transport, and never treat
NIP-09 deletion or NIP-40 expiry as erasure of submission history
([nostr-events.md](nostr-events.md) core rule).

## Client domain and state changes

- Store append-only lists separately from heads: `submissions` (heads) and `submissionVersions`
  (immutable), `assessments` (heads) and `assessmentRevisions`.
- `applyRecord` gains `SUBMISSION_VERSION` and `ASSESSMENT_REVISION` cases that upsert by their own
  id and never overwrite a sibling version (`src/domain/records.js:85-120`). `GRADE`/`REVISION`
  become revisions layered on the head; they must not null out a prior finalized result.
- `submissionFor` keeps returning the head (`src/domain/classroom.js:88`); add `versionsFor(head)` and
  `latestVersion(head)`.
- Add `SUBMISSION_STATUS.UNDER_REVIEW` and a head flag `pendingRegrade` so a resubmission after a
  finalized score shows “prior score superseded, awaiting new review” instead of silently clearing it.
- Render version history in the student’s submission panel and the teacher’s score dialog, with
  submitted time, late flag, and the version an assessment graded.

## Authorization

- Add `ACTION.SUBMIT`, `ACTION.FINALIZE_ASSESSMENT`, and `ACTION.CORRECT_ASSESSMENT` to
  `src/domain/authorization.js`.
- `SUBMIT` succeeds only when the actor **is the enrolled student** for that class with an active
  enrollment, and the homework is `published`. Owner and teacher are explicitly denied.
- `FINALIZE_ASSESSMENT`/`CORRECT_ASSESSMENT` require the assigned teacher or academy owner, as
  `GRADE` does today.
- Both client actions and server routes call the same `authorize()` with an enrollment-aware context
  (classroom + actor role + enrollment state), so a forged request cannot submit as another person.
- Add an `isActiveStudent(classroom, actor, enrollments/memberships)` helper used by both the check
  and the roster UI.

## Server and API changes

| Method | Path | Action | Status in server today |
| --- | --- | --- | --- |
| POST | `/api/homework/:id/submissions` | `SUBMIT` | new — create head + version 1, idempotent |
| POST | `/api/submissions/:id/versions` | `SUBMIT` | new — append next version |
| POST | `/api/submissions/:id/assessments` | `FINALIZE_ASSESSMENT` | new — replaces `/grade` |
| POST | `/api/assessments/:id/corrections` | `CORRECT_ASSESSMENT` | new — new revision + reason |

`server/app.js` currently exposes only `POST /api/submissions/:id/grade` and drops rubric data
(`server/app.js:121-136`). The new finalize command must accept `scores` (rubric sheet), validate with
`scoresComplete`, persist `gradedAt`/`gradedBy`, and link the graded version. Every command writes the
domain row, an audit row, and an outbox row in one transaction
([data-model.md](data-model.md) transaction invariant).

## Late policy and due dates

- `due` stays a free-text display label; `dueAt` is the machine date/time used for late detection.
- `isLate(homework, at)` compares `dueAt` to a clock; the caller passes `at` so the server clock can
  be authoritative. Late work is gated by the class `latePolicy` (`accept` / `flag` / `block`), shown
  before submission ([school-system.md](../school-system.md) §2.7).
- Each submission version carries `late`, and the head mirrors it for the student and teacher rows.
- Still open: converting `dueAt` to full academy-timezone display and recording per-student exceptions
  with a reason.

## Lifecycle states

- Homework: `draft → published → closed`; material edits create a `homework-rev` event and notify the
  class, instead of mutating history in place.
- Submission head: `submitted → under_review → revision_requested → resubmitted → graded`; versions are
  immutable regardless of head state.
- Assessment: `draft → finalized → corrected`. Draft stays private to staff; the student sees a score
  only at `finalized`.

## Idempotency and duplicate protection

Each version/revision carries a client-generated idempotency key (in `d` and a `key` tag) plus an
expected head version. The server rejects a repeat key and a stale expected version, matching the
“unique command receipt” invariant in [data-model.md](data-model.md).

## Migration and compatibility

1. Decode `v:1` records as today.
2. On first load, split `type: submission` into a head + `submission-ver:<id>:1`; split `type: grade`
   and `type: revision` into `assessment-rev:<id>:1`.
3. Keep the envelope at `v:1` and add fields additively; history records publish as regular `kind:78`.
4. Preserve existing `submission.maxScore`/`scores` when building the first assessment revision.

## Tests and acceptance checks

- Submitting twice produces two immutable version events; both remain fetchable and the head points at
  the latest ([data-model.md](data-model.md) “resubmission preserves history”).
- A teacher, owner, or unenrolled student is denied both client-side and at the server (`403`).
- A rubric finalize requires every criterion; a correction creates a second revision that links the
  first, and the first stays readable.
- Submitting after `dueAt` sets `late` and shows the policy; the server clock is authoritative.
- Relay-level check: replacing the `30078` head does not remove the `kind:78` version events.
- Addressable-head replacement and regular-event permanence are asserted with the local relay mock.

## Rollout order

1. [done] Domain + state: append-only submissions/assessments, `applyRecord` cases, history UI, migration.
2. [done] Authorization: `SUBMIT`/`FINALIZE`/`CORRECT`, enrollment helper, client guards.
3. [done] Server: submission, version, finalize, and correction endpoints with rubric support.
4. [done] Events: `kind:78` history and `30078` heads with an `a` head-address link; subscriptions
   accept both kinds. `e` previous-event links are still planned (they need the published event id
   stored on the record).
5. [done] Late policy and draft lifecycle.
6. [~] Tests added; removing the legacy `/grade` path is still pending.

## Open decisions

1. Keep the encrypted app-data transport at all, or move coursework to the private API only? The
   NIP-78 AUTH mismatch argues for API-only in production; the prototype can keep the bridge. For the
   server-optional alternative, see [Nostr-native mode](nostr-native.md).
2. Do homework material edits need their own revision events, or is a replaced head plus a
   notification enough?
3. Which NIP-42-authenticated relay (if any) is approved for the encrypted bridge?
4. Confirm the date/time representation and late-policy source before storing real deadlines.
