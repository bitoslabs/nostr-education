# Nostr-native mode (server optional)

Status: architecture option, September 2026. This answers whether the application API is required and
what an all-Nostr deployment would need. It sits beside the [Nostr event strategy](nostr-events.md) and
the [submission flow plan](submission-events-plan.md); it does not change the publication rule
(coursework never goes to a public relay in plaintext).

## Question

Can the owner → teacher → student coursework loop run without the application API, on Nostr alone?

**Yes for identity, delivery, and authorization; no for a real school until retention, minors, and
moderation are solved.** The API can be a mode, not a dependency.

## What "no server API" actually requires

Four things must hold. The first three are Nostr-native; the fourth is where a server tends to
reappear.

| Need | Nostr-native mechanism | Still a server? |
| --- | --- | --- |
| Authorization ("may this student submit?", "may this teacher grade?") | **Signed capability events** by the academy key: `membership`, `teacher-assignment`, `enrollment`, with revocation events. A client verifies signature, issuer authority, and current status instead of calling an API. | No |
| Private delivery | **[NIP-59](https://github.com/nostr-protocol/nips/blob/master/59.md) gift wrap** (`kind:1059`) per recipient, so the real author, recipient, and content are hidden. Plain NIP-44 with a visible `#p` tag leaks the recipient set. | No |
| Durable private storage | A relay that enforces **[NIP-42](https://github.com/nostr-protocol/nips/blob/master/42.md) AUTH** (academy or community relay) or a [NIP-29](https://github.com/nostr-protocol/nips/blob/master/29.md) group. | Yes — but standard relay software, not a custom API |
| Immutable history | Regular `kind:78` events for versions/revisions, addressable `kind:30078` heads (see the [submission flow plan](submission-events-plan.md)). | No |
| Private files | Blossom/NIP-94 behind authorization, or only encrypted file references on the relay. | Usually yes (auth + storage) |

If capability events exist and storage is an AUTH relay, the coursework loop runs with **no custom
application server**. The client becomes the verifier; `authorize()` in `src/domain/authorization.js`
grows an attested-state mode that checks signed grants instead of reading a roster the API returned.

## Why NIP-78 alone does not deliver this

NIP-78 says relays **SHOULD require NIP-42 AUTH and serve these events only to the author**. That is
author-owned storage, not teacher → student delivery. Cross-person coursework therefore needs
**gift wrap** (each recipient gets a sealed copy) or a **group relay** (NIP-29) whose membership the
relay enforces. The prototype's current `#p`-tagged NIP-44 events are a bridge; they do not hide the
recipient relationship.

## What the API (or an equivalent service) is still for

A relay enforces "is this pubkey a member of this group". It does **not** enforce "assigned teacher of
this class only", field-level redaction, retention windows, moderator review, or reproducible grade
totals. For a school that holds records of minors, these are product requirements, not relay features:

- legal retention, export, and deletion workflows; guardian consent;
- irreversible access revocation (already-delivered gift wraps cannot be recalled);
- moderation/abuse handling and rate limiting;
- cross-device search, aggregation, notifications, and backups;
- server-side grade calculation from a versioned policy so a total can be reproduced.

## Implemented in the prototype (step 1)

Signed capabilities exist as a domain primitive and an authorization source:

- `src/domain/capability.js` — `CAPABILITY`, `createCapability`, `revokeCapability`, `isCapabilityActive`,
  `hasCapability`. Capability ids are stable: `<kind>:<academyId>:<classroomId>:<accountId>`.
- `src/domain/authorization.js` — `isActiveStudent` and `isAssignedTeacher` accept capabilities, and
  `authorize(..., { capabilities })` prefers roster fields but falls back to signed grants for
  enrollment, teacher assignment, and owner membership.
- `capability` is a private record type; `applyRecord` stores grants and applies revocations, and the
  state persists under `capabilities`.
- Grants are minted and encrypted to the member when the owner approves a membership (`acceptJoin`),
  approves enrollment (`acceptEnrollment`), or assigns a teacher (`assignClassTeacher`).
- Capabilities sync as ordinary `kind:30078` records: `syncRecords` already subscribes to `#p: [me]`
  and `applyRecord` stores grants and revocations, so a member receives them without a server.
- Roster derivation is capability-aware: `classroomsForStudent`, `classroomsForTeacher`, and
  `homeworkForStudent` accept `capabilities` and include rooms granted by an active enrollment or
  teacher-assignment, falling back to `studentIds`/`teacherId`. The Education, Teaching, rail, nav,
  and Settings screens pass `state.capabilities`.

- `mode: nostr | server | hybrid` exists (`src/domain/mode.js`, persisted, switchable in
  **Settings → Relays & network**). It records the intended transport and exposes `usesServer`,
  `usesRelays`, and `authoritySource`; actually routing actions to the API is section C of the
  roadmap.

- Delivery uses **NIP-59 gift wrap** (`src/services/giftwrap.js`): the record is sealed (kind 13) and
  signed by the real author, then wrapped (kind 1059) and signed by a random ephemeral key with only a
  `p` tag for the recipient. `publishRecord` gift-wraps encrypted records by default; `syncRecords`
  unwraps `kind:1059` `#p:[me]` events. Plain `#p` NIP-44 is still available via `giftWrap: false`.

Note: gift wrapping signs the inner seal with the active signer directly, so the in-app *sign drawer*
is skipped for encrypted publishes (an extension or bunker still prompts on its own). This is a
prototype trade-off; reintroduce review if it matters.

## Recommendation

1. **Make mode explicit, not implicit.** A config flag (`mode: nostr | server | hybrid`) chooses the
   transport. The same `domain/` rules drive both; only the source of roster/authority differs.
2. **Implement signed capabilities first.** Encode membership, teacher assignment, and enrollment as
   academy-signed events. Then `authorize()` verifies attested state, and the API's `SUBMIT` /
   `FINALIZE_ASSESSMENT` checks become an optimization, not the only guarantee.
3. **Default a real academy to server mode** until retention/minors/moderation decisions are made.
   Default a self-sovereign or demo deployment to relay mode.
4. **Do not remove the API** we just added (`/submissions`, `/versions`, `/assessments`,
   `/corrections`); mark it optional and keep it as the fallback/authoritative path.
5. **Upgrade transport** from `#p` NIP-44 to NIP-59 gift wrap for recipient privacy before any real
   student data touches a relay.

## Tradeoffs at a glance

| Dimension | Server mode | Nostr-native mode |
| --- | --- | --- |
| Authorization | Server-enforced, not forgeable | Signed grants; verifier trusts academy key |
| Read revocation | Immediate (row removed) | Not possible for already-delivered events |
| Recipient privacy | Hidden in DB; server sees all | Gift wrap hides author/recipient on the wire |
| Retention / minors | Enforceable | Hard; needs policy + trusted relay operator |
| Availability | One server to run/back up | Relays can drop addressable heads; less predictable |
| Grade reproducibility | Server recomputes | Client recomputes from signed events + policy |
| Setup cost | Deploy API + DB + storage | Point at an academy relay; no custom backend |
