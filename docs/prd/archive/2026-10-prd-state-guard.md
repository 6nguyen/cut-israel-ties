# PRD State guard — PRD
Status: SHIPPED 2026-10-02 (PR #37) · Owner: George Nguyen · Last updated: 2026-10-02

## Problem
In PR #30, a model rewrote `docs/prd/repo-setup.md`'s State block with an
ad-hoc string replace. The replace found the first `## State` in the file,
and that was inline prose in §2 item 2, not the heading. The edit deleted
112 lines: the rest of §2, all of §3, Data & contracts, Spec delta,
Acceptance criteria, Rollout and the real State heading. The commit was
meant to touch only State. It merged unnoticed, and PR #31 restored the
text.
`/implement-prd-section` and `/handoff` locate State with anchored
`grep -n "^##"`, but they leave the edit to the model, and nothing checks a
PRD's shape after it is written. The only check that would have noticed (the
skill's step 0a.2 match) runs at the start of the next build, after the
merge.

## Goals / Non-goals
- Goals: State edits go through one tested, line-anchored script. A PRD
  whose structure breaks fails locally before commit and in the template's
  CI.
- Non-goals: checking PRD prose or content quality; linting archived PRDs
  (never edited); enforcing the lint in adopted repos' CI (Open
  question 2); changing the PRD template's headings.

## Research (what the best products do → adopt / adapt / reject)
| Pattern | Seen in | Verdict | Why |
|---|---|---|---|
| Structure-aware edits instead of text replace | markdown AST tools (remark, mdformat) | adapt | An AST is overkill for one block; line-anchored awk that skips fenced code gives the same safety with no dependency |
| Schema lint for docs in CI | markdownlint, Vale, ADR tools (adr-tools, log4brains) | adapt | Lint only the template's required headings and `Sections:` matching, not style |
| Pre-commit hooks | pre-commit, husky | reject | Repos don't share a hook manager; the skill runs the lint before every commit that touches a PRD, and CI covers the template |

## Users
Agents running `/implement-prd-section`, `/handoff` or `/migrate-prds`
(they write State); the owner, who reviews PRD PRs and should never have
to spot a lost section in a diff.

## Expected behavior
### 1. State helper
1. `claude-home/skills/implement-prd-section/scripts/state.sh`:
   - `state.sh get <prd>` prints the State block: from the line matching
     `^## State` to the line before the next `^## ` line, or to EOF.
   - `state.sh set <prd> <file>` replaces that block with `<file>`'s
     contents, which must start with a `^## State` line. Nothing outside
     the block changes byte-for-byte.
   - `state.sh set <prd> <file>` on a PRD with no State block inserts it
     before `## Open questions`. If that heading is missing, it inserts
     before `## Changes`, else at EOF.
