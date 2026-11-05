# District counters — PRD
Status: BUILDING 2026-11-04 · Owner: George Nguyen · Last updated: 2026-11-04

## Problem
Receipts are stored (`receipts` table) but never shown. A visitor cannot
tell whether anyone else in their district has acted, and the research
(`docs/research/civic-action-levers/behavioral-science-and-virality.md`
§2, §5: Hager et al.) finds that left-leaning supporters act more when
shown their own side's participation is large, while small numbers
signal that nobody is acting. The shipped cards say nothing either way.

## Goals / Non-goals
- Goals: per-district and per-state counts of completed actions this
  week, computed by code from receipts, shown on result cards, goal
  target lists and member pages; hidden below a threshold; one cached
  endpoint that costs nothing.
- Non-goals: per-user history; leaderboards across districts; counts of
  anything other than receipts; real-time updates (five-minute cache is
  enough).

## Research (what the best products do → adopt / adapt / reject)
Relies on: `docs/research/civic-action-levers/behavioral-science-and-virality.md`.
| Pattern | Seen in | Verdict | Why |
|---|---|---|---|
| "N neighbours have acted" social proof | Gerber, Green & Larimer 2008; Hager 2022 | adopt | the one virality force that helps this audience |
| Show every count from zero | petition counters | reject | small numbers signal nobody is acting; hide below 5 |
| National total on the landing page | most campaign sites | reject | contagion is within-district ties, not national; and it invites gaming |

## Users
A visitor on the results page who has not yet acted; a captain checking
whether the people they asked followed through (by district, not by
name).

## Expected behavior
### 1. Counts endpoint
1. `GET /api/counts?goal=<slug>&state=XX&district=N` → `{district:
   {calls, letters, comments, captain_lists}, state: {…}, since}` for
   receipts in the last 7 days, computed by SQL `COUNT`, cached at the
   edge for 5 minutes (`Cache-Control: public, max-age=300`).
2. Any bucket below 5 is returned as `0`; the response never carries a
   number between 1 and 4, so the threshold cannot be bypassed by
   summing buckets.
3. The endpoint reads only; a missing or unknown goal returns 404
   `no_goal`; missing state returns 400 `missing`.

### 2. Counters on the pages
1. Result cards (`/results`) and goal target lists show one line under
   the targets: "12 constituents in TX-35 called this week" when the
   district count is ≥5, else "N in Texas" when the state count is ≥5,
   else nothing. The verb matches the action type with the largest
   count.
2. Member pages (`member-pages.md`, if shipped) show the same line for
   the member's district or state.
3. The line is never shown before the island has the response; no
   placeholder, no "0".

### 3. Abuse limits on receipts
1. `POST /api/receipt` is limited to 10 per device hash per day and 1
   per device, goal and action per 10 minutes; extra posts return 429
   and are not stored. Existing per-device limits stay.
2. A `receipts.ip_hash` column (SHA-256 of the IP with a daily salt)
   allows a per-IP ceiling of 50 per day; the salt rotates so the hash
   cannot be joined across days.

## Data & contracts
- New route `worker/src/counts.ts`; `receipts` gains `ip_hash`
  (nullable; backfill null) and an index on `(goal_id, state, district,
  created_at)`.
- Config: `COUNT_THRESHOLD` Worker var, default 5.
- Client: `web/src/components/Counts.tsx`, used by the results island,
  `GoalTargets.tsx` and the member page.

## Spec delta
- MODIFIED `docs/specs/action-router.md` §Behavior 3 (result cards):
  adds the counter line and the threshold rule.
- MODIFIED `docs/specs/personalised-documents.md` §Data & contracts:
  receipt limits and `ip_hash`.
- ADDED `docs/specs/district-counters.md`: endpoint, threshold, cache,
  display rule.

## Acceptance criteria
- [ ] With 4 receipts in a district the endpoint returns 0 for it and
      the page shows nothing; with 5 it returns 5 and the line appears
      (integration test with seeded receipts).
- [ ] The 11th receipt from one device in a day returns 429 and the
      count does not move; the 51st from one IP hash returns 429.
- [ ] Every number shown equals a SQL `COUNT` over `receipts` in a test;
      no LLM is involved.
- [ ] The response carries `max-age=300`; two requests within five
      minutes hit the cache (header assertion).
- [ ] Performance budget: results page still ≤100 KB transferred; the
      counts request adds ≤1 KB; `/api/counts` ≤300 ms p95 on 10k
      receipts; infra cost unchanged at $0/month.

## Rollout & metrics
Threshold var allows raising to 10 if gaming appears. Metrics: receipts
per district per week; share of results views where a line was shown;
call receipts per 100 results views with and without a line shown.

## State (updated 2026-11-04)
- Status: BUILDING
- Sections: (build order; `[ ]` todo · `[~]` in progress · `[x]` merged · `[!]` blocked: reason)
  - [~] 1. Counts endpoint · feat/district-counters · PR #26
  - [~] 2. Counters on the pages · feat/district-counters · PR #26
  - [~] 3. Abuse limits on receipts · feat/district-counters · PR #26
- Completed: §1–3 implemented and tested on the branch; awaiting merge into integ/next-prds.
- Folded: spec delta applied in the same PR (docs/specs/district-counters.md added; action-router.md items 5 and 9; personalised-documents.md Data & contracts; deployment.md variable table; specs/README.md index).
- Branch / open PRs: feat/district-counters → integ/next-prds, PR #26.
- Files changed: worker/src/counts.ts (new); worker/src/types.ts:143-150 (ReceiptRow.ip_hash, ReceiptBuckets, ReceiptLimitCounts), :183-186 (Repo methods), :210-213 (Env); worker/src/repo.ts:184-230 (D1 countReceipts/receiptLimitCounts, foldBuckets), :297-315 (MemoryRepo); worker/src/index.ts:11, 148-180 (limits), 209-221 (/api/counts); worker/schema.sql:111-119; worker/test/counts.test.ts (new); worker/test/generate.test.ts:409,419; worker/wrangler.jsonc:30-31; .env.example; web/src/components/Counts.tsx (new), counts.test.ts (new), Results.tsx, GoalTargets.tsx; web/src/pages/m/[id].astro:5,60; docs/specs/* as listed under Folded.
- Tests run + result: quiet-check tsc PASS (0 errors); test PASS (worker vitest, counts.test.ts +11); test-web PASS (+3); build PASS; results page 21.9 KB gzip (budget 100 KB).
- Remaining: merge; set `IP_SALT` secret in production (deployment.md); `/api/counts` p95 on 10k receipts not measured against live D1.
- Next action: merge PR into integ/next-prds, then the integration PR to main; on merge flip Sections to `[x]`, Status to SHIPPED and archive the PRD.
## Open questions
1. Window length. Proposal: 7 days rolling; a decision-date window
   ("since the conference began") can replace it later per goal.
2. Should counts show on the public goal page without a district?
   Proposal: no; without a district the line has no "own side" meaning.

## Changes
- 2026-11-04 — created (APPROVED, auto: every question carries a
  proposal, none blocking). Replaces the counters part of `## Next`
  row 2.
- 2026-11-04 — §1–3 built on `feat/district-counters`: `/api/counts`,
  `Counts` island, receipt limits and `ip_hash`. Deviations: the state
  line reads "N constituents in Texas …" (same grammar as the district
  line); the counter number is the largest bucket, not the sum, so the
  verb is always true of the number; `action-router.md` item 5 (results)
  and 9 (goal detail) carry the delta (the PRD's "§Behavior 3" numbering
  was stale); limit windows are rolling 24 h / 10 min, closed on the
  older edge.
