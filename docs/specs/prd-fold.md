# PRD fold

## Purpose
After `/migrate-prds move` (`prd-migration.md`), `fold` turns each
capability group of shipped PRDs, and each reference doc section by
section, into one `docs/specs/<cap>.md` and archives the originals;
`split` folds a half-built PRD's shipped part and turns the rest into a
change PRD. Scripts gather claims, evidence and citations and do every
move and rewrite; the model only writes the specs and the change PRD.

## Behavior
1. **Fold** (`/migrate-prds fold`, `scripts/fold.sh`), one PR per
   capability group on `docs/migrate-prds-<cap>`, or one per topic on a
   `docs/migrate-prds-<topic>` branch bundling several groups and splits
   (archive and split accept any `docs/migrate-prds-*` branch). One topic
   PR is open at a time, because topics share the spec and PRD indexes and
   `docs/FEATURES.md`; topics already open together are merged into one
   `docs/migrate-prds-bundle` branch (a merge commit per topic, index rows
   matching the files on disk) and the originals closed as superseded.
   - `fold.sh groups`: shipped PRDs not yet archived (current path after
     the move), oldest first by first commit: path · title · created ·
     last commit (from the plan) · group; then one `group <cap>: <n> PRDs[
     (+<k> impl plans)], pending|done` line per group and `Ungrouped: <n>`.
     An impl plan counts with a group when its plan row's destination is
     `merge <stem>` for one of the group's PRDs.
   - `fold.sh groups --write 'cap: path, path' ...` records owner-confirmed
     groups as `- <cap>: <paths oldest first>` lines under the plan's
     `## Capability groups` (placeholder removed, same cap replaced). A
     kebab name is required; a path that isn't a shipped plan row, or is
     already in another group, is refused (exit 2).
   - `fold.sh claims <prd>`: list items under `## Expected behavior`,
     `## Behavior`, `## Requirements`, `## Acceptance criteria` and
     `## Invariants` (continuation lines joined), each with its line and
     `evidence <file>:<line> <token>` (a backticked token found by one
     `git grep` over tracked non-markdown files), `none` (tokens, no hit) or
     `no-anchor` (no backticks), under a count line.
   - The model writes `docs/specs/<cap>.md` from the group, oldest PRD
     first (ADDED, then MODIFIED), with each PRD's Changes applied (and the
     contracts of its merged impl plans) and no
     history; unconfirmed claims carry `(unverified)`, contradicted ones go
     to the PR body, not the spec; the spec is committed before archiving.
   - `fold.sh archive [-n] <cap>`: needs a clean worktree, a
     `docs/migrate-prds-*` branch, the recorded group and
     `docs/specs/<cap>.md` (else exit 2; `-n` checks only the group and
     spec, and changes nothing). Two commits: "Move <n> PRDs to
     docs/prd/archive/ (moves only)" (pure renames, so `git log --follow`
     survives even for a small PRD), then "Archive PRDs folded into
     docs/specs/<cap>.md": each pending PRD gets `Status: SHIPPED <plan
     last-commit date> (migrated)` (replacing a status line in the first 5
     lines, else inserted after the title) at its plan archive
     destination, references to it are rewritten as in the move
     (warnings the same), its `docs/prd/README.md` index rows are dropped
     (`unindex` lines) and `| [<cap>](<cap>.md) | <spec title> | — |` is
     added to the `docs/specs/README.md` index if missing (placeholder
     replaced; no README or `## Index` → warning). When no shipped row is
     pending and every partial row is split, the plan is deleted in the
     second commit (`plan: removed (migration complete)`,
     else `plan: kept (<n> shipped, <m> partial left)`). A taken archive
     destination is refused; an archived PRD is reported and skipped, so a
     re-run is a no-op. The group's merged impl plans that still exist move
     in the same moves commit to `docs/prd/archive/<plan last-commit
     YYYY-MM>-<name>.md` with `Status: MERGED <date> into <archived prd>`,
     and references to them are rewritten; until they move, the plan line
     counts them as docs left.
   - Reference docs (doc rows with destination `fold`) fold by `##`
     section, each section in its capability's fold PR:
     `fold.sh sections <doc>` (read-only) prints
     `Sections in <doc>: <n> (~<t> tokens; <c> citations: <a> anchored,
     <b> bare, <u> unresolved)`, then `| L<a>-<b> | ~<t> | <cited> |
     <heading> | <target> |` per `##` heading (recorded target, else a
     `(proposed)` one: `drop` for history/changelog/plan/roadmap words,
     `claude-md` for ownership/conventions/rules, a recorded group whose
     name shares a word, else the heading's kebab stem), then
     `unresolved: <file>:<line>: <citation>` lines. A citation is the doc's
     path, a path suffix or its unique basename, optionally closed by
     `` ` `` or `)`, then `§<ref>` or `§"<ref>"`; the ref resolves by its
     longest word prefix naming exactly one `##` heading (a `###` counts
     under its parent), ignoring case and backticks. Fenced code in
     markdown and `docs/prd/archive/` are not scanned.
   - `fold.sh sections --write <doc> '<heading>: <target>' …` records
     `| <doc> | <heading> | <target> |` rows under `## Sections` in the
     plan; targets are a capability stem, `drop`, `claude-md`,
     `map:<dir>` or `prd:<name>`; a heading prefix names its `##`
     heading; every `##` heading must end up mapped or nothing is written.
     `fold.sh extract <doc> <heading>` prints that section verbatim (its
     code blocks and tables go unchanged into the spec's
     `## Data & contracts`).
   - `relink.sh --sections <doc>` rewrites each anchored citation to its
     target: `docs/specs/<cap>.md` (no `§`: the model picks the section the
     text lands in), `CLAUDE.md §Hard gotchas`, `<dir>/CLAUDE.md` or
     `docs/prd/<name>.md`; a bare mention becomes the spec that received
     most of the doc's sections (ties: first in doc order), or
     `docs/specs/README.md` when none did (link targets stay relative). A
     `<doc>:<line>` quote is never retargeted (archive-doc points it at the
     archive). In a doc with numbered headings (`## 3. Tokens`), `§1.3`,
     `§4-6` and `plan|part|phase|section N [§…]` resolve by the leading
     number and are consumed whole; a chain over two sections (`§1.3,
     §2.6`) is unresolved. A citation in a markdown heading is never
     rewritten (the heading is a `## Sections` key and an anchor); it is
     printed `unresolved: …` with `(heading)` appended. Citations
     of a dropped or unmapped section, or that don't resolve, are printed
     `unresolved: …` (`(dropped)` appended) and left; exit 1 then.
   - `fold.sh archive-doc [-n] <doc>` on a clean `docs/migrate-prds-<cap>`
     branch: refused while a section is unmapped, a target file is missing,
     or a resolvable citation of a kept section remains. Else a moves-only
     commit to `docs/prd/archive/<last-commit YYYY-MM>-<name>.md`, then one
     with `Status: FOLDED <today> into <target files>` (or `(all sections
     dropped)`), leftover references rewritten to the archive path, and the
     plan deleted when nothing shipped, partial or left to fold remains
     (`plan: kept (<n> shipped, <m> partial, <d> docs left)`).
   - Every `fold.sh` commit (archive, archive-doc, split, split `--check`)
     first runs `features.sh` when `docs/FEATURES.md` exists, so the commit
     carries the regenerated list.
   - Master list (a file whose `###` headings carry `SHIPPED`, `PINNED`
     or `PLANNED`): one PR on `docs/migrate-prds-master-list` after its
     groups fold. Product-level sections fold into
     `docs/specs/product.md`; SHIPPED/PINNED headings into their
     capability specs; queued follow-ups and PLANNED items become
     `## Next` rows in the old order (past 10 → the owner drops or writes
     PRDs); design notes move to `docs/research/`. The file is archived
     `SUPERSEDED by docs/FEATURES.md` (moves-only commit first) with an
     old heading → row/spec mapping table in the commit body, complete
     when every heading maps. Links are relinked to the archive path;
     live citations of folded content then name the spec.


