#!/usr/bin/env bash
# Tests for scripts/state.sh and scripts/prd-lint.sh
# (docs/prd/prd-state-guard.md §1, §2).
# Run: scripts/quiet-check.sh prd-guard
set -uo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
ST="$HERE/scripts/state.sh"
LINT="$HERE/scripts/prd-lint.sh"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT

PASS=0 FAIL=0
ok() { PASS=$((PASS + 1)); echo "PASS: $1"; }
bad() { FAIL=$((FAIL + 1)); echo "FAIL: $1"; }
check() { local name="$1"; shift; if "$@" >/dev/null 2>&1; then ok "$name"; else bad "$name"; fi; }

# Fixture: inline `## State` in a list item, a fenced `## State` at line
# start (``` and ~~~), the real State block mid-file.
cat >"$T/base.md" <<'MD'
# Demo — PRD
Status: APPROVED 2026-10-02 · Owner: o

## Expected behavior
### 1. One
1. Its `## State` block lists items.
```md
## State (fenced, not real)
- Sections: fake
```
~~~
## State
~~~

## State (updated 2026-10-01)
- Sections:
  - [ ] 1. One
- Remaining: all.

## Open questions
None.

## Changes
- created.
MD
printf '## State (updated 2026-10-02)\n- Sections:\n  - [~] 1. One · feat/x\n- Remaining: §1.\n\n' >"$T/new.txt"

# --- get --------------------------------------------------------------------
"$ST" get "$T/base.md" >"$T/got" 2>&1
check "get: exit 0" test $? = 0
check "get: real block only" sh -c "head -n1 '$T/got' | grep -qx '## State (updated 2026-10-01)' && test \$(wc -l <'$T/got') = 5"
check "get: no fenced or inline lines" sh -c "! grep -q 'fenced\|fake\|Its' '$T/got'"

# --- set replaces only the block -------------------------------------------
cp "$T/base.md" "$T/a.md"; chmod 644 "$T/a.md"
"$ST" set "$T/a.md" "$T/new.txt"; RC=$?
check "set: exit 0" test "$RC" = 0
check "set: lines before the block unchanged" bash -c "cmp -s <(head -n 14 '$T/base.md') <(head -n 14 '$T/a.md')"
check "set: lines after the block unchanged" bash -c "cmp -s <(tail -n 5 '$T/base.md') <(tail -n 5 '$T/a.md')"
check "set: block is the new text" sh -c "'$ST' get '$T/a.md' | cmp -s - '$T/new.txt'"
check "set: fenced State untouched" grep -qx '## State (fenced, not real)' "$T/a.md"
check "set: mode kept" sh -c "test \"\$(stat -c %a '$T/a.md' 2>/dev/null || stat -f %Lp '$T/a.md')\" = 644"
check "set: every diff hunk inside the block (lines 15-19)" sh -c "diff '$T/base.md' '$T/a.md' | grep '^[0-9]' | tr ',acd' '    ' | awk '{ for (i = 1; i <= NF; i++) if (\$i < 15 || \$i > 19) bad = 1; n++ } END { exit bad || !n }'"

# --- errors leave the PRD byte-identical -----------------------------------
expect_fail() {  # expect_fail NAME PRD FILE PATTERN
  cp "$2" "$T/e.md"
  "$ST" set "$T/e.md" "$3" >"$T/err" 2>&1; local rc=$?
  check "$1: non-zero" test "$rc" != 0
  check "$1: PRD byte-identical" cmp -s "$2" "$T/e.md"
  check "$1: message" grep -q "$4" "$T/err"
}
{ cat "$T/base.md"; printf '\n## State (dup)\n- x\n'; } >"$T/dup.md"
expect_fail "duplicate State" "$T/dup.md" "$T/new.txt" "2 '## State' headings (lines 15 26)"
check "duplicate State: get fails too" sh -c "! '$ST' get '$T/dup.md'"
printf '## State\n- x\n\n## Acceptance criteria\n' >"$T/extra.txt"
expect_fail "extra heading in file" "$T/base.md" "$T/extra.txt" "other than line 1 (lines 4)"
printf -- '- Sections:\n' >"$T/nohead.txt"
expect_fail "file without State heading" "$T/base.md" "$T/nohead.txt" "line 1 must start"
printf '## State\n```\n## Not a heading\n```\n' >"$T/fenced.txt"
cp "$T/base.md" "$T/f.md"
check "fenced ## in file is allowed" "$ST" set "$T/f.md" "$T/fenced.txt"

