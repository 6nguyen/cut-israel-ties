#!/usr/bin/env bash
# List area maps whose area changed since the map itself last changed
# (commits after the map's last commit, plus uncommitted edits). Read-only.
#   audit.sh [path]     (default: repo root)
# A map is a nested CLAUDE.md with a "## Purpose" heading. A map and code
# changed in the same commit count as current.
set -euo pipefail
export LC_ALL=C
ROOT="${1:-$(git rev-parse --show-toplevel)}"
[ -d "$ROOT" ] || { echo "audit.sh: not a directory: $ROOT" >&2; exit 2; }
cd "$ROOT"
git rev-parse --git-dir >/dev/null 2>&1 || { echo "audit.sh: not a git repo: $ROOT" >&2; exit 2; }

stale=0; total=0
while IFS= read -r map; do
  grep -q '^## Purpose' "$map" || continue
  total=$((total + 1))
  dir="${map%/CLAUDE.md}"
  last="$(git log -1 --format=%H -- "$map")"
  if [ -z "$last" ]; then
    echo "$map: uncommitted (new map)"; stale=$((stale + 1)); continue
  fi
  # Working tree vs the map's last commit, excluding the map itself.
  changed="$(git diff --name-only "$last" -- "$dir" ":(exclude)$map")"
  untracked="$(git ls-files --others --exclude-standard -- "$dir")"
  changed="$(printf '%s\n%s\n' "$changed" "$untracked" | sed '/^$/d' | sort -u)"
  [ -n "$changed" ] || continue
  stale=$((stale + 1))
  commits="$(git rev-list --count "$last"..HEAD -- "$dir")"
  echo "$map: $commits commit(s) + working tree since ${last:0:7}; changed:"
  printf '%s\n' "$changed" | sed 's/^/  /'
done < <(find . \( -name .git -o -name node_modules -o -name ops \) -prune -o \
  -type f -name CLAUDE.md ! -path ./CLAUDE.md -print | sed 's#^\./##' | sort)
echo "$stale of $total map(s) need review"
