# Placing reference, orientation, plan and how-to docs in adopted repos
Researched: 2026-10-02 · Informs: [migrate-docs](../prd/archive/2026-10-migrate-docs.md)

## Question

The template knows three doc folders: `docs/prd/` (changes), `docs/specs/`
(what ships today) and `docs/research/` (evidence), plus per-directory
`CLAUDE.md` area maps. Existing repos carry docs that fit none of them:
contracts, architecture notes, designs of record, agent primers, roadmaps,
implementation plans, how-tos and performance records. This file decides
where each kind belongs, how a large reference file is split, what tooling
moves and converts them, and which lint rule keeps new loose docs out.

The worked example is hypertrophy-goals (hg), read at heads and headings
only.

## What hg has today (measured)

Token counts are bytes divided by four.

| File | Size | Kind | Cited by non-markdown files |
|---|---|---|---|
| `docs/contracts.md` | 897 lines, ~22.5k tokens | reference (shared shapes) | 34 code/test files, many with `§Section` anchors |
| `docs/architecture.md` | ~2.1k | reference (system) | 0 |
| `docs/methodology.md` | ~1.5k | explanation of the engine; "runtime truth lives in the DB rule_sets row" | 0 |
| `docs/design/theme-contract.md` | ~1.7k | reference ("binding spec for the persona system") | 9 |
| `docs/design/logger-contract.md` | ~2.0k | reference (API and ownership addendum) | 15 |
| `docs/design/workout-logger-ux.md` | ~5.5k | design of record v3, with History and Build plan sections | 6 |
| `docs/design/premium-polish-brief.md` | ~2.4k | mixed: binding design rules plus a brief | 24 |
| `docs/ios-map.md` | ~1.6k | orientation map ("never auto-loaded; reference it from spawn prompts") | 0 |
| `docs/logger-primer.md` | ~1.8k | orientation map plus an Invariants section | 2 |
| `docs/pilot-roadmap.md`, `docs/security-and-llm-plan.md`, `docs/data-integration-plan.md`, `docs/performance-plan.md`, `docs/plans/test-personas.md`, `docs/plans/launch-*.md` | 130 to 311 lines each | plans and roadmaps | security plan 31, performance plan 23, pilot roadmap 10 |
| `docs/plans/{onboarding-v2,progress-report-v2,feature-tour}-implementation.md` | 104 to 205 lines | implementation plans tied to one PRD | onboarding plan 10 |
| `docs/design/home-v2.md` | ~2.2k | design proposal | 5 |
| `docs/shortcuts-setup.md` | 104 lines | human how-to | 0 |
| `docs/perf/README.md`, `docs/perf/RELEASE.md` | 74, 130 lines | harness how-to, release runbook | `docs/perf/` 8 |
| `docs/perf/results/*.md` | 7 files | tool-written release records | written by `backend/loadtest/run.py` |
| `docs/reference/` | `SKILL.md` with skill frontmatter, 2 scripts, 1 html | a Claude skill | 3 |

Inside `docs/contracts.md` the sections are very uneven: Progress report v2
is ~6.5k tokens, API ~5.2k, Onboarding v2 ~3.4k, LLM quotas ~1.5k, Settings
schema ~1.3k, and the other nine sections are under 1k each. Several
section headings already name the plan or PRD they came from, for example
"Cardio (docs/prd/cardio-logging.md)".

The root `CLAUDE.md` lists `docs/ios-map.md`, `docs/logger-primer.md` and
`docs/architecture.md` under `## Area maps`, although none of them is a
`<dir>/CLAUDE.md` with a `## Purpose` heading, so Claude Code never loads
them automatically. Its repo map calls five files under `docs/` "binding
specs". Code cites docs in two forms: a bare path (`docs/contracts.md`) and
a path plus section (`docs/contracts.md §Sessions`). A whole-file move keeps
both working once the path is rewritten. Splitting a file breaks the
section form, which the current `relink.py` cannot repair.

## 1. Best practice: adopt, adapt or reject

