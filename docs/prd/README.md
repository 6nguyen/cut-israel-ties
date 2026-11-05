# PRDs — one file per change

`docs/specs/` describes the app as shipped today. A PRD here is a **change**:
a proposal with an explicit `## Spec delta`, approved **before** code. A PRD
opened as a PR is APPROVED on creation unless it has a `[blocking]` open
question (see the template's `## Open questions`); the owner can still reject
it in review.

## Lifecycle
Specced in `docs/specs/prd-lifecycle.md` (template repo only). The spec is
the source of truth; a change to one updates the other in the same PR.

1. **Propose.** Read `docs/FEATURES.md` first (what exists, is building or
   is queued). `docs/prd/<change>.md` from the template below, including
   `## Spec delta`; delete the `## Next` row it replaces in the same commit. A brand-new capability's delta is ADDED: the whole spec
   file (template in `docs/specs/README.md`).
2. **Build.** `/implement-prd-section` loads the PRD range plus only the spec
   sections the delta names. State is read and written only through
   `state.sh get|set`; `prd-lint.sh <prd>` runs before every PRD commit.
3. **Fold.** When a section merges, its delta is applied to `docs/specs/` in
   that same PR and State records `Folded: §…`.
4. **Ship.** The PR that ships the final section (State `Remaining: none`)
   also sets Status `SHIPPED YYYY-MM-DD (PR #n)`, `git mv`s the PRD to
   `archive/YYYY-MM-<change>.md`, removes its row from the index below and
   deletes its pointer lines from the root `CLAUDE.md`.
5. **Superseded or abandoned** PRDs move to `archive/` with Status
   `SUPERSEDED by <prd>` or `DROPPED`, no fold, and the same pointer
   deletion.

A PRD pointer is one root `CLAUDE.md` line carrying
`<!-- prd-pointer: docs/prd/<change>.md -->`. Archiving a PRD deletes every
line with its marker, in the same commit as the `git mv`; these are the only
`CLAUDE.md` lines any process removes automatically.

No PRD and no spec change: refactors and fixes that restore specced
behavior. A fix that *changes* specced behavior edits the spec directly in
the fix PR and gives the reason in the commit body (a PRD only if the owner
asks). `archive/` is history only: archived PRDs are never edited and agents
never load them.

## Index (open changes only, in build order)
Rows are the build order; `Needs` names the PRDs that must merge first.
A PRD with no `Needs` entry can run in parallel with the row above it.
| # | PRD | Status | Needs | Owner surfaces |
|---|---|---|---|---|
| 1 | [deploy.md](deploy.md) | APPROVED | — | Cloudflare provisioning, CI deploy on merge, go-live checklist. Nothing reaches users before this |
| 2 | [member-pages.md](member-pages.md) | APPROVED | — | `/m/<id>` member pages, `/goals/<slug>/whip`, roster import; the roster unlocks the other 47 states |
| 3 | [commitment-funnel.md](commitment-funnel.md) | APPROVED | — | post-receipt commitment, captain list of three, "Your week" card; the research's largest effect |
| 4 | [district-counters.md](district-counters.md) | APPROVED | 1, 3 | `/api/counts`, counter line on cards, receipt abuse limits; counts the `captain-list` receipt from 3 and needs live receipts to show anything |
| 5 | [state-holdings-sweep.md](state-holdings-sweep.md) | APPROVED | — | `draft-holding`, `states.csv` checks, 50-state sweep; maintainer research, runs alongside 2–4 |
| 6 | [on-device-districts.md](on-device-districts.md) | APPROVED | — | browser-location district lookup, per-state TopoJSON; privacy improvement, no feature depends on it |
| 7 | [office-visits.md](office-visits.md) | APPROVED | 2, 3 | district-office visit listings and slot requests; lives on the captain screen and member pages |
| 8 | [primary-2028.md](primary-2028.md) | APPROVED (§2 blocked) | 2 | `electoral` goal per 2028 target, `data/elections.csv`; §2 picks wait for counsel; stays `upcoming` until the NDAA goal closes |

## Next (ideas without a PRD, in intended order; ≤10)
Targets is an existing spec stem or `new`. Writing the PRD deletes its row
in the same commit; dropping an idea deletes its row.
| # | Idea | Targets | Notes |
|---|---|---|---|
| 1 | Senate leader candidate scan (IG, TikTok, web) | new | Research first: `docs/research/senate-leader-candidates.md`; feeds `our_picks` on the Senate leader goal |

## Template (copy for a new feature)

```markdown
# <Change name> — PRD
Status: DRAFT | APPROVED | BUILDING | SHIPPED YYYY-MM-DD (PR #n) | SUPERSEDED by <prd> | DROPPED · Owner: <name> · Last updated: YYYY-MM-DD

## Problem
What is wrong or missing today, in one paragraph, with the evidence.

## Goals / Non-goals
- Goals: the 2–5 outcomes this must achieve.
- Non-goals: what we deliberately leave out (and why).

## Research (what the best products do → adopt / adapt / reject)
Relies on: links to the `docs/research/<topic>.md` files behind this PRD, or
omit the line. The PRD states every decision a build needs; builds never
read research.
| Pattern | Seen in | Verdict | Why |

## Users
Who uses this and how their needs differ (copy, density, defaults).

## Expected behavior
Numbered, screen by screen. Each step: what the user sees, what they can do,
what happens next, edge cases (empty data, offline, first run vs return).

## Data & contracts
New/changed endpoints, models, settings keys, persisted client state.

## Spec delta
One entry per `docs/specs/<file>.md` § heading this change touches. Each is
ADDED (new text), MODIFIED (old → new) or REMOVED. A new capability is one
ADDED entry: the whole spec file. Example:
- MODIFIED `docs/specs/home.md` §Behavior 3: streak resets after 1 missed day → after 2 missed days.

## Acceptance criteria
Checkbox list a tester can verify without reading code, including failure
paths and the performance budget (from CLAUDE.md §Performance budgets).

## Rollout & metrics
Feature flag? Migration? What we measure to know it worked.

## State (updated YYYY-MM-DD, PR #n) — medium/long features only; ≤30 lines
- Sections: (build order; `[ ]` todo · `[~]` in progress · `[x]` merged · `[!]` blocked: reason)
  - [x] <heading text> · PR #n merged
  - [~] <heading text> · <branch> · PR #n
  - [ ] <heading text>
- Completed: …
- Folded: §… (spec deltas applied to `docs/specs/` so far)
- Branch / open PRs: …
- Files changed (file:line map): …
- Tests run + result: …
- Remaining: …
- Decisions since last update: …
- Known failures / blockers: …
- Next action: …
The implementing session updates this in the same PR. A fresh session
resumes from this block, not from conversation history. `Sections:` items
are heading text (prefix match, no line numbers); `/implement-prd-section`
with no range picks the next one and both it and `/handoff` keep the
markers current (merged PRs flip to `[x]` on the next run).

## Open questions
Numbered. Each has a `Proposal:`. Mark one `[blocking]` only if its answer
changes Expected behavior, Data & contracts, Acceptance criteria or scope, or
is costly to reverse. No blocking questions → Status `APPROVED YYYY-MM-DD
(auto)` at PR creation, proposals become decisions, logged under Changes.
Any blocking question → Status `DRAFT`, PR body lists them, no code yet.

## Changes
- YYYY-MM-DD — created (DRAFT).
```
