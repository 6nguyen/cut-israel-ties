#!/usr/bin/env bash
# quiet-check — run a build/test target, keep the FULL log on disk, print a
# failure-focused summary (≤60 lines) for the agent that ran it.
#
#   scripts/quiet-check.sh <target> [extra args passed to the command]
#   scripts/quiet-check.sh list         show configured targets
#
# Exit code = the underlying command's exit code. Full log:
#   ops/logs/quiet-<target>-<timestamp>.log   (gitignored)
# Why: every raw log line an agent reads is re-read on every later request;
# agents that composed their own pipelines re-ran builds 5-23x per task.
#
# CONFIGURE: edit the TARGETS block below — one line per target:
#   <target>|<working dir relative to repo root>|<command>|<parser>
# Parsers: pytest unittest tsc nextbuild playwright vitest jest xcodebuild go cargo generic

TARGETS='
prd-lint|.|bash scripts/prd-lint.sh|generic
doc-lint|.|bash scripts/doc-lint.sh|generic
# pytest|backend|.venv/bin/python -m pytest -q -rfE --tb=short|pytest
# tsc|web|npx tsc --noEmit|tsc
# build|web|npm run build|nextbuild
# e2e|web|npx playwright test --reporter=line|playwright
# unit|web|npx vitest run|vitest
# ios|ios|xcodebuild test -scheme App -destination "platform=iOS Simulator,name=iPhone 17" -derivedDataPath build|xcodebuild
'

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CMD="${1:-}"; shift || true
active() { echo "$TARGETS" | grep -vE '^\s*(#|$)'; }
if [ -z "$CMD" ] || [ "$CMD" = list ]; then
  echo "targets:"; active | cut -d'|' -f1,2,3 | sed 's/|/  (/; s/|/)  /; s/^/  /'
  [ -z "$(active)" ] && echo "  (none — edit TARGETS in $0)"
  exit 64
fi
LINE="$(active | awk -F'|' -v t="$CMD" '$1==t' | head -1)"
[ -z "$LINE" ] && { echo "unknown target: $CMD"; exec "$0" list; }
IFS='|' read -r _ DIR RUN PARSER <<<"$LINE"

mkdir -p "$ROOT/ops/logs"
LOG="$ROOT/ops/logs/quiet-$CMD-$(date +%Y%m%d-%H%M%S).log"
MAX=60
START=$(date +%s)
( cd "$ROOT/$DIR" && bash -c "$RUN $*" ) >"$LOG" 2>&1
RC=$?

summary() {
  case "$PARSER" in
    pytest)
      grep -E '^(=+ )?[0-9]+ (passed|failed|error|skipped|xfailed|deselected)' "$LOG" | tail -1
      grep -E '^(FAILED|ERROR) ' "$LOG" | head -20
      awk '/^={3,}/{n=99} /^_{3,} .* _{3,}$/{n++; c=0} n>0 && n<=3 && c<12 {print; c++}' "$LOG" ;;
    unittest)
      grep -E '^(FAIL|ERROR): ' "$LOG" | head -20
      grep -E '^[A-Za-z.]*(Error|Exception): ' "$LOG" | head -15
      grep -E '^Ran [0-9]+ tests? |^(OK|FAILED)' "$LOG" | tail -2 ;;
    tsc)
      grep -E 'error TS[0-9]+' "$LOG" | head -40
      echo "$(grep -cE 'error TS[0-9]+' "$LOG") type errors" ;;
    nextbuild)
      grep -nE 'Error|error|Failed to compile|Type error' "$LOG" | head -40 ;;
    playwright)
      grep -E '^\s*[0-9]+\) |✘|Error: |expect\(|Received|Expected' "$LOG" | head -40
      grep -E '^\s*[0-9]+ (passed|failed|flaky|skipped)' "$LOG" | tail -4 ;;
    vitest|jest)
      grep -E '✗|×|FAIL |● |AssertionError|Expected|Received' "$LOG" | head -40
      grep -E '^\s*(Tests|Test Files|Test Suites):' "$LOG" | tail -3 ;;
    xcodebuild)
      grep -E '^[^ ].*: error: ' "$LOG" | grep -v 'XCTAssert\|failed - \|XCTest' | sort -u | head -15
      grep -E 'error: -\[.*\] : ' "$LOG" | head -15
      grep -E "Test Case '.*' failed" "$LOG" | head -15
      grep -E 'Executed [0-9]+ tests?, with [0-9]+ failures?' "$LOG" | tail -1
      grep -E '\*\* (TEST|BUILD) (SUCCEEDED|FAILED) \*\*' "$LOG" | tail -1
      grep -E 'xcodebuild: error:|error: Unable to find a destination' "$LOG" | head -3 ;;
    go)
      grep -E '^(--- FAIL|FAIL|ok |panic:)|_test\.go:[0-9]+:' "$LOG" | head -40 ;;
    cargo)
      grep -E '^(error(\[E[0-9]+\])?:|test .* FAILED|failures:|test result:)|^\s+--> ' "$LOG" | head -40 ;;
    *)
      grep -inE 'error|fail|exception' "$LOG" | head -30; tail -5 "$LOG" ;;
  esac
}

SECS=$(( $(date +%s) - START ))
if [ "$RC" -eq 0 ]; then STATUS=PASS; else STATUS=FAIL; fi
echo "RESULT: $STATUS ($CMD, ${SECS}s, exit $RC)  full log: ${LOG#$ROOT/}"
summary | sed '/^\s*$/d' | head -$((MAX - 1))
exit "$RC"
