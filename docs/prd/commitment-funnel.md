# Commitment funnel and captains — PRD
Status: BUILDING 2026-11-04 · Owner: George Nguyen · Last updated: 2026-11-04

## Problem
The shipped flow ends at a receipt and a share button
(`docs/specs/personalised-documents.md` §Behavior 4). Nothing asks the
user to commit to a time, nothing recruits the three named people the
evidence says drive hard action, and a return visitor sees the same
landing page as a stranger. The research
(`docs/research/civic-action-levers/behavioral-science-and-virality.md`
§2, §6) puts the largest measured effects on named-captain lists with a
deadline (+13 to +17 points) and on private commitment before any public
act; the shipped funnel has neither.

## Goals / Non-goals
- Goals: after a receipt, one private commitment and one captain list of
  three first names with a ≤48-hour deadline; a persistent checklist and
  an `.ics` reminder; a return visit that opens on the user's open
  commitments, not the address field; no public act before the private
  one.
- Non-goals: server-side reminders, email or SMS (no identity is held);
  storing names server-side (never); office-visit listings (own PRD,
  `office-visits.md`); the reflection prompt (shipped in §4 of the
  action-router); counters (`district-counters.md`).

## Research (what the best products do → adopt / adapt / reject)
Relies on: `docs/research/civic-action-levers/behavioral-science-and-virality.md`.
| Pattern | Seen in | Verdict | Why |
|---|---|---|---|
| Captain owns a named list of three with a deadline | Turnout Nation, Ice Bucket structure | adopt | the largest measured effect; nomination beats broadcast |
| Private "I'll do it by <date>" before any public step | Han 2016; implied funnel | adopt | public-first licenses non-action |
| Public badge or "I signed" counter | petition sites | reject | suppresses follow-through (§1 of the research) |
| Server reminders by email/SMS | 5 Calls, Resistbot | reject | needs identity; `.ics` plus return-visit nudge instead |

## Users
Someone who just completed a call or letter and is at peak arousal; the
screen must take under a minute. Return visitors who committed earlier
want to see what is still open and tick it off, not re-enter an address.

## Expected behavior
### 1. Commitment after the receipt
1. On the receipt screen, before "Share", one line: "Will you call by
   <default: tomorrow 17:00 local>?" with the date editable (≤7 days) and
   a single confirm. For a call action already marked done the line
   reads "Will you call again before the vote?" with the goal's
   decision date as the ceiling.
2. Confirming stores `{goal, action, target, due}` in `localStorage`
   under `cut-ties:commitments` and nothing server-side. No counter
   moves, no share prompt appears.
3. Same screen, next: the related hard ask. "Name three people in
   <state-district> you'll ask to call by <due>." Three first-name
   fields (≤20 chars each, letters and spaces only) and, per name, how
   you will reach them (text · in person · call). No phone numbers or
   emails are accepted: a field containing digits or `@` is refused
   inline.
