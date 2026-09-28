# BitOS Education — full web system design: Owner · Teacher · Student

Reading the screenshot: dark social shell, left nav with **New post** as primary, feed tabs (*For you / Following / Latest*), cards with author + time + engagement row. That's the visual language. Below is the complete system design that puts the **education workflow inside that social shell** — one design system, three roles.

---

## 0. Core concept: one shell, three lenses — *the feed is the ledger*

- **One app.** Owner, teacher, and student use the same shell. The nav, right rail, and card actions change by role — the layout never does. No separate "admin panel" that feels like a different product.
- **Everything is an event card.** A submission, a revision request, a finalized grade, an issued credential — each renders in the feed with the same skeleton as a social post (author, time, content, action row). This is honest to the architecture: Nostr events *are* the history, and your "no silent edits" principle becomes visible — corrections and resubmissions appear as new cards, never invisible edits.
- **Work happens on cards.** Role actions live in the card's action row where likes/reposts sit. Detail views open as drawers, so the feed stays the home base.

---

## 1. Design tokens (dark, matching the screenshot)

```css
:root{
  /* surfaces */
  --bg:#0e1014;            /* page */
  --surface:#161922;       /* cards, nav */
  --surface-2:#1d212c;     /* hover, inputs, chips */
  --border:#2a3040;
  /* text */
  --text:#e9ecf2; --muted:#8b94a7;
  /* brand — bee gold: primary actions, active tab, focus ring */
  --accent:#f2b824; --accent-ink:#1a1405;
  /* identity violet: keys, signing, verified marks — never decoration */
  --key:#a78bfa; --key-bg:#241d3a;
  /* status */
  --ok:#6fd39b; --ok-bg:#12301f;
  --warn:#e8c268; --warn-bg:#332708;
  --err:#ef9a94; --err-bg:#3a1713;
  --info:#8ec2f5; --info-bg:#0e2438;
  /* type */
  --font:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; /* keys, ids, urls */
  /* shape & space */
  --r-card:14px; --r-inner:8px; --r-pill:999px;
  --sp:4px 8px 12px 16px 24px 32px 48px; /* 8pt-ish scale */
  --tap:44px;              /* min touch target */
  --feed-w:640px; --nav-w:240px; --rail-w:300px;
  --shadow:0 10px 32px rgba(0,0,0,.45);
}
```

Rules carried over from the earlier layers: **gold = do**, **violet = sign/identity** (signer prompt and key material only), monospace + `overflow-wrap:anywhere` for anything key-like, status always icon + text (never color alone).

---

## 2. App shell

```
≥1280px
┌──────────┬────────────────────────────────────┬─────────────┐
│  NAV     │  PAGE HEADER (title · tabs · ⋯)    │  RIGHT RAIL │
│  240px   │ ─────────────────────────────────  │  300px      │
│          │                                    │             │
│ [+New    │        FEED / CONTENT               │  role       │
│   post]  │        max-width 640                │  widgets    │
│          │        centered                     │             │
│ ◉ Home   │                                    │             │
│ ▣ Role   │                                    │             │
│   space  │                                    │             │
│ ◎ Creds  │                                    │             │
│ ⌕ Discov │                                    │             │
│ 🔔 Notif │                                    │             │
│ ○ Avatar │                                    │             │
└──────────┴────────────────────────────────────┴─────────────┘
≤1024px  rail hides → "◈" toggle in header
≤720px   nav → top bar (logo · ⌕ · 🔔 · avatar) + bottom tab bar (5) + composer FAB
```

**Nav anatomy (top → bottom):**

1. **Primary composer** — gold pill, always "＋ New post" (the social layer belongs to everyone).
2. **Home**
3. **Role workspace** — labeled *Education* / *Teaching* / *Organization*; carries a count badge (pending work).
4. **Credentials** — everyone has an identity wallet, including staff.
5. **Discover / Directory** — students find courses; teachers find colleagues; owners browse the namespace.
6. **Notifications**
7. **Avatar → profile + Settings** (keys & signer, relays, theme, handle).

---

## 3. Role navigation matrix

