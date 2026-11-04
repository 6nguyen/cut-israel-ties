#!/usr/bin/env bash
# doc-lint.sh — every doc in its home (docs/specs/doc-placement.md).
#   doc-lint.sh [repo]          default: the current repo's root
#   doc-lint.sh --only <path>…  from inside the repo: report only these
#     paths' violations (a commit's files: `git diff --cached --name-only`),
#     so a repo not yet migrated still guards what it adds or moves
# Files: tracked plus untracked-not-ignored (`git ls-files -co`), so a new
# doc is caught before its commit. Rules:
#   1. A `*.md` sits in docs/prd, docs/specs, docs/research, docs/guides,
#      .claude or .github, or is named README / CLAUDE / AGENTS / CHANGELOG /
#      CONTRIBUTING / LICENSE* (a README.md under docs/ only inside those
#      folders), or matches a docs/.doc-allow glob. Allow lines are
#      `<glob>  # <reason>`; `*` also matches `/`; no reason is a violation.
#   2. Only README.md, FEATURES.md and .doc-allow sit directly in docs/.
#   3. docs/specs/**/*.md (not README.md): first `##` is `## Purpose`, no
#      `Status:` line, ≤16000 bytes.
#   4. Each `- ` line under root CLAUDE.md `## Area maps` names an existing
#      `<dir>/CLAUDE.md` that has `## Purpose` (`- (none yet)` passes).
#   5. docs/research/README.md index rows and docs/research/ match one to
#      one; a row linking `<dir>/` covers every file under it.
#   6. Non-md files under docs/ sit in an `assets/` directory, are
#      `.gitkeep`, or are allowlisted.
# While docs/prd/migration-plan.md exists, rules 1, 2 and 6 print
# `warn: <file>:<line>: …` and do not fail; the plan's unknown rows are
# listed once at the end. Output: `<file>:<line>: <rule>` per violation,
# then a total. Exit 1 on any violation. Bash 3.2 + awk, offline.
set -uo pipefail

NL='
'
only="" only_mode=0
if [ "${1:-}" = --only ]; then
  only_mode=1; shift; for f in "$@"; do only="$only$NL$f"; done; set --
fi
root=${1:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}
cd "$root" || { echo "doc-lint: no such repo: $root"; exit 2; }

violations=0 warnings=0 files=0
plan=docs/prd/migration-plan.md
wanted() { [ "$only_mode" = 0 ] && return 0; case "$only$NL" in *"$NL${1%%:*}$NL"*) return 0 ;; esac; return 1; }
v() { wanted "$1" || return 0; echo "$1"; violations=$((violations + 1)); }
placement() {  # rules 1, 2, 6: warnings while a migration plan exists
  wanted "$1" || return 0
  if [ -f "$plan" ]; then echo "warn: $1"; warnings=$((warnings + 1)); else v "$1"; fi
}

# --- allowlist ---------------------------------------------------------------
globs=()
if [ -f docs/.doc-allow ]; then
  n=0
  while IFS= read -r l || [ -n "$l" ]; do
    n=$((n + 1))
    t=${l#"${l%%[![:space:]]*}"}
    case "$t" in ''|'#'*) continue ;; esac
    case "$t" in
      *[[:space:]]'#'[[:space:]]*[![:space:]]*) ;;
      *) v "docs/.doc-allow:$n: allow line needs \"  # <reason>\"" ;;
    esac
    g=${t%%[[:space:]]*}; [ -n "$g" ] && globs+=("$g")
  done < docs/.doc-allow
fi
allowed() {
  local g
  for g in ${globs[@]+"${globs[@]}"}; do
    # shellcheck disable=SC2053
    [[ "$1" == $g ]] && return 0
  done
  return 1
}

# --- rules 1, 2, 6 ------------------------------------------------------------
while IFS= read -r f; do
  [ -e "$f" ] || continue  # deleted in the worktree
  case "$f" in *.md|docs/*) ;; *) continue ;; esac
  files=$((files + 1))
  case "$f" in
    docs/README.md|docs/FEATURES.md|docs/.doc-allow) continue ;;
    docs/*/*) ;;
    docs/*) allowed "$f" || placement "$f:1: only README.md, FEATURES.md and .doc-allow sit directly in docs/"; continue ;;
  esac
  case "$f" in
    *.md)
      case "$f" in
        docs/prd/*|docs/specs/*|docs/research/*|docs/guides/*|.claude/*|.github/*) continue ;;
      esac
      case "${f##*/}" in
        README.md|CLAUDE.md|AGENTS.md|CHANGELOG.md|CONTRIBUTING.md|LICENSE*)
          case "$f" in docs/*) ;; *) continue ;; esac ;;
      esac
      allowed "$f" || placement "$f:1: misplaced doc (see docs/README.md, or allowlist in docs/.doc-allow)" ;;
    *)
      case "/$f" in */assets/*|*/.gitkeep) continue ;; esac
      allowed "$f" || placement "$f:1: non-markdown file under docs/ outside an assets/ directory" ;;
  esac