2. **Split** (`/migrate-prds split`, `fold.sh splits|split`), one PR per
   partial PRD on `docs/migrate-prds-split-<name>`, or bundled in a topic
   branch as in fold.
   - `fold.sh splits`: partial PRDs whose original isn't archived yet
     (path · title · last commit · recorded split point), then one
     `split done: <path>` line per split one.
   - `fold.sh splits --write <prd> <cap> <shipped items> [<new prd>]`
     records the owner's split point under `## Split points` as
     `- <prd>: <cap> · shipped: <items> · rest: <new prd>` (default: the
     same path; placeholder removed, same PRD replaced). Refused (exit 2):
     not a partial plan row, a non-kebab cap, no items, a new path outside
     `docs/prd/` or already taken.
   - `fold.sh reclass <prd> shipped|active`: a partial row whose items all
     shipped, or none did, gets that class in the plan. `shipped` sets the
     Destination to `docs/prd/archive/<last-commit YYYY-MM>-<name>.md`, so
     `groups --write` and fold take it; `active` sets its current path and
     the migration leaves it. Either appends ` — reclassed from partial`
     and drops its split point. Refused (exit 2, plan unchanged): not a
     partial row, already split, or another class.
   - The model folds the shipped items into `docs/specs/<cap>.md` as in
     fold (ADDED or MODIFIED, `(unverified)` and contradiction rules
     alike) and commits it.
   - `fold.sh split [-n] <prd>`: needs the split point and the spec (else
     exit 2), and unless `-n` the branch and a clean worktree. A
     moves-only commit `git mv`s the original to
     `docs/prd/archive/<plan last-commit YYYY-MM>-<name>.md`; then
     "Archive <name>.md as superseded by <new prd>" sets `Status:
     SUPERSEDED by <new prd>`, re-resolves only the archived file's own
     relative links (references to the PRD's path keep pointing there, at
     the change PRD to come) and adds the spec's index row. Prints one
     `cite: <file> (<n>)` per file citing the PRD's path (links and plain
     mentions; not the archive, the plan, the PRD index or `FEATURES.md`)
     and `next: write <new prd> …`, which then says to repoint the cites
     about shipped behavior to the spec. Archived already → reported,
     no-op.
   - The model writes the change PRD (`docs/prd/README.md` template) for
     the rest: a `## Spec delta` against the spec and a `## State` block
     whose `Sections:` list holds the remaining items, all `[ ]`.
   - `fold.sh split --check <prd>`: on the branch, after `split`, with the
     change PRD as the only uncommitted file; errors (exit 2, nothing
     committed) for a missing file, no `## Spec delta` or one naming
     neither `<cap>.md` nor an existing or ADDED `docs/specs/*.md` (a
     capability split by size folds into the spec that owns the rest), no `## State` with a `Sections:` list, no items or any item
     not `[ ]`, no `Status:` line. Then sets the `docs/prd/README.md` row
     to the change PRD's status (added if missing); a renamed rest drops
     the original's row and rewrites references to the original path to
     the new one. The plan is deleted when nothing is left (same rule as
     fold), and one commit "Add <name>.md change PRD for the unbuilt part"
     holds it all.
   - After the last fold/split, a fresh inventory shows no `shipped` or
     `partial` file outside `docs/prd/archive/`.

