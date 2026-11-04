# PRD migration

## Purpose
`/migrate-prds` moves a repo's existing PRDs and docs, wherever they live
and whatever state they're in, into the `docs/prd/` + `docs/specs/`
lifecycle (`prd-lifecycle.md`): inventory, then a history-keeping move.
Folding shipped PRDs and reference docs into specs, and splitting
half-built ones, is `prd-fold.md`. Scripts detect, gather evidence,
classify and move. It stops short of writing PRDs or specs for
undocumented features, creating State for active PRDs (that's
`/implement-prd-section`'s bootstrap) and non-markdown docs.

## Behavior
1. **Inventory** (`/migrate-prds inventory [path]`,
   `scripts/inventory.sh [path]`, read-only).
   - Candidates (`scripts/detect.sh`, `prd_candidates`): `*.md` files with a
     `Status:` line in the first 5 lines (`*` stripped), `PRD` as a word in
     the title or a `prd` token in the file name, or ≥3 of `## Problem`,
     `## Goals`, `## Expected behavior`, `## Acceptance criteria`, or any
     `*.md` directly in `docs/prd/`. Skipped: `.git`, `node_modules`,
     `build`, `dist`, `vendor`, `ops`, READMEs, `docs/specs/`,
     `docs/research/`, `docs/prd/migration-plan.md`.
     An implementation plan outside `docs/prd/` (a `*-implementation.md`
     name, or a `PRD:` header naming a `docs/prd/` file in the first 5
     lines) is never a candidate, even with a `Status:` line; it stays a
     doc row classed `impl-plan`.
   - Evidence per file, no State needed: status word (the first word of the
     `Status:` line, or the phrase `IN PROGRESS` / `ON HOLD`), which of State /
     `Sections:` / Spec delta exist, last commit date, branches (local and
     remote, excluding the default branch and branches whose tip is on its
     first-parent chain, i.e. never had commits of their own; merged = in
     `--merged <default>`) and PRs (one
     `gh pr list --state all`) whose head or title contains the file's
     kebab basename. A branch that is some PR's head counts once, as the PR.
     A file named only `prd` (e.g. `docs/PRD.md`) gathers no PR or branch
     evidence, since that name matches every PRD-related PR.
     Without a working `gh`: branch evidence only, and one note line.
   - Class, first match: a `docs/prd/research-*.md` file → `research`;
     status `SHIPPED`/`DONE`/`FOLDED`/`SUPERSEDED` →
     `shipped`; status `DRAFT`/`APPROVED`/`BUILDING`/`IN PROGRESS`/
     `ON HOLD`/`PROPOSED`/`SHIPPING` → `partial` if anything merged, or the
     status text (its continuation lines included) says shipped or landed
     (evidence "status says shipped"), and the file has no `Sections:` list
     (one already tracks its own progress),
     else `active`; otherwise merged and nothing open → `shipped`, both →
     `partial`, open only → `active`, nothing → `unknown`.
   - Destination: `research` → `docs/research/<topic>.md`, the topic being
     the basename without `research-` and a leading `YYYY-MM-`
     (`research-2026-09-cardio.md` → `cardio.md`); no topic left →
     `docs/research/?.md`, which the owner must name before move.
     `active`/`partial` → `docs/prd/<kebab-name>.md` (a `prd`
     token dropped; files already in `docs/prd/` stay; an open PR or branch
     keeps the basename, "name kept: open PR #n"); `shipped` →
     `docs/prd/archive/YYYY-MM-<kebab-name>.md` by last-commit month (files
     already in the archive stay); `unknown` → stays. Shown as
     `(in place)` when unchanged; a second file aiming at the same
     destination is marked "collides with <path>".
   - Doc rows (every other tracked `*.md`): outside `docs/prd/`,
     `docs/specs/`, `docs/research/`, `docs/guides/`, `.claude/`,
     `.github/`, vendor dirs and the known names (`README.md`, `CLAUDE.md`,
     `AGENTS.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `LICENSE*`,
     `docs/README.md`, `docs/FEATURES.md`), not a PRD candidate; a
     `README.md` elsewhere under `docs/` is listed. Class `doc:<kind>`, first
     rule wins and is printed as evidence: `skill` (frontmatter `name:` +
     `description:`; a `SKILL.md` stands for its whole directory, whose other
     files get no row) → `.claude/skills/<name>/`; `record` (under
     `results/`) → stays; `map` (listed under root `## Area maps`, unless
     named like a reference, or `*-map.md` / `*-primer.md`) →
     `<dir>/CLAUDE.md`, `<dir>` the most-cited backticked top-level
     directory (`?` if none); `impl-plan` (`PRD: docs/prd/<x>.md` header or
     `*-implementation.md`) → `merge <x>`, or
     `docs/prd/archive/YYYY-MM-<x>-plan.md` beside an archived `<x>`;
     `plan` (`*-plan.md`, `*-roadmap.md`, under `plans/`, or a
     PLANNED/DRAFT/IN PROGRESS/PROPOSED status in the first 15 lines) →
     `split` with unchecked items, else archived by last-commit month;
     `reference` (`*contract*`, `architecture.md`, `methodology.md`, or
     "binding" / "design of record" / "do not deviate" in the first 15
     lines) → `fold`; `research` as a decision log (`decisions.md`,
     `decision-log.md`, `*-decisions.md`, a `# Decision Log` / `# Decisions`
     / `# ADR` title, or under `adr/` / `decisions/`, kept whole), or by
     `## Sources`, a `Researched:` date line, or under `*-market/` /
     `*-rounds/` → `docs/research/<topic>.md`, a study folder keeping its
     path below that folder; `howto` (`*-setup.md`,
     `RELEASE.md`, a `README.md` under `docs/`, named by its directory) →
     `docs/guides/<name>.md`; else `unknown` → stays.
   - Doc evidence also holds lines, ~tokens (bytes / 4) and code citations
     (`cited <files> files/<n> §`: non-markdown files naming the basename,
     or `<dir>/<basename>` when two docs share it, and lines where `§`
     follows it), from one `git grep`. Over 4k tokens or `##` headings of
     different kinds (plan, reference, research, howto keywords) adds
     `mixed: …`; a mixed `unknown` row proposes `fold`. Other kinds keep
     their destination (a long study is not mixed content).
   - Output: header with PRD candidate count and default branch, one table
     row per file (path · status · State/Delta · last commit · evidence ·
     class · destination), PRD rows sorted by path then doc rows sorted by
     path, then `Counts:` per PRD class and `Docs:` per kind plus `mixed`. Same repo state
     → byte-identical output, from any directory in the repo. Not a git
     repo → exit 2.
   - The owner edits classes and destinations once (an `unknown` row may
     become `research` with a `docs/research/` destination, and the owner
     may add a `research` row for a file the inventory does not list, such
     as a study without a status line; these are the only ways a file
     outside `docs/prd/` becomes research); the skill then writes
     `inventory.sh --plan` (the same rows, no counts) with those edits to
     `docs/prd/migration-plan.md` and commits it on
     `chore/migrate-prds-move`. No confirmation → nothing written.
2. **Move** (`/migrate-prds move`, `scripts/move.sh [-n] [path]`).
   - Needs a clean worktree and `docs/prd/migration-plan.md`; runs on
     `chore/migrate-prds-move` (created from HEAD if absent; exists but not
     checked out → refused). `-n` prints the same report and changes
     nothing.
   - Moves `active`/`partial` rows to their destination and `shipped` rows
     to `docs/prd/<name>.md` (the archive name without `YYYY-MM-`) until
     their fold, except a `FOLDED`/`SUPERSEDED` pointer, whose content
     lives in another PRD: it goes straight to its `docs/prd/archive/`
     destination, status unchanged, and fold never lists it; and `research` rows to their `docs/research/` destination
     (refused before anything moves when one is outside `docs/research/`
     or is still `?.md`). `unknown`, `(in place)` and files already in `docs/prd/` or
     `docs/prd/archive/` don't move; unknown rows are listed.
   - Doc rows: `doc:research` moves like `research`; `doc:howto`,
     `doc:map` and `doc:plan`/`doc:impl-plan` bound for
     `docs/prd/archive/` move to their destination; a `doc:skill` row
     whose destination ends in `/` moves every tracked file of its
     directory. `fold`, `split` and `merge <x>` destinations,
     `doc:record`, `doc:reference`, `doc:unknown` (listed like unknown)
     and a map whose `<dir>/CLAUDE.md` exists (printed) don't move. A plan
     row with another destination, or a map still at `?/CLAUDE.md`, is
     refused before anything moves. A taken or
     duplicate destination, or a missing source, is refused before anything
     moves; a row already moved is reported and skipped, so a re-run is a
     no-op.
   - Commit 1, "Move PRDs into docs/prd (moves only)" ("Move PRDs and
     docs into place (moves only)" when a doc row moved): one `git mv` per
     file, no content change, so `git log --follow` keeps full history.
     A source folder left empty on disk is removed.
   - Commit 2, "Rewrite links to moved PRDs": across tracked text files
     (not the plan), markdown links and reference definitions are resolved
     from each file's old location; when the target or the linking file
     moved, the link is recomputed (relative stays relative, `/`-rooted
     stays rooted, `#anchors` kept, spaces as `%20`). URLs, anchors,
     links inside fenced code and links to paths that don't exist are left
     alone; a link in a moved file that didn't resolve before the move is
     printed as `broken: <file>:<line>: <link>`. Plain repo-relative
     mentions of an old path (not inside a longer path) are replaced. One
     `rewrote <file> (<n>)` line per file.
   - Warnings, never changed: an old path still in a file after the
     rewrite (URLs, longer paths, computed paths) and a renamed file's old
     basename when no other tracked file shares it (a moved `README.md` is
     not warned), as `warning: <file>:<line>: <ref>`.
   - Commit 3, "Index migrated PRDs in docs/prd/README.md": one
     `| [name](file) | <status> | — |` row per `active`/`partial` PRD not
     already indexed, appended to the `## Index` table (a `(none…)`
     placeholder row is removed); an archived pointer's row is dropped.
     No README or no `## Index` → warning.
   - Commit 4, "Index moved research in docs/research/README.md": one
     `| [topic](topic.md) | — | — | — |` row per research row, same rules;
     files moved into a `docs/research/<topic>/` study folder share one
     `| [topic](topic/) | — | — | — |` row.
     A re-run adds no rows (already-moved files are indexed at their new
     path).
   - Commit 5, "Add docs/guides/README.md": on the first move into
     `docs/guides/` when that README is absent (one task per file,
     numbered steps, builds never read it).
   - Commit 6, one per moved map, "Make <dir>/CLAUDE.md the <dir> area
     map": `## Purpose` inserted after the title when missing; the root
     `## Area maps` `- ` line naming the map becomes
     ``- <dir>: `<dir>/CLAUDE.md` — <purpose>`` (appended, replacing
     `- (none yet)`, when no `- ` line names it; a prose line naming it
     keeps its text with the path rewritten). The purpose is that line's
     description, else the map's first prose sentence, else a placeholder
     with a warning. Then `measure.sh`'s row for `<dir>` is printed as
     `measure …`; a map over ~4k tokens prints `warning: map-over-cap`.
   - Commit 7, "Regenerate docs/FEATURES.md": when `docs/FEATURES.md`
     exists and the moves left it stale (`regen   docs/FEATURES.md`).
   - Manual moves: after `git mv`, `scripts/relink.sh <old> <new> [<old>
     <new>…]` runs the commit-2 rewrite and report without committing;
     exit 1 when a `broken:` line was printed, 2 on usage errors.


## Data & contracts
- `claude-home/skills/migrate-prds/`: `SKILL.md`, `scripts/detect.sh`
  (sourceable; `prd_candidates [root]`), `scripts/inventory.sh`
  (`[--plan] [path]`), `scripts/move.sh` (`[-n] [path]`), `scripts/relink.sh`
  (`<old> <new> [<old> <new>…]`, or `--sections <doc>`, see
  `prd-fold.md`), `scripts/relink.py` (reference rewriter shared by move
  and fold), `tests/migrate_test.sh`. Fold and split scripts:
  `prd-fold.md`.
- `docs/prd/migration-plan.md` (target repos, temporary): `# Migration
  plan`, `## Files` (the confirmed table), `## Capability groups`,
  `## Split points` (and `## Sections`, `prd-fold.md`). No `Status:` line,
  so it is never a candidate.
  `## Files` classes are the PRD classes plus `doc:<kind>`; destinations
  add `fold`, `split` and `merge <x>` for doc rows. The table stays 7
  columns (doc lines, tokens and citations ride in Evidence).
- quiet-check target `migrate-prds` (template-only; bootstrap and adopt
  strip it), also run by the template-only CI step.
- Dependencies: bash 3.2+, git, python3; `gh` optional.

## Invariants (regression checklist)
- [ ] Inventory writes nothing; two runs give byte-identical output.
- [ ] READMEs, specs, the plan file, vendor dirs and non-PRD markdown are
      not candidates.
- [ ] Without `gh` the inventory runs on branch evidence and says so once.
- [ ] Every tracked non-PRD doc outside the placed folders and known names
      is one `doc:<kind>` row with its rule as evidence; files inside a
      skill directory are covered by its `SKILL.md` row.
- [ ] A file with an open PR or branch keeps its basename.
- [ ] `unknown` files have destination `(in place)` and are never moved.
- [ ] The moves commit is pure renames; `git log --follow` shows each moved
      file's full history.
- [ ] After a move no tracked file except the plan references an old path,
      other than lines listed as warnings.
- [ ] A file with an open PR keeps its basename after the move.
- [ ] Move re-run on the same plan changes nothing.
- [ ] Doc moves keep `git log --follow`; fold, split, merge, record,
      reference and unknown doc rows stay; each moved map has
      `## Purpose` and exactly one `## Area maps` line.
- [ ] `docs/prd/research-*.md` is classed `research` with a dated prefix
      stripped; `?.md` and non-`docs/research/` destinations are refused.
- [ ] Links in fenced code are untouched; already-broken links in a moved
      file are reported, not changed.

## Performance budget
- Inventory of 100 PRDs < 2 s excluding `gh` (measured 0.98 s).
- `relink.sh` < 1 s per move (measured 0.85 s on hypertrophy-goals).
- Inventory of PRDs and docs on hypertrophy-goals < 3 s (measured 0.38 s
  without `gh`, 2.1 s with it; last-commit dates come from one `git log`).
