# PRD lifecycle spec (+ clean bootstrap) — PRD
Status: SHIPPED 2026-10-02 (PR #34) · Owner: George Nguyen · Last updated: 2026-10-02

## Problem
The spec lifecycle shipped in PR #17 (change PRD → `## Spec delta` → fold
into `docs/specs/` → archive), but `docs/specs/` doesn't describe it. Only
`docs/specs/prd-progress.md` (Sections/State tracking) covers the PRD
workflow, and it points at `docs/prd/README.md` for the fold and archive
steps. The spec-lifecycle PRD recorded "Folded: n/a, adds no app
capability". That was wrong: in this repo the workflow skills are the
product, and area-maps and prd-progress, both skills, have specs. So "what
does the template do today" has no answer for its core process.

Separately, `scripts/bootstrap.sh` copies the template's own PRDs into every
new repo. It strips the template's specs, but keeps
`docs/prd/{adopt-existing-repo,token-tooling}.md`, the three archived PRDs
and their `docs/prd/README.md` index rows. A new repo starts with another
repo's open changes and history. `adopt-existing-repo.md` already says
"never copied: the template's own PRDs" with "index emptied"; bootstrap is
the outlier.

## Goals / Non-goals
- Goals:
  1. `docs/specs/prd-lifecycle.md` describes the shipped lifecycle:
     artifacts, statuses, transitions, skill touchpoints and invariants.
  2. A repo bootstrapped from the template starts with empty PRD and spec
     indexes, an empty `archive/`, and the lifecycle rules intact.
- Non-goals:
  - Changing the lifecycle itself. This PRD only specs it.
  - Re-specifying Sections/State tracking; that stays in
    `docs/specs/prd-progress.md`, linked from the new spec.
  - `adopt.sh`; it is built under `adopt-existing-repo.md`.

## Research (what the best products do → adopt / adapt / reject)
| Pattern | Seen in | Verdict | Why |
|---|---|---|---|
| Process documented as a spec beside product specs (`openspec/AGENTS.md`, spec for the change workflow) | OpenSpec | Adapt | Our process ships as skills, so it gets a normal spec; the operative rules stay in `docs/prd/README.md`, which every repo keeps |
| Template repos ship empty registries (`create-react-app`, `cookiecutter` hooks strip examples) | CRA, cookiecutter | Adopt | A new repo's indexes describe that repo only |

## Users
- **Owner:** reads `docs/specs/README.md` to see the full feature set,
  including the PRD workflow.
- **Implementing agents:** load `prd-lifecycle.md` § sections when a change
  PRD's delta touches the workflow (for example, a future skill change).
- **New-repo owners:** run `bootstrap.sh` and get clean docs.

## Expected behavior

### 1. Lifecycle spec
1. New `docs/specs/prd-lifecycle.md` with the spec template sections. Its
   content is the `## Spec delta` below. Under ~4k tokens.
2. `docs/specs/README.md` index gains its row.
3. `docs/specs/prd-progress.md` §Behavior 8 points at
   `prd-lifecycle.md` §Behavior instead of `docs/prd/README.md`.
