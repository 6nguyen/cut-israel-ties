---
name: migrate-prds
description: Migrate a repo's existing PRDs (anywhere, no State block, mixed shipped/half-built/abandoned) into the docs/prd + docs/specs lifecycle. Phase `inventory` lists every PRD with a proposed class (shipped/active/partial/unknown/research) and destination, then records the owner-confirmed plan; `move` applies it in a history-keeping, moves-only PR with every link rewritten; `fold` turns each capability group of shipped PRDs into one docs/specs file and archives them; `split` folds a half-built PRD's shipped part and turns the rest into a change PRD. Use after `adopt`, or when asked to migrate, inventory or clean up old PRDs.
argument-hint: inventory [path] | move | fold | split
---

# migrate-prds

`$ARGUMENTS` → `PHASE [PATH]`. No phase: `inventory`. Scripts are in this
skill's `scripts/` directory and do all detection, evidence and
classification; never classify or count yourself. The model only writes
specs (fold/split).

## inventory [path]
1. Run `scripts/inventory.sh <path or repo root>` and show its output
   verbatim. It is read-only; same repo state gives byte-identical output.
   It works without State: status line, State/Sections/Spec delta flags,
   last commit, and branches + PRs whose name contains the file's kebab
   basename. Without a working `gh` it says so once and uses branches only.
2. Classes: `shipped` → archived after its fold (phase 3), or at move
   when its status is `FOLDED`/`SUPERSEDED` (a pointer); `active` /
   `partial` → `docs/prd/`; `research` (`docs/prd/research-*.md`) →
   `docs/research/<topic>.md`, the topic without `research-` or a leading
   `YYYY-MM-`; `unknown` → stays put, never moved or folded without an
   owner decision. The owner may reclass an `unknown` row (a study, memo or
   design proposal) as `research` with a `docs/research/` destination, and
   must name every `docs/research/?.md` destination before move. The owner
   may also add `research` rows for files the inventory does not list (a
   study without a status line); a multi-file study goes to
   `docs/research/<topic>/<file>.md` and gets one index row. "name kept: open PR/branch" rows keep their
   basename so the open work still finds its file.
   Doc rows (`doc:<kind>`, after the PRD rows) cover every other tracked
   doc, placed by `docs/README.md`: skill, record, map, impl-plan, plan,
   reference, research, howto, unknown. `reference` and mixed `unknown`
   rows propose `fold` (by section, phase 3), plans with open items
   `split`, impl-plans `merge <prd>`. Evidence shows size and code
   citations, so ask about the big, cited ones first. The owner names
   every `?/CLAUDE.md` map directory before move.
3. Ask the owner once (one AskUserQuestion, or free text) for edits to
   classes and destinations. Never reclassify on your own.
4. On confirmation: `git switch -c chore/migrate-prds-move` off an
   up-to-date default branch, `scripts/inventory.sh --plan > docs/prd/migration-plan.md`,
   apply the owner's edits to its rows only, commit
   "Add PRD migration plan" and push. Later phases read this file; the last
   one deletes it. If the owner confirms nothing, write nothing.

## move
1. Needs the committed plan (`docs/prd/migration-plan.md`) on
   `chore/migrate-prds-move`; no plan → run `inventory` first.
2. Run `scripts/move.sh -n` and show its output (moves, unknown rows,
   rewrites, warnings, broken links, index rows). Then `scripts/move.sh`.
   It makes up to four commits: moves only (pure renames), link rewrites,
   PRD index rows, research index rows. Doc rows add a guides README
   commit on the first `docs/guides/` move and one commit per moved map
   (`## Purpose`, the `## Area maps` line, its `measure` row; a
   placeholder purpose or `map-over-cap` warning goes in the PR body),
   and a last commit regenerates a stale `docs/FEATURES.md`.
   `fold`, `split`, `merge` and record/reference doc rows stay for later. Never edit a moved file in the
   moves commit. Then add the research header (`docs/research/README.md`)
   to each moved research file in a separate commit.
3. Show the warnings and `broken:` lines verbatim (a broken line is a link
   that was already broken before the move; fix it only if the owner asks). Each is an old path the script didn't change
   (URLs, computed paths, a renamed basename); list them in the PR body for
   the owner. Don't fix them by hand in this PR unless the owner asks.
