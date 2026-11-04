# CLAUDE.md — cut-israel-ties

Repo-specific facts only. Communication, token/agent rules, sessions, git,
PRD-first, verification cadence and the quality bar are global
(`~/.claude/CLAUDE.md`, from llm-repo-template/claude-home). Don't copy them
here; every line in this file is re-read on every request.

## Repo map
<!-- One line per top-level dir: what lives there, stack, entry point. -->
- `docs/README.md` — where each kind of doc goes; doc-lint enforces it in CI.
- `docs/prd/` — one PRD per feature (template in `docs/prd/README.md`).
- `docs/specs/` — what the app does today, one spec per capability
  (template in `docs/specs/README.md`). Read it before changing shipped behavior.
- `docs/research/` — evidence behind PRD decisions, one file per question
  (rules in `docs/research/README.md`). Builds never read it.
- `docs/FEATURES.md` — generated feature list and lifecycle state; read it before proposing a PRD or answering what exists.
- `scripts/quiet-check.sh` — the only build/test entry point for agents.

## Area maps
<!-- <area>/CLAUDE.md, ≤4k tokens: purpose, contracts, anti-patterns. Claude
     Code loads one when files under it are read. `/area-maps measure` says
     which directories earn one; `/area-maps write <dir>` adds it here. -->
Before editing code under a mapped area, read its map.

## Commands
- Agents and long loops: `scripts/quiet-check.sh <target>` (`list` shows
  targets). Raw commands below are for humans and one-off runs.
<!-- - Tests: …   - Typecheck: …   - Build: …   - E2E: … -->

## Performance budgets
<!-- The numbers PRDs cite and PRs must quote (endpoint p95, launch, memory…). -->

## Hard gotchas
<!-- Things that have burned us. Add one line each time a debugging loop
     costs more than ~20 minutes. -->

## Don'ts
<!-- Product decisions and constraints that aren't obvious from the code. -->

Setup pending: when no other task is given or when asked to continue setup, run /implement-prd-section docs/prd/repo-setup.md. <!-- prd-pointer: docs/prd/repo-setup.md -->