4. `docs/prd/README.md` §Lifecycle keeps the rules (every repo needs them,
   and bootstrap removes the template's specs). It adds one line: "Specced
   in `docs/specs/prd-lifecycle.md` (template repo only)." The spec is the
   source of truth; a change to one updates the other in the same PR.

### 2. Clean bootstrap
1. `scripts/bootstrap.sh` step 1 also removes everything the template owns
   under `docs/`:
   - `docs/prd/*.md` except `README.md`;
   - `docs/prd/archive/*` except `.gitkeep`;
   - `docs/specs/*.md` except `README.md` (already done, simplified).
2. It empties both index tables: every row starting `| [` in
   `docs/prd/README.md` and `docs/specs/README.md` is deleted (one `sed`
   per file, replacing today's per-file basename loop). Header rows stay.
3. The header comment (step 1) says so.

## Data & contracts
- New: `docs/specs/prd-lifecycle.md`.
- Edited: `docs/specs/README.md` (index row), `docs/specs/prd-progress.md`
  (Behavior 8 pointer), `docs/prd/README.md` (§Lifecycle pointer line,
  index row for this PRD), `scripts/bootstrap.sh`.
- Moved on ship: this PRD → `docs/prd/archive/2026-10-prd-lifecycle-spec.md`.

## Spec delta
- ADDED `docs/specs/prd-lifecycle.md` (whole file):
  - **Purpose.** Docs can rebuild the product: `docs/specs/` says what
    ships today; `docs/prd/` holds proposed changes; `docs/prd/archive/`
    keeps the reasoning. It does not apply deltas automatically or replace
    tests.
  - **Behavior.**
    1. Artifacts: spec `docs/specs/<capability>.md` (Purpose · Behavior ·
       Data & contracts · Invariants · Performance budget; no status,
       rounds or history; <~4k tokens, split past that; indexed in
       `docs/specs/README.md`). Change PRD `docs/prd/<change>.md` (README
       template, required `## Spec delta`). Archive
       `docs/prd/archive/YYYY-MM-<change>.md` (frozen).
    2. Statuses: `DRAFT` (has a `[blocking]` question) → `APPROVED
       YYYY-MM-DD (auto|owner)` → `BUILDING` → `SHIPPED YYYY-MM-DD (PR #n)`;
       or `SUPERSEDED by <prd>` / `DROPPED`. Only open PRDs are in the
       `docs/prd/README.md` index.
    3. Spec delta: one entry per `docs/specs/<file>.md` § heading, ADDED /
       MODIFIED (old → new) / REMOVED. A new capability is one ADDED whole
       file.
    4. Build: `/implement-prd-section` step 1 loads the PRD range, State,
       Acceptance criteria, Spec delta, and only the spec § ranges the
       delta names; never `archive/`. No `docs/specs/` → skips the spec
       load and fold, warns once.
    5. Fold: each merged section applies its delta to `docs/specs/` in its
       own PR and records `Folded: §…` in State. `/handoff` checks every
       merged section is folded and folds any that are missing.
    6. Ship: the PR for the last section (State `Remaining: none`, see
       `prd-progress.md` §Behavior 8) sets `SHIPPED`, `git mv`s the PRD to
       `archive/`, removes its index row.
    7. Superseded or dropped PRDs: archived with that status, no fold.
    8. No PRD: refactors and fixes that restore specced behavior. A fix
       that changes specced behavior edits the spec in the fix PR, reason
       in the commit body.
    9. Global rule: `claude-home/CLAUDE.md` §PRD-first states the lifecycle
       in 3 lines.
    10. New repos: `bootstrap.sh` keeps both READMEs and `archive/.gitkeep`,
        removes the template's PRDs, archive and specs, and empties both
        indexes. `adopt.sh` (planned) copies the READMEs with indexes
        emptied.
  - **Data & contracts.** Paths above; archive name
    `YYYY-MM-<change>.md`; State line `Folded: §…`; Status strings above.
  - **Invariants.** Every open PRD has an index row and no archived one
    does; no archived PRD is edited after its shipping PR merges; no spec
    carries status, rounds or history; step 1 loads nothing from
    `archive/`; a bootstrapped repo has zero `| [` rows in both indexes and
    only `.gitkeep` in `archive/`.
  - **Performance budget.** Step 1 loads ≤ PRD range + State + criteria +
    delta + named spec sections; each spec <~4k tokens; global
    CLAUDE.md §PRD-first lifecycle ≤3 lines.
- MODIFIED `docs/specs/README.md` §Index: add row
  `prd-lifecycle | Change PRDs, spec deltas, fold and archive | docs/prd/README.md, implement-prd-section, handoff, bootstrap.sh`.
- MODIFIED `docs/specs/prd-progress.md` §Behavior 8: "fold and archive
  steps of the lifecycle (`docs/prd/README.md`)" → "(`prd-lifecycle.md`
  §Behavior 5–6)".

## Acceptance criteria
- [x] `docs/specs/prd-lifecycle.md` exists, follows the spec template, has
      no status/round/history wording, and is <4k tokens (`wc -c` / 4).
- [x] `docs/specs/README.md` lists it; `prd-progress.md` Behavior 8 points
      at it.
- [x] `docs/prd/README.md` §Lifecycle still holds the rules plus the
      pointer line.
- [x] `bash -n scripts/bootstrap.sh` passes.
- [x] Dry run of the new strip block in a scratch clone (committed copy):
      `docs/prd/` has only `README.md` and `archive/.gitkeep`; `docs/specs/`
      has only `README.md`; `grep -c '^| \[' docs/prd/README.md
      docs/specs/README.md` is 0 for both; both table headers remain.
- [x] On ship, this PRD is in `archive/` with status SHIPPED and no index
      row. No test suites are touched.

## Rollout & metrics
- Template-only; existing repos are unaffected (they never re-run
  bootstrap). Next new repo shows the clean docs.

## State (updated 2026-10-02)
- Sections: (build order; `[ ]` todo · `[~]` in progress · `[x]` merged · `[!]` blocked: reason)
  - [x] 1. Lifecycle spec · PR #22 merged
  - [x] 2. Clean bootstrap · feat/prd-lifecycle-spec-clean-bootstrap · PR #34
- Completed: PRD drafted; merged (PR #19). §1 built: `docs/specs/prd-lifecycle.md`
  (~854 tokens), index row, prd-progress Behavior 8 and README §Lifecycle pointers.
  §2 built: bootstrap step 1 strips template PRDs, archive and specs, and
  empties both index tables.
- Folded: §1. Lifecycle spec (whole delta); §2. Clean bootstrap (no delta).
- Branch / open PRs: `feat/prd-lifecycle-spec-clean-bootstrap` (§2).
- Tests run + result: `bash -n scripts/bootstrap.sh` OK; strip-block dry
  run in a scratch clone (also with an empty archive) leaves only the two
  READMEs + `archive/.gitkeep`, 0 index rows, headers kept.
- Remaining: none.
- Next action: merge PR #34, then `/implement-prd-section docs/prd/repo-setup.md` (§3 unblocks).

## Open questions
None open. Decisions are logged under Changes.

## Changes
- 2026-10-01 — created; no blocking questions, APPROVED (auto).
- 2026-10-01 — owner confirmed both proposals: OQ1 lifecycle rules stay in
  `docs/prd/README.md`, the spec is the template's source of truth, and both
  change in the same PR; OQ2 the two sections ship as separate PRs.
- 2026-10-01 — §1 built: lifecycle spec added and folded; Status BUILDING.
- 2026-10-02 — §2 built: bootstrap removes every template-owned doc via one
  loop with an allow-list (READMEs, `archive/.gitkeep`) and one `sed` per
  index; the per-spec basename loop is gone. SHIPPED and archived.