| Nav item | Student (Alice) | Teacher (Bob) | Owner (Nadia) |
|---|---|---|---|
| ＋ New post | ✓ | ✓ | ✓ |
| Home | mixed feed | mixed feed | mixed feed |
| Role space | **Education** — my courses, deadlines | **Teaching** — review queue, rosters, grades | **Organization** — courses, staff, sign queue, network |
| Credentials | my credentials + share | my credentials | issued-credential log (org view) |
| Discover | course catalog | staff directory | namespace (UNIQ aliases) |
| Right rail | deadlines · pending feedback · relay health | to-review count · draft grades · roster alerts | **pending signatures** · relay health · staff requests |

**Home feed tabs per role:** everyone gets *For you · Following · Latest*; the role workspace adds its own tabs (queue states).

---

## 4. The event card — core component

Every workflow event uses one skeleton; only the action row and status badge change.

```
┌──────────────────────────────────────────────────────────┐
│ ◎ Alice ✓ · alice@bitos.id · 2h · [CS-101 ▸ A2]     ⋯   │  ← author row
│                                                          │
│ Submitted version 2 — "Hash functions"                   │  ← one-line summary
│ ▸ 2 attachments: hashes.pdf · data.csv                   │  ← attachment chips
│ [▲ revision requested]                                   │  ← status badge (if any)
│ ──────────────────────────────────────────────────────── │
│ ♥ 3   ⟲ 1   💬 2          [Open assignment]              │  ← social + role action
└──────────────────────────────────────────────────────────┘
```

**Author row:** identity chip (avatar · verified name · handle/npub · time) + **context chip** (which course/assignment the event belongs to — this is what makes a workflow feed navigable).

### Event catalog — who sees what, who acts

| Event card | Student sees / does | Teacher | Owner |
|---|---|---|---|
| 📝 Post (social) | like · comment · repost | same | same |
| 🏫 Course published | **Enroll** / View | View | **Edit** |
| ✅ Enrollment approved | Open course | appears in roster | — |
| 📤 Submission vN | view own versions | **Review** | — |
| 🔁 Revision requested | **Resubmit** | view sent feedback | — |
| 🎯 Grade finalized | **View grade** | **Correct** (→ new event) | — |
| ↩ Grade corrected | view history (superseded) | view history | — |
| 📦 Completion sent | — (hidden until signed) | view status | **Review & sign** |
| 🎓 Credential issued | **View in Credentials** | — | view issue record |
| 🔑 Handle claimed | view profile | — | — |
| ⚠ Relay delivery alert | — | — | **Retry / Recheck** |

Social counts (♥ ⟲ 💬) exist on workflow cards too — lightweight peer presence (classmates can encourage, not grade). **Bitz** from your screenshot slots in here as kudos/tips on submissions — optional engagement layer, kept strictly decorative so it never reads as assessment.

---

## 5. Student screens

### 5.1 Home (feed)

```
┌────────────────────────────────────────────────┐
│  Home        [For you] [Following] [Latest]    │
├────────────────────────────────────────────────┤
│ ◎ Bob ✓ · bob@bitos.id · 2h · [CS-101 ▸ A2]    │
│ Requested a revision on your hash functions    │
│ submission. "Section 3 needs collision         │
│ resistance."                                  │
│ [▲ action needed]                             │
│ ♥ 1  💬 0        [Open assignment]  ← gold     │
├────────────────────────────────────────────────┤
│ ◎ BitOS Academy ✓ · bitos.academy · 1d         │
│ CS-101 Applied Cryptography opens Monday.      │
│ 4 assignments · Certificate on completion.     │
│ ♥ 12 ⟲ 3 💬 2      [View course]              │
├────────────────────────────────────────────────┤
│ ◎ Mia Spark · 3d                               │
│ Day 40 of posting one sketch a day. 🐝         │
│ ♥ 89 ⟲ 12 💬 7                                │
└────────────────────────────────────────────────┘
```

**Action-needed cards float to the top of "For you"** with an `▲ action needed` badge — the feed prioritizes, the student never hunts.

### 5.2 Assignment detail (drawer from card)

