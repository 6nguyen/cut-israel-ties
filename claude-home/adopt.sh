#!/usr/bin/env bash
# adopt — bring llm-repo-template's per-repo layer into an existing repo as a PR.
#   adopt <path-to-repo> [--dry-run] [--no-github] [--no-pr]
# Contract: docs/specs/adopt.md.
# Never overwrites: absent files are copied; present ones are skipped (an own
# docs/README.md is warned: it should carry the placement table) except
# four safe merges (.claude/settings.json allow/deny union, ops/logs/ in
# .gitignore, missing CLAUDE.md skeleton headings and docs/README.md
# repo-map line, missing lint targets in
# scripts/quiet-check.sh), docs/FEATURES.md, which is generated and so
# regenerated, and the managed linter copies in scripts/, which are updated
# (a copy without the managed line is a local fork: warned). Every file gets
# one action: created, merged, updated, skipped, warned or unchanged. A run with nothing to
# write makes no branch and no commit. A run that writes anything also adds
# the setup PRD (docs/prd/repo-setup.md), its index row and a CLAUDE.md
# pointer line. install.sh links this as ~/.local/bin/adopt.
set -euo pipefail
SELF="$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "${BASH_SOURCE[0]}")"
LIB="$(dirname "$SELF")/lib"
TPL="$(dirname "$(dirname "$SELF")")"   # the template clone
BRANCH=chore/adopt-llm-template
SKELETON_HEADINGS=("## Repo map" "## Area maps" "## Commands" "## Performance budgets" "## Hard gotchas" "## Don'ts")
GLOBAL_HEADINGS='^## (Git|Communication|Token efficiency|Agents)([^A-Za-z]|$)'

usage() { echo "usage: adopt <path-to-repo> [--dry-run] [--no-github] [--no-pr]" >&2; exit 64; }
die() { echo "adopt: $*" >&2; exit 1; }

TARGET="" DRY=0 GITHUB=1 PR=1
for a in "$@"; do
  case "$a" in
    --dry-run) DRY=1 ;; --no-github) GITHUB=0 ;; --no-pr) PR=0 ;;
    -h|--help) usage ;; -*) usage ;;
    *) [ -z "$TARGET" ] || usage; TARGET="$a" ;;
  esac
done
[ -n "$TARGET" ] || usage

# Preconditions: all checked before anything is written.
TARGET="$(cd "$TARGET" 2>/dev/null && pwd)" || die "no such directory: $TARGET"
git -C "$TARGET" rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "$TARGET is not a git repo"
TARGET="$(git -C "$TARGET" rev-parse --show-toplevel)"
[ "$TARGET" != "$TPL" ] || die "refusing to adopt into the template clone itself"
[ -z "$(git -C "$TARGET" status --porcelain)" ] || die "working tree is not clean in $TARGET; commit or stash first"
git -C "$TARGET" rev-parse -q --verify HEAD >/dev/null || die "$TARGET has no commits; make an initial commit first"
cd "$TARGET"

HAS_ORIGIN=0; git remote | grep -qx origin && HAS_ORIGIN=1
default_branch() {
  local b
  if b="$(git symbolic-ref -q --short refs/remotes/origin/HEAD 2>/dev/null)"; then echo "${b#origin/}"; return; fi
  for b in main master; do
    if git show-ref -q --verify "refs/heads/$b"; then echo "$b"; return; fi
  done
  git branch --show-current
}
DEFAULT="$(default_branch)"
NAME="$(basename "$TARGET")"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT

# Template transforms (template-only lines never reach the adopted repo).
drop_tpl_targets() { sed '/^[A-Za-z0-9_-]*|claude-home/d'; }
empty_index() { sed '/^| \[/d'; }
strip_ci_step() { awk '/^      - name: template-only/{skip=1; next} skip && /^      - /{skip=0} !skip'; }
claude_skeleton() { sed -e "s/{{PROJECT}}/$(printf '%s' "$NAME" | sed 's/[&/\]/\\&/g')/g" -e '/^- .*`claude-home\//d'; }
settings_for_branch() { sed "s#git push origin main:#git push origin $DEFAULT:#"; }
. "$LIB/setup-prd.sh"  # SETUP_PRD, POINTER, setup_prd, add_index_row
. "$LIB/linters.sh"    # LINTERS, managed_copy, add_lint_targets, set_ci_targets
quiet_check() { drop_tpl_targets | add_lint_targets; }
ci_yml() { strip_ci_step | set_ci_targets; }

