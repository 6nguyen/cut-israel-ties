# Maintainer research routines — PRD
Status: APPROVED 2026-11-04 (auto) · Owner: George Nguyen · Last updated: 2026-11-04

## Problem
Every number and date the site shows between now and 2026-12-19 comes from
prose sources with no structured feed: member statements on the NDAA
integration section, the House caucus vote on 2026-11-18, the Senate
leader vote in December, the compromise NDAA text and its floor votes,
candidate signals for `our_picks`, and state treasurer disclosures. Today
the goal YAML carries placeholder dates and `[VERIFY]` chips, the position
file for `ndaa-1217` has no rows, and nothing in the repo says who looks
for this material, how often, or in what form it comes back. The decision
in `docs/research/data-ingestion.md` is to run a bounded research agent
on a schedule instead of building ingestion pipelines; this PRD is the
contract for those runs. Without it the runs are ad hoc prompts whose
output nobody can lint, and the one deterministic piece the decision adds
(`import-rollcall.ts`) has no home.

## Goals / Non-goals
- Goals: three named routines with fixed prompts, cadences and stop
  dates; every run ends in one PR the maintainer can review in under ten
  minutes; every row or date in that PR carries a source the existing
  verifiers accept; the December NDAA floor votes reach `data/` the day
  they happen; total cost stays inside the LLM line of the budget.
- Non-goals: scheduled crawlers or Worker crons that write `data/` or D1
  (rejected in the research); automated fetching of Instagram or TikTok
  (blocked and forbidden by their terms); any change to how the site
  renders positions, dates or picks; editing a research snapshot in place
  (research files are dated and superseded, never rewritten).

## Research (what the best products do → adopt / adapt / reject)
Relies on: `docs/research/data-ingestion.md`,
`docs/research/senate-leader-candidates.md`.
| Pattern | Seen in | Verdict | Why |
|---|---|---|---|
| Hand-curated legislator data, scraped only where a structured feed exists | Open States | Adopt | Our only structured feeds are the roster and Clerk XML; positions and dates have none |
| Scheduled scrapers of news and member sites | GovTrack, ProPublica Represent (now shut) | Reject | Two to three days of engineering for 45 days of use, and the human verification step remains |
| Model proposes, code verifies the quote, maintainer commits | `maintainer-tooling.md` `draft-position` | Adopt | Already the repo's rule; the routine feeds it instead of bypassing it |
| Dated snapshots with a `Supersedes` line | `docs/research/README.md` | Adopt | Lets a reviewer diff what changed between runs |
| Twice-weekly tip sheet with a daily burst around a vote | Newsroom whip desks (Punchbowl, Roll Call) | Adapt | Tuesday and Friday runs, plus a manual run the morning after each decision |
| Bounded agent runs with a short report | Repo agent rules (≤100 tool calls, ≤15-line report) | Adopt | Keeps each run's cost and review time predictable |

## Users
- The maintainer (one person): reviews one PR per run, merges or asks for
  a source, never hand-edits D1.
- The routine (a scheduled cloud Claude Code session): reads the public
  web, runs the CLIs, writes only on its own branch.
- A reviewer of a later run: reads the previous snapshot's `## What
  changed` to see what moved.

## Expected behavior
### 1. Prompt files and the output contract
1. Each routine's prompt is a file in `.claude/routines/`:
   `federal-positions.md`, `senate-leader-signals.md`,
   `state-holdings.md`. The scheduled task's stored prompt is one line:
   read that file and follow it. Changing a routine is a PR to its file.
2. Every run starts from `main`, creates a branch
   `data/<routine>-<YYYY-MM-DD>` and ends by opening one PR to `main`
   (or no PR, when nothing changed). It never pushes to `main`, never
   deploys, never touches `worker/`, `web/` or `docs/specs/`.
3. A run writes at most: one new file under `docs/research/` (a dated
   snapshot with a `Supersedes: <previous file>` line and a `## What
   changed` section, plus its index row in `docs/research/README.md`),
   rows appended to `data/positions/<goal>.csv` or `data/states.csv`
   that a CLI (`draft-position`, `draft-holding`) printed, and edits to
   `data/goals/<slug>.yaml` limited to `decision_date`, `this_week`,
   `this_week_date`, `sources`, `our_picks` and `[VERIFY]` chips in
   `prep_md`.
4. The PR body has three fixed sections: `## Changed` (one line per row
   or field, with its source URL and date), `## VERIFY` (what the run
   found but could not source to the CLI's standard, with the best URL
   it has), `## Not found` (what it looked for and where). A `[VERIFY]`
   chip is removed only in the same commit that adds the source it
   waited for to `sources`.
5. A run is bounded: at most 100 tool calls, at most 40 fetched pages,
   one request per second per host, a fixed `User-Agent` naming the repo
   and a contact address, no retry on 403, back-off on 429 or 503. It
   reports in at most 15 lines. On hitting a cap it opens the PR with
   what it has and says so under `## Not found`.

