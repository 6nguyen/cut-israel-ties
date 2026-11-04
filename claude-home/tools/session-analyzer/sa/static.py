"""§6.3a static context overhead + rule-text cost. Numbers only.

At ingest time (raw `cwd` is visible there, never stored) we measure the
byte size of every source loaded before the first user turn and the repo's
`owner/name` from `.git/config`. Bytes become tokens at BYTES_PER_TOKEN;
system prompt + tools = first-request context − those sources. A session's
split is `estimated` unless the files sum to within 10% of the share the
calibration (SYSTEM_BASE) predicts.
"""
import json
import os
import re
from pathlib import Path

from . import paths

BYTES_PER_TOKEN = 3.6       # English/markdown; calibrated against /context on 2026-09-30
SYSTEM_BASE_TOKENS = 0      # system prompt + tools; derived per session as the remainder
SOURCES = ("claude_global", "claude_project", "memory", "skills", "agents")
RULES_MAP = Path(__file__).with_name("rules_map.json")
_FM = re.compile(r"^---\s*\n(.*?)\n---", re.S)
_REMOTE = re.compile(r"(?:github\.com[:/])([^/\s]+)/([^/\s]+?)(?:\.git)?\s*$")


def _size(p: Path) -> int:
    try:
        return p.stat().st_size if p.is_file() else 0
    except OSError:
        return 0


def _frontmatter_bytes(p: Path) -> int:
    """Skills/agents load only name + description (frontmatter) up front."""
    try:
        head = p.read_text(errors="replace")[:8000]
    except OSError:
        return 0
    m = _FM.match(head)
    return len(m.group(1).encode()) if m else 0


def _defs(dirs, pattern) -> int:
    n = 0
    for d in dirs:
        if d.is_dir():
            for p in sorted(d.glob(pattern)):
                n += _frontmatter_bytes(p)
    return n


def measure(cwd: Path, project_slug: str, home: Path = None) -> dict:
    home = Path(home or paths.claude_home())
    cwd = Path(cwd)
    return {
        "claude_global": _size(home / "CLAUDE.md"),
        "claude_project": _size(cwd / "CLAUDE.md") + _size(cwd / ".claude" / "CLAUDE.md"),
        "memory": _size(home / "projects" / project_slug / "memory" / "MEMORY.md"),
        "skills": _defs([home / "skills", cwd / ".claude" / "skills"], "*/SKILL.md"),
        "agents": _defs([home / "agents", cwd / ".claude" / "agents"], "*.md"),
    }


def _git_dir(cwd: Path):
    for d in [cwd, *cwd.parents]:
        g = d / ".git"
        if g.is_dir():
            return g
        if g.is_file():  # worktree: "gitdir: <path>", config lives in the common dir
            try:
                gd = Path(g.read_text().split("gitdir:", 1)[1].strip())
            except (OSError, IndexError):
                return None
            common = gd / "commondir"
            if common.is_file():
                return (gd / common.read_text().strip()).resolve()
            return gd
    return None


def repo_for(cwd: Path):
    g = _git_dir(Path(cwd))
    if not g:
        return None
    try:
        cfg = (g / "config").read_text(errors="replace")
    except OSError:
        return None
    sect = re.search(r'\[remote "origin"\](.*?)(?:\n\[|\Z)', cfg, re.S)
    m = re.search(r"url\s*=\s*(\S+)", sect.group(1)) if sect else None
    m = _REMOTE.search(m.group(1)) if m else None
    return f"{m.group(1)}/{m.group(2)}" if m else None


def env_for(cwd: str, project_slug: str) -> dict:
    try:
        st = measure(Path(cwd), project_slug)
        st["rule_bytes"] = rule_text_bytes(project_dir=Path(cwd))
        return {"repo": repo_for(Path(cwd)), "static": st}
    except Exception:  # never fatal to ingest
        return {"repo": None, "static": None}


def tokens(nbytes) -> int:
    return int(round((nbytes or 0) / BYTES_PER_TOKEN))


def split(static_bytes: dict, first_ctx: int) -> dict:
    """Per-source tokens; `system` is the remainder of the first request."""
    out = {k: tokens((static_bytes or {}).get(k, 0)) for k in SOURCES}
    out["system"] = max(0, (first_ctx or 0) - sum(out.values()))
    return out


def within(static_bytes: dict, first_ctx: int, system_tokens: int, tol=0.10) -> bool:
    """Calibration check: files + a known system/tool size vs first-request usage."""
    est = sum(tokens((static_bytes or {}).get(k, 0)) for k in SOURCES) + system_tokens
    return bool(first_ctx) and abs(est - first_ctx) <= tol * first_ctx


def rules_map() -> dict:
    return json.loads(RULES_MAP.read_text())


def effective_since(rule, m=None) -> str:
    """ISO start (UTC midnight) of the rule's effective window."""
    eff = (m or rules_map()).get("effective_since") or {}
    d = eff.get(rule) or eff.get("default") or "1970-01-01"
    return d if "T" in d else d + "T00:00:00Z"


def rule_text_bytes(home: Path = None, project_dir: Path = None) -> dict:
    """rule id -> bytes of its CLAUDE.md lines (anchors in rules_map.json).
    An anchor matches a line; the rule owns that line plus its continuation
    lines (indented, until a blank line or the next bullet/heading)."""
    home = Path(home or paths.claude_home())
    files = {"global": home / "CLAUDE.md"}
    if project_dir:
        files["project"] = Path(project_dir) / "CLAUDE.md"
    texts = {}
    for k, p in files.items():
        try:
            texts[k] = p.read_text(errors="replace").splitlines()
        except OSError:
            texts[k] = []
    out = {}
    for rule, anchors in sorted(rules_map()["rules"].items()):
        n = 0
        for a in anchors:
            lines = texts.get(a["file"], [])
            for i, line in enumerate(lines):
                if a["match"] in line:
                    n += len(line.encode()) + 1
                    j = i + 1
                    while j < len(lines) and lines[j].strip() and not lines[j].lstrip().startswith(("- ", "#", "```")):
                        n += len(lines[j].encode()) + 1
                        j += 1
                    if a.get("fence"):
                        while j < len(lines) and not lines[j].startswith("```"):
                            j += 1
                        k = j + 1
                        while k < len(lines) and not lines[k].startswith("```"):
                            k += 1
                        n += sum(len(x.encode()) + 1 for x in lines[j:k + 1])
                    break
        out[rule] = n
    return out
