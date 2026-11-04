# Migrate existing PRDs into the spec lifecycle — PRD
Status: SHIPPED 2026-10-02 (PR #27) · Owner: George Nguyen · Last updated: 2026-10-02

## Problem
`adopt` (PR #20) brings the per-repo layer into an existing repo but leaves
existing PRDs alone; that PRD listed migration as a non-goal. Repos that
adopt the template often already have many PRDs, and they:
- have no `## State (updated 2026-10-02, §5 built)
- Sections: (build order; `[ ]` todo · `[~]` in progress · `[x]` merged · `[!]` blocked: reason)
  - [x] 1. Inventory · PR #23 merged
  - [x] 2. Move · PR #24 merged
  - [x] 3. Fold · PR #25 merged
  - [x] 4. Split · PR #26 merged
  - [x] 5. Adopt hint · PR #27
- Completed: §1-5. §5: `adopt.sh` `prds_without_state` + next step 4.
- Folded: §1-4 → `docs/specs/prd-migration.md`; §5 → `docs/specs/adopt.md`
  §Behavior 8.
- Branch / open PRs: feat/migrate-prds-adopt-hint (PR #27).
- Tests: `RESULT: PASS (adopt)` — 81 passed, 0 failed (adopt full run <5 s).
- Remaining: none.
- Decisions since last update: see Changes 2026-10-02 (§5).
- Known failures / blockers: none.
- Next action: merge PR #27; nothing left (archived).

## Open questions
1. Where does the confirmed plan live? Proposal: `docs/prd/migration-plan.md`,
   committed with the move PR so later phases resume from it; deleted by the
   last PR.
2. What happens to `unknown` files? Proposal: left in place and listed in
   the plan; never moved or folded without an owner decision.
3. How deep is fold verification? Proposal: grep tests and code for each
   behavior and invariant; no test runs.

## Changes
- 2026-10-01 — created; APPROVED (auto, no blocking questions). Decisions
  from the owner discussion: the inventory doesn't depend on State (status
  line, headings and git/PR evidence instead); State creation for active
  PRDs stays lazy in `/implement-prd-section`; `adopt` points to this skill
  as a next step, shipped with the skill rather than in PR #20; built in this
  repo as a global skill.
- 2026-10-01 (§1) — inventory built. Clarified the class rule's overlap
  (status first: DRAFT/APPROVED/BUILDING + merged → `partial`, so an
  approved PRD with only merged PRs isn't called `shipped`); branches with
  no commits past the default branch aren't evidence; files already in
  `docs/prd/` keep their path; a `prd` token is dropped from proposed
  names; colliding destinations are flagged. `inventory.sh --plan` prints
  the plan file so the model never retypes the table.
- 2026-10-01 (§2) — move built. Three commits instead of two: link
  rewrites get their own commit so the moves commit stays pure renames
  even when a moved PRD's own links change. Links are resolved from each
  file's old location, so a moved file's relative links to unmoved files
  are fixed too. Added `move.sh -n`; a taken/duplicate destination, a
  dirty worktree or an existing-but-not-current move branch is refused;
  re-runs are no-ops. Inventory: branches whose tip is on the default
  branch's first-parent chain are not evidence (an empty branch cut from
  an older main read as "merged"). §5 no longer waits on PR #20 (merged).
- 2026-10-01 (§3) — fold built as `fold.sh groups|claims|archive`; the
  model only writes the spec. Groups are recorded with `groups --write`
  as `- <cap>: <paths>` lines, ideally on the move branch so group PRs can
  run in parallel; otherwise in the first fold PR, with the rest after it
  merges (parallel PRs editing one plan section would conflict). `claims`
  greps backticked tokens in tracked non-markdown files (docs aren't
  evidence); `none`/`no-anchor` get one manual grep before `(unverified)`.
  The SHIPPED date is the plan's last-commit column (the move commit would
  otherwise be the last). Archive is one commit that also rewrites links to
  the archived PRDs (move's rewriter, now `relink.py`) and deletes the plan
  once no shipped or partial PRD is left outside `archive/`.
- 2026-10-02 (§4) — split built as `fold.sh splits|split`. The original is
  archived first (`split`), freeing its path for the change PRD, which the
  model then writes and `split --check` validates and commits. References
  to the original path are left alone (they now mean the change PRD); only
  the archived file's own links are re-resolved; a renamed rest rewrites
  them. Split points: `- <prd>: <cap> · shipped: <items> · rest: <new>`.
  Archive and split now make a moves-only commit before the edits: a small
  PRD edited in the rename commit fell under git's 50% similarity and lost
  `git log --follow`. Inventory: a DRAFT/APPROVED/BUILDING PRD with a
  `Sections:` list is `active` even with merged evidence (it tracks its own
  progress), so a fresh inventory after migration shows no `partial`.
- 2026-10-02 (§5) — adopt hint built: `adopt.sh` sources `detect.sh` and
  prints "4. N PRDs without State → run /migrate-prds inventory" in its next
  steps (only after a commit, like the other steps). PRD shipped; archived.
