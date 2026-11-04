# Adopt the template in an existing repo — PRD
Status: SHIPPED 2026-10-01 (PR #20) · Owner: George Nguyen · Last updated: 2026-10-01

## Problem
The template has two layers. The global layer (`claude-home/` symlinked into
`~/.claude/` by `install.sh`) already reaches every repo on the machine. The
per-repo layer has only one documented path, for new repos:
`gh repo create --template` plus `scripts/bootstrap.sh`. The per-repo layer is
the thin `CLAUDE.md`, `docs/prd/`, `scripts/quiet-check.sh`, CI, the PR
template, `.claude/settings.json`, and the GitHub settings (delete branch on
merge, `main` protection).

`bootstrap.sh` can't run on an existing repo. It `git rm`s template-only
files that won't be there, and it never copies anything in. Adopting the
template today means copying files by hand and merging the ones that collide.

Evidence (hypertrophy-goals, 2026-10-01) — it already has `docs/prd/`, CI,
`ops/logs/` in `.gitignore` and a full `CLAUDE.md`, but:
- `.claude/settings.json` and the PR template are missing;
- delete-branch-on-merge is off;
- its `quiet-check.sh` is an older version that takes a command name, not the
  template's targets list.

## Goals / Non-goals
- Goals:
  1. One command brings the per-repo layer into an existing repo as a PR.
  2. It never overwrites or rewrites content the repo already has: missing
     files are added, and only listed safe merges change existing files.
  3. Idempotent: a second run produces no diff.
  4. It reports, without fixing, what needs a human: outdated
     `quiet-check.sh`, an overgrown `CLAUDE.md`, global rules duplicated
     locally.
- Non-goals:
  - Rewriting an existing `CLAUDE.md`, CI workflow or `quiet-check.sh`.
  - Migrating existing PRDs to the spec lifecycle (`spec-lifecycle.md`).
  - Non-GitHub hosts.

## Research (what the best products do → adopt / adapt / reject)
| Pattern | Seen in | Verdict | Why |
|---|---|---|---|
| Re-applying a template to an existing project and merging updates | copier (`copier update`), cruft | Adapt | We need only add-if-missing plus a few merges, not 3-way template updates |
| `init` in an existing repo that adds only missing scaffolding | `git init`, `openspec init`, `npx shadcn init` | Adopt | Safe to run on any repo, idempotent |
| Dry-run listing planned writes | Terraform plan, `rsync -n` | Adopt | `--dry-run` prints the action table, writes nothing |

## Users
- The owner, adopting the template in their existing repos one at a time
  (hypertrophy-goals first).

## Expected behavior
1. **Command.**
   `adopt <path-to-repo> [--dry-run] [--no-github] [--no-pr]`, run from any
   directory. `install.sh` links it into `~/.local/bin` next to
   `session-analyzer`. Its source is `claude-home/adopt.sh` in the template
   clone.
2. **Preconditions.**
   - The target must be a git repo with a clean tree. Otherwise adopt exits
     non-zero and says why.
   - It cuts `chore/adopt-llm-template` from an up-to-date default branch.
     If that branch already exists, it switches to it and merges the default
     branch.
3. **Per-file actions.** Each file ends up with one of five actions: created,
   merged, skipped, warned or unchanged.

   | File | Absent | Present |
   |---|---|---|
   | `scripts/quiet-check.sh` | copy; drop the template-only `session-analyzer\|claude-home` target | skip; **warn** if it has no `TARGETS=` block (older version) |
   | `docs/prd/README.md`, `docs/prd/archive/.gitkeep`, `docs/specs/README.md` | copy (index emptied) | skip |
   | `.github/pull_request_template.md` | copy | skip |
   | `.github/workflows/ci.yml` | copy, minus the template-only session-analyzer step | if any workflow exists: skip, and print the quiet-check snippet to paste in |
   | `.claude/settings.json` | copy | union of `permissions.allow` and `permissions.deny` only; key order and other keys untouched |
   | `.gitignore` | create with `ops/logs/` | append `ops/logs/` if missing |
   | `CLAUDE.md` | copy the skeleton; fill `{{PROJECT}}`; drop the template-only area-map line | append only the missing skeleton headings (`## Repo map`, `## Area maps`, `## Commands`, `## Performance budgets`, `## Hard gotchas`, `## Don'ts`), matched by prefix; **warn** if it's over 150 lines or contains global-rule headings (`## Git`, `## Communication`, `## Token efficiency`, `## Agents`) |
4. **Never copied:** `README.md`, `TEMPLATE.md`, the template's own PRDs,
   `claude-home/`, `scripts/bootstrap.sh`.
5. **GitHub settings** (skipped with `--no-github`): turn on
   delete-branch-on-merge, then attempt `main` protection. A 403 (private
   repo on GitHub Free) is a warning, not a failure.
   - The settings calls move out of `bootstrap.sh` into
     `claude-home/lib/gh-settings.sh`, which both scripts source, so there is
     one copy.
6. **Output.**
   - It commits ("Adopt llm-repo-template"; the body lists the actions),
     pushes over HTTPS and runs `gh pr create`. `--no-pr` stops after the
     commit.
   - It prints the action table, the warnings, and the next steps: fill in
     `CLAUDE.md`, configure quiet-check targets and `CI_TARGETS`, run
     `/area-maps` to measure the repo.
7. **No changes.** A run where every action is "unchanged" makes no commit
   and no branch, and says so.

## Data & contracts
- New:
  - `claude-home/adopt.sh`;
  - `claude-home/lib/gh-settings.sh` (functions `gh_repo_settings REPO` and
    `gh_protect_main REPO`);
  - `claude-home/tests/adopt_test.sh`.
- Edited:
  - `scripts/bootstrap.sh`: source the lib; also strip the `adopt` check
    target.
  - `claude-home/install.sh`: link `adopt`.
  - `scripts/quiet-check.sh`: new template-only target
    `adopt|claude-home|bash tests/adopt_test.sh|generic`.
  - `.github/workflows/ci.yml`: the template-only step also runs `adopt`.
  - `TEMPLATE.md`: an "Existing repo" section.
- The JSON merge uses `python3` (already required by session-analyzer). No
  new dependencies.

## Spec delta
- ADDED `docs/specs/adopt.md`: the whole capability (Purpose, Behavior 1–9,
  contracts, invariants, budget).

## Acceptance criteria
- [x] Empty git repo: every file in the table is created; no `{{PROJECT}}`
      or template-only lines remain; `quiet-check.sh list` runs.
- [x] Repo that already has `CLAUDE.md`, `.gitignore`, `settings.json` and a
      workflow: existing bytes are unchanged except the listed appends and
      merges; `settings.json` allow/deny lists are unioned with no
      duplicates and other keys kept; no new workflow file.
- [x] Repo with an older `quiet-check.sh` (no `TARGETS=`): skipped, with a
      warning.
- [x] Oversized `CLAUDE.md` or global-rule headings: a warning names them.
- [x] Second run: no diff and no commit, and it reports "nothing to adopt".
- [x] Dirty tree: exits non-zero before writing anything.
- [x] `--dry-run` writes nothing and prints the same action table a real run
      would.
- [x] `bootstrap.sh` still works for new repos and uses the shared lib.
- [x] `scripts/quiet-check.sh adopt` covers all of the above with
      `--no-github --no-pr` and passes in CI.
- [x] Performance: a full run on a local repo takes <5 s, excluding network.

## Rollout & metrics
- Pilot on hypertrophy-goals. The expected PR adds `.claude/settings.json` and
  the PR template, turns on delete-branch-on-merge, and warns about the
  older `quiet-check.sh`. It should not touch CI.
- Success: hypertrophy's adopt PR merges with no manual edits to what adopt
  wrote.

## State (updated 2026-10-01, PR #20)
- Sections: (build order; `[ ]` todo · `[~]` in progress · `[x]` merged · `[!]` blocked: reason)
  - [~] Expected behavior · feat/adopt-existing-repo-expected-behavior · PR #20
- Completed: Expected behavior 1–7, all acceptance criteria.
- Folded: §Expected behavior (ADDED `docs/specs/adopt.md`)
- Branch / open PRs: feat/adopt-existing-repo-expected-behavior · PR #20
- Files changed: `claude-home/adopt.sh` (new), `claude-home/lib/gh-settings.sh`
  (new), `claude-home/tests/adopt_test.sh` (new), `scripts/bootstrap.sh`,
  `claude-home/install.sh`, `scripts/quiet-check.sh`, `.github/workflows/ci.yml`,
  `TEMPLATE.md`, `docs/specs/adopt.md`.
- Tests run + result: `scripts/quiet-check.sh adopt` 77 passed, 0 failed;
  full run 0.35 s (budget 5 s).
- Remaining: none. Pilot on hypertrophy-goals after merge (Rollout).
- Next action: merge PR #20, then `adopt ~/…/hypertrophy-goals --dry-run`.

## Open questions
None open. Decisions below are logged under Changes.

## Changes
- 2026-10-01 — created (DRAFT).
- 2026-10-01 — APPROVED by the owner; open-question proposals adopted: OQ1 the settings.json deny rule uses the detected default branch name; OQ2 no `--upgrade-quiet-check` in v1, warn only.
- 2026-10-01 — built (PR #20). Decisions: a repo with no commits is refused
  ("make an initial commit first") since adopt never commits to the default
  branch; an older `quiet-check.sh` gets action `warned` (not `skipped`);
  "nothing to adopt" covers runs whose only actions are unchanged/skipped/
  warned; `gh_protect_main` takes an optional branch (default branch, not
  always `main`); bootstrap and adopt strip every `<target>|claude-home`
  quiet-check line, which also drops the previously leaked `token-tooling`
  target in bootstrapped repos. Spec delta added (ADDED `docs/specs/adopt.md`;
  the PRD predated the spec lifecycle). SHIPPED and archived.