# --- insert when absent -----------------------------------------------------
awk '/^## State \(updated/{skip=1; next} skip && /^## /{skip=0} !skip' "$T/base.md" >"$T/nostate.md"
"$ST" set "$T/nostate.md" "$T/new.txt"
check "insert: before Open questions" sh -c "s=\$(grep -n '^## State (updated 2026-10-02)' '$T/nostate.md' | cut -d: -f1); o=\$(grep -n '^## Open questions' '$T/nostate.md' | cut -d: -f1); test \$((s + 5)) = \$o"
check "insert: get returns it" sh -c "'$ST' get '$T/nostate.md' | cmp -s - '$T/new.txt'"
grep -v '^## Open questions\|^None\.$' "$T/base.md" | awk '/^## State \(updated/{skip=1; next} skip && /^## /{skip=0} !skip' >"$T/noopen.md"
"$ST" set "$T/noopen.md" "$T/new.txt"
check "insert: before Changes when no Open questions" sh -c "grep '^## ' '$T/noopen.md' | tail -n2 | head -n1 | grep -q '^## State'"
printf '# X\nStatus: s\n\n## Problem\np\n' >"$T/bare.md"
"$ST" set "$T/bare.md" "$T/new.txt"
check "insert: at EOF otherwise" sh -c "tail -n 5 '$T/bare.md' | cmp -s - '$T/new.txt'"
check "get: missing block fails" sh -c "! '$ST' get '$T/nostate.md.missing' && printf '# X\n' >'$T/none.md' && ! '$ST' get '$T/none.md'"

# --- State at EOF -----------------------------------------------------------
printf '# X\nStatus: s\n\n## State\n- old\n' >"$T/eof.md"
"$ST" set "$T/eof.md" "$T/new.txt"
check "set: State at EOF replaced" sh -c "printf '# X\nStatus: s\n\n' | cat - '$T/new.txt' | cmp -s - '$T/eof.md'"

# --- live PRDs: get + set round trip is byte-identical; perf <100 ms -------
n=0
for p in "$REPO"/docs/prd/*.md; do
  case "$p" in */README.md|*/migration-plan.md) continue ;; esac
  "$ST" get "$p" >"$T/live" 2>/dev/null || continue
  cp "$p" "$T/live.md"; "$ST" set "$T/live.md" "$T/live"
  check "round trip: $(basename "$p")" cmp -s "$p" "$T/live.md"; n=$((n + 1))
done
check "round trip: at least one live PRD" test "$n" -gt 0
s=$(python3 -c 'import time; print(time.time())')
for i in 1 2 3 4 5 6 7 8 9 10; do "$ST" get "$T/base.md" >/dev/null; "$ST" set "$T/a.md" "$T/new.txt"; done
ms=$(python3 -c "import time; print(int((time.time() - $s) * 1000 / 20))")
echo "perf: ${ms} ms per call"
check "perf: <100 ms per call" test "$ms" -lt 100

# --- prd-lint ---------------------------------------------------------------
cat >"$T/good.md" <<'MD'
# Good — PRD
Status: BUILDING · Owner: o

## Problem
p
## Expected behavior
### 1. One thing
```
## Acceptance criteria
## Problem
```
### 2. Two
## Acceptance criteria
- [ ] a
## State
- Sections: (legend)
  - [x] 1. One · PR #1 merged
  - [~] 2. Two · feat/x
