# Architecture

> The `src/` modules described below are implemented and run with no build step. For the school
> product's backend and data plan, start with [implementation plan](architecture/implementation-plan.md),
> [data model](architecture/data-model.md), and [Nostr events](architecture/nostr-events.md).

Zero-dependency static app. Browser ES modules, layered so that business rules stay independent of
the DOM and of the network, and so each file owns a single responsibility.

## Layering and the dependency rule

Dependencies point **inward**. An inner layer never imports an outer one.

```
main.js     → app/, ui/, services/, data/, core/
app/        → ui/, services/, data/, domain/, core/
ui/         → services/, domain/, data/, core/
services/   → domain/, core/
data/       → domain/, data/
domain/     → (nothing — pure functions)
core/       → (browser/platform only)
```

| Layer | Responsibility | May import | Must not |
| --- | --- | --- | --- |
| `core/` | Generic primitives: `el`/`append`, `createStore`, `createEmitter`, `createRouter`, `createScope` | platform only | domain, ui, app |
| `domain/` | Pure business rules: feed ordering, review/rubric math, handle + lookalike resolution, roles, status and delivery helpers | other `domain/` | DOM, `core/`, I/O |
| `data/` | Personas and seeded prototype records | `domain/`, other `data/` | ui, `core/`, I/O |
| `services/` | Simulated side effects (signer, confirm, relay, theme, iconify) | `domain/`, `core/` | DOM rendering |
| `app/` | Application orchestration: flows (`actions.js`) and overlay dialogs (`dialogs.js`) | `ui/`, `services/`, `data/`, `domain/`, `core/` | owning DOM structure |
| `ui/` | `layout/` shell + `components/` + `screens/` rendering and interaction | `services/`, `domain/`, `data/`, `core/` | being imported by inner layers |
| `main.js` | Composition root: instantiate store, router, services, overlay, shell; wire them | everything | containing business rules |

`src/main.js` is the only module that constructs the object graph. `app/actions.js` owns the
mutating flows; `app/dialogs.js` opens drawers/dialogs. If `main.js` grows business logic, it
belongs in `domain/` (rules), `services/` (effects), or `app/` (flows).

## Single-responsibility conventions

- One module = one reason to change. A component renders; a domain module decides.
- Components receive data and an options object; they never reach into global state directly.
  Screens and hosts subscribe to the store and re-render.
- Cross-component messaging uses the emitter (`bus.emit`/`bus.on`), not DOM events or globals.
- Pure domain functions take arguments and return values. They never mutate input and never touch
  `document`, timers, or storage — which is why they are unit-testable in Node.
- Simulated latency lives in `services/`, never in `domain/` or `ui/`.

## Icons

Icons come from [Iconify](https://icones.js.org/collection/lucide) over its HTTP API. The UI uses the
[Lucide](https://icones.js.org/collection/lucide) (`lucide`) collection, named explicitly (for example
`lucide:search`); `services/iconify.js` still defaults bare names to Phosphor (`ph`). There is no icon
package and no build step.

- `services/iconify.js` — pure name normalization and URL building, plus `createIconifyLoader` which
  fetches and caches SVG text. Injected `fetcher`/`cache` keep it unit-testable in Node.
- `ui/components/icon.js` — `icon(name, { size, color, label, mode, fallback })`. Default `svg`
  mode inlines the fetched, sanitized SVG so it inherits `currentColor` (accepts `ph:key` or a bare
  `key`). `css`/`bg` mode uses the URL as a CSS mask instead. `label` makes the icon an accessible
  image; otherwise it is `aria-hidden`. `fallback` glyph (or emoji) shows while loading and stays if
  the request fails.
- `setIconLoader(loader)` is called once in `main.js`; `preloadIcons(names)` warms the cache.

Icons are presentation only and never carry meaning a text label does not already state.

## Naming

| Kind | Pattern | Example |
| --- | --- | --- |
| Core factory | `createX` | `createStore`, `createEmitter`, `createRouter` |
| Component factory | `createX` (stateful host) / `x` (pure render) | `createToastHost`, `identityChip` |
| Screen entry | `renderX` | `renderHome`, `renderCredentials` |
| Domain predicate | `isX` / `hasX` | `isUsable`, `isVerified`, `isConfusable` |
| Domain verb | verb phrase | `truncateNpub`, `validateHandle`, `findLookalikes` |
| Files | `kebab-case.js` | `event-card.js` |

## State and rendering

`createStore` holds a frozen state object. `setState` replaces it and notifies subscribers; each UI
part re-renders its own subtree. There is no virtual DOM: rendering is explicit
`replaceChildren` / `clear` + rebuild, which is sufficient at prototype scale and keeps the code
dependency-free.

Screens are factories that receive `{ store, bus, app, scope }`, subscribe to the store, and return
a DOM node. The router creates a fresh `createScope()` per navigation and disposes it on the next
one, so screen subscriptions never leak. Overlays use `ui/components/overlay.js`, which owns the
focus trap, Escape handling, backdrop close, and focus restore for every dialog and drawer.

## Routing

Hash routing (`#/credentials`) so the prototype runs from any static host with no server config.
`main.js` maps paths to screen factories; unknown paths fall back to home.

## Testing

Pure `domain/` modules are covered by `node:test` (`npm test`). Anything requiring the DOM is
exercised manually through the prototype. When adding a rule, put it in `domain/` with a test
rather than inline in a component.