2. Headings are matched only at line start and outside fenced code blocks
   (` ``` ` / `~~~`). A `## State` quoted inside a list item or a code
   fence is never a match.
3. More than one `^## State` line, a `<file>` that doesn't start with
   `## State`, or a `<file>` that contains a `^## ` line other than its
   first → exit non-zero, the PRD untouched, and a message naming the
   reason and line numbers.
4. `/implement-prd-section` (§0, §0a, §3) and `/handoff` read State with
   `state.sh get` and write it only with `state.sh set`. The skills say
   "never edit the State block by hand or with ad-hoc text replace".
   `/migrate-prds split`, which writes a new PRD whole, is unchanged.

### 2. PRD lint
1. `claude-home/skills/implement-prd-section/scripts/prd-lint.sh [prd…]`
   (default: every `docs/prd/*.md` except `README.md`,
   `migration-plan.md`, `research-*.md` and `archive/`) checks each PRD,
   ignoring fenced code:
   - line 2 starts with `Status:`;
   - `## Problem`, `## Expected behavior`, `## Acceptance criteria` and
     `## Changes` each appear exactly once;
   - every other template heading (`## Goals`, `## Spec delta`,
     `## Data & contracts`, `## State`, `## Open questions`, …) appears
     at most once;
   - with a `Sections:` list, every item prefix-matches a `###` or `##`
     heading under `## Expected behavior`, with the skill's 0a.2 rule.
2. Output is one line per violation, `<file>:<line>: <rule>`, then
   `prd-lint: N files, M violations`. Any violation → exit 1.
3. `/implement-prd-section` and `/handoff` run `prd-lint.sh <prd>` before
   every commit that touches a PRD. A violation stops the commit; the agent
   fixes the PRD (usually by restoring the lost text from the previous
   commit) and never commits around it.
4. A `prd-lint` target in the template's `scripts/quiet-check.sh`
   (`prd-lint|claude-home/skills/implement-prd-section|bash scripts/prd-lint.sh …|generic`)
   runs in the template-only CI step. It is template-only, so adopt and
   bootstrap strip it as they do the other `claude-home` targets.
5. On the PR #30 corruption (`git show 3f9315d:docs/prd/repo-setup.md`) the
   lint reports at least: missing `## Acceptance criteria`, and `Sections:`
   item "3. Bootstrap writes the setup PRD" matches no heading.

## Data & contracts
- New `claude-home/skills/implement-prd-section/scripts/state.sh` and
  `scripts/prd-lint.sh`, both bash 3.2 + awk, no python. Skills are
  symlinked into `~/.claude/skills/`, so both work in every repo.
- State block boundary (the contract both scripts share): from the
  `^## State` line to the next `^## ` line, or EOF, outside fenced code.
- Tests: `claude-home/skills/implement-prd-section/tests/prd_guard_test.sh`
  (fixtures include an inline `` `## State` `` in a list item, a fenced
  `## State`, a duplicate State and the PR #30 file).

## Spec delta
- MODIFIED `docs/specs/prd-lifecycle.md`:
  - §Behavior 4 Build: State is read and written only through `state.sh`;
    every commit touching a PRD runs `prd-lint.sh` first.
  - §Data & contracts: add the State block boundary and the lint rules
    (required headings, at most once, `Sections:` prefix match).
  - §Invariants: add "every open PRD passes `prd-lint.sh`" and "a
    State-only update changes no line outside the State block".

## Acceptance criteria
- [x] `state.sh set` on a PRD whose prose contains an inline
      `` `## State` `` changes only the real State block (diff limited to
      its lines).
- [x] A `## State` inside a fenced code block is ignored by both scripts.
- [x] Two `## State` headings, or a replacement that adds an extra `## `
      heading → non-zero exit, PRD byte-identical.
- [x] `state.sh set` on a PRD without State inserts it before
      `## Open questions`.
- [x] `prd-lint.sh` on `git show 3f9315d:docs/prd/repo-setup.md` exits 1
      and names the missing `## Acceptance criteria` and the unmatched
      item "3. Bootstrap writes the setup PRD".
- [x] `prd-lint.sh` passes on every live PRD in `docs/prd/` after PR #31
      merges.
- [x] Both skills' SKILL.md use `state.sh` for State and run the lint
      before PRD commits; no SKILL.md tells the model to edit State by
      hand.
- [x] `scripts/quiet-check.sh prd-lint` runs in template CI; an adopted
      repo's `quiet-check.sh` has no `prd-lint` line.
- [x] Performance: lint of all live PRDs <1 s; `state.sh` <100 ms per
      call.

## Rollout & metrics
- Ship §1 and §2 in order; §2's skill change depends on §1's script.
- Success: no PRD-structure regression reaches main; lint failures in CI
  or before commit are recorded in the PR body when they occur.

## State (updated 2026-10-02, §2 built)
- Sections: (build order; `[ ]` todo · `[~]` in progress · `[x]` merged · `[!]` blocked: reason)
  - [x] 1. State helper · PR #36 merged
  - [~] 2. PRD lint · feat/prd-state-guard-prd-lint
- Completed: §1 `state.sh get|set`. §2 `prd-lint.sh` (Status line,
  required/at-most-once template headings, `Sections:` prefix match,
  fence-aware); both skills lint before every PRD commit.
- Branch / open PRs: `feat/prd-state-guard-prd-lint` (§2)
- Files changed: `claude-home/skills/implement-prd-section/scripts/prd-lint.sh`
  (new); `.../tests/prd_guard_test.sh` (lint cases) +
  `tests/fixtures/pr30-repo-setup.md` (3f9315d copy; CI checkout is
  shallow); `implement-prd-section/SKILL.md` (PRD lint rule);
  `handoff/SKILL.md` step 3; `scripts/quiet-check.sh` + `ci.yml`
  (`prd-lint` target, template-only); `docs/specs/prd-lifecycle.md`
  §Behavior 4, §Data & contracts, §Invariants; `docs/prd/README.md`
  §Lifecycle 2.
- Folded: §1, §2 (prd-lifecycle §Behavior 4, §Data & contracts, §Invariants).
- Tests run + result: `RESULT: PASS (prd-guard)` 49 passed; lint of all
  live PRDs 46 ms (budget <1 s). `RESULT: PASS (prd-lint)` 2 files, 0
  violations. `RESULT: PASS (adopt)` 98 passed.
- Remaining: none.
- Decisions: an item may name `## Expected behavior` itself (backfill rule
  for PRDs with no phase headings). Archived `2026-10-migrate-prds.md` fails
  the lint (State swallowed its Expected behavior and Acceptance criteria);
  archives are frozen and not linted by default, so left as is.
- Known failures / blockers: none.
- Next action: merge this PR (ships the PRD).
## Open questions
1. Where do the scripts live? Proposal: in the `implement-prd-section`
   skill's `scripts/`, the skill that owns State. `/handoff` calls them by
   path (`~/.claude/skills/implement-prd-section/scripts/`), the way
   adopt already sources `migrate-prds/scripts/detect.sh`.
2. Should adopted repos run the lint in CI? Proposal: not in this PRD.
   It would need a per-repo copy of the script (adopt and bootstrap would
   copy a new file, plus a spec change). The pre-commit lint in the skills
   already covers agent edits in every repo. Revisit if a corrupted PRD
   reaches main in an adopted repo.
3. Lint `## Spec delta` as required? Proposal: no, at most once.
   `token-tooling.md` predates specs and has none; requiring it would fail
   a live PRD for a reason unrelated to corruption.

## Changes
- 2026-10-02 — created; APPROVED (auto, no blocking questions).
- 2026-10-02 — §1 built: `state.sh get|set`; a `prd-guard` quiet-check
  target (template-only, in the CI template-only step) runs its tests.
  Status BUILDING.
- 2026-10-02 — §2 built: `prd-lint.sh` and a template-only `prd-lint`
  quiet-check target; both skills lint before every PRD commit. A
  `Sections:` item may name `## Expected behavior` itself (backfill rule).
  Status SHIPPED.
