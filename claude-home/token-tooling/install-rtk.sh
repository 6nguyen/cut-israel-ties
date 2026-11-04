#!/usr/bin/env bash
# Called by claude-home/install.sh: merge the rtk PreToolUse(Bash) hook.
#   install-rtk.sh <settings.json> <python3> <session-analyzer>
# Never installs binaries. Missing/old rtk or jq → one WARN line, exit 0.
set -uo pipefail
S="$1"; PY="$2"; SA="$3"
RTK_MIN=0.50.0  # first version tested; `rtk hook claude` is the native hook
HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/rtk-hook.sh"
v="$(rtk --version 2>/dev/null | awk '{print $2}')"
ge() { "$PY" -c 'import sys
t = lambda v: tuple(int(x) for x in v.split(".")[:3])
sys.exit(t(sys.argv[1]) < t(sys.argv[2]))' "$1" "$2" 2>/dev/null; }
if [ -z "$v" ] || ! ge "$v" "$RTK_MIN"; then
  echo "WARN: rtk >= $RTK_MIN not found${v:+ (have $v)}; Bash output filtering off (brew install rtk, then re-run)"
  exit 0
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "WARN: jq not found; Bash output filtering off (brew install jq, then re-run)"
  exit 0
fi
out="$("$PY" "$SA" install-hook "$S" --event PreToolUse --matcher Bash --mark token-tooling/rtk-hook.sh \
  --conflict "rtk hook" --conflict rtk-rewrite --command "\"$HOOK\"")" || true
echo "$out"
case "$out" in
  *": added") echo "rtk hook added. Start the experiment yourself: session-analyzer mark rtk --expect CRE/EOU:down" ;;
esac
exit 0
