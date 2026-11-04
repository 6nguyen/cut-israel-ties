# PRD candidate detection, shared by inventory.sh and claude-home/adopt.sh.
# Source it, then: prd_candidates [root] -> repo-relative paths, sorted.
# A candidate is a *.md file with a "Status:" line in its first 5 lines,
# "PRD" in its title or file name, or >=3 template headings (## Problem,
# ## Goals, ## Expected behavior, ## Acceptance criteria). Every *.md directly
# in docs/prd/ is one too. Skipped: vendor/ build dirs, ops/, READMEs,
# docs/specs/, docs/research/ and docs/prd/migration-plan.md
# (docs/prd/research-*.md is a candidate: inventory classes it research).
# An impl plan outside docs/prd/ (*-implementation.md, or a "PRD:" header
# naming a docs/prd/ file in the first 5 lines) never is, even with a
# Status: line: inventory's doc rows class it impl-plan (defect 16).
# One awk pass over all files (no per-file processes): stays fast at 100s.

prd_candidates() {
  ( cd "${1:-.}" && find . \( -name .git -o -name node_modules -o -name build \
      -o -name dist -o -name vendor -o -name ops \) -prune \
      -o -type f -name '*.md' -exec awk '
    function flush() {
      if (cur != "" && !skip && (inprd || (!ip && (st || prd || nh >= 3)))) print cur
    }
    FNR == 1 {
      flush(); cur = FILENAME; sub(/^\.\//, "", cur)
      st = 0; prd = 0; nh = 0; titled = 0; inprd = 0; ip = 0; split("", seen)
      n = split(cur, parts, "/"); base = tolower(parts[n])
      skip = (base ~ /^readme/ || cur ~ /^docs\/specs\// || cur ~ /^docs\/research\// \
        || cur == "docs/prd/migration-plan.md")
      stem = base; sub(/\.md$/, "", stem)
      if (stem ~ /(^|[-_. ])prd([-_. ]|$)/) prd = 1
      if (cur ~ /^docs\/prd\/[^\/]+$/) inprd = 1
      if (stem ~ /-implementation$/) ip = 1
    }
    FNR <= 5 {
      l = $0; gsub(/\*/, "", l)
      if (l ~ /^[ >]*Status:/) st = 1
      if (l ~ /^[^A-Za-z0-9]*PRD:.*docs\/prd\//) ip = 1
    }
    !titled && /^# / { titled = 1; if ($0 ~ /(^|[^A-Za-z])PRD([^A-Za-z]|$)/) prd = 1 }
    /^## (Problem|Goals|Expected behavior|Acceptance criteria)/ {
      h = substr($0, 4, 5)  # Probl / Goals / Expec / Accep
      if (!(h in seen)) { seen[h] = 1; nh++ }
    }
    END { flush() }' {} + ) | LC_ALL=C sort
}
