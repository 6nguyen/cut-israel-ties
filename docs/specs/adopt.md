# Adopt

## Purpose
`adopt` brings the template's per-repo layer (thin `CLAUDE.md`, `docs/prd/`,
`docs/specs/`, `docs/research/`, `scripts/quiet-check.sh`, CI, PR template,
`.claude/settings.json`, GitHub settings) into a repo that already exists, as
one PR. New repos use `gh repo create --template` + `scripts/bootstrap.sh`
instead. It never rewrites what the repo has, never migrates existing PRDs,
and supports GitHub only.

## Behavior
1. **Command.** `adopt <path-to-repo> [--dry-run] [--no-github] [--no-pr]`
   from any directory. Source `claude-home/adopt.sh`; `install.sh` links it
   to `~/.local/bin/adopt`. Template files are read from the clone it lives in.
2. **Preconditions** (checked before any write; failure exits non-zero and
   says why): the target is a git repo, not the template clone, with a clean
   tree (untracked files count) and at least one commit.
3. **Plan.** Every file gets one action: created, merged, updated, skipped,
   warned or unchanged. "Unchanged" means the file already holds exactly
   what adopt would write.

   | File | Absent | Present |
   |---|---|---|
   | `scripts/quiet-check.sh` | copy, executable, minus every template-only `<target>\|claude-home…` line, plus the targets `prd-lint\|.\|bash scripts/prd-lint.sh\|generic` and `doc-lint\|.\|bash scripts/doc-lint.sh\|generic` | add either target when missing, before the `TARGETS` block's first comment line (**merged**), else skip; **warned** if it has no `TARGETS=` block (older version) |
   | `scripts/prd-lint.sh`, `scripts/features.sh`, `scripts/doc-lint.sh` (the CI linters) | copy from `claude-home/skills/implement-prd-section/scripts/`, executable, with line 2 `# managed by llm-repo-template adopt; edit it there` | a copy with that line that differs is replaced (**updated**); one without it is a local fork: **warned**, left as is |
   | `docs/prd/README.md`, `docs/prd/archive/.gitkeep`, `docs/specs/README.md`, `docs/research/README.md` | copy with index rows removed | skip |
   | `docs/README.md` (where docs go) | copy | **warned** unless identical; the placement table is merged by hand |
   | `.github/pull_request_template.md` | copy | skip |
   | `.github/workflows/ci.yml` | copy minus the template-only step, with `CI_TARGETS: "prd-lint doc-lint"` | any `*.yml`/`*.yaml` workflow exists: skip and print the quiet-check step to paste in, which sets the same `CI_TARGETS` |
   | `.claude/settings.json` | copy; the `git push origin <branch>` deny rule names the detected default branch | union `permissions.allow` / `permissions.deny` (new rules appended, no duplicates); other keys and key order kept; invalid JSON → skipped + warning |
   | `.gitignore` | create with `ops/logs/` | append `ops/logs/` if no such line |
   | `CLAUDE.md` | copy the skeleton (its repo map names `docs/prd/`, `docs/specs/`, `docs/research/`, `docs/FEATURES.md`, `docs/README.md` and `scripts/quiet-check.sh`), `{{PROJECT}}` = repo directory name, template-only area-map line dropped | append missing skeleton headings (`## Repo map`, `## Area maps`, `## Commands`, `## Performance budgets`, `## Hard gotchas`, `## Don'ts`), matched by prefix; a file that never mentions `docs/README.md` gets the skeleton's repo-map line for it after the last line of its first `## Repo map` section (appended or not) |
   | `docs/FEATURES.md` | generate with `features.sh` (`feature-list.md`) after the `docs/` files above | generated, so a stale one is regenerated (**merged**); current → unchanged. An existing `CLAUDE.md` without `docs/FEATURES.md` gets a note with the repo map line, never an edit |
   | `docs/prd/repo-setup.md` | when the run has something else to create or merge and no `docs/prd/archive/*-repo-setup.md` exists: create from `claude-home/templates/repo-setup.md` (Status `APPROVED <today> (adopt)`, items CLAUDE.md, quiet-check targets, Area maps, plus Migrate PRDs naming N only when N > 0), add its row to the `docs/prd/README.md` index and append the pointer line below to `CLAUDE.md`; otherwise no write | unchanged |

   Setup pointer, the last line of `CLAUDE.md`:
   `Setup pending: when no other task is given or when asked to continue setup, run /implement-prd-section docs/prd/repo-setup.md. <!-- prd-pointer: docs/prd/repo-setup.md -->`

   `CLAUDE.md` warnings (measured on the file as found): over 150 lines;
   global-rule headings (`## Git`, `## Communication`, `## Token efficiency`,
   `## Agents…`), named in the warning.
4. **Never copied:** `README.md`, `TEMPLATE.md`, the template's PRDs and
   specs, `claude-home/` (except the three linters above),
   `scripts/bootstrap.sh`, `docs/.doc-allow` (template-only; `bootstrap.sh`
   removes it too). `bootstrap.sh` keeps the same linters, targets and
   `CI_TARGETS`, writing them before it removes `claude-home/`.
5. **`--dry-run`** prints the same action table a real run would and writes
   nothing (no branch, no GitHub calls).
