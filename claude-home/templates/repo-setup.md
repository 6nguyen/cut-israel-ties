# Repo setup — PRD
Status: APPROVED {{DATE}} ({{SOURCE}}) · Owner: {{OWNER}} · Last updated: {{DATE}}

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
{{MIGRATE}}Maps that already exist elsewhere (a `docs/*-map.md`, a primer) move
{{MIGRATE}}to `<dir>/CLAUDE.md` in the Migrate PRDs move PR, not here.
{{MIGRATE}}
{{MIGRATE}}### 4. Migrate PRDs
{{MIGRATE}}{{N}} PRDs without State or a line-2 `Status:`. Run the `/migrate-prds`
{{MIGRATE}}phases in order (inventory, move, fold, split), merging each PR before
{{MIGRATE}}the next. A PRD that stays active with merged sections either goes
{{MIGRATE}}through `split`, or gains a `## Spec delta` and has its merged
{{MIGRATE}}sections folded into `docs/specs/` in the same PR. Research (studies,
{{MIGRATE}}memos, design proposals) moves to `docs/research/` in the move PR, each
{{MIGRATE}}file with the header from `docs/research/README.md`. Done when
{{MIGRATE}}`docs/prd/migration-plan.md` is gone, no `docs/prd/research-*` file is
{{MIGRATE}}left and `prd-lint.sh` passes.

## Spec delta
none — setup only.

## Acceptance criteria
- [ ] `CLAUDE.md` has no placeholders and no global-rule headings, and its
      repo map names `docs/prd/` and `docs/specs/`.
- [ ] `scripts/quiet-check.sh list` shows the repo's targets and each passes
      once; CI runs `CI_TARGETS`.
- [ ] Every directory the owner picked from `/area-maps measure` has a map.
{{MIGRATE}}- [ ] `docs/prd/migration-plan.md` is gone.
{{MIGRATE}}- [ ] Every active PRD passes `prd-lint.sh`, and its merged sections
{{MIGRATE}}      are in `docs/specs/`.
- [ ] On archive, the setup pointer line is gone from `CLAUDE.md`.

## State (updated {{DATE}})
- Sections: (build order; `[ ]` todo · `[~]` in progress · `[x]` merged · `[!]` blocked: reason)
  - [ ] 1. CLAUDE.md
  - [ ] 2. quiet-check targets
  - [ ] 3. Area maps
{{MIGRATE}}  - [ ] 4. Migrate PRDs
- Remaining: all.
- Next action: `/implement-prd-section docs/prd/repo-setup.md`.

## Changes
- {{DATE}} — created by {{SOURCE}}.
