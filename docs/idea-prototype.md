# BitOS ID prototype test guide

Use this guide to run a moderated usability test of the interactive prototype in `docs/ui`. It tests whether people understand the product and can complete core tasks. It does **not** prove security, cryptography, authorization, persistence, or relay delivery: the prototype contains fictional data and simulated interactions.

## Goal

Answer these questions before implementing the pilot UI:

1. Can a learner understand what a credential is, what is private, and what can be shared?
2. Can a learner find a credential, create a time-limited share, and understand its limits?
3. Can a verifier distinguish a valid signature from issuer trust, current status, and freshness?
4. Can education staff understand the sequence from enrollment to submission, grade, completion, and issuance?
5. Can people navigate the prototype on desktop and mobile without relying on the facilitator?

## Test setup

### Participants

Run 5–7 sessions for each high-priority audience:

| Audience | Suggested participant profile | Primary scenarios |
| --- | --- | --- |
| Learner / credential holder | Has completed a course or applied for work | 1–3 |
| Teacher | Has assessed learners or managed coursework | 4 |
| Organization administrator / issuer | Manages staff, courses, or compliance | 5 |
| Verifier / HR | Checks qualifications or employment claims | 6 |

Include at least one keyboard-only user and one person using a phone-sized viewport. Do not recruit minors or use personal academic records for this prototype test.

### Materials

- Open [the prototype index](index.html) in a current desktop browser. Serve the `docs/ui` folder through a local static server if browser security blocks module loading from a file URL.
- Use a private/incognito window for each participant so theme, first-run tips, and session data start clean.
- Record observations and participant quotes only with consent. Do not record passwords, private keys, personal identifiers, or screen content that contains them.
- Prepare the findings template at the end of this guide.

### Facilitator script

Read this aloud:

> This is an early, fictional prototype of a portable identity and credential product. Nothing you do creates a real identity, signs a real credential, or sends data to a real organization. Please think aloud: say what you expect, what confuses you, and what you would do next. There are no wrong answers; we are testing the design, not you.

Do not explain the UI unless the participant is completely stuck. After a task, ask what they believed happened and whether they would trust that outcome in real life.

## Session outline

Plan 45–60 minutes.

| Time | Activity |
| --- | --- |
| 0–5 min | Consent, prototype disclosure, participant context |
| 5–10 min | First impression and unaided navigation |
| 10–35 min | Run the role-appropriate task scripts below |
| 35–45 min | Error, privacy, and trust questions |
| 45–60 min | Accessibility/mobile pass and debrief |

## Core task scripts

### 1. First impression and signed sign-in

**Start:** Reload the prototype. Select **Sign in** from the welcome screen.

**Prompt:** “You have been invited to use BitOS ID. Sign in in the way you would be comfortable using.”

**Expected path:** Choose a demo persona, select a signer type, then choose **sign challenge & continue**.

**Observe:**

- Does the participant understand what a signer is and why it is needed?
- Do they mistake a persona card for creating a new account?
- Do they expect an extension, a hardware device, or a remote signer to be available?
- Do they understand that signing in does not grant an organization role?

**Follow-up questions:**

- “What information do you think BitOS keeps after this step?”
- “What would you expect if you cancelled the signer request?”
- “What help would you need if your key was lost?”

**Pass signal:** The participant can explain, in plain language, that a key/signature proves control of an identity and that the application should not receive the secret key.

### 2. Learner: find and inspect a credential

**Start:** Sign in as **Alice · holder**. Go to **Credentials**.

**Prompt:** “You need to show a prospective employer your Computer Science degree. Find the credential and tell me whether it is usable.”

**Expected path:** Open **Bachelor of Computer Science** in the holdings list and identify issuer, status, expiry, and privacy levels.

**Observe:**

- Can the participant find the degree without reading every card?
- Do `active`, `revoked`, and `superseded` have clear meanings?
- Do they understand L0–L3 and which claims are public versus private?
- Do technical terms such as event ID, npub, and status event distract from the decision?

**Follow-up question:** “What evidence would make you confident this is the correct credential?”

**Pass signal:** The participant identifies the issuer and status, and does not interpret “signed” as automatically trusted by every employer.

### 3. Learner: share a credential safely

**Start:** Keep Alice’s degree selected in **Credentials**.

**Prompt:** “Share this degree with a recruiter for one week. Before you submit, tell me what the recruiter will receive and what you can take back.”

**Expected path:** Choose **share access**, select a recipient and **7 days**, then choose **create grant**.

**Observe:**

- Does the participant recognize that MVP sharing is the whole credential, not individual claims?
- Do they verify the recipient before creating a grant?
- Do they understand expiry, revocation, and the limitation that downloaded copies cannot be recalled?
- Is “raw token copied” understandable, safe, and actionable?

**Follow-up questions:**

- “Would you share this with a recruiter using this screen? Why or why not?”
- “What would you expect to happen after you revoke it?”

