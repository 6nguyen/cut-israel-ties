"""Streaming transcript reader + source discovery. Never decompresses to disk."""
import json
import lzma
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterator, List, Optional, Tuple

AGENT_RE = re.compile(r"^agent-(.+)\.jsonl(\.xz)?$")
SESSION_RE = re.compile(r"^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl(\.xz)?$")


def open_any(path: Path):
    path = Path(path)
    return lzma.open(path, "rb") if path.suffix == ".xz" else open(path, "rb")


def iter_records(path: Path, offset: int = 0, stats: Optional[dict] = None) -> Iterator[Tuple[int, dict]]:
    """Yield (end_offset, record) for each complete line from `offset`.

    A trailing line without '\\n' (file still being written) is not consumed,
    so the returned offsets are safe resume points. Malformed lines are
    counted in stats['bad_lines'], never fatal. Offsets are only meaningful
    for plain .jsonl (xz is always read from 0).
    """
    pos = offset
    with open_any(path) as f:
        if offset:
            f.seek(offset)
        for line in f:
            if not line.endswith(b"\n"):
                break
            pos += len(line)
            try:
                rec = json.loads(line)
            except ValueError:
                if stats is not None:
                    stats["bad_lines"] = stats.get("bad_lines", 0) + 1
                continue
            if isinstance(rec, dict):
                yield pos, rec


@dataclass
class AgentSource:
    agent_id: str
    path: Path
    meta_path: Optional[Path]


@dataclass
class SessionSource:
    session_id: str
    project: str
    main: Optional[Path]
    agents: List[AgentSource] = field(default_factory=list)
    pinned_label: Optional[str] = None

    def files(self):
        out = [(None, self.main)] if self.main else []
        return out + [(a.agent_id, a.path) for a in self.agents]


def _agents_in(d: Path) -> List[AgentSource]:
    sub = d / "subagents"
    out = []
    if sub.is_dir():
        for p in sorted(sub.iterdir()):
            m = AGENT_RE.match(p.name)
            if not m:
                continue
            meta = sub / f"agent-{m.group(1)}.meta.json"
            metaxz = sub / f"agent-{m.group(1)}.meta.json.xz"
            out.append(AgentSource(m.group(1), p, meta if meta.exists() else (metaxz if metaxz.exists() else None)))
    return out


def session_from_main(main: Path, project: str, pinned_label=None) -> SessionSource:
    m = SESSION_RE.match(main.name)
    sid = m.group(1)
    return SessionSource(sid, project, main, _agents_in(main.parent / sid), pinned_label)


def discover(root: Path, pinned_label=None) -> Iterator[SessionSource]:
    """<root>/<project-slug>/<sessionId>.jsonl[.xz] (+ <sessionId>/subagents/)."""
    if not root.is_dir():
        return
    for proj in sorted(root.iterdir()):
        if not proj.is_dir():
            continue
        for p in sorted(proj.iterdir()):
            if p.is_file() and SESSION_RE.match(p.name):
                yield session_from_main(p, proj.name, pinned_label)


def find_session(root: Path, session_id: str) -> Optional[SessionSource]:
    if not root.is_dir():
        return None
    for proj in root.iterdir():
        for ext in (".jsonl", ".jsonl.xz"):
            p = proj / f"{session_id}{ext}"
            if p.is_file():
                return session_from_main(p, proj.name)
    return None


def read_meta(path: Optional[Path]) -> dict:
    if not path:
        return {}
    try:
        with open_any(path) as f:
            d = json.loads(f.read())
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError, lzma.LZMAError):
        return {}
