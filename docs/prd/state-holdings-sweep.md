# State Israel-bond holdings sweep — PRD
Status: BUILDING · Owner: George Nguyen · Last updated: 2026-11-04

## Problem
The state goal (`data/goals/state-bonds.yaml`) renders for every visitor
whose federal goals run out, but `data/states.csv` has three empty rows,
so the page says "not yet sourced" for treasurer, holdings and decider
in every state. The research
(`docs/research/civic-action-levers/levers-and-actions.md` §State) shows
the lever is real (Maryland sold 85% of its Israel bonds after a
campaign) and that holdings are public but scattered across treasurer
reports and pension disclosures. Finding them is maintainer research;
getting them into the site without a typo is tooling.

## Goals / Non-goals
- Goals: a sourced `states.csv` row for every state that holds Israel
  bonds, plus the treasurer or board that decides and the next public
  comment date where one exists; a CLI that drafts a row from a source
  URL with a verbatim quote, like `draft-position`; a lint that rejects
  a number without a source; states with no holdings say so with a
  source instead of "not yet sourced".
- Non-goals: pension-fund equity holdings (Palantir, Caterpillar); city
  and county holdings; automatic refresh (holdings change on a report
  cadence; a `data/` PR per update).

## Research (what the best products do → adopt / adapt / reject)
Relies on: `docs/research/civic-action-levers/levers-and-actions.md`,
`docs/research/civic-action-levers/decision-points.md`.
| Pattern | Seen in | Verdict | Why |
|---|---|---|---|
| Per-state divestment scorecard with document links | AFSC Investigate, campus divestment trackers | adapt | same shape, but every cell must carry its own source and date |
| Crowd-sourced holdings | spreadsheets passed around campaigns | reject | one unsourced number discredits the whole table |
| LLM-extracted figures shown directly | none worth copying | reject | the LLM proposes, code verifies the quote on the page, the maintainer commits |

## Users
The maintainer, running the sweep over several evenings; visitors in
the 44 states that currently show nothing.

## Expected behavior
### 1. Draft tool and lint
1. `npm run draft-holding -w worker -- <STATE> <url>` fetches the page
   or PDF, asks a Haiku-class model for the Israel-bond holding in USD,
   the holdings date, the deciding body and a verbatim quote, verifies
   the quote appears on the page by code, and prints one `states.csv`
   row with `holdings_source` = the URL. No row prints without a
   verified quote and a date. Never writes to `data/`.
2. The seed rejects a `states.csv` row with `israel_bonds_usd` set and
   `holdings_source` or `holdings_date` empty, a `next_comment_date` in
   the past, or a `campaign_url` without a `campaign_name`.
3. A new column `holdings_status` (`held | none | unknown`) lets a state
   with a sourced "no Israel bonds" statement render "holds none (as of
   <date>)" rather than "not yet sourced".

### 2. The sweep
1. The sweep is a research task: `docs/research/state-israel-bonds.md`
   lists, per state, the treasurer's report URL, the pension system's
   disclosure URL and the result (held / none / not found), with the
   date checked. It is written in batches of ten states.
2. Each batch lands as one `data/` PR: the research file rows plus the
   `states.csv` rows the draft tool produced; the PR body lists states
   where nothing was found.
3. The state goal's `prep_md` and `this_week` are updated when a batch
   includes a state with a public comment date within 45 days.

### 3. State page copy
1. The state goal card and target list read `holdings_status`: `held`
   shows the amount and date with the source link; `none` shows "holds
   none" with its source; `unknown` keeps "not yet sourced" and adds
   "help us find it" linking the research file on GitHub.
2. The ask on the state action names the deciding body from `decider`
   when set and falls back to "your state treasurer".

## Data & contracts
- `data/states.csv` gains `holdings_status`; seed checks per §1.2.
- `worker/scripts/draft-holding.ts` (shares the fetch, quote-verify and
  model code with `draft-position.ts`).
- `docs/research/state-israel-bonds.md` with the research header and
  an index row.

## Spec delta
- MODIFIED `docs/specs/maintainer-tooling.md` §Behavior: adds
  `draft-holding` beside `draft-position`; seed checks for `states.csv`.
