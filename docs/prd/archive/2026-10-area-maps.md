# Area maps (Intent Layer adoption) — PRD
Status: SHIPPED 2026-10-01 (PR #6) · Owner: George Nguyen · Last updated: 2026-10-01

## Problem
The workflow already depends on area maps: the global CLAUDE.md tells
orchestrators to "point agents at the repo's area maps", `implement-prd-section`
step 1 loads "the area map for the code being touched", and `handoff` prints
"Area map: …" in the resume prompt. But nothing defines what an area map is,
when a directory earns one, how big it may be, or how it stays current. The
project CLAUDE.md slot reads "(none yet)" and no repo built from this template
has written one. Without maps, every spawn re-derives architecture by reading
code: that is the ~30-50k orientation tax the agent rules try to cut.

crafter-station/skills `intent-layer` (MIT, ~600 lines: SKILL.md, 3 shell
scripts, 3 references) defines all of this. It can't be installed as-is: it
installs outside `claude-home/` (`npx skills add -g`), its state detector looks
for a `## Intent Layer` section (on this repo it reports `partial` and would add
a second index next to `## Area maps`), and its root template has a
"Global Invariants" block that duplicates `## Hard gotchas` / `## Don'ts`.

## Goals / Non-goals
- Goals:
  1. One definition of an area map: format, size cap, when to create one.
  2. A global `area-maps` skill (in `claude-home/skills/`, linked by
     `install.sh`) that measures a repo, writes one map, and audits stale maps.
  3. Deterministic measurement: a script computes token estimates and
     thresholds; the model never does that arithmetic.
  4. Maps stay current through the existing PR rule (behavior change ⇒ same-PR
     update), not through a separate ritual.
  5. The first real map: `claude-home/tools/session-analyzer/`.
- Non-goals:
  - Auto-generated symbol or code maps (Aider-style): they describe *what*
    code exists, which agents can grep; maps record *intent*: contracts,
    invariants, anti-patterns.
  - A map per directory. Most repos need 0–3.
  - Changing `bootstrap.sh`. Maps get written when code grows into them,
    not at repo creation.
  - Supporting AGENTS.md at the repo root. The root stays CLAUDE.md.

## Research (what the best products do → adopt / adapt / reject)
| Pattern | Seen in | Verdict | Why |
|---|---|---|---|
| Child node template (Purpose / Entry points / Contracts / Patterns / Anti-patterns / Related) | intent-layer | Adopt | Covers exactly what an agent can't recover from grep |
| Token thresholds: <20k no node, 20–64k one 2–3k node, >64k split | intent-layer | Adopt | Concrete, and computed by a script |
| ≤4k tokens per node, no duplication with ancestors, facts at the lowest common ancestor (LCA) | intent-layer | Adopt | Matches "every line is re-read" |
| SME capture questions, leaf-first order | intent-layer | Adapt | Ask the owner only what code and git can't answer; ≤4 questions per map |
| `## Intent Layer` index + "Global Invariants" in root | intent-layer | Adapt | Reuse `## Area maps` as the index; invariants go to Hard gotchas |
| "CLAUDE.md or AGENTS.md?" root choice, `npx -g` install | intent-layer | Reject | Root is fixed; global skills live in `claude-home/` |
| Nested CLAUDE.md loaded on demand when files in that subtree are read | Claude Code | Adopt (see Open question 1) | Agents get the map without anyone pointing at it |
| AGENTS.md as cross-tool convention | Codex, Cursor, others | Reject for now | This toolchain is Claude-only; a symlink can add it later |
| Path-glob scoped rules | Cursor `.cursor/rules` | Reject | The directory-scoped file gives the same scoping without config |
| Repo map generated from the syntax tree, sent on every request | Aider | Reject | Costs tokens every request; captures symbols, not intent |

## Users
- **Orchestrator session**: builds context packs for agents and needs a
  file:line pointer, not an essay.
- **Spawned agents / `implement-prd-section`**: need an area's contracts
  before editing it.
- **Owner**: answers capture questions and reviews maps in PRs. Their time
  is the scarcest input.

## Expected behavior
1. **Map file.** An area map is `<area>/CLAUDE.md` with a `## Purpose`
   heading (that heading is how the scripts tell maps from other
   CLAUDE.md files), ≤4k tokens, using the template in the skill's
   `references/template.md`. Purpose goes in the first two lines. Contracts
   are explicit (never "handle carefully"). Anti-patterns come from real
   incidents or review findings, not hypotheticals.
2. **Index.** The project CLAUDE.md `## Area maps` section lists one line per
   map: `- <area>: <path> — <one-line purpose>`. The template ships one
   directive under the heading: "Before editing code under a mapped area,
   read its map." Cross-cutting invariants go to `## Hard gotchas`, never a
   new section.
3. **`/area-maps measure [path]`** runs `scripts/measure.sh`, which prints a
   table (directory · ~tokens · files · verdict) sorted by path. Directories
   are evaluated deepest first: a directory's area is its tokens minus those
   claimed by a deeper flagged or mapped directory. A map covers its
   subtree; a covered directory is flagged only past the split threshold.
   Directories under 20k are not listed; a footer gives the remainder. It excludes `.git`, `node_modules`, build output,
   `ops/`, and test/fixture directories (`tests`, `test`, `fixtures`,
   `__tests__`, `*.jsonl`/`*.xz` data). It flags existing maps and their size.
   Verdicts: `none` (<20k), `map` (20–64k), `split` (>64k), `has-map`,
   `map-over-cap` (>4k). Read-only. Output is byte-identical across runs on
   the same tree.
4. **`/area-maps write <dir>`**:
   1. Reads the directory's entry points, README and recent `git log`.
   2. Drafts the map.
   3. Asks the owner up to 4 capture questions, only for sections the code
      can't answer (invariants with an incident behind them, out-of-scope
      boundaries).
   4. Writes the map and adds the index line.
   5. Runs `measure.sh` to confirm the map is ≤4k tokens.

   If the directory is under 20k tokens, it says so and stops unless the owner
   confirms a responsibility boundary justifies a map anyway.
