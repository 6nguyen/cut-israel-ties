"""Idempotent merge of a hook (SessionEnd by default; PreToolUse for catalog
hooks in claude-home/hooks/) into ~/.claude/settings.json.
Writes a timestamped backup first; touches no other key. Used by install.sh."""
import json
import os
import shutil
import time
from pathlib import Path

MARK = "session-analyzer hook"


def has_hook(settings: dict, event="SessionEnd", mark=MARK) -> bool:
    for group in (settings.get("hooks") or {}).get(event) or []:
        for h in (group or {}).get("hooks") or []:
            if mark in str((h or {}).get("command", "")):
                return True
    return False


def merge(path: Path, command: str, event="SessionEnd", matcher=None, mark=None, conflicts=()) -> str:
    """Returns 'present' | 'added' | 'conflict:<pattern>'. A conflict (another
    hook on `event` whose command contains a `conflicts` pattern, e.g. a second
    input rewriter) writes nothing. Raises ValueError on unparseable JSON."""
    path = Path(path)
    data = {}
    if path.exists():
        data = json.loads(path.read_text() or "{}")
        if not isinstance(data, dict):
            raise ValueError("settings.json is not a JSON object")
    if has_hook(data, event, mark or (MARK if event == "SessionEnd" else command)):
        return "present"
    for c in conflicts:
        if has_hook(data, event, c):
            return f"conflict:{c}"
    if path.exists():
        shutil.copy2(path, path.with_name(f"{path.name}.bak-{time.strftime('%Y%m%d-%H%M%S')}"))
    hooks = data.setdefault("hooks", {})
    group = {"hooks": [{"type": "command", "command": command}]}
    if matcher:
        group = {"matcher": matcher, **group}
    hooks.setdefault(event, []).append(group)
    tmp = path.with_name(path.name + ".sa-new")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    if path.exists():
        os.chmod(tmp, path.stat().st_mode & 0o777)
    tmp.replace(path)
    return "added"