```
┌─ CS-101 · Assignment 2 — Hash functions ──── ✕ ┐
│ Due Mar 14, 23:59 · late accepted +48h        │
│ [▲ revision requested]                        │
│                                                │
│ Reviewer feedback · Bob · Mar 12               │
│ "Section 3 doesn't cover collision resistance │
│  — revise and resubmit."                       │
│                                                │
│ Instructions ▾   Attachments                   │
│                 [📄 hashes.pdf ×]              │
│                 [📄 data.csv ×]                │
│                 [+ Add asset]                  │
│                                                │
│ ⚠ Submitting creates version 2. Version 1     │
│   stays in history.                            │
│                                                │
│ Version history          [Submit version 2] ←gold│
│ ● v1 · Mar 11 · reviewed                      │
│ ● revision requested · Mar 12                 │
└────────────────────────────────────────────────┘
```

Removable asset chips pre-submit; after submit they lose the × and the button becomes *Resubmit*. Pinned privacy line: *"Only the course teacher and BitOS Academy can see your files."*

### 5.3 Education · right rail

```
│ ⏰ Due soon                                    │
│ A2 revision · due in 2 days        [Open]     │
│                                                │
│ 📬 Awaiting feedback                           │
│ A1 · submitted 6 days ago                      │
│                                                │
│ 📡 Your relays · 3/4 healthy                   │
```

### 5.4 Credentials & share

Reuse the credential card + share dialog + signer prompt exactly as specced earlier (handle/npub recipient, lookalike warning, expiry, revoke with recall limitation). No redesign — the wallet opens as a page with the same card grid.

---

## 6. Teacher screens

### 6.1 Teaching · review queue

```
┌────────────────────────────────────────────────┐
│ Teaching     [To review (2)] [Drafts (1)] [Finalized] │
├────────────────────────────────────────────────┤
│ ◎ Alice · A2 hash functions · v1 · 2h   [Open] │
│ ◎ Carol · A1 intro essay · v2 · 1d     [Open] │
├────────────────────────────────────────────────┤
│ ◎ Dave · A1 · draft score 82%           [Open] │
└────────────────────────────────────────────────┘
```

Rows are identity chips + context; **Open** launches the split review.

### 6.2 Review & score (split view)

```
┌───────────────────────┬────────────────────────┐
│ Alice · A2 · v1       │ Rubric                 │
├───────────────────────┼────────────────────────┤
│ [📄 hashes.pdf]       │ Correctness (1)(2)(3)(•4)│
│ [📄 data.csv ]        │ Depth       (1)(2)(•3)(4)│
│                       │ Clarity     (1)(2)(•3)(4)│
│ Comments              │ ──────────────────     │
│ [+ Add comment]       │ Total 10/12 · 83%      │
│                       │                        │
│ ⚠ Banner if v2        │ [Request revision]     │
│ arrived during review │ [Finalize grade] ←gold │
└───────────────────────┴────────────────────────┘
```

Two exits only — feedback and assessment stay distinct actions. Finalize shows: *"Finalizing records this grade permanently. Corrections create a new event; history is never edited."* Correcting reopens the rubric pre-filled, labeled **"supersedes 83%"**.

### 6.3 Send completion (authority separation)

When criteria are met, a gold **Send completion** appears in the course header:

```
┌─ Send completion ──────────────────────────┐
│ This asks BitOS Academy's organization     │
│ signer to issue the Certificate to Alice.  │
│ You cannot edit this course record         │
│ afterward.                                 │
│              [Cancel]  [Send completion]   │
└────────────────────────────────────────────┘
```

No **Sign** control ever appears for Bob — controls teach the permission model.

---

## 7. Owner screens

### 7.1 Organization · dashboard

```
┌────────────────────────────────────────────────┐
│ Organization    [Overview] [Courses] [Staff] [Sign queue] [Network] │
├────────────────────────────────────────────────┤
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐   │
│ │ Courses│ │Pending │ │Relays  │ │Staff   │   │
│ │ 3 live │ │sigs: 1 │ │3/4 ✓   │ │4 · 1 pending│
│ └────────┘ └────────┘ └────────┘ └────────┘   │
├────────────────────────────────────────────────┤
│ Completion queue · 1 pending signature         │
│ ◎ Alice · CS-101 · criteria met · sent 1h ago  │
│                                    [Review] →  │
└────────────────────────────────────────────────┘
```

### 7.2 Review & sign (the moment authority matters)