5. **`/area-maps audit`** runs `scripts/audit.sh`, which lists each map with the commit count and changed
   files in its area since the map last changed (working tree vs the map's last
   commit, plus untracked files; a new uncommitted map is listed as such). For maps with changes, it proposes edits as a diff for the owner.
   It never rewrites silently.
6. **Rule.** One line is added to the global CLAUDE.md §Quality bar: "A
   change to a mapped area's contracts, entry points or invariants updates
   its map in the same PR." `handoff` step 2 checks it: if the branch diff
   touches a mapped area, confirm the map still holds or update it.
7. **`implement-prd-section`.** Step 1 still loads the map once, and notes
   that Claude Code also attaches it when files under it are read, so it is
   not re-read later.
8. **Bootstrap.** The session-analyzer index line is template-only;
   `bootstrap.sh` deletes it along with `claude-home/`.
9. **First map.** `claude-home/tools/session-analyzer/CLAUDE.md` (~56k tokens
   of source). It links to the tool's README for commands instead of copying
   them.

## Data & contracts
- New: `claude-home/skills/area-maps/` containing `SKILL.md` (≤80 lines),
  `scripts/measure.sh` and `scripts/audit.sh` (bash 3.2+, POSIX tools),
  `references/template.md`, `references/capture.md`, and `LICENSE` (upstream
  MIT notice plus attribution to crafter-station/intent-layer).
- Changed: `CLAUDE.md` (§Area maps directive), `claude-home/CLAUDE.md`
  (one Quality-bar line), `claude-home/skills/handoff/SKILL.md` (map check),
  `claude-home/skills/implement-prd-section/SKILL.md` (wording only if Open
  `docs/prd/README.md` (index row), `scripts/bootstrap.sh` (drop the
  template-only index line), `TEMPLATE.md` (skill list).
- New: `claude-home/tools/session-analyzer/CLAUDE.md`.
- `install.sh` already links every `claude-home/skills/*/`, so it needs no
  change.

## Acceptance criteria
- [ ] After `claude-home/install.sh`, `~/.claude/skills/area-maps` is a
      symlink into the clone.
- [ ] Before the map exists, `measure.sh .` on this repo flags
      `claude-home/tools/session-analyzer/sa` as `map` (~56k); after, it shows
      `claude-home/tools/session-analyzer` as `has-map` and no `sa` row.
      It lists no `tests` directory and runs in <2 s.
- [ ] Two consecutive `measure.sh` runs produce identical output.
- [ ] `measure.sh` on an empty directory prints an empty table and exits 0.
      On a nonexistent path it prints an error and exits non-zero.
- [ ] The session-analyzer map is ≤4k tokens per `measure.sh`, has Purpose in
      its first two lines, and duplicates no command table from the README.
- [ ] CLAUDE.md has no `## Intent Layer` section. `## Area maps` has the
      directive plus exactly one entry.
- [ ] A fresh session asked to change `sa/report.py` has the map in
      context, either auto-loaded or via the directive, without being told
      about it.
- [ ] `audit` on a branch that edits `sa/` lists the session-analyzer map as
      changed-since. On `main` it reports nothing stale.
- [ ] Upstream MIT notice is present in `claude-home/skills/area-maps/LICENSE`.
- [ ] `bash -n` passes on `measure.sh`. `scripts/quiet-check.sh session-analyzer`
      is still green (no code change there; run once at merge).
- Performance budget: `measure.sh` <2 s on this repo; SKILL.md ≤80 lines;
  each map ≤4k tokens; CLAUDE.md grows by ≤1 line per map.

## Rollout & metrics
No flag. One PR after this PRD is approved. Measure with session-analyzer:
for sessions touching `sa/` after merge versus before, compare agent
orientation (tool calls before the first edit) and `lead/EOU`, via
`session-analyzer mark area-maps --expect lead/EOU:down`.

## State (updated 2026-10-01, PR #6)
- Completed: all Expected behavior items; PRD + build in one PR.
- Tests run: `bash -n` on both scripts and `bootstrap.sh`; measure.sh
  determinism (`cmp` of two runs), empty dir (rc 0), missing path (rc 2),
  0.02 s on this repo; audit.sh stale/current cases; install.sh link;
  session-analyzer suite 94 passed.
- Remaining: owner review; `session-analyzer mark area-maps` after merge.

## Changes
- 2026-10-01 — created (DRAFT).
- 2026-10-01 — owner approved the recommendations on all three open
  questions: maps are nested `CLAUDE.md`, the skill is `area-maps`, and
  `tests/` gets no map by default (`write` may still be pointed at one).
  Built in the same PR. Added `scripts/audit.sh` and the `## Purpose` map
  marker (so `claude-home/CLAUDE.md`, the global rules file, isn't
  mistaken for a map). SHIPPED (v1).
- 2026-10-01 — archived under the spec lifecycle; current behavior folded into
  `docs/specs/area-maps.md`.
