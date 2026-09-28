# Nostr Layer + UNIQ Handles — UX/UI Plan

**Quick interpretation check:** I'm reading "unixq" as **UNIQ — a unique human-readable handle system** (like `@alice` bound to an npub). If you meant something else (a queue, unique QR codes, a specific backlog item), tell me and I'll rework that section. Part 1 below covers the Nostr-native layer either way.

---

## Part 1 — Nostr-native UX layer ("styled Nostr")

Your test guide flags the core problem: *"Do technical terms such as event ID, npub, and status event distract from the decision?"* The answer is a **three-tier information model** — Nostr concepts are never removed (that would break trust and verification), they're **layered by intent**:

| Tier | Who it's for | What lives here | How it's reached |
|---|---|---|---|
| 1 · Friendly | Everyone | Names, handles, badges, plain-language status | Always visible |
| 2 · Explain | Curious / cautious | "Why do I see this?" trust and privacy explanations | One tap: "Why?" |
| 3 · Inspect | Power users, auditors | Raw event JSON, full keys, kinds, signatures | Deliberate: "Technical details" |

Rule for the build: **no Tier-3 content ever blocks or interrupts a Tier-1 task.**

### 1.1 Identity chip (npub component)

The single reusable component for displaying any identity — issuer, recipient, learner, org.

```
┌─────────────────────────────────────────────────────┐
│ ◎ BitOS Academy ✓                                   │
│   bitos.academy · npub1acad…7f2q   [copy] [QR] ▸    │
└─────────────────────────────────────────────────────┘
```

**Spec:**

- **Default view:** verified name + handle + truncated key (`npub1` + 4 + `…` + 4). Name is the anchor; the key is provenance, not the headline.
- **Copy always copies the FULL string.** Display truncates; clipboard never does.
- **Full string:** on tap/expand — monospace, `overflow-wrap: anywhere`, so it never causes horizontal scroll (your mobile pass requirement).
- **QR:** modal for in-person verification (verifier scans instead of typing anything).
- **✓ check:** only when link is proven (handle claim or contact verification). Never decorative.
- **Trust contexts (Verify screen, share recipient):** show name + truncated key *plus* a "compare full key" affordance. Users should never eyeball full 63-char keys against each other — the app does the comparison and states the result.

**Look-alike safety:** monospace font, and the claim form (Part 2) blocks confusable characters (`0`/`o`, `1`/`l`, `5`/`S`).

### 1.2 Signer permission prompt

Directly serves scenario 1's pass signal ("key/signature proves control; app never gets the secret"). Every signature request in the prototype goes through one component:

```
┌─ Signature request ──────────────────────────────┐
│ ◆ BitOS ID (this app)                            │
│                                                  │
│ Your signer is asked to approve:                 │
│                                                  │
│   Grant access to "Bachelor of Computer          │
│   Science" → @recruiter.hires.example            │
│   Expires in 7 days                              │
│                                                  │
│ Your key never leaves your signer.               │
│ Apps only receive a signature.                   │
│                                                  │
│ [Reject]              [Approve once] [Always ▾]  │
└──────────────────────────────────────────────────┘
```

**Spec:**

