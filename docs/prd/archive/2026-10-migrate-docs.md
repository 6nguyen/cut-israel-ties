# Migrate docs — PRD
Status: SHIPPED 2026-10-02 (PR #55) · Owner: George · Last updated: 2026-10-02

## Problem
`migrate-prds` moves PRDs and research, but adopted repos also carry docs
that fit no template folder: shared contracts, architecture notes, designs
of record, agent primers, roadmaps, implementation plans, how-tos and
tool-written records. hypertrophy-goals has about 40 of them under `docs/`.
`docs/contracts.md` alone is ~22.5k tokens (5.6 times the 4k spec cap) and
34 code files cite it, 23 of them by section (`docs/contracts.md §Cardio`).
Its root `CLAUDE.md` lists three `docs/*.md` files under `## Area maps`
that Claude Code never loads, because they are not `<dir>/CLAUDE.md`
files. Inventory sees none of these docs (no status line), so today the
owner adds rows by hand, and nothing stops new loose docs after migration.

## Goals / Non-goals
- Goals: one placement rule for every doc kind; inventory classifies docs
  deterministically in the same owner confirmation as PRDs; move handles
  plain renames (research, how-tos, skills, maps, finished plans); fold
  splits a large reference doc by section into capability specs and
  rewrites section citations in code; a lint that keeps docs placed once
  migration ends.
- Non-goals: rewriting doc prose beyond spec Purpose/Behavior; link
  checking of external URLs; a `docs/adr/`, `docs/architecture/`,
  `docs/plans/` or `docs/maps/` folder; tutorials.

## Research (what the best products do → adopt / adapt / reject)
Relies on: [reference-docs](../../research/reference-docs.md).
| Pattern | Seen in | Verdict | Why |
|---|---|---|---|
| Four doc types (reference, explanation, how-to, tutorial) | Diátaxis | adapt | As the classifier, not as folders; reference mirrors the product, so split per capability |
| Living specs + changes + archive with deltas | OpenSpec | adopt | Already the template lifecycle |
| Context, building blocks, deployment, cross-cutting (§3/5/7/8) | arc42 | adapt | One `docs/specs/architecture.md`; reject the 12-section doc |
| System context and containers | C4 | adapt | Levels 1-2 in the architecture spec; reject 3-4 (area maps cover them) |
| Immutable records, superseded status | ADRs | adapt | Archive + research supersede rule; reject `docs/adr/` |
| Per-feature plan and contracts | spec-kit | adapt | Plan → PRD `Sections:`, contracts → spec at fold; reject per-feature folders |
| Subdirectory memory loads on demand | Claude Code memory | adopt | Orientation maps become `<dir>/CLAUDE.md`; reject `@imports` for specs |
| Just-in-time, smallest high-signal context | Anthropic context engineering | adopt | Small capability specs read by name |
| Closest file wins | AGENTS.md | adapt | Same as area maps; optional import |
| Orphan and placement checks in CI | remark-validate-links, lychee | adapt | As an offline bash placement lint |

## Users
The owner migrating an adopted repo (one confirmation per phase); agents
building a section (they load only the spec sections a delta names); agents
proposing a new doc (lint says where it goes).

## Expected behavior

### 1. Placement rule and doc inventory
1. The template ships `docs/README.md`: a ≤25-line "where docs go" table,
   the research file's §2 placement table in short form. Current truth →
   `docs/specs/`; orientation → `<dir>/CLAUDE.md`; work left →
   `docs/prd/`; evidence and settled proposals → `docs/research/`;
   finished plans → `docs/prd/archive/`; agent-run procedures →
   `.claude/skills/`; one-directory how-tos → that directory's
   `README.md`; human how-tos with no owning directory → `docs/guides/`
   (optional, created on first need); tool-written records stay,
   allowlisted. `adopt` copies it (created, or warned when the target has
   its own).
2. `inventory.sh` also lists every tracked `*.md` outside `docs/prd/`,
   `docs/specs/`, `docs/research/`, `docs/guides/`, `.claude/`, `.github/`
   and the known names (`README.md`, `CLAUDE.md`, `AGENTS.md`,
   `CHANGELOG.md`, `CONTRIBUTING.md`, `LICENSE*`) as `doc:<kind>` rows in
   the same table, after the PRD rows. A `README.md` under `docs/` other
   than `docs/README.md` is listed.
3. Kinds, first match wins, the matched rule printed as evidence:
   `skill` (frontmatter with `name:` and `description:`), `record` (under
   `*/results/`), `map` (listed under root `## Area maps`, or named
   `*-map.md` / `*-primer.md`), `impl-plan` (`PRD: docs/prd/<x>.md`
   header or `*-implementation.md`), `plan` (`*-plan.md`, `*-roadmap.md`,
   under `plans/`, or a PLANNED/DRAFT/IN PROGRESS/PROPOSED status),
   `reference` (`*contract*.md`, `architecture.md`, `methodology.md`, or a
   header with "binding", "design of record" or "do not deviate"),
   `research` (a decision log by name, title or `adr/` folder; `## Sources`,
   a research date line, or under `*-market/` / `*-rounds/`), `howto` (`*-setup.md`, `RELEASE.md`, a `README.md` under
   `docs/`), else `unknown`.
4. Extra columns for doc rows: lines, ~tokens (bytes / 4), code citations
   (`files/§-anchored`, from `git grep` in non-markdown files). A file over
   4k tokens or whose `##` headings match different kinds is flagged
   `mixed`. `reference` and `mixed` rows propose `fold`, never a move.
5. Proposed destinations: skill → `.claude/skills/<name>/` (whole dir);
   record → `(in place)`; map → `<dir>/CLAUDE.md`, `<dir>` the most
   frequent backticked top-level path in the file; impl-plan → `merge <x>`,
   or `docs/prd/archive/YYYY-MM-<x>-plan.md` when `<x>` is archived; plan →
   `split` when it has unchecked items, else archive; reference → `fold`;
   research → `docs/research/<name>.md`, a study folder kept whole;
   howto → `docs/guides/<name>.md`; unknown → stays.
6. The owner confirms PRD and doc rows once; `--plan` writes them to the
   same `## Files` table (class `doc:<kind>`). Hand-added rows still work.

### 2. Move doc rows
1. `move.sh` renames `doc:research`, `doc:howto`, `doc:skill` (directory),
   archive-bound `doc:plan` and `doc:impl-plan` rows, and `doc:map` rows in
   the moves-only commit, with the same relink and warnings.
2. A map row whose `<dir>/CLAUDE.md` exists, a `fold`, `split` or
   `merge` destination, and `(in place)` rows are not moved.
3. After the research header commit, one commit per moved map adds
   `## Purpose` when missing, replaces the root `## Area maps` line that
   pointed at the old path with `- <dir>: \`<dir>/CLAUDE.md\` — <purpose>`,
   and prints `measure.sh`'s row for `<dir>` (a `map-over-cap` row is a
   warning in the PR body).
