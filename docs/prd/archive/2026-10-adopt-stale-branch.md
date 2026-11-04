# adopt reuses a stale branch — PRD
Status: SHIPPED 2026-10-02 (PR #60) · Owner: George · Last updated: 2026-10-02

## Problem
adopt always works on `chore/adopt-llm-template`. On hypertrophy-goals that
branch is still on `origin` from the closed PR #206 (closed for defect 7, so
adopt could re-run after the fix). With no local branch, adopt cuts a fresh
one from the default branch, commits, and the push is rejected as
non-fast-forward, so the run fails after committing. With the local branch
still present, adopt switches to it and merges the default branch: the
closed run's files are already there, so the re-run keeps their stale
content (the N = 37 setup PRD) instead of writing the fixed output.
Separately, `gh pr view <branch>` also finds closed and merged PRs, so adopt
can print "PR already open" and open no PR.

## Goals / Non-goals
- Goals: a re-run after a closed or merged adopt PR writes fresh output on
  a branch that pushes cleanly; a re-run while the PR is open continues it;
  only an open PR counts as open.
- Non-goals: deleting or force-pushing the old branch (both rewrite or
  remove pushed history the owner may still want); closing PRs.

## Research (what the best products do → adopt / adapt / reject)
| Pattern | Seen in | Verdict | Why |
|---|---|---|---|
| Fresh suffixed branch when the old PR is closed | Renovate (`recreateWhen`), Dependabot | adapt | Renovate recreates a closed PR's branch only on request; adopt is run on request, so a new branch is the request |
| Force-push over the old branch | Dependabot rebase | reject | global rule: never force-push |
| Continue the open PR's branch | Renovate, Dependabot | adopt | one PR per run of work |

## Users
Owners re-running `adopt` on a repo after closing or merging its adopt PR.

## Expected behavior
### 1. Open PRs only
1. Before cutting a branch (when `origin` exists), adopt asks `gh` for the
   PRs whose head is `chore/adopt-llm-template`. If there are some and none
   is open, it uses `chore/adopt-llm-template-<n>`, the smallest n ≥ 2 whose
   PRs are not all closed or merged, and prints
   `note: chore/adopt-llm-template has only closed or merged PRs; using chore/adopt-llm-template-<n>`.
2. The chosen branch: an existing local branch is switched to and the
   default branch merged in (as today); else a branch on `origin` is
   checked out from `origin/<branch>` and the default branch merged in, so
   the push fast-forwards; else it is cut from the default branch.
3. After pushing, adopt reuses the branch's PR only when one is open
   (`gh pr list --head <branch> --state open`); otherwise it opens one.
4. No PRs, or `gh` unavailable: the branch name is unchanged (a local
   `--no-pr` branch is still reused).

## Data & contracts
None. The action table and PR body are unchanged; the note line is new.

## Spec delta
- MODIFIED `docs/specs/adopt.md` §Behavior 7 (Branch): "If the branch
  exists it switches to it and merges the default branch." → "A branch
  whose PRs are all closed or merged is not reused: adopt uses
  `chore/adopt-llm-template-<n>` (smallest free n ≥ 2) and prints a note.
  An existing branch is switched to (local) or checked out from `origin`,
  and the default branch merged in."
- MODIFIED `docs/specs/adopt.md` §Behavior 8 (Output): "(an open PR for the
  branch is reused)" → "(the branch's PR is reused only while it is open)".
- ADDED `docs/specs/adopt.md` §Invariants: a re-run after a closed adopt
  PR pushes without force and leaves the old branch's head unchanged.

## Acceptance criteria
- [x] Remote-only `chore/adopt-llm-template` with a closed PR: adopt exits
      0, prints the note, pushes `chore/adopt-llm-template-2`, opens a PR
      for it, and the old branch's head on `origin` is unchanged; fails
      before the fix.
- [x] Local and remote branch with a merged PR: same, with fresh output
      (the files are created, not unchanged).
- [x] Remote-only branch with an open PR: adopt continues it from
      `origin`, the push fast-forwards, and no second PR is opened; fails
      before the fix.
- [x] The existing adopt suite passes; the full local run stays < 5 s on
      hypertrophy-goals.

## Rollout & metrics
Fixtures in `claude-home/tests/adopt_test.sh` (the `gh` stub learns
`pr list`). Needed before the hypertrophy-goals adopt re-run
(rollout-existing-repos §3); that run is the metric.

## State (updated 2026-10-02)
- Sections:
  - [x] 1. Open PRs only · fix/adopt-stale-branch-open-prs-only
- Folded: §1 (adopt.md §Behavior 7–8, §Invariants).
- Branch / open PRs: fix/adopt-stale-branch-open-prs-only
- Tests run + result: adopt 154 passed (8 new; 10 checks failed before
  the fix). hypertrophy-goals: dry run 0.31 s plus the `gh pr list`
  lookup 0.44 s (budget 5 s).
- Remaining: none.
- Known failures / blockers: none.
- Next action: none; archived.
## Open questions
1. Suffix the branch, or reuse it after merging main? Proposal: suffix.
   Reusing keeps the closed run's stale files, which adopt then reports as
   unchanged.

## Changes
- 2026-10-02 — created (APPROVED, auto): found on the hypertrophy-goals
  re-run (rollout-existing-repos §3, defect 9). Proposal 1 is the decision.
- 2026-10-02 — built §1 and archived. The first fixture passed before the
  fix because both adopt runs made the same commit in the same second, so
  the push was a no-op; `main` now moves between runs, as it does in a
  real repo.
