# School system documentation

Start with [School system design](school-system.md). It defines the product, roles, and main workflows.

Then use [User flows](user-flows.md) for step-by-step owner, teacher, student, grading, completion, and
alternate/error journeys.

## Build documents

1. [Product roadmap](product-roadmap.md) — recommended full-system feature list, releases, engineering epics, safety gates, and future direction for education, notes, messaging, notifications, and zaps.
2. [Implementation plan](architecture/implementation-plan.md) — release order, decisions, and acceptance checks.
3. [User flows](user-flows.md) — end-to-end role journeys, alternate paths, and dashboard actions.
4. [Build progress](architecture/progress.md) — what is built in the prototype, and the next task.
5. [Data model](architecture/data-model.md) — records, relationships, constraints, and privacy rules.
6. [Nostr event strategy](architecture/nostr-events.md) — current NIP mappings, kind choices, and publication limits.
7. [Private API](architecture/private-api.md) — NIP-98 auth and server-side authorization core.
8. [Membership and invitation flow](membership-flow.md) — user-visible states from a public link through owner approval.
9. [Homework submission flow and event plan](architecture/submission-events-plan.md) — append-only submission and assessment events that back the [User flows](user-flows.md) submission loop.
10. [Nostr-native mode (server optional)](architecture/nostr-native.md) — when the API can be dropped, and the signed-capability, gift-wrap, and relay requirements.
11. [Home feed implementation spec](architecture/home-feed.md) — features, queries, ranking, data model, privacy rules, tasks, and acceptance checks.

The following files are earlier design explorations, not the implementation contract:

- [Role-based UI concept](chat.md): social-style screens for owner, teacher, and student.
- [Identity and Nostr UX ideas](idea.md): handles, signers, relays, and technical details.
- [Prototype test guide](idea-prototype.md): usability tasks and acceptance signals for a future prototype.
- [Static prototype architecture sketch](architecture.md): proposed browser module layout, separate from the school backend plan.

When an exploration differs from the system design, use the system design as the current product direction. Confirm open decisions in that document before implementing affected features.

In particular, the `kind:30078` credential-status example in `idea.md` is an early sketch. NIP-78 defines general application data; it does not define a credential-status standard. Use the [Nostr event strategy](architecture/nostr-events.md) for the current recommendation.
