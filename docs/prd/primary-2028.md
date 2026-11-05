# 2028 primary-target goal — PRD
Status: APPROVED 2026-11-04 · Owner: George Nguyen · Last updated: 2026-11-04

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
   `target_2028 = 1` is set only for a member who voted to keep the
   integration section on a recorded roll call, in a `data/` PR that
   cites the roll call; never for an "uncommitted" classification.
2. The card shows the member's positions and votes on every goal this
   site tracked, each with source and date, the primary date and filing
   deadline from a sourced `data/elections.csv`, and one ask: "ask the
   office who is running against them and say why you're asking". The
   card carries no vote-for, vote-against, support, oppose, elect or
   defeat language about any candidate, so it is a record, not express
   advocacy.
3. The ranking gives it priority 1 so it surfaces only when the federal
   and state goals are closed or ineligible.

### 2. Picks (blocked until counsel answers)
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
- [ ] Every date and vote on the card is a `data/` row with a source;
      `target_2028` rows cite a roll call (seed check).
- [ ] The §1 card contains none of: vote for, vote against, support,
      oppose, elect, defeat, re-elect (grep test over the build output).
- [ ] If picks are permitted, the disclosure line is on the card and on
      `/about`; if not, no candidate name appears anywhere on the site
      (grep test over the build output).
- [ ] Performance budget: unchanged (≤100 KB per page).

## Rollout & metrics
Status `upcoming` until the NDAA goal closes. Metrics: receipts on the
electoral goal per targeted district.

## State (updated 2026-11-04)
- Sections: (build order; `[ ]` todo · `[~]` in progress · `[x]` merged · `[!]` blocked: reason)
  - [ ] 1. Record goal per targeted member
  - [!] 2. Picks (blocked until counsel answers) · blocked: no written
    campaign-finance answer recorded in Open question 1
- Completed: none.
- Folded: none.
- Branch / open PRs: none.
- Remaining: §1; §2 blocked.
- Next action: /implement-prd-section docs/prd/primary-2028.md (§1),
  after member-pages merges.

## Open questions
1. Decided 2026-11-04 (owner): split. §1 ships as a sourced record with
   no candidate advocacy language (§1.2) and is not express advocacy.
   §2 stays `[!]` until the owner records here a written answer from a
   campaign-finance lawyer or the FEC information line on two points:
   whether naming a challenger on an uncompensated personal website is
   covered by the FEC's individual internet-activity exemption, and
   whether the site's Stripe donations, if spent on such content, could
   make it a political committee. Until then no candidate name appears
   anywhere in the repo.
2. Decided 2026-11-04 (owner): `target_2028 = 1` only for a recorded
   vote to keep the section, cited in the `data/` PR (§1.1).

## Changes
- 2026-11-04 — created (DRAFT: questions 1 and 2 were blocking).
  Replaces `## Next` row 4.
- 2026-11-04 — APPROVED for §1 only: owner split the legal question;
  §1 is a record with no advocacy language, §2 blocked in State until
  counsel's answer is recorded; targets limited to recorded votes.
