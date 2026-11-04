"""Filesystem locations. Everything is overridable by env for tests."""
import os
from pathlib import Path


def archive_root() -> Path:
    return Path(os.environ.get("SESSION_ANALYZER_HOME") or Path.home() / ".claude-archive").expanduser()


def projects_root() -> Path:
    return Path(os.environ.get("CLAUDE_PROJECTS_DIR") or Path.home() / ".claude" / "projects").expanduser()


def index_db() -> Path:
    return archive_root() / "index.db"


def skeleton_dir() -> Path:
    return archive_root() / "skeletons"


def skeleton_path(session_id: str) -> Path:
    return skeleton_dir() / f"{session_id}.jsonl.xz"


def pinned_dir() -> Path:
    return archive_root() / "pinned"


def reports_dir() -> Path:
    return archive_root() / "reports"


def log_path() -> Path:
    return archive_root() / "logs" / "session-analyzer.log"


def ensure_dir(p: Path) -> Path:
    """mkdir -p with 0700 on every directory we create."""
    missing = []
    q = p
    while not q.exists():
        missing.append(q)
        q = q.parent
    for d in reversed(missing):
        d.mkdir(mode=0o700, exist_ok=True)
        d.chmod(0o700)  # mkdir's mode is masked by umask
    return p


def claude_home() -> Path:
    return Path(os.environ.get("CLAUDE_HOME") or Path.home() / ".claude").expanduser()
