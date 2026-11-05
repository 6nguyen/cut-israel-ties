# CLAUDE.md — cut-israel-ties

Repo-specific facts only. Communication, token/agent rules, sessions, git,
PRD-first, verification cadence and the quality bar are global
(`~/.claude/CLAUDE.md`, from llm-repo-template/claude-home). Don't copy them
here; every line in this file is re-read on every request.

## Repo map
A civic-action tool to end US aid, ties and military partnership with
Israel (`README.md`). Monorepo, npm workspaces, Node ≥22.
- `web/` — Astro 5 static site, Tailwind v4 tokens in
  `src/styles/global.css`, Preact islands in `src/components/`. Dev proxies
  `/api` to the Worker (`API_ORIGIN`, default `http://localhost:8787`).
- `worker/` — Cloudflare Worker (Hono) + D1. `src/index.ts` builds the app
  with injected repo/fetch/clock so `test/` runs in plain vitest with
  `MemoryRepo` over the real `data/` rows. `schema.sql`, `scripts/seed.ts`.
- `data/` — the only source of goals, actions, members, positions and
  states (YAML/CSV, provenance in `data/README.md`). Seeded into D1; never
  hand-edit D1.
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
- Targets: `prd-lint`, `doc-lint`, `tsc` (worker typecheck), `test`
  (worker vitest), `build` (web); all run in CI (`CI_TARGETS`).
- Local run: `npm run seed -w worker` (YAML/CSV → D1 local), then
  `npm run dev` (Worker on 8787 + Astro on 4321).
- `scripts/features.sh .` regenerates `docs/FEATURES.md` after any PRD or
  spec change; `prd-lint` fails on a stale one.

## Performance budgets
From `docs/prd/archive/2026-11-action-router.md` acceptance criteria:
- Landing ≤100 KB transferred; LCP ≤1.5 s on a mid-range phone over 4G.
- `/api/route` ≤2 s p95.
- Generation: first streamed token ≤3 s p95, complete ≤10 s p95.
- Infra cost excluding LLM and domain = $0/month.

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
