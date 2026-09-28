# Data model

Status: proposed logical schema. Names are suggestions for a relational implementation, not migrations. See [school workflow](../school-system.md) for product behavior.

## Relationship map

```mermaid
erDiagram
    ORGANIZATION ||--|| ACADEMY : owns
    ACADEMY ||--o{ MEMBERSHIP : has
    PERSON ||--o{ MEMBERSHIP : joins
    ACADEMY ||--o{ TERM : defines
    ACADEMY ||--o{ SUBJECT : defines
    SUBJECT ||--o{ CLASS : offered_as
    TERM ||--o{ CLASS : contains
    CLASS ||--o{ TEACHER_ASSIGNMENT : staffed_by
    CLASS ||--o{ ENROLLMENT : includes
    PERSON ||--o{ ENROLLMENT : attends
    CLASS ||--o{ ASSIGNMENT : publishes
    ASSIGNMENT ||--o{ ASSIGNMENT_RECIPIENT : targets
    ASSIGNMENT ||--o{ SUBMISSION : receives
    SUBMISSION ||--o{ SUBMISSION_VERSION : retains
    CLASS ||--o{ GRADEBOOK_ITEM : grades
    GRADEBOOK_ITEM ||--o{ ASSESSMENT : records
    ASSESSMENT ||--o{ ASSESSMENT_REVISION : retains
    CLASS ||--o{ COMPLETION_RECOMMENDATION : evaluates
    COMPLETION_RECOMMENDATION ||--o| CREDENTIAL : may_issue
```

## Keys and records

Use opaque UUID/ULID IDs internally. All academy-owned tables carry `academy_id` even when another foreign key implies it; validate both sides of relationships have the same academy. Store UTC timestamps plus an academy time zone for display and deadline interpretation. A person can hold roles in multiple academies.

| Table | Essential fields and links | Rules |
| --- | --- | --- |
| `organization` | `id`, `legal_name`, `verification_status`, `created_at` | One pilot academy per organization; real-world verification before issuing |
| `academy` | `id`, `organization_id`, `name`, `timezone`, `status` | Unique `organization_id` in pilot |
| `person` | `id`, display name, contact channel, `nostr_pubkey_hex` nullable | Unique linked pubkey when present; do not make public key the sole recovery path |
| `membership` | `id`, `academy_id`, `person_id`, role, state, `granted_by`, dates | Unique active person/role/academy; role is academy scoped |
| `invitation` | `id`, `academy_id`, invited contact, role, token hash, expiry, accepted person | Single-use token; no access while pending |
| `term` | `id`, `academy_id`, code, start/end | Unique code per academy; start before end |
| `subject` | `id`, `academy_id`, code, name | Unique code per academy; no roster or grades |
| `class` | `id`, `academy_id`, `subject_id`, `term_id`, section, state, dates, `policy_version_id` | Unique subject/term/section per academy; cannot publish without teacher and policy |
| `teacher_assignment` | `id`, `class_id`, `person_id`, start/end, status | Only an active teacher membership can be assigned |
| `enrollment` | `id`, `class_id`, `person_id`, state, start/end, `approved_by` | Unique person/class; active enrollment required for submission |
| `grade_policy_version` | `id`, `class_id`, version, scale, weights JSON or child rows, completion rules, effective time | Immutable after publication; new version records reason and effect on existing grades |
| `assignment` | `id`, `class_id`, teacher author, title, instructions, open/due dates, state, audience type, current revision | Only assigned teachers publish; due after open; audience is class or selected students |
| `assignment_recipient` | `assignment_id`, `enrollment_id` | Used for selected audience; unique pair; recipient must belong to same class |
| `assignment_revision` | `id`, `assignment_id`, version, snapshot, published time, actor | Material edits after publish create a revision and notification |
| `file_asset` | `id`, `academy_id`, owner, private storage key, media type, byte size, checksum, scan state | Download via authorization check; no permanent public URL |
| `submission` | `id`, `assignment_id`, `enrollment_id`, state, current version | Unique assignment/enrollment; recipient and active-enrollment checks |
| `submission_version` | `id`, `submission_id`, version, text, submitted time, actor | Unique submission/version; immutable after submit; file links in child table |
| `gradebook_item` | `id`, `class_id`, type (`homework` or `test`), assignment ID nullable, max points, weight, due date | Homework references an assignment; test can start as teacher-entered score |
| `assessment` | `id`, `gradebook_item_id`, `enrollment_id`, submission version nullable, state, current revision | Unique item/enrollment; submission required for graded homework unless excused |
| `assessment_revision` | `id`, `assessment_id`, version, score, rubric values, feedback, reason, actor, finalized time | Finalized rows immutable; correction links to previous revision |
| `completion_recommendation` | `id`, `class_id`, `enrollment_id`, policy version, evidence snapshot, state, teacher, issuer decision | Recommend only after eligibility check; decision records reason |
| `credential` | `id`, recommendation ID, subject person, issuer key ID, artifact hash/reference, status, issued time | One active credential per approved recommendation; status has history |
| `issuer_key` | `id`, `academy_id`, pubkey, authorization state, effective/revoked times | Owner role alone does not grant signing power |
| `audit_event` | `id`, `academy_id`, actor, action, entity type/ID, previous/new state, reason, time | Append-only; avoid storing full private payloads in logs |
| `outbox_event` | `id`, topic, entity ID, payload reference, retry state, created/sent times | Insert in the same transaction as the domain change |