- Remaining: §2.
## Changes
- c
MD
check "lint: clean PRD passes, fenced headings ignored" "$LINT" "$T/good.md"
lint_has() {  # lint_has NAME FILE PATTERN — exit 1 and the pattern reported
  "$LINT" "$2" >"$T/lint" 2>&1; local rc=$?
  check "$1: exit 1" test "$rc" = 1
  check "$1: reported" grep -q "$3" "$T/lint"
}
sed '2s/^Status:/State:/' "$T/good.md" >"$T/l1.md"
lint_has "lint: bad Status line" "$T/l1.md" "l1.md:2: line 2 must start with .Status:"
awk '{ print } /^## Problem/ { print "## Problem" }' "$T/good.md" >"$T/l2.md"
lint_has "lint: duplicate required heading" "$T/l2.md" "l2.md:5: duplicate .## Problem. (first at line 4)"
{ cat "$T/good.md"; printf '## Open questions\n## Open questions (again)\n'; } >"$T/l3.md"
lint_has "lint: duplicate optional heading" "$T/l3.md" "duplicate .## Open questions."
grep -v '^## Changes' "$T/good.md" >"$T/l4.md"
lint_has "lint: missing required heading" "$T/l4.md" "missing .## Changes."
sed 's/2\. Two · feat/9. Nine · feat/' "$T/good.md" >"$T/l5.md"
lint_has "lint: unmatched Sections item" "$T/l5.md" "l5.md:18: Sections: item \"9. Nine\""
check "lint: unmatched item: one violation" grep -q "1 files, 1 violations" "$T/lint"
printf '# X\nStatus: s\n\n## Problem\n## Expected behavior\nx\n## Acceptance criteria\n## State\n- Sections:\n  - [~] Expected behavior · b\n## Changes\n' >"$T/l6.md"
check "lint: item may name ## Expected behavior itself" "$LINT" "$T/l6.md"
# Spec delta needed once a section merged, only when docs/specs/ exists.
mkdir -p "$T/sd/docs/prd" "$T/sd/docs/specs"
cp "$T/good.md" "$T/sd/docs/prd/merged.md"
lint_has "lint: merged item without Spec delta" "$T/sd/docs/prd/merged.md" "merged.md:17: merged Sections item but no .## Spec delta."
awk '{ print } /^### 2\. Two/ { print "## Spec delta\nnone — fixture." }' "$T/good.md" >"$T/sd/docs/prd/delta.md"
check "lint: merged item with Spec delta passes" "$LINT" "$T/sd/docs/prd/delta.md"
sed 's/- \[x\] 1\./- [~] 1./' "$T/good.md" >"$T/sd/docs/prd/open.md"
check "lint: no merged item, no Spec delta passes" "$LINT" "$T/sd/docs/prd/open.md"
# fixtures/pr30-repo-setup.md = `git show 3f9315d:docs/prd/repo-setup.md`
lint_has "lint: PR #30 corruption (Acceptance criteria)" "$HERE/tests/fixtures/pr30-repo-setup.md" "missing .## Acceptance criteria."
check "lint: PR #30 corruption (item 3)" grep -q 'item "3. Bootstrap writes the setup PRD" matches no heading' "$T/lint"
cp "$T/good.md" "$T/research-x.md"
lint_has "lint: research file in docs/prd" "$T/research-x.md" "research-x.md:1: research belongs in docs/research/"
check "lint: research file: one violation" grep -q "1 files, 1 violations" "$T/lint"
mkdir -p "$T/rr/docs/prd" && git -C "$T/rr" init -q && cp "$T/good.md" "$T/rr/docs/prd/research-y.md"
(cd "$T/rr" && "$LINT") >"$T/lint" 2>&1
check "lint: default set includes research-*.md" grep -q "research-y.md:1: research belongs" "$T/lint"
# Feature-list rules (docs/prd/archive/2026-10-feature-list.md §2), only when docs/specs/ exists.
R="$T/rl"; mkdir -p "$R/docs/prd" "$R/docs/specs"; git -C "$R" init -q
printf '# A\n' >"$R/docs/specs/alpha.md"
printf '# Specs\n\n## Index (the feature set)\n| Spec | Capability |\n|---|---|\n| [alpha](alpha.md) | A |\n' >"$R/docs/specs/README.md"
printf '# PRDs\n\n## Next (ideas)\n| # | Idea | Targets | Notes |\n|---|---|---|---|\n| 1 | More alpha | alpha | |\n| 2 | Other | `new` | |\n' >"$R/docs/prd/README.md"
awk '{ print } /^### 2\. Two/ { print "## Spec delta\n- MODIFIED `docs/specs/alpha.md` §Behavior\n  wrapped prose is fine\nProse line is fine." }' "$T/good.md" >"$R/docs/prd/p.md"
rl_lint() { (cd "$R" && "$LINT") >"$T/lint" 2>&1; }
rl_lint; RC=$?
check "lint: delta grammar, index and Next pass" test "$RC" = 0
[ "$RC" = 0 ] || cat "$T/lint"
sed -i.bak 's/^- MODIFIED `docs\/specs\/alpha.md`/- Changed alpha/' "$R/docs/prd/p.md"
lint_has "lint: bad Spec delta bullet" "$R/docs/prd/p.md" "p.md:14: Spec delta bullet must start"
check "lint: bad Spec delta bullet: one violation" grep -q "1 files, 1 violations" "$T/lint"
mv "$R/docs/prd/p.md.bak" "$R/docs/prd/p.md"
printf '# B\n' >"$R/docs/specs/beta.md"
rl_lint; check "lint: unindexed spec" grep -q "docs/specs/beta.md:1: spec not in docs/specs/README.md index" "$T/lint"
check "lint: unindexed spec: one violation" grep -q "1 files, 1 violations" "$T/lint"
rm "$R/docs/specs/beta.md" "$R/docs/specs/alpha.md"
rl_lint; check "lint: index row for missing spec" grep -q "docs/specs/README.md:6: index row for missing docs/specs/alpha.md" "$T/lint"
check "lint: dead index row: two violations" grep -q "1 files, 2 violations" "$T/lint"
check "lint: dead target also flags its Next row" grep -q 'README.md:6: Next row target "alpha" is not a spec stem or new' "$T/lint"
printf '# A\n' >"$R/docs/specs/alpha.md"
for i in $(seq 3 11); do printf '| %s | Idea %s | new | |\n' $i $i >>"$R/docs/prd/README.md"; done
rl_lint; check "lint: Next over 10 rows" grep -q "README.md:16: Next has more than 10 rows" "$T/lint"
check "lint: Next over 10 rows: one violation" grep -q "1 files, 1 violations" "$T/lint"
sed -i.bak '/^| 1[01] /d' "$R/docs/prd/README.md" && rm "$R/docs/prd/README.md.bak"
"$HERE/scripts/features.sh" "$R" >/dev/null
rl_lint; RC=$?
check "lint: current FEATURES.md passes" test "$RC" = 0
sed -i.bak 's/| A |/| Alpha |/' "$R/docs/specs/README.md" && rm "$R/docs/specs/README.md.bak"
rl_lint; check "lint: stale FEATURES.md" grep -q "docs/FEATURES.md:1: stale, run features.sh" "$T/lint"
check "lint: stale FEATURES.md: one violation" grep -q "1 files, 1 violations" "$T/lint"
# An archived PRD left in the Index (docs/prd/repo-guards.md §1.8).
awk 'NR == 3 { print "## Index (open changes only)\n| PRD | Status | Owner surfaces |\n|---|---|---|\n| [old](archive/2026-01-old.md) | SHIPPED | x |\n" } { print }' "$R/docs/prd/README.md" >"$T/idx" && mv "$T/idx" "$R/docs/prd/README.md"
"$HERE/scripts/features.sh" "$R" >/dev/null
rl_lint; check "lint: archived PRD still indexed" grep -q "docs/prd/README.md:6: archived PRD still indexed" "$T/lint"
check "lint: archived PRD still indexed: one violation" grep -q "1 files, 1 violations" "$T/lint"
s=$(python3 -c 'import time; print(time.time())')
(cd "$REPO" && "$LINT") >"$T/lint" 2>&1; RC=$?
ms=$(python3 -c "import time; print(int((time.time() - $s) * 1000))")
check "lint: every live PRD passes" test "$RC" = 0
echo "lint perf: ${ms} ms for $(tail -n1 "$T/lint")"
check "lint: live PRDs <1 s" test "$ms" -lt 1000

echo "$PASS passed, $FAIL failed"
[ "$FAIL" = 0 ]
