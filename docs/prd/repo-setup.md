# Repo setup — PRD
Status: APPROVED 2026-11-04 (bootstrap) · Owner: George Nguyen · Last updated: 2026-11-04

## Problem
llm-repo-template's per-repo layer was just added. `CLAUDE.md`,
quiet-check targets and area maps still hold placeholders, so agents
re-explore the repo on every request.

## Goals / Non-goals
- Goals: a `CLAUDE.md` with real facts; build/test through
  `scripts/quiet-check.sh`; area maps where they pay off.
- Non-goals: feature work; changing what the code does.

## Expected behavior
### 1. CLAUDE.md
The model drafts the repo map (naming `docs/prd/` and `docs/specs/`),
commands, performance budgets and hard gotchas from the code. Global rules stay out (they load from
`~/.claude/CLAUDE.md`). The owner reviews the facts in the PR.

### 2. quiet-check targets
The model proposes `TARGETS` in `scripts/quiet-check.sh` and `CI_TARGETS`
in CI from the build files it finds, then runs `scripts/quiet-check.sh list`
and each target once.

### 3. Area maps
`/area-maps measure` lists the directories big enough for a map; run
`/area-maps write <dir>` for each one the owner picks. None picked → the
section is done.

## Spec delta
none — setup only.

## Acceptance criteria
- [ ] `CLAUDE.md` has no placeholders and no global-rule headings, and its
      repo map names `docs/prd/` and `docs/specs/`.
- [ ] `scripts/quiet-check.sh list` shows the repo's targets and each passes
      once; CI runs `CI_TARGETS`.
- [ ] Every directory the owner picked from `/area-maps measure` has a map.
- [ ] On archive, the setup pointer line is gone from `CLAUDE.md`.

## State (updated 2026-11-04)
- Sections: (build order; `[ ]` todo · `[~]` in progress · `[x]` merged · `[!]` blocked: reason)
  - [~] 1. CLAUDE.md · feat/repo-setup-1-claude-md
  - [~] 2. quiet-check targets · feat/repo-setup-1-claude-md
  - [~] 3. Area maps · feat/repo-setup-1-claude-md
- Completed: all three on feat/repo-setup-1-claude-md (no code in the repo: §2 keeps the bootstrap targets `prd-lint doc-lint`, each run once; §3 measure lists no directory, none picked).
- Folded: none (spec delta: none).
- Branch / open PRs: feat/repo-setup-1-claude-md
- Files changed (file:line map): CLAUDE.md:1-60 (repo map, commands, gotchas, don'ts).
- Tests run + result: quiet-check prd-lint PASS, doc-lint PASS.
- Remaining: none.
- Next action: open PR, archive.
## Changes
- 2026-11-04 — created by bootstrap.
- 2026-11-04 — §1–3 built together on feat/repo-setup-1-claude-md: docs-only repo, §2 and §3 change no files.