4. The first `docs/guides/` move also adds `docs/guides/README.md` (one
   task per file, numbered steps, builds never read it).

### 3. Section fold for reference docs
1. `fold.sh sections <doc>` (read-only): one line per `##` section with
   line range, ~tokens, anchored citations
   (`git grep -c "<doc> §<heading prefix>"`) and a proposed capability from
   the heading and the recorded fold groups.
2. `fold.sh sections --write <doc> '<heading>: <target>' …` records the
   map under `## Sections` in `migration-plan.md`. Targets: a capability
   stem, `drop` (history, build plans, superseded versions), `claude-md`
   (agent rules → root `## Hard gotchas`), `map:<dir>` or `prd:<name>`.
   Every `##` heading of the doc must be mapped.
3. `fold.sh extract <doc> <heading>` prints the section verbatim. Code
   blocks and tables are pasted unchanged into the spec's
   `## Data & contracts`; the model writes Purpose, Behavior and
   Invariants, and `claims` runs on that prose as in PRD fold.
4. `relink.sh --sections <doc>` rewrites `<doc> §<heading>` citations to
   `docs/specs/<cap>.md §Data & contracts` from the recorded map, bare
   `<doc>` citations to `docs/specs/README.md`, and prints each citation it
   cannot resolve (`unresolved: <file>:<line>`). No redirect stub is left.
5. When every section of a doc is folded or dropped, `fold.sh archive-doc
   <doc>` moves it to `docs/prd/archive/YYYY-MM-<name>.md` with
   `Status: FOLDED into <specs>` (moves-only commit, then the status
   commit). Each capability fold PR folds that capability's PRDs and its
   doc sections together, so each spec is written once.

