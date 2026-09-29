# Private API (prototype)

Status: prototype core, September 2026. This is the beginning of the private data plane described in
the [data model](data-model.md): a small HTTP API where the **server** enforces the same role rules the
client already uses. It has no durable storage yet and is not wired into the app; it exists so
authorization no longer lives only in the browser. The API is the authoritative path for a real
academy; it is optional if authorization is carried as academy-signed capabilities and storage is an
AUTH relay — see [Nostr-native mode (server optional)](nostr-native.md).

## Running

```
npm run server            # http://localhost:8787 (override with PORT)
```

`server/index.js` starts an in-memory store (`server/store.js`).

## Authentication

Every request must carry a [NIP-98](https://github.com/nostr-protocol/nips/blob/master/98.md) token:

```
Authorization: Nostr <base64(kind 27235 event)>
```

`server/auth.js` verifies: signature, `kind: 27235`, the `u` tag equals the request URL, the `method`
tag matches, the optional `payload` tag equals the SHA-256 of the raw body, and `created_at` is within
60 seconds. Failures return `401 { "error": "unauthorized", "reason": … }`.

## Authorization

After authentication the actor pubkey is passed to `authorize()` from
`src/domain/authorization.js` — the **same module the client imports**. `403 { "error": "forbidden" }`
means the rule denied the write regardless of what the UI would have shown.

## Endpoints

| Method | Path | Action | Rule |
| --- | --- | --- | --- |
| POST | `/api/classrooms/:id/policy` | `SET_POLICY` | academy owner |
| POST | `/api/classrooms/:id/homework` | `POST_HOMEWORK` | teacher or owner |
| POST | `/api/classrooms/:id/recommendations` | `RECOMMEND_COMPLETION` | teacher or owner; requires eligibility |
| POST | `/api/homework/:id/submissions` | `SUBMIT` | enrolled learner only; homework published |
| POST | `/api/submissions/:id/versions` | `SUBMIT` | owning learner only |
| POST | `/api/submissions/:id/assessments` | `FINALIZE_ASSESSMENT` | teacher or owner; validates score or full rubric |
| POST | `/api/assessments/:id/corrections` | `CORRECT_ASSESSMENT` | teacher or owner; reason required; links the replaced revision |
| POST | `/api/submissions/:id/grade` | `GRADE` | legacy single-score path; teacher or owner |
| POST | `/api/enrollments/:id/decision` | `DECIDE_ENROLLMENT` | teacher or owner |
| POST | `/api/credentials/:id/revoke` | `REVOKE_CREDENTIAL` | academy owner |

`SUBMIT` resolves the class roster from **approved enrollments** (`store.activeStudentIds`), not from
the classroom row or the request, so a forged roster cannot grant submission rights. The server keeps
the same append-only model as the client: `submissions` is the mutable head and `submissionVersions` /
`assessmentRevisions` are immutable.

### Planned private-name endpoints

| Method | Path | Purpose | Rule |
| --- | --- | --- | --- |
| GET | `/api/academies/:academyId/people/:personId/profile` | Read the academy-scoped private name | Self; directory-authorized admin; assigned teacher for an enrolled student; enrolled student for an assigned teacher |
| PATCH | `/api/academies/:academyId/people/:personId/profile` | Set or correct structured private-name fields | Self, or directory-authorized admin with audit reason |

These endpoints return structured name fields only after server-side authorization. Other viewers receive public kind `0` alias data through the public profile path, not a redacted private-profile object. See [Data model: Public alias and private academy name](data-model.md#public-alias-and-private-academy-name).

The responses are the stored record (`201`/`200`), `400` bad JSON / missing fields, `404` unknown id,
`422` a domain rule (invalid score, not eligible).

## Not done yet

- **Durable storage.** The store is in memory; a restart loses everything. Swap `server/store.js` for a
  real database before use.
- **Client wiring.** The client still writes to local state. Point the actions at this API (behind a
  config flag) and treat the server as the source of truth.
- **Private academy profiles.** The schema and authorization contract are documented, but the encrypted-at-rest table and name endpoints are not implemented yet. Do not collect official names in the current local-storage prototype.
- **Issuer signer separation.** Credential issuance still signs with the academy key held in app
  storage; move that to a server-side signer with activation/rotation.
- **TLS and rate limiting.** Required before exposing this anywhere but localhost.
