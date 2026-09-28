# Membership and invitation flow

Academy membership is academy-scoped. Opening or accepting a public invitation does not itself grant access.

## Learner flow

1. The academy owner publishes and shares a learner invitation link.
2. The learner opens the link and signs in.
3. The primary action says **Request membership**. Submitting it creates a `pending` membership request.
4. Settings → Membership lists the academy under **Pending membership requests**. It must not appear under **Joined academies** yet.
5. The owner reviews the request in Organization → Enrollment and accepts or declines it.
6. An acceptance changes the academy membership to `active`. The academy then appears under **Joined academies**.
7. Academy membership does not automatically enroll the learner in every class. Class enrollment is a separate step.

Repeated use of the same invitation is idempotent: one learner can have only one pending request per academy. Historical duplicate requests are displayed as one request, and one owner decision resolves the group.

## Teacher flow

A teacher invitation grants an academy-scoped teaching role when accepted. A classroom assignment remains separate. The Credentials screen may show the resulting teaching membership, but labels it as role evidence rather than a signed credential.

## Relay records

The public join-link record contains only public invitation data. Membership requests and decisions are private records encrypted to their recipient with NIP-44:

- `joinreq`: learner → academy owner;
- `member`: academy owner → learner, with `pending`, `active`, or declined/no-membership state.

The application must not infer active membership from possession of a public invite code. Authorization must use the approved academy membership state.