**Pass signal:** The participant can state the recipient, scope, time limit, and revocation limitation before creating the grant.

### 4. Learner and teacher: coursework loop

**Start:** As Alice, open **Education**. Then switch to **Bob · teacher** and open **Teaching**.

**Prompt to learner:** “You received feedback asking for a revision. Find the feedback and submit the next version.”

**Prompt to teacher:** “Review Alice’s latest work. Request a revision or finalize a grade, then explain what cannot be changed afterward.”

**Expected path:** Learner sees submission history and uses the assignment action. Teacher chooses a learner, adds a review, finalizes rubric entries, then sends a completion for organization signing when applicable.

**Observe:**

- Is the learner’s next action clear from the assignment state?
- Do version history, deadline, and late-policy language make sense?
- Does the teacher understand that comments, grade revisions, and issuance are distinct actions?
- Does the organization signer step communicate authority separation?

**Pass signal:** Participants understand that a later submission and a grade correction create new history; they are not silent edits.

### 5. Organization: manage access and issuing authority

**Start:** Switch to **Nadia · org admin**, then open **Organization** and **Network**.

**Prompt:** “Invite a teacher. Then show me who is allowed to issue a credential and what you would check if delivery to a relay failed.”

**Observe:**

- Do role, teaching assignment, and issuer authorization appear distinct?
- Can the participant explain that admin access alone does not allow credential signing?
- Can they recognize a pending, failed, or stale delivery state?

**Pass signal:** The participant does not assume that an invitation or organization-admin role automatically creates issuer authority.

### 6. Verifier: make a trust decision

**Start:** Switch to **Vera · verifier** and open **Verify**.

**Prompt:** “A candidate gives you this degree. Decide whether you would accept it for this role. Explain your decision to the candidate.”

**Expected path:** Run the degree example, inspect the result, change the verifier context to **anonymous**, and compare the result. Optionally inspect **local trust evidence**.

**Observe:**

- Do participants see the final result before getting lost in the terminal pipeline?
- Do they understand the difference between signature validity, issuer trust, revocation/status, and expiry?
- Do they interpret `TRUST UNPROVEN` as uncertainty rather than fraud or product failure?
- Do they know the next safe action when status is stale, unavailable, revoked, or superseded?

**Pass signal:** The participant says that a valid signature alone is insufficient and can explain what local trust evidence changes.

## Cross-cutting checks

### Privacy and comprehension

Ask after any relevant task:

1. “Which information is public right now?”
2. “What would be shared with this recipient?”
3. “What could remain available after a grant expires or is revoked?”
4. “Which action is irreversible or difficult to undo?”

Flag any answer that assumes private grades are public, expiry deletes copied data, or signing proves truth.

### Keyboard-only pass

Without using a pointer, test sign-in, navigation, a credential share modal, and verification. Confirm:

- Focus is always visible and follows a logical order.
- Enter/Space activates controls; Escape closes menus and dialogs.
- A dialog keeps focus inside it and returns focus to its trigger on close.
- Locked destinations are not reachable as active links.
- Result changes and toast messages are announced to a screen reader.

### Mobile pass

Repeat tasks 2, 3, and 6 at 320 px and 390 px viewport widths. Confirm:

- The navigation does not wrap into an unreadable wall of items.
- Long keys, event IDs, tables, and terminal results do not cause horizontal page scrolling.
- Primary actions remain visible without excessive scrolling.
- Touch targets are at least 44 by 44 CSS pixels.

## Severity and decision rules

| Severity | Definition | Required response |
| --- | --- | --- |
| Blocker | A person cannot complete a core task, or may expose private data / make an unsafe trust decision | Fix and retest before implementation acceptance |
| High | A person completes it only with help, misunderstands an important state, or loses confidence | Prioritize before pilot UI build |
| Medium | The task completes but wording, hierarchy, or feedback causes friction | Add to the next design iteration |
| Low | Cosmetic or preference issue without task impact | Track if repeated across participants |

Do not decide from one comment alone. Prioritize an issue when it affects at least 2 of 5 participants, affects a high-risk task once, or contradicts the product/security requirements.

## Findings template

Copy this entry for each issue:

```text
ID / title:
Date / prototype version:
Participant role and device:
Task and step:
Observed behavior / direct quote:
Expected behavior:
Severity: blocker | high | medium | low
Frequency:
Likely cause:
Recommendation:
Owner:
Decision / follow-up test:
Related feature, backlog task, or decision:
```

## Exit criteria for the next design iteration

- Five participants per highest-priority role completed their core task with no blocker.
- Participants can explain the privacy boundary and the difference between signature validity and trust.
- Every high-severity finding has an owner and a design decision.
- Keyboard and 320 px mobile passes have no blocker.
- Prototype-only behavior is labeled clearly; implementation work remains governed by the pilot criteria in `docs/planning/product.md`.