- **Diátaxis** (https://diataxis.fr/, https://diataxis.fr/reference/):
  adapt. Use its four types as the classifier, not as folders. Reference
  becomes specs, explanation becomes a spec's Purpose or research, how-to
  becomes a skill, a colocated README or `docs/guides/`. Tutorials are
  rejected for single-owner repos. Its rule that reference should "mirror
  the structure of the product" backs splitting contracts per capability.
- **arc42** (https://docs.arc42.org/home/): adapt. Reject the 12-section
  document as too heavy. Keep one `docs/specs/architecture.md` covering
  context, building blocks, deployment and cross-cutting concepts (its
  sections 3, 5, 7, 8). Quality requirements (section 10) already live in
  each spec's Performance budget, and decisions (section 9) live in archived
  PRDs and research.
- **C4** (https://c4model.com/): adapt. Write levels 1 and 2 (system
  context, containers) as prose or a diagram inside the architecture spec,
  which the site says is enough for most teams. Reject levels 3 and 4: area
  maps and the code cover them.
- **ADRs** (https://adr.github.io/,
  https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions):
  adapt the ideas and reject the folder. Nygard's records are never
  rewritten and gain a superseded status, which matches the research
  supersede rule and PRD archiving. His "large documents are never kept up
  to date" supports small specs. A decision made without a PRD (for example
  hg's `female-body-source.md` licensing choice) goes to `docs/research/`
  with a `Decided in` line.
- **OpenSpec** (https://github.com/Fission-AI/OpenSpec): adopt (already
  adopted). Living specs plus change proposals plus an archive, with
  ADDED/MODIFIED/REMOVED deltas, is the template's lifecycle. Its
  `project.md` context file corresponds to `CLAUDE.md` plus the
  architecture spec.
- **spec-kit** (https://github.com/github/spec-kit): adapt. Its
  per-feature `plan.md`, `tasks.md`, `data-model.md` and `contracts/` show
  that implementation plans and contracts belong to a feature. The template
  keeps one PRD file per change instead: the plan becomes `Sections:` and
  `## Data & contracts`, and contracts land in the spec at fold. Reject
  per-feature folders and companion plan files.
- **Claude Code memory** (https://code.claude.com/docs/en/memory): adopt.
  Subdirectory `CLAUDE.md` files "load on demand when Claude reads files in
  those directories", so orientation maps belong there, not in `docs/`.
  Its size advice (under 200 lines per file) matches the 4k-token map cap.
  Reject `@imports` for specs: imports load at launch in every session.
  Path-scoped `.claude/rules/*.md` with a `paths:` glob are an option only
  for a rule that spans several areas (for example UI rules for both
  `dashboard/` and `ios/`); the template's default stays `## Hard gotchas`.
- **Anthropic context engineering**
  (https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents):
  adopt. "Just in time" loading through lightweight identifiers (index
  tables, file paths, headings) and "the smallest set of high-signal
  tokens" justify small capability specs read by name and line range over
  one large reference file.
- **AGENTS.md** (https://agents.md/): adapt. The "closest one takes
  precedence" rule matches area maps. The template stays on `CLAUDE.md`; a
  repo that also serves other agents can import `AGENTS.md` from it.
- **Cursor rules** (https://cursor.com/docs/context/rules): reject as a
  mechanism (not used), but its advice to keep rules "under 500 lines",
  split large ones and reference files instead of copying them agrees with
  the caps here.
- **Docs link and orphan checks** (remark-validate-links,
  https://github.com/remarkjs/remark-validate-links; lychee, see
  https://github.com/minodisk/riffle/pull/164; GitLab docs testing,
  https://docs.gitlab.com/development/documentation/testing/): adapt. CI
  checks for broken relative links and orphan files are common practice.
  The template needs a cheaper, offline, bash check scoped to placement.

## 2. Placement rule per kind

General rule: a doc's destination is decided by who reads it and when.
Current truth that builds load goes to `docs/specs/`. Orientation that
agents need while editing a directory goes to that directory's
`CLAUDE.md`. Work not yet done goes to `docs/prd/`. Evidence and settled
proposals go to `docs/research/`. Finished or dropped plans go to
`docs/prd/archive/`. Procedures go next to what they operate. Only
tool-written records stay where the tool writes them.

| Kind | Destination | Conversion | hg files |
|---|---|---|---|
| Contracts (shared interface shapes) | `## Data & contracts` of the owning `docs/specs/<cap>.md` | fold by section | `contracts.md`, `design/logger-contract.md` |
| Architecture (system-level) | `docs/specs/architecture.md`, one spec using the template headings: Purpose is the governing principle, Behavior holds components, data flows and jobs, Data & contracts holds ports and network, Invariants holds failure posture and the zero-cost rule | whole-file move, then a header edit | `architecture.md` |
| Explanation of a capability | Purpose and Behavior of that capability's spec | fold | `methodology.md` |
| Design of record, binding design rules | `docs/specs/<cap>.md` (Behavior and Invariants); History, build plan and rounds are dropped because git and the archive keep them | fold, split by sub-capability past ~4k | `design/workout-logger-ux.md`, `design/theme-contract.md`, binding parts of `design/premium-polish-brief.md` |
| Design proposal | `docs/research/<topic>.md` with `Decided in <prd or spec>`; any part that code cites as binding is folded into the spec first | move plus fold of the binding part | `design/home-v2.md`, `design/ux-parity.md`, `design/female-body-source.md` |
| Orientation map | `<dir>/CLAUDE.md` area map with `## Purpose`, indexed under `## Area maps`; invariants inside it move to the spec | move, header edit, `measure.sh` check | `ios-map.md` to `ios/CLAUDE.md`; `logger-primer.md` to `dashboard/components/logger/CLAUDE.md` (iOS rows into `ios/CLAUDE.md`); the backend entry gets a real `backend/CLAUDE.md` from `/area-maps write backend` |
| Agent rules (file ownership, copy rules) | root `CLAUDE.md` `## Hard gotchas` or the owning area map | owner edit | "File ownership" sections in `contracts.md` and the polish brief |
| Roadmap or plan with work left | change PRD in `docs/prd/<name>.md` with `Sections:`; shipped parts fold into specs (same as `split`) | split | `pilot-roadmap.md`, `security-and-llm-plan.md`, plan parts of `performance-plan.md`, `plans/test-personas.md` |
| Roadmap or plan that is done, superseded or dropped | `docs/prd/archive/YYYY-MM-<name>.md` with its status | move | `data-integration-plan.md` (likely superseded by `prd/data-sync.md`; owner confirms) |
| Roadmap that only orders other plans | its order becomes the `docs/prd/README.md` index order; its owner decisions become `## Open questions` in the child PRDs; the file archives | owner edit, move | `plans/launch-roadmap.md` |
| Research digest with a phased plan | `docs/research/<topic>.md`; the plan becomes a PRD only when the owner commits to it | move | `plans/launch-business.md`, `launch-distribution.md`, `launch-legal.md`, `launch-architecture.md` |
| Implementation plan tied to one PRD | merged into that PRD (`Sections:`, `## Data & contracts`) while active; archived next to the PRD as `archive/YYYY-MM-<change>-plan.md` when the PRD ships, the way hg already keeps `onboarding-v2-history.md` | split or move | `plans/*-implementation.md` |
| Cross-cutting budgets | `docs/specs/performance.md` (budgets, the gate, the harness contract); per-capability budgets go to each spec's Performance budget | fold | `## Budgets` of `performance-plan.md` |
| How-to an agent runs | project skill `.claude/skills/<name>/SKILL.md` | move | `perf/RELEASE.md`, `reference/` (already a skill with frontmatter) |
| How-to for a tool in one directory | `README.md` in that directory | move | `perf/README.md` to `backend/loadtest/README.md` |
| How-to for humans with no owning directory | `docs/guides/<task>.md` | move | `shortcuts-setup.md` (or archive, if the Shortcuts pipeline is retired) |
| Tool-written records | stay where the tool writes them, allowlisted | none | `docs/perf/results/` |
| Assets (html, svg, png) | `assets/` beside the doc that uses them, or stay allowlisted | move or allowlist | `design/*.html`, `review/`, `prd/mockups/` |

### New folders

Only one new folder is justified: `docs/guides/`, for how-tos that humans
follow, that no agent runs and that no single code directory owns. It is
Diátaxis's how-to type, it never holds current truth, and builds never read
it. It is created on first need and has a three-line README (one task per
file, numbered steps, never read by builds). In hg only
`shortcuts-setup.md` qualifies, so the folder is cheap.

Rejected new folders: `docs/architecture/` (one spec is enough),
`docs/adr/` (archive plus research already form the decision log),
`docs/plans/` (plans are PRDs) and `docs/maps/` (maps must be
`<dir>/CLAUDE.md` to load on demand).

### Why `ios-map.md` should auto-load now

Its header says "never auto-loaded" on purpose. That made sense before area
maps existed: the only alternative was the root `CLAUDE.md`, which loads in
every session. As `ios/CLAUDE.md` it costs ~1.6k tokens only in sessions
that read files under `ios/`, which is the agreed price of a map (≤4k), and
it removes the need for spawn prompts to mention it. This is an owner
decision at the inventory confirmation.

## 3. Splitting big reference files

Recommendation: split `contracts.md` per capability into each spec's
`## Data & contracts`, and do not keep a single large reference file.

Reasons:
- At ~22.5k tokens it is 5.6 times the 4k spec cap. An agent told to
  "build against docs/contracts.md" either reads all of it or must already
  know which line range to grep.
- `/implement-prd-section` loads only the spec sections a delta names. After
  the split, a cardio build loads ~0.4k of contracts instead of ~22.5k,
  and the worst case (progress report) is ~3 to 4k after its own split.
- A spec delta that changes a shape and its behavior then edits one file,
  so fold stays a single-file operation.
- The headings already carry the capability (Cardio, Onboarding v2,
  Progress report v2, Sessions), so the section-to-capability map is mostly
  mechanical.

Proposed mapping, to be confirmed with the §4 fold groups so that PRD folds
and contract sections land in the same spec:

| Section(s) | ~tokens | Spec |
|---|---|---|
| Identifiers & conventions, Database overview, Dev routes, API conventions | ~1.4k plus the shared part of API | `docs/specs/api.md` (cross-cutting shapes, like arc42 section 8) |
| Endpoint groups inside API | ~5.2k total | spread over each capability's spec |
| Engine output, LLM output, Report JSON, Data-gated sections | ~2.2k | `docs/specs/analysis-report.md` (with `methodology.md` as Purpose and Behavior) |
| LLM quotas, usage & budget | ~1.5k | `docs/specs/llm-budget.md` |
| Settings schema & prompt quarantine | ~1.3k | `docs/specs/settings.md` |
| Sessions | ~0.4k | `docs/specs/auth.md` |
| Onboarding v2 | ~3.4k | `docs/specs/onboarding.md` (Behavior has to stay under ~0.6k, or the spec splits) |
| Cardio | ~0.4k | `docs/specs/cardio.md` |
| Progress report v2 | ~6.5k | two specs, for example `progress-report.md` and `progress-awards.md` (code already cites `§awards`) |
| File ownership | ~0.2k | root `CLAUDE.md` or area maps (an agent rule, not product truth) |

Shapes are copied byte for byte (code blocks and tables). The model writes
only Purpose, Behavior and the joins between sections. Each shape is
defined once, in the spec. Area maps link to it and never copy it, and the
three clients (backend, dashboard, iOS) cite the same spec section.

The same rule applies to `workout-logger-ux.md` (~5.5k): Screens 1 to 4
and "Our only deltas" go to `workout-logger.md`, the iOS gesture map to
`logger-gestures.md`, and the tour and tooltips to `feature-tour.md`.
History, Build plan and the superseded-version notes are dropped.

Citations in code need a section-level move map. 23 of the 36 code citations use
`docs/contracts.md §<Section>`. After the split each one is rewritten to
`docs/specs/<cap>.md §Data & contracts`. Bare `docs/contracts.md`
citations (13) are rewritten to `docs/specs/README.md`, whose index names
the capability. No redirect stub is left behind, because a stub would be a
loose doc that the lint has to allow forever.

## 4. Tooling

### Inventory grows a `doc` class

Yes. `inventory.sh` already lists PRD candidates. It should also list every
tracked `*.md` outside `docs/prd/`, `docs/specs/`, `docs/research/` and the
known non-doc names (`README.md`, `CLAUDE.md`, `AGENTS.md`, `CHANGELOG.md`,
`LICENSE*`, `CONTRIBUTING.md`, `.claude/**`, `.github/**`) as `doc:<kind>`
rows in the same table and the same owner confirmation. The owner then
confirms everything once, and `migration-plan.md` gains the rows.

Kinds and their deterministic signals, with the first match winning. Each
row prints the rule that matched as its evidence.

| Kind | Signals (path, name, header lines 1 to 8, frontmatter) | Proposed destination |
|---|---|---|
| `skill` | YAML frontmatter with `name:` and `description:` | `.claude/skills/<name>/` (the whole directory) |
| `record` | under `*/results/`, or written by a tracked script (`git grep -l <dir>` in non-markdown files that write) | stays, allowlist |
| `map` | listed under root `CLAUDE.md` `## Area maps`, or name `*-map.md` / `*-primer.md`, or a header containing "re-deriv" or "orientation" | `<dir>/CLAUDE.md`, where `<dir>` is the most frequent backticked top-level path prefix in the file |
| `impl-plan` | a `PRD: docs/prd/<x>.md` header line, or name `*-implementation.md` | merge into `<x>`, or archive next to it when `<x>` is shipped |
| `plan` | name `*-plan.md` / `*-roadmap.md` / under `plans/`, or `Status: PLANNED/DRAFT/IN PROGRESS/PROPOSED` | `docs/prd/<name>.md` (split) or archive by last-commit age and status |
| `reference` | name `*-contract*.md`, `contracts.md`, `architecture.md`, `methodology.md`, or a header containing "binding", "design of record" or "do not deviate" | `fold` to `docs/specs/<cap>.md` |
| `research` | `Research date`, a teardown, a `## Sources` heading, or under `*-market/` / `*-rounds/` | `docs/research/<topic>.md` |
| `howto` | name `*-setup.md`, `RELEASE.md`, a `README.md` under `docs/`, or a numbered-step majority | colocated `README.md`, a skill, or `docs/guides/` |
| `unknown` | nothing matched | stays; the owner decides |

Extra columns: lines, ~tokens, and code citations (files, of which
`§`-anchored). A file over 4k tokens or with a mixed class (headings that
match different kinds, as in `performance-plan.md` and
`premium-polish-brief.md`) is flagged `mixed`. Mixed files and `reference`
files are never moved whole; they go to fold.

### Move

`move.sh` already moves files, rewrites links and reports warnings, and it
handles `doc:research`, `doc:howto`, `doc:skill`, archive-bound `doc:plan`
rows and `doc:map` rows as plain renames. Additions:
- A map move refuses when `<dir>/CLAUDE.md` exists (that becomes a fold).
  After the moves commit, a separate commit adds `## Purpose`, replaces the
  root `## Area maps` pointer with the area-map index line, and runs
  `measure.sh` to confirm the map is ≤4k tokens. This mirrors the existing
  research header commit.
- Skill moves carry their directory, and relink rewrites `docs/reference/`
  directory mentions.

### Fold for reference docs

`fold` today works PRD by PRD. A reference doc needs a section-level
plan:
1. `fold.sh sections <doc>` (read-only) lists each `##` section with line
   range, ~tokens, the code citations that anchor to it
   (`git grep "<doc> §<heading prefix>"`) and a proposed capability taken
   from the heading text and the recorded PRD groups.
2. The owner confirms once. `fold.sh sections --write <doc> '<heading>:
   <cap>' ...` records the map in `migration-plan.md`. A heading can map to
   `drop` (history, build plan), `claude-md`, `map:<dir>` or `prd:<name>`.
3. `fold.sh extract <doc> <heading>` prints the section verbatim. Shapes
   (code blocks, tables) are pasted unchanged into `## Data & contracts`.
   The model writes Purpose, Behavior and Invariants, and the existing
   `claims` evidence check runs on the prose.
4. `relink.sh --sections` rewrites `<doc> §<heading>` citations to
   `docs/specs/<cap>.md §<target heading>` from the recorded map, rewrites
   bare `<doc>` citations to `docs/specs/README.md`, and prints any
   citation it cannot resolve as a warning.
5. When every section is recorded as written or dropped, the source moves
   to `docs/prd/archive/YYYY-MM-<name>.md` with
   `Status: FOLDED into <specs>`, so history stays and agents never load it.

The scripts classify, measure, extract and rewrite. The model writes spec
prose only. The owner decides classes and capability names once per phase.

### Order for hg

Run this inside rollout §3 and §4, not as a new PRD:
1. The §3 inventory confirmation covers PRDs and docs together.
2. The move PR moves research, skills, how-tos, maps and archive-bound
   plans.
3. Each §4 capability fold PR also folds the contract and design-of-record
   sections recorded for that capability, so each spec is written once.

The template change (doc kinds, `sections`, `extract`, `relink
--sections`, the lint) is a change to the `prd-migration` spec and needs a
PRD (`migrate-docs` or an extension of `rollout-existing-repos`).

## 5. Doc-lint rule

`doc-lint.sh` (bash 3.2 and awk, offline, ~1 s) runs beside `prd-lint.sh`
in `/implement-prd-section`, `/handoff` and CI, and is installed by
`adopt.sh`. Rules, each printed as `<file>:<line>: <rule>`:

1. **Placement.** Every tracked `*.md` is under `docs/prd/` (including
   `archive/`), `docs/specs/`, `docs/research/`, `docs/guides/`,
   `.claude/`, `.github/`, or is named `README.md`, `CLAUDE.md`,
   `AGENTS.md`, `CHANGELOG.md`, `CONTRIBUTING.md` or `LICENSE*`, or
   matches a glob in `docs/.doc-allow`. Each allow line is
   `<glob>  # <reason>`; a line without a reason is itself a violation.
   hg starts with `docs/perf/results/**  # written by backend/loadtest/run.py; CLAUDE.md performance gate`.
2. **No loose `docs/` root files.** Only `docs/README.md` (optional) and
   `docs/.doc-allow` may sit directly in `docs/`.
3. **Specs stay specs.** Each `docs/specs/*.md` other than the README has
   `## Purpose` as its first `##` heading and no `Status:` line, and is
   ≤16,000 bytes (~4k tokens).
4. **Maps are maps.** Every line under root `## Area maps` points at a
   `<dir>/CLAUDE.md` that has `## Purpose`. hg's current
   `docs/ios-map.md` line fails this rule.
5. **Indexes match files.** Every spec and research file has a row in its
   README index, and every row points at an existing file.
6. **Non-markdown under `docs/`** lives in an `assets/` directory or is
   allowlisted.

Rollout: while `docs/prd/migration-plan.md` exists, rules 1, 2 and 6 only
warn, and rows the plan marks `unknown`/stays are reported once in a
footer. When the last migration PR deletes the plan, they become errors.
This keeps the adopt PR green and makes the end of migration the point
where loose docs become impossible.

## Open questions

1. Should `ios/CLAUDE.md` auto-load (cost ~1.6k tokens per iOS session)?
   Proposal: yes. A map is the template's answer to re-derivation, and the
   current "reference from spawn prompts" rule depends on every prompt
   remembering it.
2. Is `docs/guides/` worth a fourth folder for one file in hg? Proposal:
   yes, as an optional folder that lint knows and `adopt` does not create.
   The other choice is archiving `shortcuts-setup.md` if the Shortcuts
   pipeline is retired.
3. Should `.claude/rules/` with `paths:` replace `## Hard gotchas` for
   cross-area UI rules? Proposal: no, not by default. Revisit when
   `## Hard gotchas` grows past ~20 lines.
