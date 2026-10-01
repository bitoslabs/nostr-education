# Home feed implementation spec

Status: proposed. This document defines work for developers; it does not describe completed features. The [school system design](../school-system.md) and [data model](data-model.md) govern academic access and privacy.

## Goal and scope

Home helps each person find their next school action, then catch up on permitted class activity. Public posts and course suggestions are secondary. A feed item is a projection of an authorized source record, never the source of truth for an assignment, grade, enrollment, or approval.

The first delivery should support owner, teacher, and student dashboards after the core class, assignment, and grading flows work. Social recommendations can follow. Do not put student rosters, homework contents, submission text, grades, feedback, file URLs, or private names into public relay events or unauthenticated feed responses.

## Recommended deployment architecture

For a real academy, use the **private API and durable database as the authoritative path** for school records, access checks, Next actions, feed preferences, and personalized feed queries. Authenticate API requests with NIP-98, then resolve current academy and class permissions on the server; a valid Nostr signature alone does not grant school access. The existing Node API is an in-memory prototype and is not yet wired into the browser, so durable storage and client integration are prerequisites.

Use Nostr relays for deliberately public academy profiles, approved announcements, and optional public posts. The client may merge those public items with authorized API results for display, but relay content cannot create school permissions or supply private academic cards. A private AUTH relay and NIP-59 gift wraps may support an explicitly chosen server-optional deployment later; they do not provide the private query, retention, and immediate access-revocation behavior required by the default school deployment. See [Private API](private-api.md), [Nostr-native mode](nostr-native.md), and [Nostr event strategy](nostr-events.md).

## Current prototype gap

- `src/domain/feed.js` filters `state.events` by audience, filters followed authors, and moves `actionNeeded` items first. It has no timestamp ranking or query layer.
- `src/ui/screens/home.js` renders all matching items in memory, with no pagination, loading, retry, or empty-state distinction.
- `state.events` is initialized empty in `src/main.js` and is not included in `src/services/storage.js` persisted fields. Actions create local event cards, so they are not a durable cross-device feed.
- `postNote` and `like` update local state; `openThread` is a placeholder. These controls must not imply synced social behavior until backed by an implemented service.

## Feature list

| Priority | Feature | Behavior |
| --- | --- | --- |
| P0 | Next actions | Show unfinished, authorized work for the current role: student deadlines and revision requests; teacher submissions to review; owner enrollment and approval requests. Each item opens the exact protected record. |
| P0 | Class updates | Show recent permitted assignment, submission-status, grading-status, enrollment, and class announcements. Keep private details behind the destination page. |
| P0 | Feed states | Loading, empty, offline/stale, error and retry states; manual refresh; accessible labels and keyboard navigation. |
| P0 | Read and dismiss | Read state is per person. Dismiss hides an informational item only; it cannot complete or delete an underlying school task. Completion is derived from the source record. |
| P1 | Following and Latest | Following includes permitted items from followed authors and the viewer. Latest sorts by real occurrence time with a stable tie-breaker. |
| P1 | Pagination and deduplication | Bounded pages, opaque cursor, stable ordering, and one card per source event or task revision. |
| P1 | Relevance explanation | Suggested public class/course cards state why they appear and offer dismiss or “show less.” Do not recommend a class that is unpublished, inaccessible, or already enrolled. |
| P2 | Social posts | Publish/fetch public posts, replies, reactions, moderation controls, and synced counts only after durable identity and relay behavior are specified. |

## Feed surfaces and query contract

Keep a **Next actions** section visible above the feed tabs. Tabs are **For you**, **Following**, and **Latest**. The current persona and academy/class authorization scope apply to every surface. A user with roles in multiple academies may filter by academy; default to all academies they can access. Do not accept role, audience, or academy membership claims from client filters.

Proposed private API (adapt names to the chosen backend):

```text
GET /api/feed?tab=foryou|following|latest&academy_id=optional&limit=20&cursor=opaque
GET /api/feed/actions?academy_id=optional&limit=20&cursor=opaque
POST /api/feed/items/:id/read
POST /api/feed/items/:id/dismiss
```