### 4. doc-lint
1. `doc-lint.sh [repo]` (bash 3.2 + awk, offline) beside `prd-lint.sh`,
   printing `<file>:<line>: <rule>` and a count line; exit 1 on errors.
   Rules:
   1. Placement: every tracked `*.md` is in a folder or name from
      §1.2, or matches a glob in `docs/.doc-allow` (`<glob>  # <reason>`; a
      line without a reason is a violation).
   2. Only `docs/README.md` and `docs/.doc-allow` sit directly in `docs/`.
   3. Each spec other than the README has `## Purpose` as its first `##`
      heading, no `Status:` line, and ≤16,000 bytes.
   4. Every line under root `## Area maps` points at a `<dir>/CLAUDE.md`
      that has `## Purpose`.
   5. The research index and `docs/research/` match one to one (a study
      folder row covers its files). The specs index is prd-lint's rule
      (feature-list §2.2).
   6. Non-markdown files under `docs/` sit in an `assets/` directory or
      are allowlisted.
2. While `docs/prd/migration-plan.md` exists, rules 1, 2 and 6 print
   `warn:` and do not fail; the plan's `unknown` rows are listed once in a
   footer. Deleting the plan makes them errors.
3. Runs wherever prd-lint runs: `/implement-prd-section` and `/handoff`
   before PRD commits, and the prd guard. A `doc-lint` quiet-check target
   runs its tests. This repo lints with 0 violations.

## Data & contracts
- `migration-plan.md` `## Files` rows gain classes `doc:<kind>` and
  destinations `fold`, `split`, `merge <x>`; a new `## Sections` table
  `| Doc | Heading | Target |`.
- `docs/.doc-allow`: one `<glob>  # <reason>` per line.
- New commands: `fold.sh sections [--write]`, `fold.sh extract`,
  `fold.sh archive-doc`, `relink.sh --sections`, `doc-lint.sh`.

## Spec delta
- ADDED `docs/specs/doc-placement.md`: the placement rule (Expected
  behavior 1.1) and doc-lint (Expected behavior 4).
- MODIFIED `docs/specs/prd-migration.md` §Behavior 1 (doc rows, kinds,
  columns), 2 (doc moves, map commit, guides README) and 3 (section fold,
  `relink --sections`, archive-doc); §Data & contracts (plan tables).
- MODIFIED `docs/specs/adopt.md` §Behavior 3 (`docs/README.md` created or
  warned).
- ADDED `docs/specs/prd-fold.md`: `prd-migration.md` §Behavior 3–4 (fold,
  split, section fold) with their data and invariants, moved out so each
  spec stays under doc-lint's 16,000-byte cap.
- MODIFIED `docs/specs/prd-lifecycle.md` §Behavior 4 (doc-lint before
  every commit); `docs/specs/adopt.md` §Behavior 4 (`docs/.doc-allow`
  never copied).

## Acceptance criteria
- [ ] A fixture with one doc of each kind gets the expected kind, evidence
      and destination; a 5k-token doc and a mixed-heading doc are flagged
      `mixed`; same tree → byte-identical inventory.
- [ ] `move.sh` on the fixture moves research, howto, skill dir, map and
      an archived plan with `git log --follow` intact, adds the map
      `## Purpose`, rewrites the Area maps line, and leaves fold rows.
- [ ] `fold.sh sections` on a fixture contracts doc lists anchored
      citation counts; after `--write`, `extract` and
      `relink.sh --sections`, no `<doc> §` citation remains and unmapped
      ones are printed `unresolved:`.
- [ ] doc-lint flags each of the six rules once on a fixture, warns
      instead while a plan exists, and this repo lints with 0 violations.
- [ ] hypertrophy-goals: after rollout §3/§4, doc-lint reports 0
      violations with only `docs/perf/results/**` (and assets) allowlisted.
- [ ] Budget: inventory < 3 s and doc-lint < 1 s on hypertrophy-goals.

## Rollout & metrics
Template first (§1–§4). hypertrophy-goals then runs inventory once for PRDs
and docs inside rollout §3, moves in its move PR, and folds doc sections in
each §4 capability PR. Metric: tokens a build loads for contracts (hg cardio:
~22.5k today, ~0.4k after).

## State (updated 2026-10-02)
- Sections:
  - [~] 1. Placement rule and doc inventory · feat/migrate-docs · PR #55
  - [~] 2. Move doc rows · feat/migrate-docs · PR #55
  - [~] 3. Section fold for reference docs · feat/migrate-docs · PR #55
  - [~] 4. doc-lint · feat/migrate-docs · PR #55