done < <(git ls-files -co --exclude-standard)

# --- rule 3: specs -----------------------------------------------------------
while IFS= read -r f; do
  [ -f "$f" ] || continue
  case "${f##*/}" in README.md) continue ;; esac
  out=$(awk -v F="$f" '
    { t = $0; sub(/^ {0,3}/, "", t) }
    fence == "" && (substr(t, 1, 3) == "```" || substr(t, 1, 3) == "~~~") { fence = substr(t, 1, 3); next }
    fence != "" { if (substr(t, 1, 3) == fence) fence = ""; next }
    /^## / && !h2 { h2 = 1; if ($0 !~ /^## Purpose[ \t]*$/) print F ":" NR ": first `##` heading must be `## Purpose`" }
    /^Status:/ { print F ":" NR ": specs carry no `Status:` line (current truth, not a plan)" }
    END { if (!h2) print F ":1: no `## Purpose` heading" }' "$f")
  [ -n "$out" ] && while IFS= read -r l; do v "$l"; done <<<"$out"
  size=$(wc -c <"$f" | tr -d ' ')
  [ "$size" -gt 16000 ] && v "$f:1: spec is $size bytes (max 16000; split it by capability)"
done < <(if [ -d docs/specs ]; then git ls-files -co --exclude-standard -- 'docs/specs/*.md'; fi)  # git warns on a missing dir

# --- rule 4: area maps -------------------------------------------------------
if [ -f CLAUDE.md ]; then
  out=$(awk '
    /^## / { in_maps = ($0 ~ /^## Area maps/); next }
    in_maps && /^- / {
      if ($0 ~ /^- \(none yet\)/) next
      p = ""; s = $0
      while (match(s, /`[^`]*`/)) {
        c = substr(s, RSTART + 1, RLENGTH - 2); s = substr(s, RSTART + RLENGTH)
        if (c ~ /(^|\/)CLAUDE\.md$/ && c != "CLAUDE.md") { p = c; break }
      }
      print NR "\t" p
    }' CLAUDE.md)
  while IFS=$'\t' read -r n p; do
    [ -n "$n" ] || continue
    if [ -z "$p" ]; then v "CLAUDE.md:$n: Area maps line names no \`<dir>/CLAUDE.md\`"
    elif [ ! -f "$p" ]; then v "CLAUDE.md:$n: Area maps line points at missing $p"
    elif ! grep -q '^## Purpose' "$p"; then v "$p:1: area map has no \`## Purpose\` (listed at CLAUDE.md:$n)"
    fi
  done <<<"$out"
fi

# --- rule 5: research index --------------------------------------------------
idx=docs/research/README.md
if [ -f "$idx" ]; then
  rows=$(awk '/^\| *\[[^]]*\]\(/ { s = $0; sub(/^[^(]*\(/, "", s); sub(/\).*$/, "", s); sub(/#.*$/, "", s); print NR "\t" s }' "$idx")
  covers=()
  while IFS=$'\t' read -r n link; do
    [ -n "$n" ] || continue
    t="docs/research/${link#./}"
    if [ ! -e "$t" ]; then v "$idx:$n: index row points at missing ${link}"; continue; fi
    [ -d "$t" ] && t="${t%/}/"
    covers+=("$t")
  done <<<"$rows"
  while IFS= read -r f; do
    [ -e "$f" ] || continue
    case "$f" in "$idx"|*/.gitkeep|*/assets/*) continue ;; esac
    hit=0
    for c in ${covers[@]+"${covers[@]}"}; do
      case "$c" in */) case "$f" in "$c"*) hit=1 ;; esac ;; *) [ "$f" = "$c" ] && hit=1 ;; esac
      [ $hit = 1 ] && break
    done
    [ $hit = 1 ] || v "$f:1: not in the docs/research/README.md index"
  done < <(git ls-files -co --exclude-standard -- docs/research/)
fi

# --- footer ------------------------------------------------------------------
if [ -f "$plan" ]; then
  unk=$(awk -F'|' '/^## Files/ { f = 1; next } /^## / { f = 0 }
    f && /^\|/ { c = $(NF - 2); gsub(/^ +| +$/, "", c)
      if (c == "unknown" || c == "doc:unknown") { p = $2; gsub(/^ +| +$|`/, "", p); print "  " p } }' "$plan")
  echo "warn: $plan exists, so placement rules (1, 2, 6) only warn"
  [ -n "$unk" ] && { echo "plan rows still unknown (owner decision pending):"; echo "$unk"; }
fi
echo "doc-lint: $files files, $violations violations, $warnings warnings"
[ "$violations" = 0 ]
