#!/usr/bin/env bash
# PreToolUse(Bash) hook, token-tooling Phase 1 (docs/prd/token-tooling.md).
# Applies the kill switch and our pass-through rules, then lets rtk's own
# `rtk hook claude` decide whether a command has a filter. Never blocks or
# fails a session: every other path exits 0 with no output (command runs as typed).
[ -e "${CLAUDE_HOME:-$HOME/.claude}/token-tooling.off" ] && exit 0
command -v rtk >/dev/null 2>&1 && command -v jq >/dev/null 2>&1 || exit 0
IN="$(cat)"
CMD="$(printf '%s' "$IN" | jq -r '.tool_input.command // empty' 2>/dev/null)" || exit 0
CMD="${CMD#"${CMD%%[![:space:]]*}"}"
[ -n "$CMD" ] || exit 0
case "$CMD" in
  RTK_RAW=1[[:space:]]*|*scripts/quiet-check.sh*|*"sed -n"*) exit 0 ;;  # escape hatch / already summarized
esac
S="${CMD//||/}"; S="${S//2>&1/}"; S="${S//>&2/}"
case "$S" in *'|'* | *'>'*) exit 0 ;; esac  # agent shaped the output itself (pipe/redirect)
printf '%s' "$IN" | rtk hook claude 2>/dev/null
exit 0
