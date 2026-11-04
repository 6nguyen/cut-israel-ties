#!/usr/bin/env bash
# Measure a repo for area maps (≤4k-token <dir>/CLAUDE.md files with a
# "## Purpose" heading). Read-only; same tree => byte-identical output.
#   measure.sh [path]     (default .)
# Tokens ~= bytes/4 over source/doc/config files. Excluded: VCS, deps, build
# output, ops/, test and fixture dirs, and docs/ (PRDs, specs and research
# are indexed by their own READMEs, not area maps). Directories are walked deepest first:
# a directory's "area" is its tokens minus those already claimed by a deeper
# flagged or mapped directory. A map covers its subtree; a covered directory
# is flagged only when it alone exceeds the split threshold.
# Verdicts: map (20-64k, write one) · split (>64k) · has-map ·
# map-over-cap (map >4k tokens). Directories below 20k are not listed.
set -euo pipefail
export LC_ALL=C
ROOT="${1:-.}"
[ -d "$ROOT" ] || { echo "measure.sh: not a directory: $ROOT" >&2; exit 2; }
ROOT="${ROOT%/}"; [ -n "$ROOT" ] || ROOT=/

PRUNE=( -name .git -o -name node_modules -o -name dist -o -name build
  -o -name .next -o -name __pycache__ -o -name .venv -o -name venv
  -o -name target -o -name .build -o -name DerivedData -o -name Pods
  -o -name ops -o -name tests -o -name test -o -name __tests__
  -o -name fixtures -o -name docs )
EXT=( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx'
  -o -name '*.mjs' -o -name '*.py' -o -name '*.go' -o -name '*.rs'
  -o -name '*.java' -o -name '*.kt' -o -name '*.swift' -o -name '*.rb'
  -o -name '*.php' -o -name '*.c' -o -name '*.cc' -o -name '*.cpp'
  -o -name '*.h' -o -name '*.m' -o -name '*.cs' -o -name '*.vue'
  -o -name '*.svelte' -o -name '*.astro' -o -name '*.sh' -o -name '*.sql'
  -o -name '*.graphql' -o -name '*.prisma' -o -name '*.md' -o -name '*.mdx'
  -o -name '*.json' -o -name '*.yaml' -o -name '*.yml' -o -name '*.toml' )

# Maps: nested CLAUDE.md with a "## Purpose" heading (the root one is the index).
maps="$(find "$ROOT" \( "${PRUNE[@]}" \) -prune -o -type f -name CLAUDE.md -print \
  | while IFS= read -r f; do
      if [ "$f" != "$ROOT/CLAUDE.md" ] && grep -q '^## Purpose' "$f"; then
        printf 'M\t%s\t%s\n' "$(wc -c <"$f" | tr -d ' ')" "${f%/CLAUDE.md}"
      fi
    done)"
# Files: "<bytes> <path>" from batched wc; awk drops wc's "total" lines.
files="$(find "$ROOT" \( "${PRUNE[@]}" \) -prune -o -type f \( "${EXT[@]}" \) -exec wc -c {} +)"

printf '%s\n%s\n' "$maps" "$files" | awk -F'\t' -v root="$ROOT" '
function parent(p,  i) { i = match(p, /\/[^\/]*$/); return i ? substr(p, 1, i - 1) : "" }
function depth(p) { return gsub(/\//, "/", p) }
function tok(b) { b = int(b / 4); return b >= 1000 ? sprintf("~%.1fk", b / 1000) : "~" b }
$1 == "M" { map[$3] = $2; dirs[$3] = 1; next }
{
  sub(/^ +/, ""); b = $0; sub(/ .*/, "", b); p = $0; sub(/^[0-9]+ /, "", p)
  if (p == "total" || p == "") next
  if (p ~ /\/CLAUDE\.md$/ && (parent(p) in map)) next
  nfiles++
  for (d = parent(p); d != "" && d != root; d = parent(d)) { total[d] += b; files[d]++; dirs[d] = 1 }
  rootbytes += b
}
END {
  n = 0
  for (d in dirs) { n++; key[n] = sprintf("%04d\t%s", 999 - depth(d), d) }
  # deepest first, then by path: deterministic
  for (i = 2; i <= n; i++) { v = key[i]; for (j = i - 1; j >= 1 && key[j] > v; j--) key[j + 1] = key[j]; key[j + 1] = v }
  for (i = 1; i <= n; i++) {
    d = substr(key[i], 6)
    covered = 0
    for (a = parent(d); a != "" && a != root; a = parent(a)) if (a in map) covered = 1
    area = total[d] - claimed[d]
    v = ""
    if (d in map) v = (map[d] > 16000) ? "map-over-cap" : "has-map"
    else if (area >= 256000) v = "split"
    else if (!covered && area >= 80000) v = "map"
    if (v == "") continue
    row[d] = sprintf("%-48s %9s %6d  %s%s", d, tok(area), files[d], v,
      (d in map) ? "  (map " tok(map[d]) ")" : "")
    for (a = parent(d); a != "" && a != root; a = parent(a)) claimed[a] += area
    rest += area
  }
  printf "%-48s %9s %6s  %s\n", "directory", "tokens", "files", "verdict"
  m = 0
  for (d in row) { m++; out[m] = d }
  for (i = 2; i <= m; i++) { v = out[i]; for (j = i - 1; j >= 1 && out[j] > v; j--) out[j + 1] = out[j]; out[j + 1] = v }
  for (i = 1; i <= m; i++) print row[out[i]]
  printf "\n%d files, %s total; %s outside listed areas (covered by the root CLAUDE.md)\n",
    nfiles, tok(rootbytes), tok(rootbytes - rest)
}'
