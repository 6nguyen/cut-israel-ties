# Doc placement

## Purpose
Every doc has one home, decided by who reads it and when, so a build loads
current truth from `docs/specs/` and nothing else. `docs/README.md` states
the rule in one table; `/migrate-prds inventory` proposes a home for each
existing doc.

## Behavior
1. **Placement table** (`docs/README.md`, ≤25 lines). Current truth
   (contracts, architecture, design rules, budgets) → `docs/specs/`;
   orientation for agents editing a directory → `<dir>/CLAUDE.md`, listed
   under root `## Area maps`; work not yet done → `docs/prd/`; evidence,
   studies and settled proposals → `docs/research/` (a study keeps its
   folder; a decision log too); finished, superseded or dropped plans → `docs/prd/archive/`;
   procedures an agent runs → `.claude/skills/<name>/`; a how-to for one
   directory's tool → that directory's `README.md`; human how-tos with no
   owning directory → `docs/guides/` (created on first need); tool-written
   records stay, listed in `docs/.doc-allow`; images and HTML → `assets/`
   beside the doc. Only `docs/README.md`, `docs/FEATURES.md` and
   `docs/.doc-allow` sit directly in `docs/`.
2. **Adopt** copies `docs/README.md` when absent; a target's own
   different `docs/README.md` is warned and left as is.
3. **Inventory** lists every misplaced doc as a `doc:<kind>` row with a
   proposed destination (`docs/specs/prd-migration.md` §Behavior 1).
4. **doc-lint** (`implement-prd-section/scripts/doc-lint.sh [repo]`,
   bash 3.2 + awk, offline) checks tracked and untracked-not-ignored files
   and prints `<file>:<line>: <rule>` per violation, then
   `doc-lint: N files, V violations, W warnings`; exit 1 on any violation.
   1. A `*.md` sits in `docs/prd/`, `docs/specs/`, `docs/research/`,
      `docs/guides/`, `.claude/` or `.github/`, or is named `README.md`,
      `CLAUDE.md`, `AGENTS.md`, `CHANGELOG.md`, `CONTRIBUTING.md` or
      `LICENSE*` (under `docs/`, only inside those folders), or matches a
      `docs/.doc-allow` glob. An allow line without `# <reason>` is a
      violation.
   2. Only `README.md`, `FEATURES.md` and `.doc-allow` sit directly in
      `docs/`.
   3. Each spec other than the README has `## Purpose` as its first `##`
      heading, no `Status:` line, and is ≤16,000 bytes (fenced code
      ignored).
   4. Each `- ` line under root `## Area maps` names an existing
      `<dir>/CLAUDE.md` with `## Purpose` (`- (none yet)` passes).
   5. The `docs/research/README.md` index and `docs/research/` match one to
      one; a row linking `<dir>/` covers every file under it.
   6. Non-markdown files under `docs/` sit in an `assets/` directory, are
      `.gitkeep`, or are allowlisted.
   While `docs/prd/migration-plan.md` exists, rules 1, 2 and 6 print
   `warn: <file>:<line>: …` and do not fail, and the plan's `unknown` rows
   are listed once at the end.
5. **Guard.** `/implement-prd-section` and `/handoff` run `doc-lint.sh
   --only $(git diff --cached --name-only)` before every commit: only the
   commit's own files are reported, so a repo not yet migrated still
   guards what it adds or moves. Every adopted or bootstrapped repo also
   lints its whole tree in its CI job, from its managed copy
   `scripts/doc-lint.sh` (quiet-check target `doc-lint`, in `CI_TARGETS`;
   `adopt.md`), so a misplaced doc fails the PR with its file and line.
   The template lints its whole tree in CI too and allowlists
   `claude-home/*` and `TEMPLATE.md`; `bootstrap.sh` removes
   `docs/.doc-allow` with them.

## Data & contracts
- `docs/README.md`: the table above, shipped by the template and by adopt.
- `docs/.doc-allow`: one `<glob>  # <reason>` per line; `#` lines are
  comments; `*` also matches `/`.
- `claude-home/skills/implement-prd-section/scripts/doc-lint.sh [repo] |
  --only <path>…`; tests `tests/doc_lint_test.sh` (quiet-check target
  `doc-lint`, template-only, also in the template-only CI step).

## Invariants (regression checklist)
- [ ] The template's `docs/README.md` is ≤25 lines and names every
      destination above.
- [ ] Adopt never overwrites a target's `docs/README.md`.
- [ ] doc-lint flags each rule once on its fixture, warns instead of
      failing for rules 1, 2 and 6 while a migration plan exists, and
      `--only` reports only the named paths.
- [ ] The template, an adopted empty repo and a bootstrapped repo lint
      with 0 violations.

## Performance budget
doc-lint < 1 s on a repo (measured 0.08 s on the template, 0.17 s on
hypertrophy-goals). Inventory: `docs/specs/prd-migration.md`.