`assessment_revision` is distinct from `submission_version`: the student changes work; the teacher changes assessment. `gradebook_item` gives homework and tests a common grading target. For a class-wide assignment, the recipient set is derived from active enrollments according to the published catch-up policy. For selected work, explicit `assignment_recipient` rows determine access.

## Access rules

| Record | Owner/admin | Assigned teacher | Enrolled student |
| --- | --- | --- | --- |
| Academy catalog and class policy | Manage | Read own classes | Read enrolled classes |
| Class roster | Manage | Read own classes | No roster by default |
| Assignment instructions | Manage for support | Create/read own classes | Read only if targeted |
| Submission and file | Explicit support/audit grant | Read targeted class | Own only |
| Draft assessment | Explicit academic grant | Own class | No |
| Released assessment and grade | Explicit academic grant | Own class | Own only |
| Audit trail | Authorized auditors | Relevant own-class events | Own visible history only |

The owner/admin role is operational authority, not blanket access to students' work. Implement a separate, logged academic support grant where access is necessary. Check authorization for every API request and file download, including guessed IDs. Notifications contain record links and generic messages, never scores or file content.

## State and calculation invariants

- Enrollment acceptance and class assignment are separate transactions. Membership alone never grants class access.
- Enforce `academy_id` and `class_id` consistency in application code and database constraints where possible. Use composite foreign keys or scoped lookups to prevent cross-tenant references.
- The server resolves the effective recipient set when serving an assignment and when accepting a submission. A selected assignment never becomes visible to other students.
- Keep `submission_version` and finalized `assessment_revision` immutable. A correction creates a new row and includes a reason.
- Grade totals use a specific `grade_policy_version`. Store the policy version and calculation inputs with each released total so it can be reproduced.
- A missing item, an ungraded submission, an excused item, and a scored zero are distinct values. Do not coerce null scores to zero.
- Use a client-generated idempotency key and a unique command receipt for submit, publish, finalize, and issue to prevent duplicate writes.
- Transactionally write the domain row, audit row, and outbox row. External relay or notification delivery can retry without repeating the domain action.
- Define retention and deletion periods by jurisdiction and institution policy before importing real student records, especially minors' records.

## Suggested API commands

`createAcademy`, `inviteMember`, `acceptInvitation`, `createClass`, `assignTeacher`, `enrollStudent`, `publishAssignment`, `submitVersion`, `requestRevision`, `finalizeAssessment`, `correctAssessment`, `recommendCompletion`, and `approveCredential` each require an actor, academy scope, idempotency key, and expected record version. Each returns a new state and an audit event ID. Read endpoints enforce the same scope and audience rules.
