# Repo guards — PRD
Status: SHIPPED 2026-10-02 (PR #59) · Owner: George · Last updated: 2026-10-02

## Problem
The doc and PRD rules reach a repo only through two skills.
`implement-prd-section` and `handoff` tell the agent to run prd-lint and
doc-lint before a commit, but an ad-hoc session never loads them. Nothing
checks the result afterwards. An adopted repo's CI has empty `CI_TARGETS`,
and adopt drops the template-only step, which is the only place the linters
run. The lint scripts live in `~/.claude/skills/`, so a CI runner could not
run them anyway. The repo's own `CLAUDE.md` never names `docs/README.md`, so
an ad-hoc agent does not learn where a new doc goes. Evidence: hypertrophy-goals
has 92 doc-lint violations, and its hand-written `docs/PRD.md` drifted from
its PRDs within three weeks. video-index-search grew a `docs/decisions.md`
outside every placement rule.

## Goals / Non-goals
- Goals: every adopted or bootstrapped repo runs prd-lint (which includes
  the `docs/FEATURES.md` staleness check) and doc-lint in CI; its
  `CLAUDE.md` points at the placement rules; a re-run of adopt keeps the
  repo's copies of the linters current.
- Non-goals:
  - A hand-kept master list. `docs/FEATURES.md` (generated) plus the
    `## Next` rows in `docs/prd/README.md` already are the master list; a
    second, hand-written one would drift (owner decision 2026-10-02).
  - A running decision log. A decision's current value and reason live in
    its spec, its history in the PRD `## Changes`, non-obvious constraints
    in `CLAUDE.md` Hard gotchas, and evidence in `docs/research/`. An
    existing log is moved to `docs/research/` as frozen history and its
    rows are folded into specs (owner decision 2026-10-02).
  - A local pre-commit or Claude Code hook. CI is the one gate; the skills
    already lint before their commits.
  - Running the linters on hypertrophy-goals or video-index-search. The
    rollout's adopt re-run does that (rollout-existing-repos §3–§4).

## Research (what the best products do → adopt / adapt / reject)
| Pattern | Seen in | Verdict | Why |
|---|---|---|---|
| Doc and style linters as a required CI check | markdownlint-cli2, Vale | adopt | The check runs no matter which session wrote the doc |
| Tool copied into the repo at a pinned version | pre-commit `rev:`, Renovate-managed vendored scripts | adapt | The template repo is private, so CI cannot fetch it; adopt re-runs refresh the copy |
| Local hook as the only gate | husky, pre-commit | reject | Needs a local install and is skipped with `--no-verify` |

## Users
Agents in any session of an adopted repo, and the owner reviewing PRs.

## Expected behavior
### 1. Linters in every repo's CI
1. adopt copies `prd-lint.sh`, `features.sh` and `doc-lint.sh` from
   `claude-home/skills/implement-prd-section/scripts/` to the repo's
   `scripts/`. Line 2 of each copy is
   `# managed by llm-repo-template adopt; edit it there`.
2. A re-run replaces a copy that still carries that line and differs from
   the template (row `updated`). A copy without the line is a local fork:
   it is left as is and warned.
3. adopt adds the targets `prd-lint|.|bash scripts/prd-lint.sh|generic` and
   `doc-lint|.|bash scripts/doc-lint.sh|generic` to the repo's
   `scripts/quiet-check.sh` when missing.
4. adopt's `ci.yml` sets `CI_TARGETS: "prd-lint doc-lint"`. When the repo
   keeps its own workflow, the printed paste-in step names both targets.
5. `scripts/bootstrap.sh` does the same before it removes `claude-home/`,
   so a new repo from the template keeps both checks.
6. A PR that misplaces a doc, breaks a PRD or leaves `docs/FEATURES.md`
   stale fails the `checks` job, and the log names the file and line.
7. While `docs/prd/migration-plan.md` exists, doc-lint's placement rules
   only warn (unchanged), so CI stays green mid-migration.
8. prd-lint flags a `docs/prd/README.md` `## Index` row that links into
   `archive/` (`archived PRD still indexed`). Archiving deletes the row,
   but relinking a moved PRD rewrites it instead, which is how the
   feature-list row survived #54.

### 2. CLAUDE.md points at the rules
1. The `## Repo map` of the template's `CLAUDE.md` skeleton gains the line
   ``- `docs/README.md` — where each kind of doc goes; doc-lint enforces it in CI.``
2. adopt adds that line to an existing `## Repo map` when the file has no
   `docs/README.md` mention; a repo without a `## Repo map` gets it with the
   heading adopt already appends.

## Data & contracts
- New per-repo files: `scripts/prd-lint.sh`, `scripts/features.sh`,
  `scripts/doc-lint.sh`, each with the managed line on line 2.
- `scripts/quiet-check.sh` targets `prd-lint` and `doc-lint` (run from the
  repo root).
- `.github/workflows/ci.yml` `CI_TARGETS: "prd-lint doc-lint"`.
- adopt summary rows: `created`, `updated` or `warned` per copied script.

## Spec delta
- MODIFIED `docs/specs/adopt.md` §Behavior (copied files table): add the
  three linters (create, refresh when managed, warn when forked), the two
  quiet-check targets, `CI_TARGETS: "prd-lint doc-lint"` and the
  `CLAUDE.md` repo-map line; bootstrap keeps the same files.
- MODIFIED `docs/specs/doc-placement.md` §Behavior 5 (Guard): the skills'
  pre-commit run → the skills' pre-commit run plus the repo's CI job.
- MODIFIED `docs/specs/prd-lifecycle.md` §Behavior 4: prd-lint also runs
  in CI from the repo's `scripts/prd-lint.sh`, and flags an Index row that
  links into `archive/`.

## Acceptance criteria
- [x] adopt on an empty repo creates the three scripts and both targets,
      sets `CI_TARGETS`, and `scripts/quiet-check.sh prd-lint` and
      `doc-lint` pass there.
- [x] A re-run with an older managed copy prints `updated` and replaces it;
      a copy without the managed line prints `warned` and is unchanged.
- [x] A bootstrapped repo keeps the three scripts and both targets, and both
      pass.
- [x] In an adopted fixture, a doc placed directly in `docs/` makes
      `scripts/quiet-check.sh doc-lint` exit 1 and name the file.
- [x] The adopted `CLAUDE.md` names `docs/README.md` exactly once, on a new
      repo and on a repo that already had a `## Repo map`.
- [x] prd-lint exits 1 on an Index row linking `archive/<name>.md` and
      names the README line; a fixture fails before the rule exists.
- [x] Budget: both CI targets together take ≤2 s on hypertrophy-goals.

## Rollout & metrics
Build after PR #54 (features.sh) and PR #55 (doc-lint) merge. Ship this
before the rollout re-runs adopt on hypertrophy-goals, so that re-run
brings the guards with it; video-index-search gets them from its next
adopt re-run. Metric: no PR in either repo merges with a doc-lint or
prd-lint violation.

## State (updated 2026-10-02)
- Sections:
  - [x] 1. Linters in every repo's CI · PR #58 merged
  - [x] 2. CLAUDE.md points at the rules · feat/repo-guards-claude-md-points-at-the-rules
- Completed: §1 (PR #58): lib/linters.sh, adopt and bootstrap copy the
  three linters, add both targets and set CI_TARGETS; prd-lint flags
  archived Index rows. §2: the skeleton repo map names docs/README.md and
  adopt adds that line to an existing CLAUDE.md that never mentions it.
- Folded: §1 (adopt.md, doc-placement.md, prd-lifecycle.md), §2 (adopt.md).
- Branch / open PRs: feat/repo-guards-claude-md-points-at-the-rules
- Remaining: none.
- Known failures / blockers: none.
- Next action: none; archived.
## Open questions
1. Copy the linters, or fetch them in CI? Proposal: copy. The template repo
   is private, so a CI fetch would need a token in every repo, and the
   copy pins the version the repo was linted with.
2. Should `features --check` be its own CI target? Proposal: no.
   prd-lint already fails on a stale `docs/FEATURES.md`, so a second
   target would run the same check twice.
3. Should section 2 also name `docs/FEATURES.md`? Proposal: no change.
   PR #54 already adds that repo-map line.

## Changes
- 2026-10-02 — created (APPROVED, auto). Proposals 1–3 are decisions. The
  master list and decision log stay as designed (see Non-goals), per the
  owner on 2026-10-02.
- 2026-10-02 — added §1.8 (archived PRD still indexed): main kept
  feature-list's Index row after #54 archived it, because relinking the
  moved PRD rewrote the row instead of deleting it. The row is removed in
  this PR; the rule keeps it from recurring.
- 2026-10-02 — §1 built. Measured on hypertrophy-goals: prd-lint 0.22 s
  plus doc-lint 0.15 s (budget 2 s). doc-lint no longer prints git's
  "could not open directory" warning on a repo with `docs/` but no
  `docs/specs/`, which would have cluttered every pre-migration CI log
  (fixture added). adopt.md's copied-files table had a blank line that
  split it in two; removed while folding.
- 2026-10-02 — §2 built and the PRD archived. adopt inserts the line at
  the end of an existing `## Repo map` section, so the adopt.md invariant
  "original bytes kept" now names that line as an allowed addition, as it
  does the setup pointer. `docs/FEATURES.md` keeps its note-only handling
  (open question 3). adopt: 146 passed (4 new; 3 failed before the fix).
