# features.sh dates uncommitted specs — PRD
Status: SHIPPED 2026-10-02 (PR #57) · Owner: George · Last updated: 2026-10-02

## Problem
`features.sh` dates a spec row by the spec's last commit. The rules say to
run it before committing, so a spec that is new or edited in that commit
is dated by an older commit, or gets `-` when it has none. Once the commit
lands, `--check` calls `docs/FEATURES.md` stale and CI fails. Evidence:
merging main (#54) into #55 and #56 staged `docs/specs/feature-list.md`;
FEATURES.md regenerated mid-merge showed `-`, and both PRs then failed
the `checks` job with `docs/FEATURES.md: stale, run features.sh` until a
follow-up commit regenerated it again.

## Goals / Non-goals
- Goals: a FEATURES.md generated before a commit is still current after
  it, so the pre-commit run is enough; clean checkouts (CI) are unchanged.
- Non-goals: a commit made on a later day than the generation (the check
  then says stale and a re-run fixes it); dating PRD rows, which already
  come from `Last updated`.

## Research (what the best products do → adopt / adapt / reject)
| Pattern | Seen in | Verdict | Why |
|---|---|---|---|
| Date dirty files as "now" | git-restore-mtime, Hugo `lastmod` from git | adopt | the commit about to be made carries today's date |
| Generate in a pre-commit hook after staging | pre-commit `files` hooks | reject | no local hooks (repo-guards non-goal) |

## Users
Agents and owners running `features.sh` before a commit; CI running
`--check` on a clean checkout.

## Expected behavior
### 1. Uncommitted specs are dated today
1. A spec under `docs/specs/` that differs from `HEAD` (staged or not) or
   is untracked is dated with today's local date, which is the committer
   date its commit will carry.
2. Every other spec keeps its last commit date. A clean checkout gives the
   same output as before.
3. In a repo without commits, every spec is untracked and dated today.

## Data & contracts
None. The `Updated` column format is unchanged.

## Spec delta
- MODIFIED `docs/specs/feature-list.md` §Behavior (Updated column): "else
  the spec's last commit date, else `-`" → "else today when the spec has
  uncommitted changes or is untracked, else its last commit date, else
  `-`".

## Acceptance criteria
- [ ] A new untracked spec is dated today, and after committing it
      `features.sh --check` passes without a re-run.
- [ ] An edited, uncommitted spec is dated today, and after committing it
      `--check` passes.
- [ ] Specs with no local changes keep their commit date.
- [ ] The existing features suite still passes, including the ≤1 s budget
      for 100 PRDs.

## Rollout & metrics
Fixture in `tests/features_test.sh`. Nothing to migrate: the next run
rewrites FEATURES.md.

## State (updated 2026-10-02, PR #57)
- Sections:
  - [x] 1. Uncommitted specs are dated today · PR #57
- Folded: §1 (feature-list.md §Behavior, Updated column)
- Branch / open PRs: fix/features-uncommitted-spec-date · PR #57
- Files changed: `features.sh:24,108-117`, `tests/features_test.sh` (dirty block)
- Tests run + result: features 45 passed (3 new failed before the fix); budget 87 ms for 100 PRDs
- Remaining: none
- Next action: merge PR #57 (archived; nothing left)
## Open questions
1. Use UTC instead of the local date? Proposal: local. `%cs` is the
   committer's local date, so local is what the commit will carry.

## Changes
- 2026-10-02 — created (APPROVED, auto). Proposal 1 is the decision.
- 2026-10-02 — built §1 (BUILDING); delta folded into feature-list.md.
- 2026-10-02 — SHIPPED (PR #57); archived.
