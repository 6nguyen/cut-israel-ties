"""Disk budget (PRD §6.2, binding): 1 GB archive cap, 500 MB pinned cap,
10 GB free-space floor checked before every write. The floor is
overridable ONLY via SESSION_ANALYZER_MIN_FREE_GB (tests)."""
import os
import shutil
import sys
import time
from pathlib import Path

from . import paths

GB = 1024 ** 3
MB = 1024 ** 2
ARCHIVE_CAP = 1 * GB
PINNED_CAP = 500 * MB
LOG_MAX = 1 * MB
LOG_KEEP = 2


def min_free_bytes() -> int:
    v = os.environ.get("SESSION_ANALYZER_MIN_FREE_GB")
    return int(float(v) * GB) if v not in (None, "") else 10 * GB


def _existing_ancestor(p: Path) -> Path:
    p = p.resolve()
    while not p.exists() and p != p.parent:
        p = p.parent
    return p


def free_bytes(p: Path = None) -> int:
    return shutil.disk_usage(_existing_ancestor(p or paths.archive_root())).free


def below_floor() -> bool:
    return free_bytes() < min_free_bytes()


class FloorError(Exception):
    """Raised before a write when the volume is under the free-space floor."""


def require_space():
    if below_floor():
        raise FloorError(f"free space {free_bytes() / GB:.1f} GB < floor {min_free_bytes() / GB:.1f} GB; wrote nothing")


def tree_bytes(p: Path) -> int:
    total = 0
    if not p.exists():
        return 0
    for root, _dirs, files in os.walk(p):
        for f in files:
            try:
                total += os.lstat(os.path.join(root, f)).st_size
            except OSError:
                pass
    return total


def archive_bytes() -> int:
    return tree_bytes(paths.archive_root())


def pinned_bytes() -> int:
    return tree_bytes(paths.pinned_dir())


def log(msg: str):
    """One line to the rotating log (1 MB x 2). Below the floor: stderr only."""
    line = f"{time.strftime('%Y-%m-%dT%H:%M:%S')} {msg}\n"
    if below_floor():
        sys.stderr.write(line)
        return
    lp = paths.log_path()
    try:
        paths.ensure_dir(lp.parent)
        if lp.exists() and lp.stat().st_size >= LOG_MAX:
            for i in range(LOG_KEEP - 1, 0, -1):
                src = lp.with_name(f"{lp.name}.{i}")
                if src.exists():
                    src.replace(lp.with_name(f"{lp.name}.{i + 1}"))
            lp.replace(lp.with_name(f"{lp.name}.1"))
            extra = lp.with_name(f"{lp.name}.{LOG_KEEP}")
            if extra.exists():  # LOG_KEEP files total: current + .1
                extra.unlink()
        with open(lp, "a") as f:
            f.write(line)
    except OSError:
        sys.stderr.write(line)
