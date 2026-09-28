# School system documentation

Start with [School system design](school-system.md). It defines the product, roles, and main workflows.

## Build documents

1. [Implementation plan](architecture/implementation-plan.md) — release order, decisions, and acceptance checks.
2. [Build progress](architecture/progress.md) — what is built in the prototype, and the next task.
3. [Data model](architecture/data-model.md) — records, relationships, constraints, and privacy rules.
4. [Nostr event strategy](architecture/nostr-events.md) — current NIP mappings, kind choices, and publication limits.
5. [Private API](architecture/private-api.md) — NIP-98 auth and server-side authorization core.
6. [Membership and invitation flow](membership-flow.md) — user-visible states from a public link through owner approval.

The following files are earlier design explorations, not the implementation contract:

- [Role-based UI concept](chat.md): social-style screens for owner, teacher, and student.
- [Identity and Nostr UX ideas](idea.md): handles, signers, relays, and technical details.
- [Prototype test guide](idea-prototype.md): usability tasks and acceptance signals for a future prototype.
- [Static prototype architecture sketch](architecture.md): proposed browser module layout, separate from the school backend plan.

When an exploration differs from the system design, use the system design as the current product direction. Confirm open decisions in that document before implementing affected features.

In particular, the `kind:30078` credential-status example in `idea.md` is an early sketch. NIP-78 defines general application data; it does not define a credential-status standard. Use the [Nostr event strategy](architecture/nostr-events.md) for the current recommendation.
