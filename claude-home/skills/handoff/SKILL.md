---
name: handoff
description: End a feature session cleanly — update the PRD ## State block for the current branch, commit, push, and print a ≤15-line resume prompt so a fresh session continues from the repo, not from this conversation. Use before /clear or when a session nears its context or usage cap.
argument-hint: [docs/prd/feature.md]
---

# handoff

Argument: `$ARGUMENTS` = the PRD path. If empty, infer it from the branch
name or the files in `git diff --name-only main...HEAD`; if still ambiguous,
ask which PRD and stop. Repos without `docs/prd/`: skip step 2 and put the
State bullets in the PR description instead.

## Steps (keep to ≤6 tool calls)
1. One Bash call: `git branch --show-current`, `git status --short`,
   `git log --oneline main..HEAD`, `gh pr list --head $(git branch --show-current) --json number,url`,
   `grep -n "^##" PRD`, and the State block
   (`~/.claude/skills/implement-prd-section/scripts/state.sh get PRD`).
2. Reconcile `Sections:` exactly as `implement-prd-section` §0a steps 1–3
   (backfill if missing, stop on unmatched headings, one `gh pr list` for
   `[~] · PR #n` items, `git branch --merged main` fallback). Mark the
   section this branch is building `[~] · <branch>` (`· PR #n` if one is
   open); `[!] · blocked: <reason>` if it is blocked.
   Then write the PRD `## State (updated <today>, PR #n)` block, ≤30 lines,
   to a scratch file and apply it with `state.sh set PRD <file>` (same
   path). Never edit the State block by hand or with an ad-hoc text
   replace; a non-zero exit leaves the PRD untouched, so fix the input:
   - Sections (one line per item, first bullet)
   - Completed
   - Branch / open PRs
   - Files changed (file:line map — from `git diff --stat main...HEAD` plus the
     symbols you touched)
   - Tests run + result (quote `scripts/quiet-check.sh` RESULT lines if run)
   - Remaining (`none` when no `[ ]`/`[~]` items are left)
   - Decisions since last update
   - Known failures / blockers
   - Next action (one imperative sentence)
   Add a `## Changes` entry only if behavior changed in this session.
   Spec delta folded for every section merged this session: each `[x]` or
   this branch's merged section is in State `Folded:` and its delta is in
   `docs/specs/` (skip if the repo has no `docs/specs/`). Missing → fold it
   now, same commit.
   If the branch diff touches a mapped area (CLAUDE.md §Area maps) and
   changes its contracts, entry points or invariants, update that map in
   the same commit.
3. If the commit touches a PRD, run
   `~/.claude/skills/implement-prd-section/scripts/features.sh` when
   `docs/FEATURES.md` exists (stage it), then
   `~/.claude/skills/implement-prd-section/scripts/prd-lint.sh PRD` first.
   A violation stops the commit: fix the PRD (usually restore the lost text
   from `git show HEAD:PRD`), never commit around it.
   After staging, run `~/.claude/skills/implement-prd-section/scripts/doc-lint.sh
   --only $(git diff --cached --name-only)`; a violation stops the commit
   (move the doc to its `docs/README.md` home or allowlist it with a reason).
   Commit everything outstanding (what + why + QA evidence); push over HTTPS
   (`git -c credential.helper='!gh auth git-credential' push origin <branch>`).
   Never commit to main; if on main with changes, stop and say so.
4. Print the resume prompt, ≤15 lines, ready to paste as the first message
   of a new session:

```
Resume <feature>: branch <branch>, PR <url or none>.
Read docs/prd/<feature>.md ## State first, then lines <a-b> (the section being built).
Area map: <the map CLAUDE.md §Area maps names for this area>.
Next action: <one sentence>.
Model/effort for this session: <model + effort>.
```

Do not summarise the conversation, do not list what was tried and abandoned,
do not paste diffs. The repo is the memory.
