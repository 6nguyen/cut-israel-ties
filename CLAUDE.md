# CLAUDE.md — cut-israel-ties

Repo-specific facts only. Communication, token/agent rules, sessions, git,
PRD-first, verification cadence and the quality bar are global
(`~/.claude/CLAUDE.md`, from llm-repo-template/claude-home). Don't copy them
here; every line in this file is re-read on every request.

## Repo map
Docs only so far: a civic-action tool to end US aid, ties and military
partnership with Israel. No app code, no stack chosen yet; `README.md`
says what it is.
- `docs/README.md` — where each kind of doc goes; doc-lint enforces it in CI.
- `docs/prd/` — one PRD per feature (template in `docs/prd/README.md`);
  its `## Next` table queues ideas that have no PRD yet.
- `docs/specs/` — what the app does today, one spec per capability
  (template in `docs/specs/README.md`). Read it before changing shipped behavior.
- `docs/research/` — evidence behind PRD decisions, one file per question
  (rules in `docs/research/README.md`). Builds never read it.
  `civic-action-levers/` is the study behind the first product idea.
- `docs/FEATURES.md` — generated feature list and lifecycle state; read it before proposing a PRD or answering what exists.
- `design/stitch/` — Google Stitch export (design system, one HTML+PNG per
  screen, placeholder photos); reference for the frontend build, never built.
- `scripts/` — `quiet-check.sh` (the only build/test entry point for agents)
  plus the CI linters `prd-lint.sh`, `doc-lint.sh` and `features.sh`.

## Area maps
Before editing code under a mapped area, read its map.
- (none yet)

## Commands
- Agents and long loops: `scripts/quiet-check.sh <target>` (`list` shows
  targets). Raw commands below are for humans and one-off runs.
- Targets: `prd-lint`, `doc-lint`; both run in CI (`CI_TARGETS`). No build
  or test suite exists yet; add targets when the first code lands.
- `scripts/features.sh .` regenerates `docs/FEATURES.md` after any PRD or
  spec change; `prd-lint` fails on a stale one.

## Performance budgets
None yet. The first product PRD sets them.

## Hard gotchas
- Research files are dated snapshots (vote tallies, member positions,
  leadership calendars). Never rewrite one; add a new file with a
  `Superseded by` line and a `## What changed` section.
- `docs/FEATURES.md` is generated; hand edits are undone by the next
  `features.sh` run.

## Don'ts
- Don't aim a feature at "cut aid" alone. The live decision points are the
  NDAA integration sections (219/224), the 2028 MOU replacement, named
  appropriations votes and primaries. A PRD names the vote it targets.
- Don't make a public act the first step. The evidence says public badges
  and petitions suppress follow-through; the funnel is private commitment,
  then a related hard ask, then named-captain recruitment, then a public
  receipt.
- Don't let the product's numbers (whip counts, tallies) come from an LLM;
  deterministic code counts, sourced rows feed it.