4. Saving the list writes `cut-ties:captain` `{goal, due, people[3]:
   {name, channel, done}}` locally and offers "Add reminder" (an `.ics`
   download: title, due, the goal deep link; no names in the file) and
   "Copy a message" (the goal deep link with one pre-filled line naming
   the goal and the date, for the user's own groups).
5. Skipping either step is one tap; nothing nags on this visit.

### 2. Checklist and return visit
1. `/` for a visitor with a stored district and any open commitment or
   captain list shows a "Your week" card above the address field: the
   commitment with "Done" and "Not yet", and the three names with a
   checkbox each. Ticking a name is local; ticking all three creates a
   receipt (`POST /api/receipt` with action type `captain-list`, no
   names) and then, and only then, offers "Share".
2. Overdue items (past `due`) show "Still on?" with "Done", "New date"
   and "Drop". Dropping deletes the item locally. Items whose goal has
   closed are dropped silently with one line naming the outcome.
3. "Change address" clears the place and the route cache, never the
   commitments; "Start over" (in the footer of the card) clears all.
4. The act page for a goal with an open commitment shows "You said
   you'd call by <due>" above the form.

### 3. Share after the list
1. "Share" after a completed captain list uses the shipped share sheet
   with a receipt line in the grammar "Three of us in TX-35 are calling
   Casar before <date>. Who's next?" and the goal deep link; no names.
2. The share image (built at request time from the goal card template)
   carries goal, district and date only.

## Data & contracts
- `localStorage` `cut-ties:commitments` (array), `cut-ties:captain`
  (object); schema versioned with a `v: 1` field.
- `receipts` gains `kind IN ('action','captain-list')`; `action_id` and
  `target_id` become nullable and a CHECK ties them to `kind`, so the FK
  still guards ordinary receipts (a synthetic `action_id` value cannot
  live in an integer FK column). `POST /api/receipt` accepts `action:
  'captain-list'` with no target.
- `.ics` is generated in the browser from a template
  (`web/src/lib/ics.ts`); nothing is fetched.
- New island `web/src/components/YourWeek.tsx`; `ActForm.tsx` gains the
  commitment and captain steps after the receipt.

## Spec delta
- MODIFIED `docs/specs/personalised-documents.md` §Behavior 4: after
  the receipt, the commitment and captain steps precede "Share"; share
  is offered after a receipt or a completed list.
- MODIFIED `docs/specs/action-router.md` §Behavior 1 (landing): a
  return visitor with open items sees the "Your week" card above the
  field.
- ADDED `docs/specs/commitment-funnel.md`: commitments, captain lists,
  checklist, `.ics`, local schema.

## Acceptance criteria
- [ ] After a receipt the commitment line appears before any share
      affordance; "Share" is absent until a receipt or a completed list
      exists (DOM test).
- [ ] A captain field containing a digit or `@` is refused and never
      stored; no request carries a name (network assertion over the
      whole flow).
- [ ] Ticking three names posts one receipt with `action_id`
      `captain-list` and no target; ticking two posts nothing.
- [ ] The `.ics` file validates (RFC 5545 parser test) and contains no
      name; the reminder opens the goal deep link.
- [ ] Return visit with an open commitment shows "Your week" above the
      address field; "Change address" keeps it; "Start over" clears it;
      a closed goal's items are dropped with its outcome line.
- [ ] Performance budget: landing ≤100 KB transferred with the "Your
      week" island (measured); LCP ≤1.5 s; no new Worker endpoint.

## Rollout & metrics
No flag. Metrics (from receipts only, no names): share of receipts
followed by a commitment; captain-list receipts per 100 call receipts;
return visits with an open item (client counter sent with the receipt as
a boolean).

## State (updated 2026-11-04)
- Status: BUILDING
- Sections: (build order; `[ ]` todo · `[~]` in progress · `[x]` merged · `[!]` blocked: reason)
  - [~] 1. Commitment after the receipt · feat/commitment-funnel · PR pending
  - [~] 2. Checklist and return visit · feat/commitment-funnel · PR pending
  - [~] 3. Share after the list · feat/commitment-funnel · PR pending
- Completed: §1–3 implemented and tested on the branch; nothing merged.
- Folded: spec delta applied on the branch (`docs/specs/commitment-funnel.md` added; `personalised-documents.md` §4 and `action-router.md` §1/§6 modified); counts as folded when the PR merges.
- Branch / open PRs: feat/commitment-funnel · PR pending.
- Files changed: worker/schema.sql:98-112 (receipts.kind, nullable ids, index); worker/src/types.ts:105-106 (ReceiptKind); worker/src/repo.ts:136-141 (D1 insert); worker/src/index.ts:140-163 (captain-list branch); worker/test/generate.test.ts:403-424; web/src/lib/commitments.ts (new); web/src/lib/ics.ts (new); web/src/components/Funnel.tsx (new); web/src/components/YourWeek.tsx (new); web/src/components/ActForm.tsx:1-6,58-75,228-240 (Funnel, share gate, nudge); web/src/components/AddressForm.tsx:4,21-22 (return rule); web/src/pages/index.astro:3-8,16-18; web/src/pages/goals/[slug]/act/[action].astro:21; web/src/pages/privacy.astro:12; web/src/lib/store.ts:24-36 (deviceId); web/vitest.config.ts + web/test/setup.ts; tests web/src/lib/*.test.ts, web/src/components/funnel.test.ts.
- Tests run: quiet-check prd-lint, doc-lint, tsc, test (worker), test-web (17), build — all PASS; landing 24.0 KB gzip (budget ≤100 KB).
- Remaining: merge via the integration PR; after merge mark Sections `[x]`, Status SHIPPED, archive the PRD.
- Next action: review and merge PR; then /handoff to archive.
## Open questions
1. Default commitment deadline. Proposal: next weekday 17:00 local;
   never later than the goal's decision date.
2. Should a captain list exist without a prior receipt? Proposal: no;
   the list is the "related hard ask" after a completed action, which is
   the order the evidence supports.

## Changes
- 2026-11-04 — §1–3 built on `feat/commitment-funnel`. Decisions: open
  question 1 adopted as proposed (next weekday 17:00 local, capped at the
  decision date; a repeat call may pick any day up to the vote); open
  question 2 adopted (the list only follows a receipt). Schema: instead
  of a synthetic `action_id`, `receipts.kind` with nullable, CHECK-tied
  `action_id`/`target_id` (spec `## Data & contracts`). The share image
  is drawn on the device (canvas) and attached when the browser can
  share files, so no Worker endpoint was added. The captain record also
  keeps the target official's surname (`who`) for the share line.
- 2026-11-04 — created (APPROVED, auto: every question carries a
  proposal, none blocking). Replaces the commitment, captains and
  reflection parts of `## Next` row 2; reflection already shipped.
