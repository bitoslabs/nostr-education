# Nostr event strategy and kind registry

Status: proposed, checked against the linked NIPs in September 2026. Nostr is optional for the first school release. The private [data model](data-model.md) is the source of truth for enrollment, homework, submissions, grades, and completion decisions. Whether the application API is itself optional is covered in [Nostr-native mode (server optional)](nostr-native.md).

## Core rule

Never publish a roster, student identifier, assignment targeted to a student, submission, file URL, feedback, score, or academic evidence to a public relay. Even encrypted events expose some metadata and are difficult to retract. A private relay also needs its own access-control and retention design; its name alone does not make the records private. This is a product policy, informed by the limitations in [NIP-44](https://github.com/nostr-protocol/nips/blob/master/44.md) and the deletion/expiration semantics in [NIP-09](https://github.com/nostr-protocol/nips/blob/master/09.md) and [NIP-40](https://github.com/nostr-protocol/nips/blob/master/40.md).

## Existing standards we may use

| Need | NIP / kind | Decision for this product |
| --- | --- | --- |
| Event structure and signatures | [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md) | Use for any published event; validate ID, Schnorr signature, author, timestamp, and kind. |
| Public academy or opt-in adult profile | [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md) `kind:0` | Optional; `name`/`display_name` are public aliases only. Never put a student's official/legal name here by default. |
| Public announcement | [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md) `kind:1` | Optional general news only; no class roster or individual progress. |
| Human-readable Nostr identifier | [NIP-05](https://github.com/nostr-protocol/nips/blob/master/05.md) with `kind:0` metadata | Optional academy/staff identifier. It maps a domain name to a key; it is not a school credential. |
| Display/copy public keys and event links | [NIP-19](https://github.com/nostr-protocol/nips/blob/master/19.md) | Show `npub`/`nevent` to people; store and transmit hex keys/IDs in events and APIs. |
| Browser signer | [NIP-07](https://github.com/nostr-protocol/nips/blob/master/07.md) | Optional adult user/staff path when `window.nostr` is present. |
| Remote signer | [NIP-46](https://github.com/nostr-protocol/nips/blob/master/46.md) `kind:24133` | Consider for issuer operations after a signer threat model; this kind is for signer RPC, not coursework. |
| HTTP request authorization | [NIP-98](https://github.com/nostr-protocol/nips/blob/master/98.md) `kind:27235` | Possible API login mechanism; still map pubkey to academy membership and check class permissions. Enforce URL, method, freshness, and body hash where applicable. |
| Relay authentication | [NIP-42](https://github.com/nostr-protocol/nips/blob/master/42.md) `kind:22242` | Use only if an approved relay requires it. Relay authentication does not grant app roles. |
| Encrypted payload format / gift wraps | [NIP-44](https://github.com/nostr-protocol/nips/blob/master/44.md), [NIP-59](https://github.com/nostr-protocol/nips/blob/master/59.md) `kind:1059` | Possible future private notice; do not send grades, homework, or files this way in the first release. |
| Public achievement badge | [NIP-58](https://github.com/nostr-protocol/nips/blob/master/58.md) definition `kind:30009`, award `kind:8`, profile list `kind:10008` | Optional only with student opt-in and clear public disclosure. A badge is not by itself a diploma or formal credential. |
| Deletion request | [NIP-09](https://github.com/nostr-protocol/nips/blob/master/09.md) `kind:5` | Do not treat as guaranteed erasure or as credential revocation. |
| Expiration | [NIP-40](https://github.com/nostr-protocol/nips/blob/master/40.md) `expiration` tag | Do not treat as secrecy or guaranteed deletion. |

### Kind ranges matter

Under [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md), regular events persist, replaceable events can supersede older events by author/kind, ephemeral events are not expected to be stored, and addressable events use `kind + pubkey + d` as an address. Specifically, `1000–9999` are regular, `10000–19999` replaceable, `20000–29999` ephemeral, and `30000–39999` addressable, with additional lower-numbered cases specified by NIP-01. Do not select a number merely because it sits in a convenient range; check the NIP kind registry and define semantics before publishing.

## Product action to event mapping

| Product action | Public Nostr kind in first release | Reason |
| --- | --- | --- |
| Create academy, term, subject, or class | None | Operational records live in private database; public catalog is a separate choice. |
| Invite or enroll student | None | Membership and roster are private. |
| Assign homework, submit work, request revision | None | Student-specific education records and files are private. |
| Record test score, grade, or grade correction | None | Grades and evidence are private. |
| Recommend or approve completion | None | Internal decision and evidence remain private. |
| Publish general academy news | Optional `kind:1` (`#t: bitos-education`) | Public text approved by owner. |
| Publish academy/staff profile | Optional `kind:0` | Only public identity fields. |
| Issue a public badge | Optional `kind:30009` and `kind:8` | Only if badge visibility is explicitly chosen. |
| Issue formal completion credential | **No NIP kind chosen** | Define credential format, holder control, issuer authority, status, and verification first. |

The older [identity exploration](../idea.md) used `kind:30078` as an example credential-status event. [NIP-78](https://github.com/nostr-protocol/nips/blob/master/78.md) actually defines arbitrary application data (`kind:30078` addressable, `kind:78` regular); it does **not** standardize credentials or their revocation. Do not implement that example as an interoperable credential protocol.

## If we later define application events

Draft a versioned protocol before selecting any custom kind. Specify exact JSON schema, signer and authorization rules, stable IDs, event references, update/correction semantics, retention, relay discovery, and compatibility tests. Check the current NIP kind list for collisions; label the kind **application-defined** until a NIP standard exists. Publish only data classified public by the academy's field-level policy. NIP-78 can carry app-specific public data, but another client will not know its meaning without our documented schema.

For an addressable event, remember that relays may discard older versions. Do not rely on it as the only audit history. For a regular event, assume copies can persist. Keep the authoritative academic audit in the private database either way.

## Signer and verification requirements

1. Link a Nostr pubkey to a person through a signed, time-bound challenge. A pubkey alone is not proof of academy membership.
2. For any signed artifact, verify event ID and signature, expected kind, signer authorization at the action time, and academy identity. NIP-05 helps find a key but does not automatically authorize issuing.
3. Keep issuer signing permission separate from owner and teacher roles. Track key activation, rotation, and revocation in the private system.
4. Do not put an `nsec` or raw private key in app storage or logs. Choose a signer implementation and recovery process before enabling real issuance.
5. A formal credential needs a published verification contract: artifact format, subject binding, issuer key history, status lookup, expiry, and failure behavior when status is unavailable. A NIP-58 badge alone does not satisfy this contract.

## Publication gate

Before enabling a relay publisher, review a sample signed event and confirm that `content`, tags, URLs, timestamps, and linked assets reveal no student record or private class relationship. Record the approved event kind and allowed fields in a publish allowlist. Test that a rejected or failed relay write never changes the private domain transaction's result. Log relay delivery separately from academic state.

Private academy names are excluded from the relay publication allowlist. Do not publish them in kind `0`, application-defined kind `30078`, tags, or encrypted events on a public relay. NIP-44 protects content in transit and at rest from casual reading, but relay metadata, persistence, recipient relationships, and deletion cannot meet the private directory's access and retention requirements. Store these fields in the authorized private data plane.

## Implemented publish allowlist (prototype)

The prototype publishes only the events below. Everything else stays local or is encrypted to explicit recipients.

| Published event | Kind | Payload |
| --- | --- | --- |
| Academy record | `30078` (`#t: bitos-education`) | name, type, time zone, about, picture, handle, `orgPubkey` |
| Public note | `1` (`#t: bitos-education`) | short public text only; no roster, individual progress, or private class relationship |
| Subject record | `30078` | name, code |
| Classroom record | `30078` | name, term, status, `teacherId`, `subjectId`, completion policy — `studentIds` stripped by `toPublicRecord` |
| Academy profile | `0` | approved public profile fields (name, about, picture, nip05) |
| Credential | `30080` | title, course, holder name, completion `average`, policy version, issuer key + nip05, issued-at, signature |
| Credential revocation | `30080` (`d` = credential id, `status` tag) | credential id, issuer, revoked-at, signature |

Encrypted records: `invite`, `joinreq`, `homework`, `submission`, `grade`, `revision`,
`recommendation`, `submission-ver`, `assessment-rev`, `capability`. They are never written in
plaintext. By default they are sent as **NIP-59 gift wraps** (`kind:1059`, ephemeral author, only a
`p` tag for the recipient) so relay observers cannot see the real author or recipient; `giftWrap: false`
falls back to plain NIP-44 with a `#p` tag.

### Append-only coursework history (implemented)

Earlier builds published every encrypted record as addressable `kind:30078` with `d = <type>:<id>`, so a
resubmission with the same id replaced the previous version on every relay. The code now uses the
NIP-01 regular/addressable split: **current state** stays in `kind:30078` heads, and **immutable facts**
append as regular `kind:78` events (`submission-ver:*`, `assessment-rev:*`, `homework-rev:*`) linked to
their head with an `a` tag (`30078:<author>:<headType>:<headId>`).

| Encrypted event | Kind | Replaced? |
| --- | --- | --- |
| `submission-ver:*`, `assessment-rev:*`, `homework-rev:*` | `78` (regular) | no, append-only |
| `homework`, `submission`, `grade`, `revision`, `invite`, `joinreq`, `recommendation` | `30078` (addressable) | yes, latest `d` wins |

`recordKind()` / `HISTORY_RECORD_TYPES` in `src/services/records.js` decide the kind, and `syncRecords`
subscribes to both kinds. See the [homework submission flow and event plan](submission-events-plan.md)
for the tag schema and migration. Note NIP-78 expects relay-side NIP-42 AUTH limited to the author, so
cross-person delivery over this bridge is a prototype transport, not the production path; recipient
privacy needs [gift wrap](nostr-native.md).

The public record set is enforced by `PUBLIC_RECORD_TYPES` (`academy`, `subject`, `classroom`) and
`toPublicRecord`, both covered by tests. The credential event deliberately omits rosters and
per-homework grades; it carries only the completion average. Kind `30080` is **application-defined**
for this prototype, not a NIP standard — treat it as such until a credential NIP exists.