- MODIFIED `docs/specs/action-router.md` §Behavior state goal: the
  three `holdings_status` renderings.

## Acceptance criteria
- [ ] `draft-holding` on a fixture page prints a row whose quote is on
      the page; on a page without a date it prints nothing (mocked
      model, 6 fixtures).
- [ ] A `states.csv` row with an amount and no source fails the seed;
      a past `next_comment_date` fails the seed.
- [ ] All 50 rows present with `holdings_status` set; every `held` row
      has amount, date and source; the research file has a row per
      state with a checked date.
- [ ] The state card for a `none` state shows "holds none" with a
      source link; for `unknown` it links the research file.
- [ ] No number on the state page comes from the model: a test asserts
      every rendered amount equals the CSV cell.
- [ ] Performance budget: unchanged pages (≤100 KB); draft tool cost
      ≤$0.01 per run (Haiku, ≤8k input tokens).

## Rollout & metrics
Batches of ten states, five PRs. Metrics: states with `held` or `none`
versus `unknown`; state-goal receipts per state after each batch.

## State (updated 2026-11-04)
- Sections: (build order; `[ ]` todo · `[~]` in progress · `[x]` merged · `[!]` blocked: reason)
  - [~] 1. Draft tool and lint · feat/state-holdings-sweep · PR #22
  - [ ] 2. The sweep · maintainer research, not a build; batches of ten
    from `docs/research/state-israel-bonds.md` (50 rows, all "not checked")
  - [~] 3. State page copy · feat/state-holdings-sweep · PR #22
- Completed: none merged.
- Folded: §1 and §3 spec deltas applied on the branch
  (`docs/specs/maintainer-tooling.md` §Behavior 2, 5, contracts,
  invariants; `docs/specs/action-router.md` §Behavior 14, invariant).
- Branch / open PRs: feat/state-holdings-sweep · PR #22.
- Files changed: worker/src/{draft-shared,draft-holding,state-copy}.ts
  (new), worker/src/{draft-position,load,types,ranking,route,generate}.ts,
  worker/scripts/draft-holding.ts (new), worker/schema.sql,
  worker/package.json, worker/test/{draft-holding,states}.test.ts (new),
  worker/test/ranking.test.ts, data/states.csv (`holdings_status`),
  data/actions/state-bonds-call.yaml (`{decider}`), data/README.md,
  web/src/components/Target.tsx, web/src/components/Target.test.ts (new),
  web/src/pages/goals/[slug].astro, web/src/pages/goals/[slug]/act/[action].astro,
  web/vitest.config.ts, docs/research/state-israel-bonds.md (new) + index.
- Tests run + result: tsc PASS; worker vitest 112 passed (10 files);
  web vitest 5 passed; web build PASS; prd-lint, doc-lint PASS.
- Remaining: §2 sweep (research, five data PRs); merge §1 + §3.
- Next action: maintainer runs batch 1 (MD, CA, WA, NY, IL, MN, MA, NJ,
  PA, TX) with `draft-holding`, one data PR per batch.
## Open questions
1. Scope of "holdings": treasurer-held bonds only, or pension systems
   too? Proposal: both, in one row per state, with the deciding body of
   the larger holding as `decider`; pension equity stays out.
2. Order of the sweep. Proposal: states with a known campaign first
   (Maryland, California, Washington, New York, Illinois, Minnesota,
   Massachusetts, New Jersey, Pennsylvania, Texas).

## Changes
- 2026-11-04 — created (APPROVED, auto: every question carries a
  proposal, none blocking). Replaces `## Next` row 3.
- 2026-11-04 — §1 and §3 built on `feat/state-holdings-sweep`. Open
  question 1 decided per proposal: one row per state covering treasury
  and pension holdings, `decider` = the body behind the larger holding.
  `draft-holding` reads HTML and plain text only: a PDF body is refused
  with a reason (no PDF parser ships in the Worker package; save the
  report's text to a `.txt` URL). The tool also verifies the amount by
  code (it must be a dollar figure inside the verbatim quote) and prints
  a `decider` only when that text is on the page. The state action's
  `ask_text` carries a `{decider}` placeholder filled by code
  (`fillAsk`). §2 stays maintainer research: the research file lists all
  50 states as "not checked" in the PRD's batch order.