### 2. Federal positions and dates
1. Covers the goals `house-caucus`, `ndaa-1217` and `ndaa-report-vote`.
   For each, the run checks: the decision date (caucus notice, floor
   schedule, Rules Committee posting), the status of the compromise NDAA
   text, and new public statements by members on the integration section
   (press releases, Dear Colleague letters, floor remarks, local press).
2. For each statement found, the run executes
   `npm run draft-position -w worker -- <bioguide_id> <url> <goal>` and
   appends the row only if the CLI printed one. A statement the CLI
   rejected goes under `## VERIFY` with the URL. Goals without a
   positions file get no rows; the statement goes under `## VERIFY`.
3. A changed or newly published decision date updates `decision_date`
   and the matching `## Timeline` line in `prep_md`, with the notice URL
   added to `sources`. `this_week` is rewritten to the one action a
   constituent can take before the next date, and `this_week_date` set
   to the run date.
4. Cadence: Tuesday and Friday at 14:00 UTC from 2026-11-07 through
   2026-12-19, plus a manual run the morning after 2026-11-18, the day
   the compromise text is posted, and the day after each floor vote.
   After 2026-12-19 the schedule is deleted; a new named vote gets a new
   schedule by PR to this file.

### 3. Senate leader candidate signals
1. Covers the goal `senate-leader`. The run refreshes the counts in the
   current `senate-leader-candidates` snapshot by the method that file
   records: public profile pages read in the browser, counts copied as
   rendered, with the fetch date; plus press on declared or drafted
   candidates and the caucus vote date.
2. Output is a new snapshot `senate-leader-candidates-<YYYY-MM-DD>.md`
   that supersedes the previous one, and a proposed `our_picks` list (at
   most three entries with `source_url` and `signal`) in the PR body,
   never written to the goal YAML by the run; the maintainer copies it in
   if they agree. `decision_date` is updated as in §2.3 when the caucus
   date is published.
3. Cadence: weekly, Mondays 14:00 UTC, from 2026-11-09 until the caucus
   vote is held, then the schedule is deleted.

### 4. State holdings batch
1. Runs the sweep `state-holdings-sweep` §2 specifies; this section
   adds only who and when. Batch one is IL, NY, PA, TX, FL, MD, MN, MI,
   WA, NC; batch two is the next ten states by population. Each batch is
   one run and one PR, with `docs/research/state-israel-bonds.md` rows
   and the `states.csv` rows `draft-holding` printed.
2. Cadence: two runs, 2026-11-12 and 2026-12-03, 14:00 UTC. Further
   batches are scheduled by PR to `.claude/routines/state-holdings.md`
   after 2026-12-19.

### 5. Roll-call import
1. `npm run import-rollcall -w worker -- <clerk-xml-url> <goal>
   [--flag <column>]` fetches one House Clerk roll-call XML
   (`clerk.house.gov/evs/<year>/roll<nnn>.xml`), maps each `recorded-vote`
   to the member by `name-id` (the bioguide id), and prints either
   `positions/<goal>.csv` rows (`Yea`/`Aye` → `for`, `No`/`Nay` →
   `against`, `Not Voting`/`Present` → no row) with `source_url` = the
   XML URL, `source_date` = the XML's `action-date`, `changed_by` =
   `import-rollcall`, or, with `--flag`, a `members.csv` with that flag
   column set to `yes`/`no` for members in the XML and left as is for
   the rest. It never writes a file; output is stdout.
2. A `name-id` not in `members.csv` is printed to stderr as
   `# unknown member <id> <name>` and skipped; the exit code is 0 so the
   rest of the vote lands. A non-XML or non-200 response exits 66.
3. Senate roll calls are not fetched (senate.gov refuses non-browser
   clients); their rows are typed into the `data/` PR by hand with the
   `senate.gov` vote URL as source, as `member-pages` open question 1
   already provides.
4. First uses: `roll243.xml` for the `rc243` flag (one `data/` PR), then
   each December NDAA floor vote the day it happens, run by the §2
   routine with the row diff in its PR.

## Data & contracts
- New `.claude/routines/federal-positions.md`,
  `senate-leader-signals.md`, `state-holdings.md`: the prompts, each
  containing §1's output contract verbatim plus its own §2–§4 steps.
- New `worker/scripts/import-rollcall.ts` (CLI) and
  `worker/src/import-rollcall.ts` (`parseRollCall(xml) → {date, votes:
  [{nameId, name, vote}]}`, `rollCallRows(parsed, members, goal)`,
  `rollCallFlags(parsed, members, column)`), tested in plain vitest with
  a fixture XML; `package.json` script `import-rollcall`.
- Scheduled tasks: three entries in the account's Claude Code scheduled
  routines, named `cut-ties/federal-positions`,
  `cut-ties/senate-leader-signals`, `cut-ties/state-holdings`, each
  with the cron from its section, the repository `6nguyen/cut-the-ties`,
  write access limited to branches matching `data/*`, and
  `ANTHROPIC_API_KEY` for the CLIs. No Worker cron, no D1 access.
