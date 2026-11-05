# 2028 primary-target goal — PRD
Status: DRAFT · Owner: George Nguyen · Last updated: 2026-11-04

## Problem
The ranking engine and goal model support an `electoral` category, and
`members.target_2028` exists as a flag, but no goal uses them. The
research (`docs/research/civic-action-levers/levers-and-actions.md`)
scores replacing a member in a primary as the highest-impact lever a
constituent has, and a named 2028 target with a challenger pick is the
natural fourth goal for a district whose member voted to keep the
integration section. The archived action-router PRD (Open question 7)
deferred it: a site run by one person that names a candidate may be
making expenditures that count as express advocacy with FEC reporting
duties, and that must be resolved before any copy is written.

## Goals / Non-goals
- Goals: a goal of category `electoral` per targeted member, with the
  member's record on the votes this site tracks, the primary date and
  filing deadline, and the actions a constituent can take that the
  owner has confirmed are lawful without registration; `our_picks` on
  that goal only if the legal answer allows it.
- Non-goals: fundraising for any candidate; volunteer sign-up for a
  campaign; anything before the legal answer.

## Research (what the best products do → adopt / adapt / reject)
Relies on: `docs/research/civic-action-levers/levers-and-actions.md`.
| Pattern | Seen in | Verdict | Why |
|---|---|---|---|
| Scorecard of the incumbent's record with the primary date | Justice Democrats, AIPAC-funded trackers | adapt | record is sourced rows this site already holds; the date is public |
| "Our pick" challenger card | endorsement sites | defer | depends on Open question 1 |
| Donate-to-challenger buttons | ActBlue embeds | reject | turns the site into a political committee |

## Users
Constituents of a targeted member who have already called and been
told the member will keep the section; they want to know what comes
next and when.

## Expected behavior
### 1. Record goal per targeted member
1. `data/goals/primary-<state>-<district>.yaml`, category `electoral`,
   eligibility `house{target_2028: 1}` for that district; status
   `upcoming` until the federal goal it follows closes.
2. The card shows the member's positions and votes on every goal this
   site tracked, each with source and date, the primary date and filing
   deadline from a sourced `data/elections.csv`, and the ask the legal
   answer permits (at minimum: "ask who is running and tell the office
   why").
3. The ranking gives it priority 1 so it surfaces only when the federal
   and state goals are closed or ineligible.

### 2. Picks (conditional on the legal answer)
1. If permitted: `our_picks` as on the Senate leader goal, each with
   rationale, source and signal date, and a disclosure line on the
   card and `/about`.
2. If not permitted: no picks; the card links the state's candidate
   filing list instead.

## Data & contracts
- `data/elections.csv(state, district, primary_date, filing_deadline,
  source_url)`; seed checks dates and sources.
- No new endpoints; the goal model is unchanged.

## Spec delta
- MODIFIED `docs/specs/action-router.md` §Behavior goals: the
  `electoral` category rendering and the disclosure line.

## Acceptance criteria
- [ ] The electoral goal ranks below any active federal or state goal
      for the same district and surfaces when they are closed (ranking
      test).
- [ ] Every date and vote on the card is a `data/` row with a source.
- [ ] If picks are permitted, the disclosure line is on the card and on
      `/about`; if not, no candidate name appears anywhere on the site
      (grep test over the build output).
- [ ] Performance budget: unchanged (≤100 KB per page).

## Rollout & metrics
Status `upcoming` until the NDAA goal closes. Metrics: receipts on the
electoral goal per targeted district.

## Open questions
1. [blocking] Does naming a challenger, or even naming a member as a
   2028 target with their record, make this site's spending (domain,
   Cloudflare, LLM) an independent expenditure or electioneering
   communication with FEC reporting duties for the owner? Proposal: the
   owner asks a campaign-finance lawyer or the FEC's information line
   and records the answer here; until then the goal stays `upcoming`
   and no candidate name is written anywhere in the repo.
2. [blocking] Which members get `target_2028 = 1`? Proposal: only those
   who voted to keep the integration section on a recorded vote, set in
   a `data/` PR with the roll call as source, after question 1.

## Changes
- 2026-11-04 — created (DRAFT: questions 1 and 2 are blocking; no code
  until answered). Replaces `## Next` row 4.