6. **Nothing to write** (every file unchanged, skipped or warned): no branch,
   no commit; prints "nothing to adopt".
7. **Branch.** Otherwise it cuts `chore/adopt-llm-template` from the default
   branch (`origin/HEAD`, else `main`, else `master`), pulling first when
   `origin` exists. A branch whose PRs are all closed or merged is not
   reused: adopt uses `chore/adopt-llm-template-<n>` (smallest free n ≥ 2)
   and prints a note. An existing branch is switched to (local) or checked
   out from `origin`, and the default branch merged in.
8. **Output.** Commit "Adopt llm-repo-template" (body: the action table and
   warnings), push over HTTPS and `gh pr create` (the branch's PR is reused
   only while it is open). With `--no-github` the PR body ends with a line naming the
   skipped settings and how to apply them later. `--no-pr` stops after the
   commit. It prints the table, warnings, CI snippet and one next-step
   line: "after merging, run /implement-prd-section
   docs/prd/repo-setup.md (or start a Claude session
   and say 'continue setup')". N (for the setup PRD's migrate item) counts
   `prd_candidates` (`claude-home/skills/migrate-prds/scripts/detect.sh`,
   no git/`gh` evidence) outside `docs/prd/archive/` with no `## State`
   line or no `Status:` on line 2; `docs/prd/research-*.md` files are
   research and are not counted.
9. **GitHub settings** (unless `--no-github` or `--dry-run`): delete branch on
   merge, then protect the default branch. Both come from
   `claude-home/lib/gh-settings.sh`, which `bootstrap.sh` also sources. A
   failed protection call (403 on private repos without Pro) is a warning.

## Data & contracts
- `claude-home/adopt.sh`; `claude-home/lib/gh-settings.sh`:
  `gh_repo_settings REPO`, `gh_protect_main REPO [BRANCH=main]`.
- `claude-home/lib/setup-prd.sh` (also sourced by `bootstrap.sh`):
  `SETUP_PRD`, `POINTER`, `INDEX_ROW`, `SETUP_NEXT`,
  `setup_prd TEMPLATE N SOURCE`, `add_index_row` (stdin → stdout).
- `claude-home/lib/linters.sh` (also sourced by `bootstrap.sh`):
  `LINTERS`, `LINTER_DIR`, `MANAGED`, and the stdin → stdout filters
  `managed_copy`, `add_lint_targets`, `set_ci_targets`. The linters are
  copied, not fetched, because the template repo is private.
- Template-only markers adopt and bootstrap strip: quiet-check lines whose
  dir starts with `claude-home`; the CI step named `template-only…`; the
  `CLAUDE.md` area-map line pointing into `claude-home/`.
- Sources `claude-home/skills/migrate-prds/scripts/detect.sh` for N.
- `claude-home/templates/repo-setup.md`: the setup PRD template, with
  `{{DATE}}`, `{{SOURCE}}`, `{{OWNER}}`, `{{N}}`, and lines prefixed
  `{{MIGRATE}}` (kept without the prefix only when N > 0). Its Area maps
  item maps the directories the owner picks from `/area-maps measure`;
  with Migrate PRDs, existing maps move to `<dir>/CLAUDE.md` in the move
  PR. Template-only.
- Dependencies: bash 3.2+, git, python3 (JSON merge, path resolution), gh.

## Invariants (regression checklist)
- [ ] Empty repo: every file in the table is created; no `{{PROJECT}}` or
      template-only lines; `scripts/quiet-check.sh list` runs.
- [ ] Existing `CLAUDE.md`, `.gitignore`, `settings.json`, workflow: original
      bytes kept except the listed appends and merges (including the setup
      pointer and the `docs/README.md` repo-map line); no new workflow.
- [ ] An adopted `CLAUDE.md` names `docs/README.md` exactly once, new or
      existing, with or without its own `## Repo map`.
- [ ] Empty repo: the setup PRD has 3 `[ ]` items, an index row, and
      `CLAUDE.md` ends with exactly one pointer line.
- [ ] Setup PRD archived, or a repo adopted before the setup PRD existed:
      no setup PRD and no pointer are written.
- [ ] A re-run after a closed or merged adopt PR pushes without force and
      leaves the old branch's head unchanged.
- [ ] Older `quiet-check.sh`: untouched, warned.
- [ ] Re-run: a drifted managed linter is updated, a fork is warned and
      kept, a missing lint target is merged back exactly once.
- [ ] In an adopted repo, `scripts/quiet-check.sh doc-lint` exits 1 on a
      misplaced doc and names its file and line.
- [ ] Second run: no diff, no commit, "nothing to adopt".
- [ ] Dirty tree: non-zero exit, nothing written.
- [ ] `--dry-run` table equals the real run's table.
- [ ] The setup PRD has the migrate item only when PRDs without State exist
      outside the archive; the action table is the same either way.
- [ ] `bootstrap.sh` still bootstraps a new repo through the shared lib.
- [ ] An adopted empty repo and a bootstrapped repo lint with 0 doc-lint
      violations, and both run the `prd-lint` and `doc-lint` targets green.
- Covered by `scripts/quiet-check.sh adopt` (runs in template CI).

## Performance budget
A full local run (no network) under 5 s; measured 0.35 s.
