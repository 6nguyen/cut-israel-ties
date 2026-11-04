# PRD lifecycle

## Purpose
The docs can rebuild the product: `docs/specs/` says what ships today,
`docs/prd/` holds proposed changes, and `docs/prd/archive/` keeps the
reasoning behind them. This spec covers how a change moves from proposal to
spec. It does not apply deltas automatically or replace tests.

## Behavior
1. **Artifacts.**
   - Spec: `docs/specs/<capability>.md` with Purpose · Behavior · Data &
     contracts · Invariants · Performance budget. No status, rounds or
     history. Under ~4k tokens; split past that. Indexed in
     `docs/specs/README.md`.
   - Change PRD: `docs/prd/<change>.md` from the `docs/prd/README.md`
     template, with a required `## Spec delta`.
   - Archive: `docs/prd/archive/YYYY-MM-<change>.md`, frozen.
   - Feature list: `docs/FEATURES.md`, generated (`feature-list.md`). A
     proposal reads it first and deletes the `## Next` row it replaces in
     the same commit; `/implement-prd-section` and `/handoff` run
     `features.sh` before `prd-lint.sh` whenever it exists and stage it.
2. **Statuses.** `DRAFT` (has a `[blocking]` question) → `APPROVED
   YYYY-MM-DD (auto|owner)` → `BUILDING` → `SHIPPED YYYY-MM-DD (PR #n)`; or
   `SUPERSEDED by <prd>` / `DROPPED`. Only open PRDs are in the
   `docs/prd/README.md` index.
3. **Spec delta.** One entry per `docs/specs/<file>.md` § heading: ADDED,
   MODIFIED (old → new) or REMOVED. A new capability is one ADDED whole
   file.
4. **Build.** `/implement-prd-section` step 1 loads the PRD range, State,
   Acceptance criteria, Spec delta, and only the spec § ranges the delta
   names; never `archive/`. Without `docs/specs/` it skips the spec load and
   fold and warns once. State is read and written only through
   `implement-prd-section/scripts/state.sh` (`get` / `set`), by that skill
   and `/handoff`. Both run `implement-prd-section/scripts/prd-lint.sh
   <prd>` before every commit that touches a PRD, and `doc-lint.sh --only
   <staged files>` (`doc-placement.md`) before every commit; a violation
   stops the commit. prd-lint also runs over every PRD in each adopted or
   bootstrapped repo's CI job, from its managed copy `scripts/prd-lint.sh`
   (quiet-check target `prd-lint`, `adopt.md`), and flags a
   `docs/prd/README.md` `## Index` row that links into `archive/`
   (`archived PRD still indexed`).
5. **Fold.** Each merged section applies its delta to `docs/specs/` in its
   own PR and records `Folded: §…` in State. `/handoff` checks that every
   merged section is folded and folds any that are missing.
6. **Ship.** The PR for the last section (State `Remaining: none`, see
   `prd-progress.md` §Behavior 8) sets `SHIPPED`, `git mv`s the PRD to
   `archive/`, removes its index row and deletes its pointer lines from the
   root `CLAUDE.md` in the same commit.
7. **Superseded or dropped.** The PRD is archived with that status, no
   fold, and the same pointer deletion.
8. **No PRD.** Refactors and fixes that restore specced behavior need none.
   A fix that changes specced behavior edits the spec in the fix PR and
   gives the reason in the commit body.
9. **Global rule.** `claude-home/CLAUDE.md` §PRD-first states the lifecycle
   in 3 lines.
10. **New repos.** `bootstrap.sh` keeps the PRD, spec and research READMEs
    and `archive/.gitkeep`, removes the template's PRDs, archive, specs and
    research, and empties the indexes. It then writes the setup PRD (`docs/prd/repo-setup.md`, no
    migrate section), its index row and the `CLAUDE.md` pointer, as adopt
    does, and regenerates `docs/FEATURES.md` (empty state: header and table
    only). `adopt.sh` copies the READMEs with the indexes emptied.

The rules are also stated in `docs/prd/README.md` §Lifecycle, because every
repo needs them and bootstrap removes this spec. This file is the template's
source of truth; a change to one updates the other in the same PR.

## Data & contracts
- Paths: `docs/specs/<capability>.md`, `docs/prd/<change>.md`,
  `docs/prd/archive/YYYY-MM-<change>.md`.
- State line: `Folded: §<section>`.
- State block: from the `^## State` line to the line before the next
  `^## ` line, or EOF; headings count only outside fenced code. Absent →
  `state.sh set` inserts it before `## Open questions`, else `## Changes`,
  else at EOF. Two State headings → error, PRD untouched.
- PRD lint (`prd-lint.sh [prd…]`, default every `docs/prd/*.md` except
  `README.md`, `migration-plan.md`; fenced code ignored; a `research-*.md`
  file gets the single violation `research belongs in docs/research/`,
  see `research.md`):
  line 2 starts with `Status:`; `## Problem`, `## Expected behavior`,
  `## Acceptance criteria`, `## Changes` exactly once; every other template
  `## ` heading at most once; each `Sections:` item (text before ` · `)
  prefix-matches a `##`/`###` heading under `## Expected behavior`; when
  `docs/specs/` exists beside the PRD's `docs/prd/`, a PRD with an `[x]`
  Sections item has a `## Spec delta` (`none — <reason>` counts), and every
  top-level bullet under it starts `ADDED|MODIFIED|REMOVED
  \`docs/specs/<x>.md\`` or is `none — <reason>` (prose lines allowed).
  Once per such `docs/` (the repo's, plus each linted PRD's): every
  `docs/specs/*.md` but README has a specs index row and every index row's
  file exists; each `## Next` row in `docs/prd/README.md` targets an
  existing spec stem or `new`, ≤10 rows; when `docs/FEATURES.md` exists,
  `features.sh --check` passes (see `feature-list.md`). Output
  `<file>:<line>: <rule>` per violation plus a total; any violation → exit 1.
- Status strings: as in Behavior 2.
- PRD pointer: one root `CLAUDE.md` line containing
  `<!-- prd-pointer: docs/prd/<change>.md -->`. Archiving deletes every line
  with that PRD's marker and nothing else; with no marker `CLAUDE.md` stays
  byte-identical. Pointer lines are the only `CLAUDE.md` lines any process
  removes automatically.

## Invariants (regression checklist)
- [ ] Every open PRD has an index row; no archived PRD does.
- [ ] No archived PRD is edited after its shipping PR merges.
- [ ] After archive, no `CLAUDE.md` line carries a pointer to that PRD.
- [ ] No spec carries status, rounds or history.
- [ ] A State-only update changes no line outside the State block.
- [ ] Every open PRD passes `prd-lint.sh`.
- [ ] `/implement-prd-section` step 1 loads nothing from `archive/`.
- [ ] A bootstrapped repo has zero `| [` rows in both indexes and only
      `.gitkeep` in `archive/`.

## Performance budget
Step 1 loads at most the PRD range + State + Acceptance criteria + Spec
delta + the named spec sections. Each spec stays under ~4k tokens. The global
CLAUDE.md §PRD-first lifecycle is ≤3 lines.