- Header names **who asks**; body states the **action in outcome language** ("Grant access to…" not "sign event kind 1"), then the standing privacy line.
- **Approve once / Always for this app** teaches that permission is scoping, not yes/no forever.
- **Reject** returns the user to the previous screen with a neutral toast: *"Not signed. Nothing was shared."* (answers your guide's follow-up: "What would you expect if you cancelled the signer request?")
- **Signer types on the sign-in screen** get one plain-language line each:

| Signer | Label shown | Sub-line |
|---|---|---|
| Browser extension | Extension (like Alby) | "A separate app holds your key and approves each request." |
| Hardware device | Hardware key | "A physical device must be present and unlocked." |
| Remote signer | Remote signer (bunker) | "Your key stays on a service you control; it signs on your approval." |
| Built-in demo | Demo signer (prototype only) | "Simulated. Never store a real key here." |

- **Lost-key path (guide follow-up: "what if your key was lost?"):** a stub "Recovery" entry in Settings with honest copy: *"BitOS ID cannot restore a lost key. Recovery options — backup phrase, social recovery — are being designed for the pilot."* Fictional, clearly labeled, but the acknowledgment itself builds trust.

### 1.3 Relay manager (extends the Network page)

You already have delivery states (`pending / failed / stale`). Complete the picture:

```
│ Relays · 3 of 4 healthy                          │
│ ● wss://relay.damus.io      read+write  120 ms   │
│ ● wss://nos.lol             read        210 ms   │
│ ◐ wss://bitos.relay         connecting…          │
│ ○ wss://relay.example       offline  [Retry]     │
│ [+ Add relay]                                     │
│                                                   │
│ Delivery log (this session)                       │
│ ● Alice's status check → delivered · 2 relays     │
│ ▲ Carol's completion event → failed  [Retry]      │
│ ○ Degree status → stale · last seen 6 days [Recheck]│
```

**Spec:**

- Health dot + text label (never color alone): `connected / connecting / offline`.
- Read/write shown as **badges**, not jargon: `read` `write` `read+write`.
- Delivery states reuse the exact same component as your credential status feed — one visual language for "did this reach the network?"
- **Stale** is the important one for verifiers (your scenario 6): copy reads *"Last confirmed 6 days ago — this may not reflect the issuer's latest update"* — uncertainty, not failure.

### 1.4 Event inspector drawer (Tier 3)

Available from any signed item via a quiet "Technical details" link:

```
▼ Technical details · status event
  BitOS Academy published a status update for
  Alice's degree: "active" · Mar 12.

  event id      d3f9c2…a41c            [copy]
  signer        npub1acad…7f2q  matches issuer ✓
  kind          30078 (credential status)
  created       2025-03-12 14:02 UTC
  signature     valid ✓   [show raw]

  [Copy raw JSON]          · simulated data ·
```

Header is a **plain-language sentence** — the raw fields sit under it, never above it. "matches issuer ✓" is the computed comparison so users don't do string-matching by eye.

### 1.5 Visual style tokens for the Nostr layer

| Concept | Treatment |
|---|---|
| Keys, event IDs, relay URLs | Monospace, muted color, `text-wrap: anywhere` |
| Human names / handles | Body font, primary color, ✓ badge when verified |
| Signature / signing actions | Distinct accent color + key icon — used *only* for real signing moments, never decoration |
| "Technical details" links | Small, low-contrast, always last in a section |
| Simulated data | Persistent `simulated · prototype` tag in technical views |

---

## Part 2 — UNIQ: unique handles

### Concept

The npub is the identity; the handle is a **verified, human-readable alias publicly linked to it** (NIP-05-style proof, first-class in the product). Design rule #1: **handles are never required** — every flow works with npub + QR alone, so privacy-sensitive users lose nothing.

### Namespace decision

| Option | Example | Strength | Risk |
|---|---|---|---|
| Global, first-come | `@alice` | Portable, simple | Squatting, disputes |
| Org-scoped | `alice@bitos.academy` | Matches issuance authority; orgs police their own namespace | Less portable |
| **Hybrid (recommended)** | Personal `@alice` + org alias `alice@bitos.academy` | Best of both | Two concepts to teach |

For the pilot, ship **org-scoped aliases as primary** (auto-suggested at enrollment — closes the loop with the coursework plan) and a **personal handle as optional**. Teach once: *"An alias belongs to the organization; your personal handle belongs to you."*

### Claim flow

**Step 1 — pick:**

```
│ Claim your handle                               │
│ bitos.id/ [ alice          ]        [Check]     │
│                                                  │
│ ✓ alice is available                            │
│ ⚠ Claiming makes the link public: anyone can    │
│   see that "alice" belongs to your identity.    │
│                                                  │
│                            [Cancel] [Claim @alice]│
```

**Step 2 — prove (reuses the signer prompt from 1.2):**

```
│ Your signer will sign a claim proving you       │
│ control this identity.                          │
│   Claim: alice@bitos.id → npub1fjvz…8xk3        │
│                             [Reject] [Approve]  │
```

**Step 3 — done:**

```
│ ✓ @alice is yours                               │
│ Linked to npub1fjvz…8xk3 · public since Mar 12  │
│ [Show QR]  [Copy link]                          │
```

### States

| State | Badge | UI |
|---|---|---|
| Unclaimed | — | Input + Check |
| Checking | spinner | "Checking availability…" (announced via `aria-live`) |
| Available | ✓ success | Claim button + public-link warning |
| Taken | ✕ | "Taken by another identity since 2024" + 3 suggestions (`alice_c, alice.bitos, ali`) |
| Reserved | ⊘ | "'admin' is reserved. Handles like admin, verify, and org names are protected." |
| Claiming | spinner | "Waiting for your signer…" (cancellable) |
| Claimed | ✓ | Identity chip upgrades to handle + check |

### Where handles change existing screens

| Screen | Before | After |
|---|---|---|
| Credentials card | `npub1acad…7f2q` | `BitOS Academy ✓ · bitos.academy` |
| Share recipient | paste/choose raw key | Pick **verified contact by handle** (primary), paste npub (secondary) — wrong-recipient risk drops sharply |
| Verify input | npub only | Handle **or** npub **or** QR scan |
| Enrollment accept | name + npub | Auto-suggest `alice@bitos.academy` alias |
| Org admin (scenario 5) | — | Namespace page: claim `bitos.academy`, manage aliases, see reserved list |

### Impersonation defense

```
│ ⚠ @a1ice is not @alice                          │
│ These are different identities. The handles     │
│ look similar — compare the keys or scan the     │
│ QR from the person directly.                    │
```

Trigger on edit-distance-1 lookalikes and confusable characters in search/recipient fields. This is the single highest-severity UNIQ risk: a handle feels *more* trustworthy than a key, so near-miss handles must be loudly flagged.

### Privacy & trust rules (test-guide aligned)

- Claiming publishes a public link → explicitly **L0**. The warning appears **before** the signer prompt, not after.
- Microcopy everywhere: *"A verified handle proves they control the key. It does not mean anyone endorses them."* — the handle equivalent of your "signed ≠ trusted" pass signal.
- Handle-less mode: Settings toggle *"Show my handle instead of my key"* with *"Some screens always show the key for verification."*

---

## Microcopy bank

| Moment | Copy |
|---|---|
| Signer prompt footer | "Your key never leaves your signer. Apps only receive a signature." |
| Rejected request | "Not signed. Nothing was shared." |
| Relay stale | "Last confirmed 6 days ago — this may not reflect the issuer's latest update." |
| Copy key | "Full key copied — 63 characters." |
| Handle claim warning | "Claiming makes the link public: anyone can see this handle belongs to your identity." |
| Handle taken | "Taken by another identity. These look different but are similar: a1ice, alice_c." |
| Handle ≠ endorsement | "A verified handle proves control of the key — not an endorsement." |
| Org alias at enrollment | "You'll get alice@bitos.academy. It stays with the organization if you leave." |

## Edge cases

| Situation | Expected UI |
|---|---|
| Learner leaves the org | Alias expires/revokes; **credential still verifies via npub** — shown as "alias expired, identity valid" |
| Org loses its namespace | Aliases marked `namespace inactive`; nothing breaks cryptographically |
| Handle transferred/disputed | Out of pilot scope — show "contact the namespace owner" stub, don't invent dispute UI |
| Claim signed but relay delivery fails | Relay state on the claim itself: `pending → delivered`, retry affordance |
| Lookalike recipient typed | Impersonation banner before grant creation (blocks until acknowledged) |
| Screen reader + truncated key | Announces "npub, truncated, copy button copies full 63-character key" |

## Accessibility notes

- Availability check results, claim success, and copy actions announced via `aria-live="polite"`.
- Handle input announces rules on focus: "letters and numbers, 3–24 characters, some look-alike characters are blocked."
- QR modals: focus-trapped, Escape closes, focus returns to trigger (same pattern as your share modal — one tested component, reused).
- Relay dot + text label pairs satisfy the never-color-alone rule at 320 px.

## Test tasks to append to your guide

1. *"Show me the technical details of your degree's status event."* — **Pass:** finds Tier 3 without it interrupting the main task; can say what the event proves.
2. *"Claim the handle @alice."* — **Pass:** can state the link is public and that the handle proves key control, not endorsement.
3. *"Send your credential to @recruiter."* — **Pass:** notices the lookalike warning when shown `@recru1ter`; verifies before granting.
4. *"A relay shows stale for this credential — what do you do?"* — **Pass:** interprets as uncertainty, states a safe next action (recheck / contact issuer), not fraud or failure.

---

**Next step options:** I can build these as prototype screens matching your `docs/ui` conventions (persona switcher, toasts, simulated delays) — the identity chip and signer prompt are the two components everything else depends on, so I'd start there. Or, if "unixq" meant something different, correct me and I'll redesign Part 2.