#!/usr/bin/env python3
"""PreToolUse(Bash) hook installed by `session-analyzer apply` (enforce-rule
5.13). In a repo that has scripts/quiet-check.sh, a raw build/test command is
blocked with the wrapper to use instead. Anything else, or any error: allow."""
import json
import os
import re
import sys

RAW = re.compile(r"(^|[;&|]\s*|\bcd [^;&|]+&&\s*)(\S*python3? -m pytest|\S*pytest\b|xcodebuild\b|npx playwright test|"
                 r"npm run build|npx tsc\b|npx vitest\b)")


def main():
    try:
        ev = json.load(sys.stdin)
        cmd = (ev.get("tool_input") or {}).get("command") or ""
        cwd = ev.get("cwd") or os.getcwd()
    except Exception:
        return 0
    if "quiet-check" in cmd or not RAW.search(cmd):
        return 0
    d = cwd
    while d and d != os.path.dirname(d):
        if os.path.exists(os.path.join(d, "scripts", "quiet-check.sh")):
            print("Raw build/test output floods context: run it through scripts/quiet-check.sh "
                  "<target> instead (token-workflow 5.13).", file=sys.stderr)
            return 2
        d = os.path.dirname(d)
    return 0


if __name__ == "__main__":
    sys.exit(main())