The server resolves the actor from authentication. `limit` is capped (suggested maximum 50). Responses contain `{ items, next_cursor, generated_at }`; the cursor carries the tab, scope, sort keys and query version, is opaque to clients, and expires when its authorization context changes. A client can request a fresh first page after refresh. The server checks current access before serializing each card and again when opening its destination. Empty pages after filtering may still have `next_cursor`.

Candidate sources, in order: (1) pending authorized tasks from assignments, submissions, enrollment, and issuer queues; (2) recent protected class or academy activity from the transactional outbox/event projection; (3) permitted public posts and published course catalog items. Query each source with a bounded time window, merge by stable sort keys, then page. Avoid an unbounded relay subscription for the initial home query. Relay-sourced public posts require signature validation, deduplication by event ID, and a bounded `since`/`limit` query; they cannot confer academic access.

## Logical data model

These are proposed projections and preferences, not migrations already present in the repository. Reuse `outbox_event` and existing domain tables from [data model](data-model.md); do not duplicate private payloads in feed storage.

| Record | Fields | Constraints and purpose |
| --- | --- | --- |
| `feed_event` | `id`, `event_key`, `source_type`, `source_id`, `source_version`, `academy_id` nullable, `class_id` nullable, `actor_id` nullable, `occurred_at`, `published_at`, `visibility_policy`, `destination_type`, `destination_id` | Append-only projection metadata. Unique `(source_type, source_id, source_version, event_key)`. `visibility_policy` is a server-known rule, not a list supplied by a browser. No private body, grade, roster, or file URL. |
| `feed_item_state` | `person_id`, `feed_event_id`, `read_at` nullable, `dismissed_at` nullable | Unique `(person_id, feed_event_id)`. A dismissal applies to one informational event; it does not mutate the source. Retain only as long as needed by the retention policy. |
| `feed_preference` | `person_id`, `academy_id` nullable, `muted_actor_id` nullable, `muted_topic` nullable, `updated_at` | One preference per scope/target. Mutes affect ranking or presentation, not source authorization or required school tasks. |
| `feed_query_cursor` | No table required | Encode or sign the last sort tuple and filter/version data. Do not expose private identifiers in an unsigned cursor. |

Task cards are computed from live domain status rather than stored as independent `feed_event` rows. A recommended API item shape is:

```json
{
  "id": "opaque-item-id",
  "kind": "assignment.due",
  "surface": "action",
  "occurred_at": "2026-10-01T08:00:00Z",
  "due_at": "2026-10-05T17:00:00Z",
  "academy_id": "opaque-academy-id",
  "class_id": "opaque-class-id",
  "actor": { "id": "opaque-person-id", "display_name": "Permitted name" },
  "summary": "Assignment due soon",
  "destination": { "type": "assignment", "id": "opaque-assignment-id" },
  "reason": "Your class",
  "read": false
}
```

The server generates `summary`, `actor.display_name`, and `reason` after authorization. For sensitive actions, use a generic summary and load details only on the protected destination. `due_at` is optional; all times are UTC and displayed in the academy time zone. Client routes are derived from allowed `destination.type` values rather than accepted as arbitrary URLs.

## Authorization and privacy rules