4. Fill the new index rows' "Owner surfaces" only if the owner gives them;
   `—` is fine.
5. Push and open the PR ("Move PRDs into docs/prd"), body: counts of moved
   / rewritten / unknown, the warnings, and "review with `git log --follow`".
6. Moving a file by hand outside this phase: `git mv`, then
   `scripts/relink.sh <old> <new> [<old> <new>…]` from the repo (same
   rewrite and report; exit 1 when a link was already broken).

## fold
1. Needs the plan on the default branch (move PR merged). Run
   `scripts/fold.sh groups`: shipped PRDs not yet archived, oldest first,
   with their recorded group. Propose capability groups (several PRDs may
   describe one capability; kebab names, not clashing with an existing
   `docs/specs/<cap>.md` unless that spec is the one to MODIFY) and ask the
   owner once. Record them all with
   `scripts/fold.sh groups --write 'cap: path, path' ...`. Best done on the
   move branch before it merges; otherwise commit "Record capability
   groups" as the first commit of the first group's PR and fold the other
   groups after it merges.
2. Per group, one PR on `docs/migrate-prds-<cap>` off the up-to-date
   default branch. Many groups share the spec and PRD indexes and
   `docs/FEATURES.md`, so separate PRs conflict as they merge: bundle
   groups, their splits and their reference-doc sections by topic on one
   `docs/migrate-prds-<topic>` branch instead (archive and split accept
   it). Topics share those indexes too: keep one topic PR open at a time
   and cut the next topic branch after it merges. Topics already open
   together → merge them into one `docs/migrate-prds-bundle` branch (one
   merge commit per topic, index rows resolved to the files on disk,
   `features.sh` rerun), open one PR, close the originals as superseded.
   For each PRD in the group, oldest first, run
   `scripts/fold.sh claims <prd>` and write `docs/specs/<cap>.md` (template
   in `docs/specs/README.md`): the first PRD ADDS the spec, each later one
   MODIFIES it. Take Expected behavior with that PRD's own Changes log
   applied; drop rounds, research, status and history. An impl plan whose
   row reads `merge <stem>` is read with its PRD (`groups` counts it) for
   contracts the PRD lacks; `archive` moves it beside the PRD.
3. Evidence per claim (`claims` greps tests and code, not markdown):
   `evidence` → write it; `none` / `no-anchor` → grep the code yourself
   for it once; still nothing → keep the text with `(unverified)`. A claim
   the code contradicts is not written; list it in the PR body with the
   file:line. No test runs.
4. Commit the spec ("Add <cap> spec from migrated PRDs"), then
   `scripts/fold.sh archive -n <cap>` and `scripts/fold.sh archive <cap>`.
   A moves-only commit (`git mv` to the plan's archive destination), then
   one with Status `SHIPPED <last commit> (migrated)`, links rewritten, the PRD index row dropped,
   the spec index row added (fill its "Owner surfaces" if known), and the
   plan deleted when no shipped or partial PRD is left outside the archive.
   Show warnings verbatim in the PR body. Every `fold.sh` commit
   regenerates `docs/FEATURES.md` when it exists; run
   `~/.claude/skills/implement-prd-section/scripts/features.sh` yourself
   before committing a spec or change PRD.
5. Push and open the PR ("Fold <cap> PRDs into docs/specs"), body: PRDs
   folded, `(unverified)` count, contradicted claims, warnings.
6. Groups touch separate spec files, so with the groups recorded on the
   default branch they may run as parallel agents (global spawn rules), one
   group each.
7. Reference docs (doc rows with destination `fold`, e.g. a contracts
   doc): with the groups, run `scripts/fold.sh sections <doc>`, propose a
   target per `##` section (capability stem; `drop` for history, build
   plans and superseded versions; `claude-md` for agent rules, which go to
   root `## Hard gotchas`; `map:<dir>`; `prd:<name>`), ask the owner once,
   and record them with `scripts/fold.sh sections --write <doc>
   '<heading>: <target>' ...`. In each capability's PR, fold its sections
   with its PRDs so the spec is written once: `scripts/fold.sh extract
   <doc> <heading>`, paste code blocks and tables unchanged into
   `## Data & contracts`, write Purpose/Behavior/Invariants yourself.
   The PR that folds a doc's last section runs `scripts/relink.sh
   --sections <doc>` (list its `unresolved:` lines in the PR body; fix
   only the ones the owner names), commits "Retarget <doc> citations", then
   `scripts/fold.sh archive-doc <doc>`.

### Master list
A hand-written master list (a file whose `###` headings carry `SHIPPED`,
`PINNED` or `PLANNED`, like a `docs/PRD.md`) is replaced by the generated
`docs/FEATURES.md`. Do it in the fold phase, one PR on
`docs/migrate-prds-master-list` (or in the last migration PR), after the
groups it feeds are folded:
1. Product-level sections (vision, glossary, users, non-goals, key
   artifacts) fold into `docs/specs/product.md` (ADDED, or MODIFIED).