## Data & contracts
- `claude-home/skills/migrate-prds/scripts/fold.sh` (run from the repo):
  `groups [--write …] | claims <prd> | archive [-n] <cap> | splits
  [--write …] | split [-n|--check] <prd> | reclass <prd> shipped|active |
  sections [--write] <doc> … |
  extract <doc> <heading> | archive-doc [-n] <doc>`;
  `scripts/sections.py` (doc sections and citations, shared by fold and
  `relink.sh --sections <doc>`); `scripts/relink.py` for archive rewrites.
- `docs/prd/migration-plan.md` tables fold and split read and write:
  Groups: `- <cap>: <path>, <path>` lines (current paths, oldest first).
  Sections: `| Doc | Heading | Target |` rows, one per `##` heading of
  each folded reference doc.
  Split points: `- <prd>: <cap> · shipped: <items> · rest: <new prd>`.
- Covered by quiet-check target `migrate-prds` (template-only).

## Invariants (regression checklist)
- [ ] Fold: each group yields one spec with an index row; its PRDs are in
      `docs/prd/archive/` with `Status: SHIPPED <date> (migrated)`, full
      `git log --follow` history, no index row and no links left to their
      old path; archive re-run changes nothing.
- [ ] Claims without evidence carry `(unverified)`; contradicted claims are
      in the PR body, not the spec.
- [ ] Split: the original is archived `SUPERSEDED by <new prd>` with full
      history; the change PRD has a Spec delta naming the spec and a
      `Sections:` list of `[ ]` items; `--check` commits nothing on error.
- [ ] Section fold: after `sections --write`, the specs and
      `relink.sh --sections`, no `<doc> §` citation of a kept section
      remains outside the archive; the doc is archived `FOLDED` with full
      `git log --follow` history.
- [ ] The last fold or split deletes the plan; a fresh inventory then shows
      no shipped/partial file outside `archive/`.


## Performance budget
No test runs in the target repo; `relink.sh --sections` < 1 s per doc
(measured 0.23 s on hypertrophy-goals `contracts.md`).
