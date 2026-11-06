# Stable goal and action ids — PRD
Status: SHIPPED 2026-11-06 (PR #32) · Owner: George Nguyen · Last updated: 2026-11-06

## Problem
`loadRows` in `worker/src/load.ts` numbers goals and actions by their
position in the sorted file list (`id: i + 1`). `receipts`, `reports`,
`generations`, `screenings` and `positions` in D1 reference those
integers, and `seed:remote` deletes and reinserts goals and actions on
every deploy. Adding `data/goals/abc.yaml` today shifts every goal that
sorts after it by one, so the receipts behind the district counters, the
reports in the digest and the per-action generation limits silently
attach to the wrong goal. Renaming or removing a file does the same.
Nothing warns; the counters just become wrong. The deploy PRD recorded
this as a known bug to fix before real receipts exist, and go-live is
the point after which it cannot be fixed without a data migration.

## Goals / Non-goals
- Goals: an id, once published, never changes and is never reused; the
  loader refuses a data set that breaks that; a test catches an id
  change in review, before seed; no migration of D1 rows is needed
  because the change lands before production receipts exist.
- Non-goals: switching the primary keys to text slugs (touches every
  table, index and query for no gain over a frozen integer); renumbering
  existing ids (the five goals and five actions keep the integers they
  have today).

## Research (what the best products do → adopt / adapt / reject)
| Pattern | Seen in | Verdict | Why |
|---|---|---|---|
| Explicit, never-reused integer ids in source-controlled fixtures | Rails `fixtures` with fixed ids, Django data migrations | Adopt | Smallest change: one field per YAML file, the schema stays |
| Slug primary keys | Most CMSs | Reject | Every FK, index and query changes; a slug rename is still a re-key |
| A frozen registry test that fails when a known id moves | Protobuf field-number reservation, Android resource ids | Adopt | Review catches the mistake; the loader catches it again at seed |

## Users
- Maintainer and the scripts that write goal or action YAML
  (`make-primary-goal.ts`): they add the next free id; the loader and
  the test tell them when they got it wrong.
- Constituents: nothing visible; counters and reports stay attached to
  the right goal across deploys.

## Expected behavior
### 1. Explicit ids in goal and action YAML
- Every file in `data/goals/` and `data/actions/` carries `id: <positive
  integer>`. The five goals keep 1–5 in their current sorted order
  (`house-caucus` 1, `ndaa-1217` 2, `ndaa-report-vote` 3,
  `senate-leader` 4, `state-bonds` 5) and the five actions likewise, so
  a local D1 seeded today needs no change.
- `data/README.md` gains the rule: ids are assigned once, never changed,
  never reused after a file is removed; the next id is the highest ever
  used plus one, listed in `data/ids.md`.
- `make-primary-goal.ts` (and any future writer) reads `data/ids.md`
  for the next free id and appends to it.

### 2. Loader guards
- `loadRows` reads `id` instead of computing it; it throws, naming the
  file, on a missing or non-integer id, a duplicate id within goals or
  within actions, and an id lower than or equal to a `retired` id listed
  in `data/ids.md`.
- `data/ids.md`: a table `kind | id | slug | status (live | retired) |
  since`; the loader parses it and also throws when a live YAML id is
  absent from the table or its slug differs (so the table is the
  registry, not a comment).

### 3. Frozen registry test
- `worker/test/ids.test.ts` asserts the committed `data/` rows match
  `data/ids.md` exactly (same ids, same slugs, no extra live rows), and
  that removing a goal file leaves every other id unchanged (fixture
  copy with one file deleted).
- `scripts/quiet-check.sh test` already runs it; `prd-lint` is not
  involved.

## Data & contracts
- YAML: `+ id` (required) on goals and actions.
- `+ data/ids.md` registry (`kind | id | slug | status | since`), the
  single place the next id comes from.
- `worker/src/load.ts`: `id` read, not computed; new checks; `readIds()`.
- `worker/scripts/make-primary-goal.ts`: assigns and records the id.
- No schema change; `seed.ts` unchanged.

## Spec delta
- MODIFIED `docs/specs/action-router.md` §Data & contracts: goal and action rows "numbered by sorted file order" → "carry an explicit `id` from the YAML, registered in `data/ids.md`; the loader rejects a missing, duplicate, retired or unregistered id".
- MODIFIED `docs/specs/action-router.md` §Invariants: add "adding, renaming or removing a goal or action file changes no other row's id; `receipts`, `reports`, `generations`, `screenings` and `positions` keep pointing at the same goal and action across seeds".
- MODIFIED `docs/specs/maintainer-tooling.md` §Behavior 4 (Seed): add "the loader's id registry checks run before any SQL is written".
- MODIFIED `docs/specs/electoral-record.md` §Data & contracts: `make-primary-goal.ts` writes `id` from `data/ids.md`.

## Acceptance criteria
- [ ] `loadRows` on today's `data/` yields the same ids as before the change (goals 1–5, actions 1–5), so a local D1 seeded before the change is unaffected.
- [ ] A fixture with a goal file missing `id`, with two goals sharing an id, with an id marked `retired` in `data/ids.md`, or with a live id absent from `data/ids.md`, each makes `loadRows` throw with a message naming the file or the id.
- [ ] Deleting `data/goals/house-caucus.yaml` in a fixture copy leaves `ndaa-1217` at id 2 and every action's `goal_id` unchanged.
- [ ] `make-primary-goal.ts` on a fixture writes `id: 6` and appends a `live` row to `data/ids.md`.
- [ ] `worker/test/ids.test.ts` fails when a committed YAML id or slug differs from `data/ids.md`.
- [ ] Performance budget unchanged: landing ≤100 KB and LCP ≤1.5 s (no web change), `/api/route` ≤2 s p95 (one extra file read at load), infra $0/month.

## Rollout & metrics
- No flag, no migration: ids are identical before and after. Must merge
  before the first production seed (`deploy.md` §3), after which a
  changed id would need a D1 data migration.
- Metric: zero loader id failures in CI after merge; the deploy PRD's
  known-bug line is removed in the same PR.

## State (updated 2026-11-06)
- Status: SHIPPED
- Sections: (build order; `[ ]` todo · `[~]` in progress · `[x]` merged · `[!]` blocked: reason)
  - [x] 1. Explicit ids in goal and action YAML · PR #32
  - [x] 2. Loader guards · PR #32
  - [x] 3. Frozen registry test · PR #32
- Completed: §1–3 merged to main via PR #32 (integration of `feat/stable-data-ids`): explicit ids in goal and action YAML, `data/ids.md` registry, loader guards, `worker/test/ids.test.ts`.
- Folded: the Spec delta's four MODIFIED lines are in `docs/specs/action-router.md`, `maintainer-tooling.md` and `data/README.md`.
- Branch / open PRs: none (integration PR #32, https://github.com/6nguyen/cut-the-ties/pull/32, merged 2026-11-06).
- Remaining: none. Landed before the first production seed (`deploy.md` §3), as required.
- Decisions since last update: see `## Changes` 2026-11-05 (registry module, retired-id reading, lenient live-row-without-file, script body moved under `src/`).
- Known failures / blockers: none.
- Next action: none; archived.

## Open questions
1. Should `positions/*.csv` and `elections.csv` also carry goal ids
   instead of resolving by slug file name? Proposal: no; they resolve
   through the slug at load time, which is already stable, and a
   positions file is named after the goal it belongs to.

## Changes
- 2026-11-05 — created; no blocking questions, so APPROVED (auto) at PR creation; the proposal in Open questions is the decision.
- 2026-11-05 — §1–3 built on `feat/stable-data-ids`. Decisions beyond the PRD text:
  - Registry code lives in a new `worker/src/ids.ts` (`parseIds`, `readIds`, `nextId`, `appendIdRows`, `checkId`); `load.ts` only calls `readIds` once and `checkId` per file, so the loader diff stays confined to the id lines (another branch edits `load.ts` in parallel).
  - "An id lower than or equal to a retired id" is read as: a YAML id equal to a retired id throws (reuse), and any id absent from the table throws (unregistered). A live id below a retired one stays valid, since goal 1 outlives a retired goal 3; together the two checks refuse every reuse.
  - The loader does not require a file for every `live` registry row (a forgotten retire does not break a seed; `nextId` still skips it). `worker/test/ids.test.ts` asserts the exact match, so review catches it.
  - `worker/test/ids.test.ts` hard-codes the frozen table (`FROZEN`), so a coordinated change to both a YAML id and `data/ids.md` still fails until the test is edited on purpose.
  - The body of `make-primary-goal.ts` moved to `worker/src/make-primary-goal.ts` (`makePrimaryGoal(dataDir, argv, log, today)`) so the acceptance test runs it on a fixture copy; the script is a two-line shell. It appends the registry rows before writing YAML and refuses a slug already live in the registry. `goalYaml` / `actionYaml` take the id as their first argument.
  - `data/ids.md` is allow-listed in `docs/.doc-allow` (doc-lint rule 1 would otherwise flag a `.md` outside `docs/`); it sits beside the rows it keys, as the PRD names it.
  - The retired-row workflow for a removed file is documented in `data/README.md` and the registry header; `since` holds the date a row was added or retired.
  - `docs/specs/action-router.md` sits at doc-lint's 16 000-byte cap, so its two Spec-delta lines are compressed (the full rule is in `data/README.md` and `maintainer-tooling.md` §Behavior 4) and two historical asides in the donation bullet ("replaces the PRD's Worker vars", "from the PRD estimate") were dropped to fit. A split of that spec by capability is due as its own docs PR.