1. Build the candidate query from current memberships, active enrollments, teacher assignments, and explicit recipient lists. Verify the source record and its academy/class relationships before including any item. A feed event ID or a Nostr signature alone never grants access.
2. A selected-student assignment appears only for its recipients and authorized staff. A student's submission or grade appears only to that student and authorized staff. Other students do not see classmates' names or activity by default.
3. When access is revoked, previously cached cards must disappear on the next query; protected destination and file endpoints recheck access immediately. Keep private response caches scoped per account and clear them on sign-out/account switch.
4. Public relay events contain only deliberately public information. A protected feed projection may reference private records internally, but relay payloads and push notifications use the restricted fields in [user flows](../user-flows.md#event-data-and-push-safe-data).
5. Mutes and dismissals cannot hide required tasks from the Next actions section. A task leaves that section only when the source workflow says it is complete, expired under policy, or no longer authorized.

## Ranking and ordering

Start with deterministic rules, not a learned model. Apply authorization and visibility before ranking. Use the same stable tie-breaker, `(occurred_at DESC, id DESC)`, on every page.

**Next actions:** sort by action category, then due date or request age. Overdue student work and revision requests, teacher review work, and owner approval requests belong here. Show a small count by role; avoid placing one person's entire queue ahead of every other relevant update in the main feed.

**For you:** assign a configurable score to permitted non-task items. Suggested first pass: enrolled or taught class `+40`, followed actor `+20`, same academy `+10`, recent event `+0..20` with a seven-day decay, already read `-15`, muted source excluded. Cap repeated cards from one actor or class within a page and backfill with other candidates. Do not use grades, student identities, demographic traits, private message contents, or raw popularity as ranking inputs. Log the reason code and ranking version for debugging, without logging private text.

**Following:** filter to followed authors plus the viewer, then sort newest first. Academic activity remains subject to permission checks. **Latest:** sort all permitted feed items newest first; do not rely on array insertion order or the display string `time: 'now'`. Both tabs use cursor pagination.

Course suggestions are a separate module after class activity. Start with transparent rules: published and enrollable, within the user's academy or followed subject, not already enrolled, not dismissed. Limit suggestion frequency and explain the match. Do not infer sensitive characteristics or promote courses using student grades.

## Implementation tasks

| Order | Task | Done when |
| --- | --- | --- |
| 1 | Define event keys, source-to-card mapping, permitted summary text, and destination routes for each role. | Product and privacy review accepts examples for student, teacher, owner, and an unrelated viewer. |
| 2 | Add timestamps and stable IDs to existing local feed cards; make `filterFeed` explicitly sort Latest/Following and deduplicate. | Unit tests cover same-time tie breaks, action ordering, and hidden items. This improves the prototype without claiming cross-device persistence. |
| 3 | Add private feed projection and read/dismiss storage, using domain changes plus the transactional outbox. | Replayed source events are idempotent; deleting/revoking access removes cards from results. |
| 4 | Implement authenticated candidate queries and cursor pagination. | API tests cover every role, selected recipients, cross-academy access, revocation, page boundaries, duplicate events, and stale cursors. |
| 5 | Build Next actions and feed tabs with route links, refresh, and loading/error/offline states. | A user can reach the exact protected task; keyboard and mobile flows work; completed tasks disappear after refresh. |
| 6 | Add deterministic For you ranking, reason codes, and per-person preferences. | Fixture-based tests preserve access boundaries and stable pages; users can dismiss suggestions without losing required tasks. |
| 7 | Add social transport and engagement only if part of the release scope. | Posts, replies, and reactions survive reload and appear on another authorized device; invalid or duplicate relay events do not create cards. |

## Acceptance scenarios

- A student sees their own upcoming assignment and revision request, opens each exact record, and does not see another student's submission or grade in any tab, page, search result, or cached response.
- A teacher sees assigned-class review work and stops seeing it when their assignment is revoked. An owner sees only approvals for academies where they hold the required permission.
- An informational class update can be marked read or dismissed. A pending task remains until its source state changes. Switching accounts does not show the previous account's cached cards.
- Latest remains correctly ordered across two pages when events share a timestamp. A repeated projection event appears once. Refresh can recover items created while the browser was closed.
- A newly enrolled student sees only the history allowed by the class catch-up policy. A signed public post never exposes private academic details or creates academic permission.

## Release order

Implement tasks 1–5 alongside the first school workflow release. Add ranking and suggestions after authorized queries are reliable. Ship social transport only with an explicit public-content and moderation policy. This ordering follows the [implementation plan](implementation-plan.md), which prioritizes private class and grading workflows before a public social feed.