- Branch names `data/<routine>-<YYYY-MM-DD>`; PR title
  `data: <routine> <YYYY-MM-DD>`; PR body sections `## Changed`,
  `## VERIFY`, `## Not found`.
- No schema change. Positions rows keep
  `bioguide_id,position,source_url,source_date,changed_by`;
  `changed_by` gains the value `import-rollcall`.

## Spec delta
- MODIFIED `docs/specs/maintainer-tooling.md` §Behavior: adds item 6
  "Research routines" (the three routines, their output contract and
  cadences from §1–§4) and item 7 "Roll-call import" (§5).
- MODIFIED `docs/specs/maintainer-tooling.md` §Data & contracts: adds
  the `.claude/routines/` files, `import-rollcall` module signatures,
  the scheduled-task names and the branch/PR naming.
- MODIFIED `docs/specs/maintainer-tooling.md` §Invariants: adds "a
  routine never pushes to `main`, never writes `worker/`, `web/`,
  `docs/specs/` or D1, and removes a `[VERIFY]` chip only with a source
  in the same commit" and "`import-rollcall` never writes a file and
  prints a row only for a vote recorded in the XML".
- MODIFIED `docs/specs/maintainer-tooling.md` §Performance budget: LLM
  cost line adds about 15 routine runs through 2026-12-19; infra stays
  $0.

## Acceptance criteria
- [ ] Each of the three prompt files exists, contains the §1 output
      contract, and the stored scheduled prompt only points at it.
- [ ] A dry run of the federal routine against the current repo opens a
      PR with the three body sections, at least one `## VERIFY` item for
      the `senate-leader` caucus date, and no change outside
      `docs/research/`, `data/positions/`, `data/goals/` and the research
      index.
- [ ] A positions row the routine added fails `loadRows` if its
      `source_url` or `source_date` is removed (existing lint still
      guards the new writer).
- [ ] A run that hits the 100-tool-call cap still opens its PR and says
      so under `## Not found`.
- [ ] `import-rollcall` on `roll243.xml` prints one `members.csv` with the
      `rc243` column set for every sitting House member in the XML and
      stderr lines for unknown ids; on a fixture it prints
      `for`/`against` rows with the XML date and no row for `Not Voting`.
- [ ] `import-rollcall` with a 404 URL exits 66 and prints nothing to
      stdout.
- [ ] No schedule remains after 2026-12-19 except one created by a later
      PR to a routine file.
- [ ] Performance budget: infra cost excluding LLM and domain stays
      $0/month; routine LLM spend through 2026-12-19 is reported in the
      shipping PR.

## Rollout & metrics
No flag; the routines are off until their scheduled tasks are created,
which is the last step of §1. Metrics, read from the PRs: runs completed,
rows merged per run, `## VERIFY` items per run (should fall as sources
land), days between a decision and its date reaching `main` (target: one
run). After 2026-12-19 the shipping PR records the counts and the spend.

## State (updated 2026-11-04)
- Sections: (build order; `[ ]` todo · `[~]` in progress · `[x]` merged · `[!]` blocked: reason)
  - [ ] 1. Prompt files and the output contract
  - [ ] 5. Roll-call import
  - [ ] 2. Federal positions and dates
  - [ ] 3. Senate leader candidate signals
  - [ ] 4. State holdings batch
- Completed: none.
- Folded: none.
- Branch / open PRs: none.
- Remaining: all. §1 and §5 are builds; §2–§4 are the schedules plus
  their first runs.
- Decisions since last update: none.
- Known failures / blockers: none (`draft-holding` shipped with
  `state-holdings-sweep` §1).
- Next action: /implement-prd-section
  docs/prd/maintainer-research-routines.md (§1).

## Open questions
1. Where the routine runs. Proposal: the account's Claude Code scheduled
   routines (cloud), because they already have repository access and a
   per-run tool budget; a GitHub Action calling the Agent SDK is the
   fallback if branch-scoped write access cannot be set there.
2. Whether the run may execute `draft-position` itself. Proposal: yes,
   with `ANTHROPIC_API_KEY` as a routine secret; without the key the run
   lists every candidate statement under `## VERIFY` instead of rows.
3. Whether the federal run edits goal YAML directly. Proposal: yes, for
   the six fields §1.3 lists only; anything else in the YAML goes in the
   PR body as a suggestion.
4. Whether `import-rollcall` lands here or in `member-pages` §1.
   Proposal: here, so the `member-pages` build is not reopened; its open
   question 1 keeps its answer and uses this script for the House side.

## Changes
- 2026-11-04 — created; APPROVED (auto): no blocking questions, proposals
  stand as decisions. Replaces `## Next` row 1 (Senate leader candidate
  scan).