```
┌─ Sign & issue · Alice · CS-101 ──────────── ✕ ┐
│ Completion criteria                            │
│ ✓ All 4 assignments finalized                  │
│ ✓ Overall grade 78% ≥ 60%                      │
│ ✓ Teacher: Bob ✓ · assigned to CS-101          │
│                                                │
│ Issues: BitOS Academy Certificate              │
│ → ◎ Alice · alice@bitos.id ✓                   │
│                                                │
│ ⚠ Signing is recorded permanently. This       │
│   credential becomes verifiable by anyone      │
│   Alice shares it with.                        │
│                                                │
│        [Decline…]   [Sign & issue] ← violet    │
└────────────────────────────────────────────────┘
```

**Sign & issue is violet** (the signing accent) and routes through the standard **signer prompt** — the same component the student meets, so everyone learns one mental model: *the org signer approves, the key never leaves.*

On sign: relay delivery states appear on the event card (`pending → delivered / failed / stale` with Retry/Recheck), and Alice's feed gains a 🎓 **Credential issued** card.

### 7.3 Staff & roles

```
│ Staff                                          │
│ ◎ Bob ✓ · teacher · CS-101, CS-204  [Roles ▾]  │
│ ◎ Carol ✓ · teacher · (unassigned)    [Roles ▾]│
│ ● invite pending · dave@… · sent 2d   [Resend] │
│                                                │
│ Issuer authorization                           │
│ Signer key: npub1kk9m…2f8d ✓ rotated Jan 12    │
│ Authorized signers: Nadia (you)                │
│ + Add signer…   ⟲ Rotate key…                  │
```

Role, teaching assignment, and issuer authorization are **three separate controls** — an invitation never grants signing power (your scenario-5 pass signal). Network tab reuses the relay manager from the earlier layer, unchanged.

---

## 8. Shared screens

- **Profile** — identity chip header (name, handle or npub, ✓ if verified, QR), credential highlights, post history. Teachers/orgs show "staff of BitOS Academy ✓."
- **Settings → Keys & signer** — signer type with the plain-language lines from the sign-in spec; lost-key recovery stub with honest copy; handle settings (UNIQ claim/visibility toggle).
- **Notifications** — grouped by event type with a jump-to-card action; `aria-live` announces "3 new events" on background refresh.

## 9. States

| State | Pattern |
|---|---|
| Empty feed | "Nothing here yet. [Find a course] / [Follow teachers]" — always one exit |
| Empty queue (teacher) | "All caught up ✓ — nothing to review" |
| Loading feed | 3 skeleton cards (shimmer), never spinner-only |
| Relay failed | amber card row in Network + owner rail, Retry; stale = "last confirmed X ago — may not reflect latest" (uncertainty, not failure) |
| Offline | gold banner "Reconnecting… drafts are kept locally" |

## 10. Responsive & accessibility rules

- **≤720px:** top bar + 5-item bottom tab bar (Home · role space · Credentials · 🔔 · Profile), composer FAB, drawers → bottom sheets, review split view stacks with a **sticky action bar** (Finalize always reachable).
- Tap targets ≥ 44×44; focus ring gold, always visible; dialogs trap focus, Escape closes, focus returns to trigger.
- Feed = semantic list with per-card headings; toasts and queue counts announced via `aria-live`.
- Rubric criteria = fieldsets with radios, live total announced; tables scroll in their own container, never the page.
- 320px check: no horizontal page scroll — long keys wrap (monospace + `overflow-wrap:anywhere`), context chips truncate with the full name in the title attribute.

---

## Build plan

Everything above is one prototype file's worth of patterns, reusing the components we already built (`chip()`, `signerPrompt()`, toasts, focus trap, relay states). Proposed structure:

- **`bitbee.html`** — persona switcher (Alice/Bob/Nadia) that swaps nav, feed, and right rail; three seeded feeds (~10 event cards each); working drawers for assignment detail, review & score, and review & sign; composer modal; bottom-tab mobile layout.

Say **build** and I'll generate the complete file matching the earlier prototype's conventions (no dependencies, incognito-clean, simulated delays) — or tell me which single flow to perfect first (I'd start with **teacher review → owner sign**, since it exercises the most components at once).