# readme_line: CLAUDE.md (stdin → stdout) with the skeleton's docs/README.md
# line after the last non-blank line of the first "## Repo map" section.
README_LINE='- `docs/README.md` — where each kind of doc goes; doc-lint enforces it in CI.'
readme_line() {
  awk -v l="$README_LINE" '
    { line[NR] = $0 }
    !s && index($0, "## Repo map") == 1 { s = NR; last = NR; next }
    s && !e { if ($0 ~ /^## /) e = NR; else if ($0 ~ /[^[:space:]]/) last = NR }
    END { for (i = 1; i <= NR; i++) { print line[i]; if (i == last) print l } }'
}

row() { ROWS="$ROWS$(printf '  %-9s %s' "$1" "$2")"$'\n'; }
warn() { WARNS="${WARNS}WARN: $*"$'\n'; }

# stage <path> <created|merged> [x]: $WORK/new holds the desired bytes.
stage() {
  if [ -f "$1" ] && cmp -s "$WORK/new" "$1"; then row unchanged "$1"; return 0; fi
  row "$2" "$1"; CHANGED=1
  if [ "$MODE" = apply ]; then
    mkdir -p "$(dirname "$1")"; cat "$WORK/new" >"$1"
    if [ "${3:-}" = x ]; then chmod +x "$1"; fi
  fi
  return 0
}

# add <path> [filter]: copy the template file if absent. Returns 1 if present.
add() {
  local p="$1"; shift
  if [ $# -gt 0 ]; then "$@" <"$TPL/$p" >"$WORK/new"; else cat "$TPL/$p" >"$WORK/new"; fi
  if [ -e "$p" ]; then
    if cmp -s "$WORK/new" "$p"; then row unchanged "$p"; else row skipped "$p"; fi
    return 1
  fi
  local x=""; if [ -x "$TPL/$p" ]; then x=x; fi
  stage "$p" created $x
}

plan() {  # plan <probe|dry|apply>; probe = without the setup PRD
  MODE="$1" ROWS="" WARNS="" NOTES="" CHANGED=0
  local setup=0; if [ "$MODE" != probe ]; then setup=$SETUP; fi

  if [ -e scripts/quiet-check.sh ] && ! grep -q '^TARGETS=' scripts/quiet-check.sh; then
    row warned scripts/quiet-check.sh
    warn "scripts/quiet-check.sh is an older version (no TARGETS= block), left as is, so the prd-lint and doc-lint targets are missing; compare with $TPL/scripts/quiet-check.sh"
  elif [ ! -e scripts/quiet-check.sh ]; then add scripts/quiet-check.sh quiet_check
  else
    add_lint_targets <scripts/quiet-check.sh >"$WORK/new"
    if ! cmp -s "$WORK/new" scripts/quiet-check.sh; then stage scripts/quiet-check.sh merged
    else add scripts/quiet-check.sh quiet_check || true  # unchanged or skipped
    fi
  fi
  linters
  if [ "$setup" = 1 ]; then
    if [ -e docs/prd/README.md ]; then
      add_index_row <docs/prd/README.md >"$WORK/new"; stage docs/prd/README.md merged
    else
      empty_index <"$TPL/docs/prd/README.md" | add_index_row >"$WORK/new"; stage docs/prd/README.md created
    fi
  else
    add docs/prd/README.md empty_index || true
  fi
  add docs/prd/archive/.gitkeep || true
  add docs/specs/README.md empty_index || true
  add docs/research/README.md empty_index || true
  if [ -e docs/README.md ] && ! cmp -s "$TPL/docs/README.md" docs/README.md; then
    row warned docs/README.md
    warn "docs/README.md exists, left as is; merge in the placement table from $TPL/docs/README.md (doc-lint checks that rule)"
  else
    add docs/README.md || true
  fi
  add .github/pull_request_template.md || true

  if [ -n "$(find .github/workflows -maxdepth 1 \( -name '*.yml' -o -name '*.yaml' \) 2>/dev/null)" ]; then
    ci_yml <"$TPL/.github/workflows/ci.yml" >"$WORK/new"
    if [ -f .github/workflows/ci.yml ] && cmp -s "$WORK/new" .github/workflows/ci.yml; then
      row unchanged .github/workflows/ci.yml
    else
      row skipped ".github/workflows/ci.yml (a workflow exists)"
      NOTES="${NOTES}Paste into your CI job to run the same targets agents run
(check out with \`fetch-depth: 0\`; features.sh dates specs from history):
      - name: quiet-check
        env: { CI_TARGETS: \"prd-lint doc-lint\" }
        run: |
          rc=0
          for t in \$CI_TARGETS; do scripts/quiet-check.sh \"\$t\" || rc=1; done
          exit \$rc
"
    fi
  else
    add .github/workflows/ci.yml ci_yml || true
  fi

  settings_for_branch <"$TPL/.claude/settings.json" >"$WORK/tpl-settings.json"
  if [ -e .claude/settings.json ]; then
    if python3 - "$WORK/tpl-settings.json" .claude/settings.json >"$WORK/new" <<'PY'
import json, sys
tpl = json.load(open(sys.argv[1]))
raw = open(sys.argv[2]).read()
cur = json.loads(raw)
perm = cur.setdefault("permissions", {})
if not isinstance(perm, dict):
    sys.exit(2)
changed = False
for key in ("allow", "deny"):
    have = perm.get(key, [])
    if not isinstance(have, list):
        sys.exit(2)
    extra = [r for r in tpl["permissions"][key] if r not in have]
    if extra:
        perm[key] = have + extra
        changed = True
sys.stdout.write(json.dumps(cur, indent=2, ensure_ascii=False) + "\n" if changed else raw)
PY
    then stage .claude/settings.json merged
    else row skipped .claude/settings.json; warn ".claude/settings.json is not valid JSON or has a non-list permissions.allow/deny; merge by hand"
    fi
  else
    cp "$WORK/tpl-settings.json" "$WORK/new"; stage .claude/settings.json created
  fi

  if [ -e .gitignore ]; then
    if grep -qxE '/?ops/logs/?' .gitignore; then row unchanged .gitignore
    else
      { cat .gitignore; if [ -n "$(tail -c1 .gitignore)" ]; then echo; fi; echo 'ops/logs/'; } >"$WORK/new"
      stage .gitignore merged
    fi
  else
    printf 'ops/logs/\n' >"$WORK/new"; stage .gitignore created
  fi

  if [ -e CLAUDE.md ]; then
    local lines globals  # measured before any append
    lines="$(wc -l <CLAUDE.md | tr -d ' ')"
    if [ "$lines" -gt 150 ]; then warn "CLAUDE.md is $lines lines (>150); move area detail into area maps (/area-maps)"; fi
    globals="$(grep -E "$GLOBAL_HEADINGS" CLAUDE.md | paste -sd ',' - | sed 's/,/, /g' || true)"
    if [ -n "$globals" ]; then warn "CLAUDE.md has global-rule headings ($globals); they already load from ~/.claude/CLAUDE.md, so remove the local copies"; fi
    cp CLAUDE.md "$WORK/new"
    local missing=0 h
    if [ -n "$(tail -c1 CLAUDE.md)" ]; then echo >>"$WORK/new"; fi
    for h in "${SKELETON_HEADINGS[@]}"; do
      if ! awk -v h="$h" 'index($0, h) == 1 { f = 1 } END { exit !f }' CLAUDE.md; then
        printf '\n%s\n' "$h" >>"$WORK/new"; missing=1
      fi
    done
    if ! grep -qF docs/README.md CLAUDE.md; then
      readme_line <"$WORK/new" >"$WORK/rl"; mv "$WORK/rl" "$WORK/new"; missing=1
    fi
    if [ "$setup" = 1 ]; then printf '\n%s\n' "$POINTER" >>"$WORK/new"; missing=1; fi
    if [ "$missing" = 1 ]; then stage CLAUDE.md merged; else row unchanged CLAUDE.md; fi
  elif [ "$setup" = 1 ]; then
    { claude_skeleton <"$TPL/CLAUDE.md"; printf '\n%s\n' "$POINTER"; } >"$WORK/new"; stage CLAUDE.md created
  else
    add CLAUDE.md claude_skeleton || true
  fi

  features_md
  if [ "$MODE" = probe ]; then return 0; fi
  if [ "$setup" = 1 ]; then setup_prd "$TPL/claude-home/templates/repo-setup.md" "$MIGRATE_N" adopt >"$WORK/new"; stage "$SETUP_PRD" created
  elif [ -e "$SETUP_PRD" ]; then row unchanged "$SETUP_PRD"
  elif setup_archived; then row unchanged "$SETUP_PRD (archived)"
  else row skipped "$SETUP_PRD (nothing else to adopt)"
  fi
}

# docs/FEATURES.md is generated (docs/specs/feature-list.md), so a stale one
# is regenerated. Dry and probe runs predict from the current tree; apply
# renders after the docs/ files above are written (the setup PRD and the
# PRD index rows are not inputs). An existing CLAUDE.md without the repo map
# line gets a note, never an edit.
FEATURES="$TPL/claude-home/skills/implement-prd-section/scripts/features.sh"
FEATURES_LINE='- `docs/FEATURES.md` — generated feature list and lifecycle state; read it before proposing a PRD or answering what exists.'
features_md() {
  local p=docs/FEATURES.md
  if [ "$MODE" = apply ]; then
    local had=0; if [ -e "$p" ]; then had=1; fi
    case "$("$FEATURES" .)" in
      *unchanged*) row unchanged "$p" ;;
      *) CHANGED=1; if [ "$had" = 1 ]; then row merged "$p"; else row created "$p"; fi ;;
    esac
  elif [ ! -e "$p" ]; then row created "$p"; CHANGED=1
  elif "$FEATURES" --check . >/dev/null; then row unchanged "$p"
  else row merged "$p"; CHANGED=1
  fi
  if [ -e CLAUDE.md ] && ! grep -qF "$p" CLAUDE.md; then
    NOTES="${NOTES}Add to the CLAUDE.md repo map:
  $FEATURES_LINE
"
  fi
}

# The linters CI runs (claude-home/lib/linters.sh), copied with the managed
# line. A managed copy that differs is updated; one without the line is a
# local fork, left as is and warned.
linters() {
  local f p
  for f in $LINTERS; do
    p="scripts/$f"
    managed_copy <"$TPL/$LINTER_DIR/$f" >"$WORK/new"
    if [ ! -e "$p" ]; then stage "$p" created x
    elif cmp -s "$WORK/new" "$p"; then row unchanged "$p"
    elif sed -n 2p "$p" | grep -qxF "$MANAGED"; then stage "$p" updated x
    else
      row warned "$p"
      warn "$p has no managed line (a local fork), left as is; compare with $TPL/$LINTER_DIR/$f"
    fi
  done
}

setup_archived() { compgen -G 'docs/prd/archive/*-repo-setup.md' >/dev/null; }

# decide_setup: the setup PRD is written only when it is absent (live or
# archived) and the run has something else to create or merge.
decide_setup() {
  SETUP=0 MIGRATE_N=0
  if [ -e "$SETUP_PRD" ] || setup_archived; then return 0; fi
  plan probe
  if [ "$CHANGED" = 1 ]; then SETUP=1; MIGRATE_N=$(prds_without_state); fi
}

report() {
  echo "adopt: $TARGET (default branch $DEFAULT)"
  printf '%s' "$ROWS"
  printf '%s' "$WARNS"
  if [ -n "$NOTES" ]; then printf '%s' "$NOTES"; fi
}

github() {
  if [ "$GITHUB" = 0 ]; then return 0; fi
  local repo
  if ! repo="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null)"; then
    echo "WARN: no GitHub repo found (gh repo view failed); GitHub settings skipped"; return 0
  fi
  . "$LIB/gh-settings.sh"
  gh_repo_settings "$repo" || true
  gh_protect_main "$repo" "$DEFAULT"
}

SKIPPED_GH="GitHub settings skipped (--no-github): delete branch on merge and protection of \`$DEFAULT\` were not applied, so the repo owners decide. To apply both later, re-run \`adopt <path-to-repo>\` without --no-github after this PR merges."

next_steps() {
  if [ ! -e "$SETUP_PRD" ]; then return 0; fi
  echo "$SETUP_NEXT"
}

# PRD candidates (migrate-prds detection, no git/gh evidence) outside
# docs/prd/archive/ not in template shape: no "## State" block, or line 2
# not starting with "Status:". docs/prd/research-*.md is research, not a PRD.
prds_without_state() {
  . "$(dirname "$SELF")/skills/migrate-prds/scripts/detect.sh"
  prd_candidates . | { grep -v -e '^docs/prd/archive/' -e '^docs/prd/research-[^/]*\.md$' || true; } | while IFS= read -r f; do
    if ! grep -q '^## State' "$f" || ! sed -n 2p "$f" | grep -q '^Status:'; then echo "$f"; fi
  done | wc -l | tr -d ' '
}

# pr_states <branch> [state]: its PRs' states, one per line (none when it
# has no PRs or gh is unavailable). `gh pr view` would also find closed ones.
pr_states() { gh pr list --head "$1" --state "${2:-all}" --json state -q '.[].state' 2>/dev/null || true; }
# pick_branch: a branch whose PRs are all closed or merged holds a finished
# run's files, and pushing over it would need a force: use the next free
# $BRANCH-<n> instead.
pick_branch() {
  if [ "$HAS_ORIGIN" = 0 ]; then return 0; fi
  git fetch -q origin
  local b=$BRANCH n=1 s
  while s="$(pr_states "$b")"; [ -n "$s" ] && ! printf '%s\n' "$s" | grep -qx OPEN; do
    n=$((n + 1)); b="$BRANCH-$n"
  done
  if [ "$b" != "$BRANCH" ]; then echo "note: $BRANCH has only closed or merged PRs; using $b"; BRANCH=$b; fi
}

decide_setup
plan dry
if [ "$DRY" = 1 ]; then report; echo "dry run: nothing written"; exit 0; fi
if [ "$CHANGED" = 0 ]; then report; echo "nothing to adopt"; github; exit 0; fi

pick_branch
if git show-ref -q --verify "refs/heads/$BRANCH"; then
  git switch -q "$BRANCH"
  if [ "$HAS_ORIGIN" = 1 ]; then git fetch -q origin && git merge -q --no-edit "origin/$DEFAULT"
  else git merge -q --no-edit "$DEFAULT"; fi
elif [ "$HAS_ORIGIN" = 1 ] && git show-ref -q --verify "refs/remotes/origin/$BRANCH"; then
  git switch -q -c "$BRANCH" "origin/$BRANCH"  # so the push fast-forwards
  git merge -q --no-edit "origin/$DEFAULT"
else
  git switch -q "$DEFAULT"
  if [ "$HAS_ORIGIN" = 1 ]; then git pull -q --ff-only; fi
  git switch -q -c "$BRANCH"
fi

decide_setup
plan apply
report
if [ "$CHANGED" = 0 ]; then echo "nothing to adopt"; github; exit 0; fi
git add -A
git commit -q -F - <<MSG
Adopt llm-repo-template

Per-repo layer from llm-repo-template (claude-home/adopt.sh):
$ROWS${WARNS:+
$WARNS}
MSG
echo "committed on $BRANCH"

if [ "$PR" = 1 ]; then
  git -c credential.helper='!gh auth git-credential' push -qu origin "$BRANCH"
  if pr_states "$BRANCH" open | grep -qx OPEN; then echo "PR already open for $BRANCH (pushed)"
  else
    BODY="$(printf 'Adds the llm-repo-template per-repo layer. Nothing existing is overwritten.\n\n```\n%s%s```\n' "$ROWS" "$WARNS")"
    if [ "$GITHUB" = 0 ]; then BODY="$BODY"$'\n\n'"$SKIPPED_GH"; fi
    gh pr create --base "$DEFAULT" --head "$BRANCH" --title "Adopt llm-repo-template" --body "$BODY"
  fi
fi
github
next_steps
