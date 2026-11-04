#!/usr/bin/env bash
# Link this clone's global Claude config into ~/.claude so every repo on this
# machine gets the same rules and skills. Idempotent; re-run after adding a skill.
#   ~/.claude/CLAUDE.md          -> claude-home/CLAUDE.md
#   ~/.claude/skills/<name>      -> claude-home/skills/<name>
#   ~/.local/bin/session-analyzer -> claude-home/tools/session-analyzer/session-analyzer
#   ~/.local/bin/adopt           -> claude-home/adopt.sh (per-repo layer into an existing repo)
#   ~/Library/LaunchAgents/com.claude.session-analyzer.plist (nightly 02:30, macOS)
#   ~/Library/LaunchAgents/com.claude.session-report.plist (weekly report, Mondays 08:00, macOS)
#   ~/.claude/settings.json: SessionEnd hook + one PreToolUse(Bash) hook per claude-home/hooks/*.py
#     + the rtk PreToolUse(Bash) hook when rtk is installed (token-tooling/install-rtk.sh)
#     merged in (backup first, nothing else touched)
# Existing non-symlink targets are moved to <target>.bak-<timestamp>, never deleted.
set -euo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="${CLAUDE_HOME:-$HOME/.claude}"
TS="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DEST/skills"

link() {  # link <source> <target>
  if [ -L "$2" ]; then rm "$2"
  elif [ -e "$2" ]; then mv "$2" "$2.bak-$TS"; echo "backed up $2 -> $2.bak-$TS"; fi
  ln -s "$1" "$2"; echo "linked $2"
}

link "$SRC/CLAUDE.md" "$DEST/CLAUDE.md"
for d in "$SRC"/skills/*/; do
  name="$(basename "$d")"
  link "${d%/}" "$DEST/skills/$name"
done

# Settings: report, never rewrite (settings.json holds personal keys too).
S="$DEST/settings.json"
if ! grep -q '"autoCompactWindow"' "$S" 2>/dev/null; then
  echo 'WARN: add  "autoCompactWindow": 200000  to ~/.claude/settings.json (caps main-thread context at 200k)'
fi

# session-analyzer (zero-token metrics store; claude-home/tools/session-analyzer/README.md).
SA="$SRC/tools/session-analyzer"
BIN_DIR="${SA_BIN_DIR:-$HOME/.local/bin}"
PY="$(command -v python3)"
mkdir -p "$BIN_DIR"
link "$SA/session-analyzer" "$BIN_DIR/session-analyzer"
link "$SRC/adopt.sh" "$BIN_DIR/adopt"
case ":$PATH:" in *":$BIN_DIR:"*) ;; *) echo "WARN: $BIN_DIR is not on PATH (the hook and launchd use absolute paths; add it for the CLI)";; esac
if [ "$(uname)" = Darwin ]; then
  for LABEL in com.claude.session-analyzer com.claude.session-report; do
    PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
    mkdir -p "$(dirname "$PLIST")"
    sed -e "s#@PYTHON@#$PY#g" -e "s#@BIN@#$BIN_DIR/session-analyzer#g" \
      "$SA/launchd/$LABEL.plist.in" >"$PLIST.new"
    if cmp -s "$PLIST.new" "$PLIST"; then rm "$PLIST.new"; echo "launchd $LABEL unchanged"
    else
      mv "$PLIST.new" "$PLIST"
      launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
      launchctl bootstrap "gui/$(id -u)" "$PLIST" && echo "loaded $PLIST"
    fi
  done
fi
# The only settings.json writes this script makes: idempotent hook merges.
"$PY" "$BIN_DIR/session-analyzer" install-hook "$S" --command "$BIN_DIR/session-analyzer hook" || true
# Catalog hooks (`session-analyzer apply` enforce-rule PRs land them here). The
# command no-ops if a later `revert` removed the file.
for h in "$SRC"/hooks/*.py; do
  [ -e "$h" ] || continue
  "$PY" "$BIN_DIR/session-analyzer" install-hook "$S" --event PreToolUse --matcher Bash \
    --command "f=$h; [ -f \"\$f\" ] || exit 0; exec $PY \"\$f\"" || true
done
# token-tooling Phase 1: rtk filters Bash output (docs/prd/token-tooling.md).
# Kill switch: touch ~/.claude/token-tooling.off (rm to re-enable; no reinstall).
"$SRC/token-tooling/install-rtk.sh" "$S" "$PY" "$BIN_DIR/session-analyzer"
