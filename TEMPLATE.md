# llm-repo-template

Boilerplate for repos built with Claude Code: token-efficient agent workflow,
PRD-first process, PR-only git, and a quiet build/test wrapper. Distilled from
the hypertrophy-goals token-workflow PRD (2026-09-28), where one 48-hour
session's usage was traced request by request.

## Two layers

| Layer | Lives in | Reaches | Holds |
|---|---|---|---|
| Global | `claude-home/` → symlinked into `~/.claude/` | every repo on this machine, including old ones | communication, token + agent rules, spawn recipe, sessions, git, PRD-first, verification cadence, quality bar; `handoff`, `implement-prd-section`, `area-maps`, `migrate-prds` skills; `adopt` command |
| Per repo | the rest of this template | repos created from it, or adopted with `adopt` | thin `CLAUDE.md` skeleton, PRD + spec templates (`docs/prd/`, `docs/specs/`), `scripts/quiet-check.sh`, CI, PR template, `.claude/settings.json` |

Global rules live in one place so they're never duplicated per repo (a copy
loads twice every request and goes stale).

## One-time machine setup

```bash
git clone https://github.com/6nguyen/llm-repo-template ~/Documents/github/llm-repo-template
~/Documents/github/llm-repo-template/claude-home/install.sh
```

Then in `~/.claude/settings.json` keep `"autoCompactWindow": 200000` (caps the
1M-native main thread at 200k; the single biggest main-thread lever) and turn
off MCP connectors you don't use per project (each costs schema tokens on
every request; `/context` at session start should read <50k).

To change a global rule: edit `claude-home/`, PR, merge, `git pull`. The
symlinks pick it up; re-run `install.sh` only after adding a skill.

## New repo

```bash
gh repo create my-app --private --template 6nguyen/llm-repo-template --clone
cd my-app && scripts/bootstrap.sh
```

`bootstrap.sh` removes the template-only files and the template's own
PRDs and specs, fills in the project name, turns on delete-branch-on-merge,
protects `main` (needs GitHub Pro for private repos; it warns and continues
otherwise), and opens the cleanup as a PR. The rest of setup is a PRD, as for
an existing repo: `docs/prd/repo-setup.md` (`CLAUDE.md`, quiet-check targets
and `CI_TARGETS`, area maps) plus a pointer line in `CLAUDE.md`. After
merging, run `/implement-prd-section docs/prd/repo-setup.md`, or say
"continue setup" in a Claude session, once per section. First feature: see
[Working loop](#working-loop).

## Existing repo

```bash
adopt ~/code/my-app --dry-run   # print the action table, write nothing
adopt ~/code/my-app             # branch chore/adopt-llm-template, commit, PR
```

`adopt` (linked by `install.sh`; source `claude-home/adopt.sh`) copies in the
per-repo files the repo lacks and never overwrites one it has. Only three
merges touch existing files: `.claude/settings.json` gets the template's
allow/deny rules unioned in, `.gitignore` gets `ops/logs/`, and `CLAUDE.md`
gets any missing skeleton headings appended. It warns, without fixing, about
an older `quiet-check.sh`, a `CLAUDE.md` over 150 lines, and global rules
copied into `CLAUDE.md`; with an existing CI workflow it prints the
quiet-check step to paste in. It also applies the same GitHub settings as
`bootstrap.sh` (`--no-github` skips them; `--no-pr` stops after the commit).
A second run reports "nothing to adopt".

The rest of setup is a PRD: adopt writes `docs/prd/repo-setup.md` with one
section each for filling in `CLAUDE.md`, quiet-check targets and
`CI_TARGETS`, and area maps, plus a migrate section when the repo has PRDs
without State (next section). A pointer line at the end of `CLAUDE.md`
tells Claude about it. After merging the adopt PR, run
`/implement-prd-section docs/prd/repo-setup.md`, or say "continue setup" in
a Claude session, once per section. Archiving the setup PRD removes the
pointer.

### Migrating existing PRDs

For PRDs scattered around the repo, with no State block and a mix of
shipped, half-built and abandoned work. Each phase is a slash command in
Claude Code; scripts do the detection and the moves, and the model only
writes specs.

| Step | Command | Result |
|---|---|---|
| 1 | `/migrate-prds inventory` | Table of every PRD with its evidence (status, branches, PRs), a class (`shipped` / `active` / `partial` / `unknown`) and a destination. You correct it once; the confirmed plan is committed as `docs/prd/migration-plan.md` on `chore/migrate-prds-move`. Nothing moves yet. |
| 2 | `/migrate-prds move` | PR moving `active`/`partial` (and, for now, `shipped`) PRDs into `docs/prd/` and indexing the active ones. Renames get their own commit so `git log --follow` keeps history, and every link to a moved file is rewritten. `unknown` files stay put. |
| 3 | `/migrate-prds fold` | Proposes capability groups for the shipped PRDs (you confirm), then one PR per group: a `docs/specs/<cap>.md` spec written from the PRDs, with claims the code doesn't back marked `(unverified)`, and the PRDs archived as `SHIPPED … (migrated)`. |
| 4 | `/migrate-prds split` | One PR per half-built PRD: the shipped part goes into a spec, the original is archived `SUPERSEDED`, and the unbuilt rest becomes a new change PRD with a `Sections:` list. |

Merge each PR before the next phase. The last fold or split deletes the
plan; then every live PRD is in `docs/prd/` and ready for the working loop.

## Working loop

Every repo (new, bootstrapped or adopted):

1. **Propose.** Copy the template in `docs/prd/README.md` to
   `docs/prd/<feature>.md`, including its `## Spec delta`, and open it as a PR.
   It counts as approved when opened unless an open question is marked
   `[blocking]`.
2. **Build.** `/implement-prd-section docs/prd/<feature>.md` picks the next
   unbuilt section, cuts a branch, builds it, runs the tests and opens one PR.
   It tracks progress in the PRD's `## State` `Sections:` list (`[ ]` todo,
   `[~]` in progress, `[x]` merged, `[!]` blocked); merged PRs flip to `[x]`
   on the next run.
3. **Merge**, then run the same command again for the next section. The PR
   that ships the last section folds the spec delta into `docs/specs/` and
   archives the PRD.
4. **End a session** with `/handoff`: it updates State, pushes, and prints
   a resume prompt for the next session.

## Why these rules (measured)

From the audited session (775 main requests, 60 agents / 4,152 requests):

- ~68% of spend was agent tool loops (8 agents ran 150–212 requests at
  300–450k context) → ≤100 calls / ≤200k caps, spawn recipe, batching.
- ~25% was main-thread re-reads (median 399k, peak 961k) → 200k autocompact,
  one session per workstream, State block instead of conversation memory.
- ~8–10% was stale payloads (91 images, 330k chars of inline HTML) →
  agents `SendUserFile`; research returns ≤40 lines.
- 12 full cache rewrites (model switches, idle >1h) → one model per session.
- 4 agents killed by HTTP 429 → `/usage` before spawn, ≤2 heavy per window.
- CLAUDE.md itself was <1% of any request — keep it tidy, but it's not the lever.

Model routing (2026-09-28, same PRD section built three ways): Sonnet-medium
skipped the perf gate and shipped a decode crash; the strongest model at
medium/high was clean. Route decode/concurrency/new-screen work to the
strongest model; mechanical sweeps down.