2. Each SHIPPED or PINNED heading folds into its capability's spec, one
   group per capability as in fold step 1 (claims and evidence as in
   steps 2-3).
3. A PINNED heading's queued follow-up and every PLANNED item become
   `## Next` rows in `docs/prd/README.md`, in the old order, Targets the
   spec stem or `new`. Past 10 rows, ask the owner to drop items or turn
   them into PRDs. Long design notes move to `docs/research/` with the
   header.
4. Archive the file (`git mv` to `docs/prd/archive/<YYYY-MM>-<name>.md` in
   a moves-only commit), Status `SUPERSEDED by docs/FEATURES.md`, links
   rewritten with `scripts/relink.sh <old> <archive path>` (relink takes a
   move, never the spec: given `product.md` it rewrites that file's own
   links as if it had moved), then point live citations of folded content
   (code, `CLAUDE.md`, open PRDs) at the spec, e.g. the glossary at
   `docs/specs/product.md`, and run `features.sh`. The commit
   body holds the mapping table (old heading → FEATURES row, spec or
   `product.md`); done when every old heading maps to one.

## split
1. Run `scripts/fold.sh splits`: partial PRDs not yet split. For each, read
   the PRD and its `fold.sh claims`, propose which numbered behaviors
   shipped and the capability (an existing spec to MODIFY, or a new one),
   and ask the owner once for all of them. A PRD whose items all shipped
   (a stale status line) or none did is not a split: record it with
   `scripts/fold.sh reclass <prd> shipped|active`, then fold it with its
   group, or leave it as a change PRD with a `## Spec delta`. Record each
   split with
   `scripts/fold.sh splits --write <prd> <cap> '<shipped items>' [<new prd>]`
   (new path only if the owner wants a new name). Commit "Record split
   points" on the move branch, or in the first split PR (then split the
   rest after it merges).
2. Per PRD, one PR on `docs/migrate-prds-split-<name>` (or its topic
   bundle). Fold the shipped
   items into `docs/specs/<cap>.md` exactly as in `fold` steps 2-3; commit
   it.
3. `scripts/fold.sh split -n <prd>`, then `scripts/fold.sh split <prd>`:
   the original is archived `SUPERSEDED by <new prd>` (two commits).
4. Write the change PRD at the printed path from the `docs/prd/README.md`
   template: Problem/Expected behavior for the unbuilt items only, a
   `## Spec delta` against `docs/specs/<cap>.md` (or the spec split from it
   that owns the rest), the original's status
   (DRAFT stays DRAFT, so does one with a `[blocking]` open question;
   otherwise APPROVED), and a `## State` block whose
   `Sections:` list holds the remaining items, all `[ ]`. Then
   `scripts/fold.sh split --check <prd>`; fix every `error:` line it prints
   and re-run until it commits.
   Then repoint the `cite: <file>` lines `split` printed: a citation of
   shipped behavior names `docs/specs/<cap>.md` (§ where it helps), one of
   the unbuilt rest keeps the PRD path, a historical record (results,
   research) names the archived file. Commit "Point <name> citations at
   specs".
5. Push and open the PR ("Split <name> into spec + change PRD"), body:
   shipped items, `(unverified)` count, contradicted claims, the remaining
   sections. The last fold/split PR deletes the plan (`plan: removed`).

## Rules
- One phase = one PR in the target repo (inventory's plan rides on the move
  branch).
- Never move, rename or edit a PRD during inventory.
- `unknown` rows are never moved, folded or edited without an owner
  decision recorded in the plan.
- Docs-only: no test runs in the target repo.
