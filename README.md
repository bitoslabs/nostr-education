# BitOS ID / BitOS Education

Nostr-native education identity and credential prototype. A dark social shell that hosts the
education workflow — one shell, three roles (owner, teacher, student), where the feed *is* the
ledger and every workflow event is a card.

Design context lives in [`docs/`](./docs) (index: [`docs/README.md`](./docs/README.md)):

- [`docs/school-system.md`](./docs/school-system.md) — **product contract**; source of truth for scope
- [`docs/chat.md`](./docs/chat.md) — earlier exploration: social-shell UI concept
- [`docs/idea.md`](./docs/idea.md) — earlier exploration: Nostr UX layer and UNIQ handles
- [`docs/idea-prototype.md`](./docs/idea-prototype.md) — usability test guide
- [`docs/architecture.md`](./docs/architecture.md) — code structure and conventions
- [`docs/architecture/`](./docs/architecture) — implementation plan, data model, Nostr events

When an exploration contradicts `school-system.md`, the system design wins.

## Stack

Zero dependencies. Plain HTML, CSS, and ES modules — no build step, no bundler, no npm install.
Node is used only for the built-in test runner.

## Quick start

```sh
npm run dev        # serves the folder at http://localhost:5173
```

Any static server works, for example `python3 -m http.server 5173`. A local server is required
because ES modules do not load over `file://`.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Static server for the prototype |
| `npm test` | Run the domain unit tests (`node --test`) |

## Structure

```
index.html            entry point, loads src/main.js as a module
src/
  main.js             composition root — the only place that wires modules together
  core/               dom, store, emitter, router, scope
  domain/             pure rules: feed, review, school, handle, identity, credential, delivery
  data/               personas and seeded prototype records
  services/           simulated effects + platform: signer, confirm, relay, theme, iconify
  app/                orchestration: actions.js (flows), dialogs.js (drawers/dialogs)
  ui/
    components/       reusable components (event card, drawers, overlay, icons, primitives)
    layout/           shell, sidebar nav, right rail, mobile chrome
    screens/          home, role (education/teaching/organization), credentials, discover, notifications, verify
  styles/             tokens, base, layout, components, auth
tests/                node:test unit tests for the pure domain layer
assets/               static assets
```

The app is a three-column social shell (nav · feed · rail) with a persona switcher, dark/light
theme, drawers for assignment/review/sign, and mobile bottom tabs plus a composer FAB.

The dependency rule and naming conventions are documented in
[`docs/architecture.md`](./docs/architecture.md).

## Prototype disclaimer

All data is fictional and every interaction is simulated. Nothing here signs a real credential,
creates a real identity, or contacts a real relay.
