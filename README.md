# BitOS ID / BitOS Education

Nostr-native education identity and credentials. A dark social shell that hosts the education
workflow — one shell, three roles (owner, teacher, student) — where real Nostr keys sign events
and records are published to relays.

Design context lives in [`docs/`](./docs) (index: [`docs/README.md`](./docs/README.md)):

- [`docs/school-system.md`](./docs/school-system.md) — **product contract**; source of truth for scope
- [`docs/chat.md`](./docs/chat.md) — earlier exploration: social-shell UI concept
- [`docs/idea.md`](./docs/idea.md) — earlier exploration: Nostr UX layer and UNIQ handles
- [`docs/idea-prototype.md`](./docs/idea-prototype.md) — usability test guide
- [`docs/architecture.md`](./docs/architecture.md) — code structure and conventions
- [`docs/architecture/`](./docs/architecture) — implementation plan, data model, Nostr events
- [`docs/architecture/progress.md`](./docs/architecture/progress.md) — build progress and next task

When an exploration contradicts `school-system.md`, the system design wins.

## Stack

Plain HTML, CSS, and ES modules — no build step or bundler, and no CDN at runtime. Runtime
dependencies are [`nostr-tools`](https://github.com/nbd-wtf/nostr-tools) and
[`vanjs-core`](https://vanjs.org/) (the 1 kB reactive UI library). `npm install` runs
`scripts/vendor.mjs` (via `postinstall`), which copies those browser ESM trees from `node_modules`
into a gitignored `vendor/` directory, and the import map in `index.html` points at them. Keys,
signatures, and relay messages are real; run `npm install` once before `npm run dev`.

## Quick start

```sh
npm install        # also generates vendor/ from node_modules
npm run dev        # serves the folder at http://localhost:5173
```

Any static server works, for example `python3 -m http.server 5173`. A local server is required
because ES modules do not load over `file://`. The app is fully self-contained once `vendor/`
exists, so it can be served from a LAN, a USB stick, or anywhere offline. On top of that, `sw.js`
caches the shell and the whole module graph on the first online visit, so the browser can then open
the app with no network at all (same-origin requests are network-first, so edits still show while
developing).

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Static server for the app |
| `npm test` | Run the domain unit tests (`node --test`) |
| `npm run vendor` | Regenerate `vendor/` from `node_modules` after a dependency change |

## Structure

```
index.html            entry point, loads src/main.js as a module, registers sw.js
sw.js                 offline shell: precaches the app, network-first for same-origin
src/
  main.js             composition root — the only place that wires modules together
  core/               dom, store, emitter, router, scope, reactive (VanJS bridge)
  domain/             pure rules: feed, review, school, handle, identity, credential, delivery
  data/               account registry
  services/           real platform: nostr (keys/sign/relay), storage, confirm, theme, iconify
  app/                orchestration: actions.js (flows), dialogs.js (drawers/dialogs)
  ui/
    components/       reusable components (event card, drawers, overlay, icons, primitives)
    layout/           shell, sidebar nav, right rail, mobile chrome
    screens/          home, role (education/teaching/organization), credentials, discover, notifications, verify
  styles/             tokens, base, layout, components, auth
tests/                node:test unit tests for the pure domain layer
assets/               static assets
scripts/vendor.mjs    copies browser ESM deps from node_modules into vendor/
vendor/               generated, gitignored: local copies of nostr-tools, vanjs, @noble, @scure
```

The app is a three-column social shell (nav · feed · rail) with a persona switcher, dark/light
theme, drawers for assignment/review/sign, and mobile bottom tabs plus a composer FAB.

The dependency rule and naming conventions are documented in
[`docs/architecture.md`](./docs/architecture.md).

## Keys and privacy

Accounts generate real Nostr key pairs. The secret key is stored in this browser when you choose
the local signer, or stays in a NIP-07 extension or NIP-46 bunker signer. Academic records are kept
in local storage and signed events are published to the configured relays. Treat public relays as
public: do not publish private coursework there.

### Back up your keys

Open **Settings → Account & identity**. Check the public `npub`, then use **Back up your account key**
to reveal and save the matching `nsec` somewhere private and offline. The secret is hidden again
after 60 seconds. Never share an `nsec`: anyone who has it can sign as that identity. If you use a
browser extension or bunker, back up the key through that signer instead.

To restore a personal account in another browser, choose **Import nsec / npub** on the sign-in
screen and paste the personal `nsec`. An `npub` only opens the account for viewing; it cannot sign.

Academy owners also see **Back up your academy key**. This is a separate `nsec` for the academy's
public profile; save it alongside your personal account backup. The current app does not yet offer
academy-key import on a new device, so keep access to the original browser as well. Signing out
clears keys stored by this app in that browser. BitOS cannot recover a lost secret key.
