#!/usr/bin/env bash
# Tests for scripts/measure.sh (docs/specs/area-maps.md §3).
# Run: scripts/quiet-check.sh area-maps
set -uo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
M="$HERE/scripts/measure.sh"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT

PASS=0 FAIL=0
ok() { PASS=$((PASS + 1)); echo "PASS: $1"; }
bad() { FAIL=$((FAIL + 1)); echo "FAIL: $1"; }
check() { local name="$1"; shift; if "$@" >/dev/null 2>&1; then ok "$name"; else bad "$name"; fi; }
fill() { mkdir -p "$(dirname "$1")"; head -c "$2" /dev/zero | tr '\0' x >"$1"; }  # fill <file> <bytes>

# Fixture: a 30k-token code dir (map), a 30k-token docs/ of PRDs and
# research (excluded), a 30k-token tests/ (excluded).
R="$T/repo"
fill "$R/app/core.py" 120000
fill "$R/docs/prd/feature.md" 60000; fill "$R/docs/analysis.md" 60000
fill "$R/tests/test_core.py" 120000
"$M" "$R" >"$T/out" 2>&1; RC=$?
check "exit 0" test "$RC" = 0
check "code dir flagged map" grep -qE "/app +~30\.0k +1 +map$" "$T/out"
check "docs/ not listed" sh -c "! grep -q '/docs' '$T/out'"
check "tests/ not listed" sh -c "! grep -q '/tests' '$T/out'"
check "docs/ not in the total" grep -q '^1 files, ~30.0k total' "$T/out"
"$M" "$R" >"$T/out2" 2>&1
check "byte-identical rerun" cmp -s "$T/out" "$T/out2"
mkdir -p "$T/empty"
check "empty dir: exit 0" "$M" "$T/empty"
check "missing path: non-zero" sh -c "! '$M' '$T/nope'"

echo "$PASS passed, $FAIL failed"
[ "$FAIL" = 0 ]
