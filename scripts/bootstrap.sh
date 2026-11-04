#!/usr/bin/env bash
# One-time setup for a repo created from llm-repo-template:
#   gh repo create <name> --private --template 6nguyen/llm-repo-template --clone
#   cd <name> && scripts/bootstrap.sh
# 1. Removes template-only files (claude-home/, this script) and everything
#    the template owns under docs/: its PRDs, archived PRDs and specs, plus
#    their index rows. docs/prd/README.md, docs/specs/README.md,
#    docs/research/README.md (table headers kept) and docs/prd/archive/.gitkeep
#    stay.
# 2. Fills the project name into CLAUDE.md / README.md and writes the setup
#    PRD (docs/prd/repo-setup.md, its index row, a CLAUDE.md pointer line),
#    then regenerates docs/FEATURES.md for the emptied docs. Copies the CI
#    linters (prd-lint, features, doc-lint) into scripts/ with their
#    quiet-check targets and CI_TARGETS, as adopt does.
# 3. GitHub settings: delete branch on merge, and main
#    protection (PR required, no force-push, no deletion). Templates do not copy
#    these, so this is the only place they get applied.
# 4. Commits the cleanup on chore/bootstrap and opens a PR.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
. claude-home/lib/gh-settings.sh  # sourced now: step 1 removes claude-home/
. claude-home/lib/setup-prd.sh
. claude-home/lib/linters.sh
REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
NAME="${REPO#*/}"
echo "bootstrapping $REPO"

# 1-2. Template cleanup (on a branch — never commit to main)
git switch -q -c chore/bootstrap
# Template-owned docs: keep only the three READMEs and archive/.gitkeep, then
# empty the index tables (rows start "| [", headers stay).
for f in docs/prd/*.md docs/prd/archive/* docs/specs/*.md docs/research/*; do
  case "$f" in
    docs/prd/README.md|docs/specs/README.md|docs/research/README.md|docs/prd/archive/.gitkeep) continue ;;
  esac
  if [ -e "$f" ]; then git rm -rq "$f"; fi  # unmatched glob stays literal
done
for f in docs/prd/README.md docs/specs/README.md docs/research/README.md; do
  sed -i '' '/^| \[/d' "$f" 2>/dev/null || sed -i '/^| \[/d' "$f"
done
# Template-only check targets (session-analyzer, token-tooling, adopt: all
# under claude-home/).
sed -i '' '/^[A-Za-z0-9_-]*|claude-home/d' scripts/quiet-check.sh 2>/dev/null \
  || sed -i '/^[A-Za-z0-9_-]*|claude-home/d' scripts/quiet-check.sh
# CI linters (claude-home/lib/linters.sh), copied before claude-home/ goes.
for f in $LINTERS; do
  managed_copy <"$LINTER_DIR/$f" >"scripts/$f"; chmod +x "scripts/$f"
done
add_lint_targets <scripts/quiet-check.sh >scripts/quiet-check.sh.tmp
cat scripts/quiet-check.sh.tmp >scripts/quiet-check.sh; rm scripts/quiet-check.sh.tmp
set_ci_targets <.github/workflows/ci.yml >ci.yml.tmp && mv ci.yml.tmp .github/workflows/ci.yml
# Template-only area map index line (its map lives under claude-home/).
sed -i '' '/^- session-analyzer: `claude-home/d' CLAUDE.md 2>/dev/null \
  || sed -i '/^- session-analyzer: `claude-home/d' CLAUDE.md
sed -i '' "s/{{PROJECT}}/$NAME/g" CLAUDE.md README.md 2>/dev/null \
  || sed -i "s/{{PROJECT}}/$NAME/g" CLAUDE.md README.md
# Setup PRD from claude-home/templates/ (no migrate section: no PRDs left),
# written before claude-home/ goes.
setup_prd claude-home/templates/repo-setup.md 0 bootstrap >"$SETUP_PRD"
add_index_row <docs/prd/README.md >docs/prd/README.md.tmp
mv docs/prd/README.md.tmp docs/prd/README.md
printf '\n%s\n' "$POINTER" >>CLAUDE.md
# Empty-state feature list (docs/specs/feature-list.md), rendered by the
# global features.sh before claude-home/ goes.
claude-home/skills/implement-prd-section/scripts/features.sh . >/dev/null
git rm -rq claude-home scripts/bootstrap.sh TEMPLATE.md
# The template's doc-lint allowlist only names files removed above.
if [ -e docs/.doc-allow ]; then git rm -q docs/.doc-allow; fi
git add -A
git commit -qm "Bootstrap $NAME from llm-repo-template

Remove template-only files, fill the project name and add the setup PRD."

# 3. Repo settings + main protection (claude-home/lib/gh-settings.sh, shared
# with claude-home/adopt.sh)
gh_repo_settings "$REPO"
gh_protect_main "$REPO" main

# 4. Ship the cleanup as a PR
git -c credential.helper='!gh auth git-credential' push -qu origin chore/bootstrap
gh pr create --title "Bootstrap from llm-repo-template" --body "Template cleanup after creating from llm-repo-template."
echo "$SETUP_NEXT"
