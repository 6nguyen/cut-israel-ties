#!/usr/bin/env bash
# managed by llm-repo-template adopt; edit it there
# prd-lint.sh — catch PRD structure loss before it is committed.
#   prd-lint.sh [prd…]   default: docs/prd/*.md at the repo root, except
#                        README.md and migration-plan.md
# A research-*.md file gets one violation: research lives in docs/research/
# (docs/specs/research.md), not among PRDs.
# Rules (fenced code ignored): line 2 starts with `Status:`; Problem,
# Expected behavior, Acceptance criteria and Changes appear exactly once;
# every other template `## ` heading at most once; each `Sections:` item
# prefix-matches a `##`/`###` heading under `## Expected behavior`
# (implement-prd-section §0a.2: text before ` · `); when `docs/specs/`
# sits next to the PRD's `docs/prd/`, a PRD with an `[x]` Sections item has
# a `## Spec delta` (`none — <reason>` allowed), so merged work has a
# place to fold, and every top-level `## Spec delta` bullet is
# `- ADDED|MODIFIED|REMOVED \`docs/specs/<x>.md\`…` or `- none — <reason>`.
# Once per docs/ root with a specs/ dir (docs/specs/feature-list.md):
# specs index rows and docs/specs/*.md match one to one; `## Next` in
# docs/prd/README.md has ≤10 rows, each targeting a spec stem or `new`;
# when docs/FEATURES.md exists, `features.sh --check` passes.
# Output: `<file>:<line>: <rule>` per violation, then a total. Exit 1 on any
# violation. Bash 3.2 + awk.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
roots=""
if [ $# = 0 ]; then
  root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
  [ -d "$root/docs/specs" ] && roots="$root/docs"$'\n'
  for p in "$root"/docs/prd/*.md; do
    case "$(basename "$p")" in README.md|migration-plan.md) continue ;; esac
    [ -f "$p" ] && set -- "$@" "$p"
  done
fi

files=0 violations=0
for p in "$@"; do
  files=$((files + 1))
  if [ ! -f "$p" ]; then echo "$p:0: no such file"; violations=$((violations + 1)); continue; fi
  case "$(basename "$p")" in research-*.md)
    echo "$p:1: research belongs in docs/research/"; violations=$((violations + 1)); continue ;;
  esac
  specs=0; dd="$(dirname "$(dirname "$p")")"
  if [ -d "$dd/specs" ]; then
    specs=1
    case "$(basename "$(dirname "$p")")" in prd)
      printf '%s\n' "$roots" | grep -qxF "$dd" || roots="$roots$dd"$'\n' ;;
    esac
  fi
  out=$(awk -v F="$p" -v SPECS="$specs" '
    function name(h,   i) {  # template heading key, or "" for a free heading
      for (i = 1; i <= nt; i++) if (index(h, T[i]) == 1) {
        rest = substr(h, length(T[i]) + 1)
        if (rest == "" || rest !~ /^[A-Za-z]/) return T[i]
      }
      return ""
    }
    function v(line, msg) { print F ":" line ": " msg }
    BEGIN {
      nt = split("Problem|Goals|Research|Users|Expected behavior|Data & contracts|Spec delta|Acceptance criteria|Rollout|State|Open questions|Changes", T, "|")
      split("Problem|Expected behavior|Acceptance criteria|Changes", R, "|")
      for (i in R) REQ[R[i]] = 1
    }
    NR == 2 && $0 !~ /^Status:/ { v(2, "line 2 must start with `Status:`") }
    { t = $0; sub(/^ {0,3}/, "", t) }
    fence == "" && (substr(t, 1, 3) == "```" || substr(t, 1, 3) == "~~~") { fence = substr(t, 1, 3); next }
    fence != "" { if (substr(t, 1, 3) == fence) fence = ""; next }
    /^## / {
      h = substr($0, 4); k = name(h)
      inexp = (k == "Expected behavior") ? 1 : (k != "" ? 0 : inexp)
      if (k != "") {
        if (k in seen) v(NR, "duplicate `## " k "` (first at line " seen[k] ")")
        else seen[k] = NR
      }
      if (inexp && (k == "" || k == "Expected behavior")) H[++nh] = h
      indelta = (k == "Spec delta")
      insec = 0; next
    }
    /^### / && inexp { H[++nh] = substr($0, 5) }
    SPECS && indelta && /^- / && $0 !~ /^- (ADDED|MODIFIED|REMOVED) `docs\/specs\/[^`\/]+\.md`/ && $0 !~ /^- none — / {
      v(NR, "Spec delta bullet must start `ADDED|MODIFIED|REMOVED docs/specs/<x>.md` or `none — <reason>`")
    }
    /^- Sections:/ && !secseen { insec = 1; secseen = 1; next }
    insec && /^  - \[.\] / { I[++ni] = substr($0, 9); IL[ni] = NR; if (substr($0, 5, 3) == "[x]" && !xl) xl = NR; next }
    insec { insec = 0 }
    END {
      for (k in REQ) if (!(k in seen)) v(1, "missing `## " k "`")
      if (SPECS && xl && !("Spec delta" in seen))
        v(xl, "merged Sections item but no `## Spec delta` (docs/specs exists; fold merged work or write `none — <reason>`)")
      for (i = 1; i <= ni; i++) {
        it = I[i]; p = index(it, " · "); if (p) it = substr(it, 1, p - 1)
        sub(/[ \t]+$/, "", it)
        ok = 0; for (j = 1; j <= nh; j++) if (index(H[j], it) == 1) { ok = 1; break }
        if (!ok) v(IL[i], "Sections: item \"" it "\" matches no heading under `## Expected behavior`")
      }
    }' "$p")
  if [ -n "$out" ]; then
    echo "$out"; violations=$((violations + $(printf '%s\n' "$out" | wc -l)))
  fi
done

# Repo rules, once per docs/ root (paths printed as reached).
repo_rules() {  # repo_rules <docs dir>
  local d="$1" idx="$1/specs/README.md" f stem
  if [ -f "$idx" ]; then
    for f in "$d"/specs/*.md; do
      [ -f "$f" ] || continue; stem="$(basename "$f" .md)"
      [ "$stem" = README ] && continue
      grep -qE "^\| \[[^]]*\]\($stem\.md\)" "$idx" || echo "$f:1: spec not in docs/specs/README.md index"
    done
    awk -v F="$idx" -v D="$d/specs" '/^## /{on = ($0 ~ /^## Index/)} on && /^\| \[/ {
        l = $0; sub(/^\| \[[^]]*\]\(/, "", l); sub(/\).*/, "", l)
        if (system("test -f \"" D "/" l "\"") != 0) print F ":" NR ": index row for missing docs/specs/" l
      }' "$idx"
  fi
  if [ -f "$d/prd/README.md" ]; then
    awk -v F="$d/prd/README.md" -v D="$d/specs" '
      /^## /{on = ($0 ~ /^## Next/); idx = ($0 ~ /^## Index/); next}
      # Archiving deletes the row; relinking a moved PRD would rewrite it.
      idx && /^\| \[[^]]*\]\(archive\// { print F ":" NR ": archived PRD still indexed" }
      on && /^\|/ && $0 !~ /^\|[-| :]+\|$/ {
        if (!hdr) { hdr = 1; next }
        n++; split($0, c, "|"); t = c[4]; gsub(/[ `]/, "", t)
        if (t != "new" && system("test -f \"" D "/" t ".md\"") != 0)
          print F ":" NR ": Next row target \"" t "\" is not a spec stem or new"
        if (n == 11) print F ":" NR ": Next has more than 10 rows"
      }' "$d/prd/README.md"
  fi
  if [ -f "$d/FEATURES.md" ]; then
    "$HERE/features.sh" --check "$(dirname "$d")" | sed "s#^docs/FEATURES.md: #$d/FEATURES.md:1: #"
  fi
}
while IFS= read -r d; do
  [ -n "$d" ] || continue
  out=$(repo_rules "$d")
  if [ -n "$out" ]; then
    echo "$out"; violations=$((violations + $(printf '%s\n' "$out" | wc -l)))
  fi
done <<<"$roots"
echo "prd-lint: $files files, $violations violations"
[ "$violations" = 0 ]