- Branch / open PRs: feat/migrate-docs · PR #55 (all sections bundle here)
- Folded: §1 (doc-placement.md added; prd-migration §Behavior 1 + Data; adopt §Behavior 3); §2 (prd-migration §Behavior 2 + Invariants); §3 (prd-migration §Behavior 3 + Data + Invariants, since moved to prd-fold.md); §4 (doc-placement §Behavior 4–5 + Data + Invariants + budget; prd-lifecycle §Behavior 4; adopt §Behavior 4 + Invariants)
- Remaining: none
- Next action: merge PR #55 (archived with it)
## Open questions
1. Extend `migrate-prds` or add a new skill? Proposal: extend it; docs and
   PRDs share one inventory, one plan, one owner confirmation and one move
   PR, and the fold of a capability writes its spec once.
2. Should an orientation map auto-load as `<dir>/CLAUDE.md` (hg
   `ios-map.md`, ~1.6k tokens per iOS session)? Proposal: yes by default
   (the map proposal in §1.5); the owner can keep a file in place at the
   inventory confirmation.
3. Is `docs/guides/` worth a folder? Proposal: yes, optional; lint knows
   it, `adopt` does not create it.
4. Should `.claude/rules/` with `paths:` replace `## Hard gotchas` for
   cross-area rules? Proposal: no; revisit when `## Hard gotchas` passes
   ~20 lines.

## Changes
- 2026-10-02 — created; APPROVED (auto): no blocking questions, proposals
  1–4 adopted as decisions.
- 2026-10-02 — §1 built (PR #55). Decisions: doc lines, ~tokens and
  citations ride in the Evidence cell, so the plan table stays 7 columns for
  `move.sh`, `fold.sh` and hand-added rows. A `SKILL.md` row stands for
  its whole directory; the directory's other files get no row. A reference
  name (`architecture.md`, `methodology.md`, `*contract*`) listed under
  Area maps is `reference`, not `map` (hg lists `architecture.md` there).
  `mixed` proposes `fold` only for `unknown` rows: a long study, record or
  plan keeps its destination with the flag shown. A citation key is the
  basename, or `<dir>/<basename>` when two docs share it. `docs/FEATURES.md`
  (feature-list) is a known name. Last-commit dates come from one `git log`
  pass (hg: 0.38 s without `gh`, was 1.5 s of per-file calls).
- 2026-10-02 — §2 built (PR #55). Decisions: map commits come right after
  `move.sh`'s index commits, before the skill's research header commit,
  so all of `move.sh`'s output lands in one run. A map's purpose is its
  `## Area maps` description, else its first prose sentence, else a
  placeholder that `move.sh` warns about. A plan row bound anywhere but
  `split`, `merge <x>` or `docs/prd/archive/`, and a map at `?/CLAUDE.md`,
  are refused before anything moves. The moves commit says "Move PRDs and
  docs into place" when a doc row moved. (§1's commit body said 185 tests;
  the suite had 177.)
- 2026-10-02 — §3 built (PR #55). Decisions: a citation resolves by the
  longest word prefix of its `§` text that names one `##` heading (a
  `###` counts under its parent), so hg's `§Progress`, `§"Onboarding v2"`
  and `§Data-gated sections` resolve; 73 of hg's 78 `contracts.md`
  citations resolve (5 name no heading). `sections` counts with that
  resolver instead of `git grep -c`. Citations of a dropped section stay
  and are listed; `archive-doc` then points them at the archived doc.
  `archive-doc` dates the archive name by the doc's last commit, like PRD
  archives, and the plan is kept while a `fold` doc row is unarchived.
- 2026-10-02 — §4 built (PR #55). Decisions: files are tracked plus
  untracked-not-ignored, so a new doc fails before its commit. The skills
  run `doc-lint.sh --only <staged files>`, so a repo that has not migrated
  yet (hg: 92 violations today) still guards what it adds or moves; CI and
  the tests lint the whole template. `docs/FEATURES.md` may sit directly
  in `docs/` (feature-list). `.gitkeep` passes rule 6; a research row
  linking `<dir>/` covers its files (rollout §3 study folders). The
  template's `docs/.doc-allow` is template-only and `bootstrap.sh` removes
  it. `prd-migration.md` was 22,149 bytes, so fold and split moved to
  `prd-fold.md`. Measured 0.08 s on the template, 0.17 s on hg.
- 2026-10-02 — Decision logs (PR #55, found by doc-lint on vis's
  `docs/decisions.md`, which inventory could only call `unknown`): a doc
  named `decisions.md` / `decision-log.md` / `*-decisions.md`, titled
  Decision Log / Decisions / ADR, or under `adr/` / `decisions/` is
  `research`, as the research's ADR finding says; an ADR folder moves
  whole. `docs/README.md` names decision logs in the research row.
